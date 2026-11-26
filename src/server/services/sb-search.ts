import "server-only";
import type { InValue } from "@libsql/client";
import { getRawClient } from "../db/client";
import { ApiError, notFound } from "../http";
import type { SquadBeyondClient } from "../integrations/squad-beyond";
import { looksLikeSbLocator, pageMediaFromRaw } from "../integrations/squad-beyond-mapping";
import { fetchPageRange, syncPageVersions, upsertPages, upsertRankedPages } from "../sb-sync";
import { extractCandidates } from "./judging";
import { pickerWindow, withSb } from "./sb-picker";
import { addDays, jstToday } from "@/lib/format";

// 取り込み候補 › Squad beyond search: finds beyond pages outside the top-spend refresh and imports one.
// Squad beyond has no page-name search, so a name is matched against
//   1. the full page list, re-listed from Squad beyond at most once a day (~1 call per 100 pages), and
//   2. folders whose name matches (/folders/searches, then the pages in those folders);
// a URL or UID goes straight to /ab_tests/url_search.

const PAGE_LIST_KEY = "sb_page_list";
const PAGE_LIST_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FOLDERS = 20;
const MAX_HITS = 50;
const IMPORT_DAYS = 30;

export interface SbSearchHit {
  id: string;
  name: string;
  folder: string | null;
  status: string | null;
  /** Delivery figures for the last 30 days are stored. */
  imported: boolean;
  /** Open 取り込み候補 from this page. */
  candidates: number;
}

async function pageListFresh(now: number): Promise<boolean> {
  const row = (await getRawClient().execute({ sql: "SELECT updated_at FROM settings WHERE key = ?", args: [PAGE_LIST_KEY] })).rows[0];
  return row ? now - Date.parse(String(row.updated_at)) < PAGE_LIST_TTL_MS : false;
}

/** Re-lists every beyond page into sb_pages when the stored list is older than a day. */
async function ensurePageList(sb: SquadBeyondClient): Promise<void> {
  const now = Date.now();
  if (await pageListFresh(now)) return;
  let count = 0;
  for (let page = 1, totalPages = 1; page <= totalPages; page++) {
    const r = await sb.listPagesPage(page);
    await upsertPages(r.pages);
    count += r.pages.length;
    totalPages = r.totalPages;
  }
  const at = new Date(now).toISOString();
  await getRawClient().execute({
    sql: `INSERT INTO settings (key, value_json, updated_by, updated_at) VALUES (?, ?, 'system', ?)
          ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    args: [PAGE_LIST_KEY, JSON.stringify({ count }), at],
  });
}

/** Page ids from folders whose name matches (2 calls). */
async function folderPageIds(sb: SquadBeyondClient, q: string): Promise<string[]> {
  const folders = (await sb.searchFolders(q)).slice(0, MAX_FOLDERS);
  if (folders.length === 0) return [];
  const { pages } = await sb.listPagesPage(1, { folderIds: folders.map((f) => f.id) });
  await upsertPages(pages);
  return pages.map((p) => p.id);
}

async function hits(q: string, extraIds: readonly string[]): Promise<SbSearchHit[]> {
  const like = `%${q}%`;
  const idClause = extraIds.length > 0 ? ` OR p.id IN (${extraIds.map(() => "?").join(",")})` : "";
  const args: InValue[] = [like, like, q, ...extraIds, MAX_HITS];
  const res = await getRawClient().execute({
    sql: `SELECT p.id, p.name, p.folder, p.status,
                 EXISTS (SELECT 1 FROM sb_metrics_daily m JOIN sb_versions v ON v.id = m.sb_version_id WHERE v.page_id = p.id) imported,
                 (SELECT COUNT(*) FROM sb_candidates sc JOIN sb_versions v ON v.id = sc.sb_version_id WHERE v.page_id = p.id AND sc.status = 'open') candidates
          FROM sb_pages p
          WHERE p.name LIKE ? OR p.folder LIKE ? OR p.id = ?${idClause}
          ORDER BY CASE WHEN p.status = 'active' THEN 0 ELSE 1 END, p.name LIMIT ?`,
    args,
  });
  return res.rows.map((r) => ({
    id: String(r.id), name: String(r.name ?? r.id), folder: r.folder ? String(r.folder) : null, status: r.status ? String(r.status) : null,
    imported: Number(r.imported) === 1, candidates: Number(r.candidates ?? 0),
  }));
}

/** Searches beyond pages by name, folder name, URL or UID (from Squad beyond, see the header). */
export async function searchSbPagesRemote(query: string): Promise<SbSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) throw new ApiError("VALIDATION_ERROR", "2文字以上で検索してください");
  if (looksLikeSbLocator(q)) {
    // A 404 or an empty body just means "not a Squad beyond URL / UID we know".
    const page = await withSb((sb) => sb.searchPageByUrl(q)).catch(() => null);
    if (page) await upsertRankedPages([page]);
    return page ? hits(page.id, [page.id]) : [];
  }
  const ids = await withSb(async (sb) => {
    await ensurePageList(sb);
    return folderPageIds(sb, q);
  });
  return hits(q, ids);
}

/**
 * Imports one beyond page: its Versions and the last 30 days of delivery figures (2 calls), then
 * re-extracts candidates. Returns the page's open candidates.
 */
export async function importSbPage(pageId: string, today: string = jstToday()): Promise<{ candidates: number }> {
  const row = (await getRawClient().execute({ sql: "SELECT id, raw_json FROM sb_pages WHERE id = ?", args: [pageId] })).rows[0];
  if (!row) throw notFound("beyondページ");
  const window = pickerWindow(addDays(today, -IMPORT_DAYS), null, today);
  if (!window) throw new ApiError("UNPROCESSABLE", "取り込める期間がありません");
  const ref = { id: pageId, media: pageMediaFromRaw(row.raw_json === null || row.raw_json === undefined ? null : String(row.raw_json)) };
  await withSb(async (sb) => {
    await syncPageVersions(sb, pageId);
    await fetchPageRange(sb, ref, window.start, window.end);
  });
  await extractCandidates();
  const n = await getRawClient().execute({
    sql: "SELECT COUNT(*) n FROM sb_candidates sc JOIN sb_versions v ON v.id = sc.sb_version_id WHERE v.page_id = ? AND sc.status = 'open'",
    args: [pageId],
  });
  return { candidates: Number(n.rows[0]?.n ?? 0) };
}
