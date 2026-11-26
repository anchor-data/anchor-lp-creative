import "server-only";
import { getRawClient } from "../db/client";
import { ApiError, notFound } from "../http";
import { getSquadBeyondClient, SbNotConfiguredError, type SquadBeyondClient } from "../integrations/squad-beyond";
import { combineVersionTotals, isSbResolvableUrl, pageMediaFromRaw, parseSbUrl, sbVersionIdFromUrl, sbVersionUrl, type SbVersionTotals } from "../integrations/squad-beyond-mapping";
import { ensureVersionContent, fetchPageRange, syncPageVersions, upsertRankedPages } from "../sb-sync";
import { friendlyError } from "../sb-refresh";
import { addDays, jstToday } from "@/lib/format";
import type { LpPreview } from "@/lib/domain/lp-preview";

// Registration wizard (S-04 STEP3/4) pickers. Data the scheduled syncs have not loaded yet is
// fetched from Squad beyond on demand, so any page can be registered — not only the top-PV ones.

/** Longest window the creative picker loads in one go (4 calls of 30 days). */
const MAX_PICKER_DAYS = 120;

export interface PickerVersion {
  id: string;
  name: string;
  url: string;
  hasBody: boolean;
}
export interface PickerCreative {
  id: string;
  name: string;
  spend: number | null;
  pv: number | null;
}
export interface PickerVersionContent {
  versionId: string;
  pageId: string;
  name: string;
  url: string;
  bodyText: string;
  preview: LpPreview | null;
}

function client(): SquadBeyondClient {
  try {
    return getSquadBeyondClient();
  } catch (err) {
    throw new ApiError("UNPROCESSABLE", friendlyError(err));
  }
}

export async function withSb<T>(fn: (sb: SquadBeyondClient) => Promise<T>): Promise<T> {
  const sb = client();
  try {
    return await fn(sb);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof SbNotConfiguredError) throw new ApiError("UNPROCESSABLE", friendlyError(err));
    throw new ApiError("UPSTREAM_ERROR", `Squad beyondから取得できませんでした：${friendlyError(err)}`);
  }
}

async function pageRow(pageId: string): Promise<{ id: string; raw_json: unknown }> {
  const row = (await getRawClient().execute({ sql: "SELECT id, raw_json FROM sb_pages WHERE id = ?", args: [pageId] })).rows[0];
  if (!row) throw notFound("beyondページ");
  return { id: String(row.id), raw_json: row.raw_json };
}

async function storedVersions(pageId: string): Promise<PickerVersion[]> {
  const res = await getRawClient().execute({ sql: "SELECT id, name, url, body_text IS NOT NULL has_body FROM sb_versions WHERE page_id = ? ORDER BY synced_at DESC, name", args: [pageId] });
  return res.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name ?? r.id),
    url: r.url ? String(r.url) : sbVersionUrl(pageId, String(r.id)),
    hasBody: Number(r.has_body) === 1,
  }));
}

/** Versions of a page; loads the list from Squad beyond (1 call) when it was never synced, or on `refresh`. */
export async function pickerVersions(pageId: string, opts: { refresh?: boolean } = {}): Promise<PickerVersion[]> {
  await pageRow(pageId);
  const stored = await storedVersions(pageId);
  if (stored.length > 0 && !opts.refresh) return stored;
  await withSb((sb) => syncPageVersions(sb, pageId));
  return storedVersions(pageId);
}

/** Body text, preview images and URL of one Version (1 call the first time). */
export async function pickerVersionContent(versionId: string): Promise<PickerVersionContent> {
  const row = (await getRawClient().execute({ sql: "SELECT id, page_id, name, url FROM sb_versions WHERE id = ?", args: [versionId] })).rows[0];
  if (!row) throw notFound("Version");
  const content = await withSb((sb) => ensureVersionContent(sb, versionId));
  if (!content) throw notFound("Version");
  const pageId = String(row.page_id);
  return {
    versionId,
    pageId,
    name: String(row.name ?? versionId),
    url: row.url ? String(row.url) : sbVersionUrl(pageId, versionId),
    bodyText: content.text.slice(0, 100_000),
    preview: content.preview,
  };
}

/** Clamps [from, to] to what the picker loads: ends yesterday (JST) at the latest, at most MAX_PICKER_DAYS. */
export function pickerWindow(from: string, to: string | null, today: string = jstToday()): { start: string; end: string; days: number } | null {
  const yesterday = addDays(today, -1);
  const end = !to || to > yesterday ? yesterday : to;
  if (from > end) return null;
  const span = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const days = Math.min(span, MAX_PICKER_DAYS);
  return { start: addDays(end, -(days - 1)), end, days };
}

async function versionCreatives(versionId: string, pageId: string): Promise<PickerCreative[]> {
  const res = await getRawClient().execute({
    sql: `SELECT sc.id, sc.name, SUM(m.spend) spend, SUM(m.pv) pv
          FROM sb_creatives sc JOIN sb_metrics_daily m ON m.sb_creative_id = sc.id AND m.sb_version_id = ?
          WHERE sc.page_id = ? GROUP BY sc.id, sc.name ORDER BY COALESCE(SUM(m.spend), 0) DESC, SUM(m.pv) DESC`,
    args: [versionId, pageId],
  });
  return res.rows.map((r) => ({ id: String(r.id), name: String(r.name ?? r.id), spend: r.spend === null ? null : Number(r.spend), pv: r.pv === null ? null : Number(r.pv) }));
}

/**
 * Ad parameters (creatives) that ran on a Version. When nothing is stored for it and a delivery period
 * is given, that period's daily rows are loaded first (1 call per 30 days), which also fills the metrics
 * the judgment preview needs.
 */
export async function pickerCreatives(pageId: string, opts: { versionId?: string; from?: string; to?: string | null; refresh?: boolean }): Promise<PickerCreative[]> {
  const page = await pageRow(pageId);
  if (!opts.versionId) {
    const res = await getRawClient().execute({ sql: "SELECT id, name FROM sb_creatives WHERE page_id = ? ORDER BY name", args: [pageId] });
    return res.rows.map((r) => ({ id: String(r.id), name: String(r.name ?? r.id), spend: null, pv: null }));
  }
  const stored = await versionCreatives(opts.versionId, pageId);
  if ((stored.length > 0 && !opts.refresh) || !opts.from) return stored;
  const window = pickerWindow(opts.from, opts.to ?? null);
  if (!window) return stored;
  const ref = { id: page.id, media: pageMediaFromRaw(page.raw_json === null || page.raw_json === undefined ? null : String(page.raw_json)) };
  await withSb(async (sb) => {
    for (let offset = 0; offset < window.days; offset += 30) {
      const end = addDays(window.end, -offset);
      const start = addDays(window.end, -Math.min(offset + 30, window.days) + 1);
      await fetchPageRange(sb, ref, start, end);
    }
  });
  return versionCreatives(opts.versionId, pageId);
}

/** Page search for the picker (name or id), newest-synced first. */
export async function searchSbPages(q: string, limit = 50): Promise<{ id: string; name: string; folder: string | null; status: string | null }[]> {
  const like = `%${q.trim()}%`;
  const res = await getRawClient().execute({
    sql: `SELECT id, name, folder, status FROM sb_pages
          WHERE ? = '%%' OR name LIKE ? OR id LIKE ? OR folder LIKE ?
          ORDER BY CASE WHEN id = ? THEN 0 WHEN status = 'active' THEN 1 ELSE 2 END, name LIMIT ?`,
    args: [like, like, like, like, q.trim(), limit],
  });
  return res.rows.map((r) => ({ id: String(r.id), name: String(r.name ?? r.id), folder: r.folder ? String(r.folder) : null, status: r.status ? String(r.status) : null }));
}

// --- Matching an article entered by URL / name to Squad beyond (手入力の登録でも実績を引けるように) ---

export interface SbMatch {
  pageId: string;
  pageName: string;
  versionId: string | null;
  versionName: string | null;
  /** "url": resolved from the article URL (reliable); "name": title / product name similarity (needs a human pick). */
  matchedBy: "url" | "name";
}

export interface SbResolveInput {
  url?: string;
  title?: string;
  productName?: string;
}

async function pageName(pageId: string): Promise<string> {
  const row = (await getRawClient().execute({ sql: "SELECT name FROM sb_pages WHERE id = ?", args: [pageId] })).rows[0];
  return row?.name ? String(row.name) : pageId;
}

async function urlMatch(url: string): Promise<SbMatch | null> {
  const fromConsole = parseSbUrl(url);
  let pageId = fromConsole?.pageId ?? null;
  const versionId = fromConsole?.versionId ?? sbVersionIdFromUrl(url);
  if (!pageId && isSbResolvableUrl(url)) {
    // A 404 or an empty body just means "not a Squad beyond URL we know".
    const page = await withSb((sb) => sb.searchPageByUrl(url)).catch(() => null);
    if (page) {
      await upsertRankedPages([page]);
      pageId = page.id;
    }
  }
  if (!pageId) return null;
  const versions = await pickerVersions(pageId).catch(() => [] as PickerVersion[]);
  const version = versionId ? versions.find((v) => v.id === versionId) ?? null : null;
  return { pageId, pageName: await pageName(pageId), versionId: version?.id ?? null, versionName: version?.name ?? null, matchedBy: "url" };
}

/** Stored Versions / pages whose names contain the article title or product name (pages loaded by the syncs only). */
async function nameCandidates(title: string, productName: string, limit = 5): Promise<SbMatch[]> {
  const terms = [title, productName].map((t) => t.trim()).filter((t) => t.length >= 2);
  if (terms.length === 0) return [];
  const client = getRawClient();
  const out: SbMatch[] = [];
  for (const term of terms) {
    const like = `%${term}%`;
    const versions = await client.execute({
      sql: `SELECT v.id vid, v.name vname, p.id pid, p.name pname FROM sb_versions v JOIN sb_pages p ON p.id = v.page_id
            WHERE v.name = ? OR v.name LIKE ? ORDER BY v.name = ? DESC, v.synced_at DESC LIMIT ?`,
      args: [term, like, term, limit],
    });
    for (const r of versions.rows) out.push({ pageId: String(r.pid), pageName: String(r.pname ?? r.pid), versionId: String(r.vid), versionName: String(r.vname ?? r.vid), matchedBy: "name" });
    const pages = await client.execute({ sql: "SELECT id, name FROM sb_pages WHERE name LIKE ? OR folder LIKE ? ORDER BY status = 'active' DESC, name LIMIT ?", args: [like, like, limit] });
    for (const r of pages.rows) out.push({ pageId: String(r.id), pageName: String(r.name ?? r.id), versionId: null, versionName: null, matchedBy: "name" });
  }
  const seen = new Set<string>();
  return out.filter((m) => {
    const key = `${m.pageId}|${m.versionId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

/** The beyond page / Version an article belongs to: from its URL first, then name candidates. */
export async function resolveSbArticle(input: SbResolveInput): Promise<{ match: SbMatch | null; candidates: SbMatch[] }> {
  const match = input.url ? await urlMatch(input.url) : null;
  if (match) return { match, candidates: [] };
  return { match: null, candidates: await nameCandidates(input.title ?? "", input.productName ?? "") };
}

/** Version-level totals for a delivery period (1 call per 30 days), the numbers the 事例一括登録シート uses. */
export async function pickerVersionTotals(versionId: string, from: string, to: string | null): Promise<SbVersionTotals & { start: string; end: string }> {
  const row = (await getRawClient().execute({ sql: "SELECT page_id FROM sb_versions WHERE id = ?", args: [versionId] })).rows[0];
  if (!row) throw notFound("Version");
  const window = pickerWindow(from, to);
  if (!window) throw new ApiError("VALIDATION_ERROR", "配信開始日が未来の日付です");
  const pageId = String(row.page_id);
  const parts = await withSb(async (sb) => {
    const out: Omit<SbVersionTotals, "days">[] = [];
    for (let offset = 0; offset < window.days; offset += 30) {
      const end = addDays(window.end, -offset);
      const start = addDays(window.end, -Math.min(offset + 30, window.days) + 1);
      const part = await sb.getVersionTotals(pageId, versionId, start, end);
      if (part) out.push(part);
    }
    return out;
  });
  return { ...combineVersionTotals(parts, window.days), start: window.start, end: window.end };
}
