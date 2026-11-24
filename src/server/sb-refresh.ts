import "server-only";
import { ulid } from "ulid";
import { getRawClient } from "./db/client";
import { ApiError } from "./http";
import { addDays, jstToday } from "@/lib/format";
import { extractCandidates } from "./services/judging";
import { getSquadBeyondClient, SbAuthError, SbNotConfiguredError, SbRateLimitError } from "./integrations/squad-beyond";
import { fetchPageRange, syncPageVersions, upsertRankedPages } from "./sb-sync";
import { hasMoreBatches } from "./integrations/squad-beyond-mapping";

// 取り込み候補 refresh, a few beyond pages at a time. Pages come from /ab_tests/rankings sorted by
// page views over the last 30 days, so each batch costs about 1 + 2 × SB_BATCH_SIZE Squad beyond calls:
// one ranking call, then a version list and one 30-day figures call per page.

export const SB_BATCH_SIZE = 3;
const RANGE_DAYS = 30;
const KEY = "sb_refresh";
const JOB = "J-16";

export interface SbRefreshView {
  status: "never" | "done";
  /** Ranking pages loaded so far (each holds SB_BATCH_SIZE beyond pages). */
  loadedBatches: number;
  hasMore: boolean;
  rangeStart: string | null;
  rangeEnd: string | null;
  at: string | null;
  failures: string[];
}

const NEVER: SbRefreshView = { status: "never", loadedBatches: 0, hasMore: true, rangeStart: null, rangeEnd: null, at: null, failures: [] };

export async function getRefreshView(): Promise<SbRefreshView> {
  const row = (await getRawClient().execute({ sql: "SELECT value_json FROM settings WHERE key = ?", args: [KEY] })).rows[0];
  if (!row) return NEVER;
  try {
    const v = JSON.parse(String(row.value_json)) as Partial<SbRefreshView>;
    return typeof v.loadedBatches === "number" && v.status === "done" ? { ...NEVER, ...v } : NEVER;
  } catch {
    return NEVER;
  }
}

async function saveView(view: SbRefreshView, userId: string): Promise<void> {
  await getRawClient().execute({
    sql: `INSERT INTO settings (key, value_json, updated_by, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    args: [KEY, JSON.stringify(view), userId, new Date().toISOString()],
  });
}

export function friendlyError(err: unknown): string {
  if (err instanceof SbAuthError) return "Squad beyondの認証に失敗しました（APIキーを確認してください）";
  if (err instanceof SbRateLimitError) return "Squad beyond APIの利用上限に達しました。しばらくしてから再度お試しください";
  if (err instanceof SbNotConfiguredError) return "Squad beyondのAPIキーが設定されていません";
  return err instanceof Error ? err.message : String(err);
}

/**
 * Loads one batch. `"latest"` reloads the top pages (batch 1) for the last 30 days; `"more"` loads the
 * next batch within the same window. Candidates are re-extracted from everything stored afterwards.
 */
export async function loadBatch(mode: "latest" | "more", userId: string): Promise<SbRefreshView> {
  let sb;
  try {
    sb = getSquadBeyondClient();
  } catch (err) {
    throw new ApiError("UNPROCESSABLE", friendlyError(err));
  }
  const prev = await getRefreshView();
  if (mode === "more" && (prev.status === "never" || !prev.hasMore)) throw new ApiError("CONFLICT", "これ以上読み込めるページはありません");

  const more = mode === "more" && prev.rangeStart !== null && prev.rangeEnd !== null;
  const rangeEnd = more && prev.rangeEnd ? prev.rangeEnd : addDays(jstToday(), -1);
  const rangeStart = more && prev.rangeStart ? prev.rangeStart : addDays(rangeEnd, -(RANGE_DAYS - 1));
  const batch = more ? prev.loadedBatches + 1 : 1;
  const runId = ulid();
  await getRawClient().execute({ sql: "INSERT INTO job_runs (id, job, target_date, status, started_at) VALUES (?, ?, ?, 'running', ?)", args: [runId, JOB, rangeEnd, new Date().toISOString()] });

  try {
    const ranked = await sb.listRankings({ startDate: rangeStart, endDate: rangeEnd, page: batch, perPage: SB_BATCH_SIZE });
    // Pages with no views in the window have no figures, so they are skipped (and end the list).
    const withViews = ranked.pages.filter((p) => p.pageViews > 0);
    await upsertRankedPages(withViews);
    const failures: string[] = [];
    for (const page of withViews) {
      try {
        await syncPageVersions(sb, page.id);
        await fetchPageRange(sb, page, rangeStart, rangeEnd);
      } catch (err) {
        if (err instanceof SbAuthError || err instanceof SbRateLimitError) throw err;
        failures.push(page.name || page.id);
      }
    }
    const candidates = await extractCandidates();
    const view: SbRefreshView = {
      status: "done",
      loadedBatches: batch,
      hasMore: hasMoreBatches(batch, ranked.totalPages, ranked.pages.length, withViews.length),
      rangeStart, rangeEnd,
      at: new Date().toISOString(),
      failures: more ? [...prev.failures, ...failures] : failures,
    };
    await saveView(view, userId);
    await getRawClient().execute({
      sql: "UPDATE job_runs SET status = 'succeeded', items = ?, error = ?, finished_at = ? WHERE id = ?",
      args: [candidates.upserted, failures.length ? `部分失敗: ${failures.join(", ")}` : null, view.at, runId],
    });
    return view;
  } catch (err) {
    const message = friendlyError(err);
    await getRawClient().execute({ sql: "UPDATE job_runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?", args: [message.slice(0, 2000), new Date().toISOString(), runId] });
    throw err instanceof ApiError ? err : new ApiError("UPSTREAM_ERROR", message);
  }
}
