import "server-only";
import type { InStatement } from "@libsql/client";
import { getRawClient } from "./db/client";
import { dateChunks, pageMediaFromRaw, selectCreativeRows, type SbPage } from "./integrations/squad-beyond-mapping";
import { SbAuthError, type SquadBeyondClient } from "./integrations/squad-beyond";

// Squad beyond → DB building blocks shared by the scheduled jobs (自社実績 sync) and the
// step-by-step manual refresh on 取り込み候補. Every function is idempotent.

export interface SyncResult {
  items: number;
  partialFailures?: string[];
}

export interface PageRef {
  id: string;
  media: string;
}

const toRef = (r: Record<string, unknown>): PageRef => ({ id: String(r.id), media: pageMediaFromRaw(r.raw_json === null || r.raw_json === undefined ? null : String(r.raw_json)) });

function pageUpdatedAt(raw: unknown): string {
  const v = (raw as { updated_at?: unknown } | null)?.updated_at;
  return v === undefined || v === null ? "" : String(v);
}

/** Upserts pages and returns the delivering ones whose version list is missing or out of date. */
export async function upsertPages(pages: readonly SbPage[]): Promise<string[]> {
  if (pages.length === 0) return [];
  const client = getRawClient();
  const now = new Date().toISOString();
  const ph = pages.map(() => "?").join(",");
  const stored = await client.execute({
    sql: `SELECT p.id, json_extract(p.raw_json, '$.updated_at') updated_at, EXISTS (SELECT 1 FROM sb_versions v WHERE v.page_id = p.id) has_versions
          FROM sb_pages p WHERE p.id IN (${ph})`,
    args: pages.map((p) => p.id),
  });
  const unchanged = new Set(stored.rows.filter((r) => Number(r.has_versions) === 1).map((r) => `${r.id}|${r.updated_at ?? ""}`));
  await client.batch(pages.map((p) => ({
    sql: `INSERT INTO sb_pages (id, name, folder, status, url, raw_json, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET name = excluded.name, folder = excluded.folder, status = excluded.status, url = excluded.url, raw_json = excluded.raw_json, synced_at = excluded.synced_at`,
    args: [p.id, p.name, p.folder, p.status, p.url, JSON.stringify(p.raw), now],
  })), "write");
  return pages.filter((p) => p.status === "active" && !unchanged.has(`${p.id}|${pageUpdatedAt(p.raw)}`)).map((p) => p.id);
}

/**
 * Upserts pages from the rankings endpoint. Its items lack folder and updated_at, so existing values
 * are kept (raw_json is merged rather than replaced).
 */
export async function upsertRankedPages(pages: readonly SbPage[]): Promise<void> {
  if (pages.length === 0) return;
  const now = new Date().toISOString();
  await getRawClient().batch(pages.map((p) => ({
    sql: `INSERT INTO sb_pages (id, name, folder, status, url, raw_json, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET name = excluded.name, folder = COALESCE(excluded.folder, sb_pages.folder), status = excluded.status,
            url = excluded.url, raw_json = json_patch(COALESCE(sb_pages.raw_json, '{}'), excluded.raw_json), synced_at = excluded.synced_at`,
    args: [p.id, p.name, p.folder, p.status, p.url, JSON.stringify(p.raw), now],
  })), "write");
}

/** Returns the version's text, fetching its HTML once (1 call) if it was never stored. */
export async function ensureVersionBody(sb: SquadBeyondClient, versionId: string): Promise<string | null> {
  const client = getRawClient();
  const row = (await client.execute({ sql: "SELECT body_text FROM sb_versions WHERE id = ?", args: [versionId] })).rows[0];
  if (!row) return null;
  if (row.body_text !== null) return String(row.body_text);
  const { text } = await sb.getVersionContent(versionId);
  await client.execute({ sql: "UPDATE sb_versions SET body_text = ? WHERE id = ?", args: [text, versionId] });
  return text;
}

/** One call: the page's version list. Version HTML is fetched later, only for candidates. */
export async function syncPageVersions(sb: SquadBeyondClient, pageId: string): Promise<number> {
  const { versions } = await sb.getPageMaster(pageId);
  if (versions.length === 0) return 0;
  const now = new Date().toISOString();
  await getRawClient().batch(versions.map((v) => ({
    sql: `INSERT INTO sb_versions (id, page_id, name, url, body_text, raw_json, synced_at) VALUES (?, ?, ?, ?, NULL, ?, ?)
          ON CONFLICT (id) DO UPDATE SET name = excluded.name, url = excluded.url, raw_json = excluded.raw_json, synced_at = excluded.synced_at`,
    args: [v.id, pageId, v.name, v.url, JSON.stringify(v.raw), now],
  })), "write");
  return versions.length;
}

/** One call: daily rows for a page over [startDate, endDate] (at most 30 days), plus new creatives. */
export async function fetchPageRange(sb: SquadBeyondClient, page: PageRef, startDate: string, endDate: string): Promise<number> {
  const rows = selectCreativeRows(await sb.getBranchOperation(page.id, startDate, endDate, page.media));
  const now = new Date().toISOString();
  const metrics: InStatement[] = rows.map((r) => ({
    sql: `INSERT OR REPLACE INTO sb_metrics_daily (date, sb_version_id, sb_creative_id, media, spend, pv, click, ctr, cv, cvr, ctvr, cpa, mcv, mcvr, mcpa, fver, sver, fsver, oar, media_imp, media_ctr, media_cpm, media_cpc, raw_json, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [r.date, r.versionId, r.creativeId, r.media, r.spend, r.pv, r.click, r.ctr, r.cv, r.cvr, r.ctvr, r.cpa, r.mcv, r.mcvr, r.mcpa, r.fver, r.sver, r.fsver, r.oar, r.mediaImp, r.mediaCtr, r.mediaCpm, r.mediaCpc, JSON.stringify(r.raw), now],
  }));
  // Squad beyond has no creative master: register each ad parameter the first time it appears.
  const creatives: InStatement[] = [...new Map(rows.map((r) => [r.creativeId, r.parameter])).entries()].map(([id, parameter]) => ({
    sql: "INSERT INTO sb_creatives (id, page_id, name, parameter, raw_json, synced_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
    args: [id, page.id, parameter ?? "(パラメータなし)", parameter, JSON.stringify({ parameter }), now],
  }));
  if (metrics.length + creatives.length > 0) await getRawClient().batch([...metrics, ...creatives], "write");
  return rows.length;
}

export async function activePages(): Promise<PageRef[]> {
  return (await getRawClient().execute("SELECT id, raw_json FROM sb_pages WHERE status = 'active' ORDER BY id")).rows.map(toRef);
}

/** Pages behind registered 自社実績 (live combinations whose metrics come from Squad beyond). */
export async function ownResultPages(): Promise<PageRef[]> {
  const res = await getRawClient().execute(`
    SELECT DISTINCT p.id, p.raw_json FROM combinations c
    JOIN articles a ON a.id = c.article_id
    LEFT JOIN sb_versions v ON v.id = c.sb_version_id
    JOIN sb_pages p ON p.id = COALESCE(a.sb_page_id, v.page_id)
    WHERE c.deleted_at IS NULL AND c.metrics_source = 'sb' ORDER BY p.id`);
  return res.rows.map(toRef);
}

/** J-02 (manual, from A-06): full page list, then version lists for new or changed delivering pages. */
export async function syncMaster(sb: SquadBeyondClient): Promise<SyncResult> {
  const toSync = await upsertPages(await sb.listPages({ activeOnly: false }));
  const failures: string[] = [];
  for (const id of toSync) {
    try {
      await syncPageVersions(sb, id);
    } catch (err) {
      if (err instanceof SbAuthError) throw err;
      failures.push(id);
    }
  }
  return { items: toSync.length, partialFailures: failures };
}

/**
 * J-03 / J-05: refreshes daily rows for 自社実績 pages over the last `days` days ending `endDate`.
 * One call per page per 30-day chunk, so the daily run costs one call per linked page.
 */
export async function syncOwnResults(sb: SquadBeyondClient, endDate: string, days: number): Promise<SyncResult> {
  const pages = await ownResultPages();
  const failures: string[] = [];
  let items = 0;
  for (const page of pages) {
    for (const [start, end] of dateChunks(endDate, days)) {
      try {
        items += await fetchPageRange(sb, page, start, end);
      } catch (err) {
        if (err instanceof SbAuthError) throw err;
        failures.push(`${page.id}(${start}〜${end})`);
      }
    }
  }
  return { items, partialFailures: failures };
}
