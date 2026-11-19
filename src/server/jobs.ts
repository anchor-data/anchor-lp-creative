import "server-only";
import type { InStatement } from "@libsql/client";
import { ulid } from "ulid";
import { getRawClient } from "./db/client";
import { getBindings, getEnv } from "./env";
import { addDays, jstToday } from "@/lib/format";
import { extractCandidates, recomputeJudgments } from "./services/judging";
import { sweepMissingEmbeddings } from "./services/embeddings";
import { deleteFiles } from "./services/files";
import { getSquadBeyondClient, SbAuthError, SbNotConfiguredError, type SquadBeyondClient } from "./integrations/squad-beyond";

// Batch jobs (spec ch.7). Every job is idempotent and recorded in job_runs.
export const JOBS = {
  "J-01": "Squad beyondの疎通確認",
  "J-02": "Squad beyondのマスタ同期",
  "J-03": "Squad beyondの日次取得（前日分）",
  "J-04": "Squad beyondの取得漏れの補完（直近7日）",
  "J-05": "Squad beyondの過去分の一括取り込み",
  "J-07": "当たり判定の再計算",
  "J-08": "登録候補の抽出",
  "J-09": "埋め込みの作成（漏れ拾い）",
  "J-10": "APIキー期限・利用量の確認",
  "J-14": "削除から30日過ぎたデータの物理削除",
  "J-15": "DBのバックアップ",
} as const;
export type JobId = keyof typeof JOBS;

/** JST hour → jobs (one hourly Cron Trigger dispatches everything; spec ch.7). */
const SCHEDULE: Record<number, JobId[]> = {
  3: ["J-09"],
  4: ["J-14", "J-15"],
  5: ["J-01"],
  6: ["J-02", "J-03"],
  7: ["J-04"],
  8: ["J-07", "J-08"],
  9: ["J-10"],
};

export async function notify(text: string): Promise<void> {
  const url = getEnv().NOTIFY_WEBHOOK_URL;
  console.error(JSON.stringify({ level: "notify", text }));
  if (!url) return;
  await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => undefined);
}

interface JobResult {
  items: number;
  partialFailures?: string[];
}

export async function runJob(job: JobId, targetDate?: string): Promise<{ status: string; items: number | null; error: string | null }> {
  const client = getRawClient();
  const date = targetDate ?? addDays(jstToday(), -1);
  const running = await client.execute({
    sql: "SELECT id FROM job_runs WHERE job = ? AND COALESCE(target_date, '') = ? AND status = 'running' AND started_at > ?",
    args: [job, date, new Date(Date.now() - 30 * 60_000).toISOString()],
  });
  const id = ulid();
  const startedAt = new Date().toISOString();
  if (running.rows.length > 0) {
    await client.execute({ sql: "INSERT INTO job_runs (id, job, target_date, status, started_at, finished_at) VALUES (?, ?, ?, 'skipped', ?, ?)", args: [id, job, date, startedAt, startedAt] });
    return { status: "skipped", items: null, error: null };
  }
  await client.execute({ sql: "INSERT INTO job_runs (id, job, target_date, status, started_at) VALUES (?, ?, ?, 'running', ?)", args: [id, job, date, startedAt] });
  try {
    const result = await execute(job, date);
    const error = result.partialFailures?.length ? `部分失敗: ${result.partialFailures.slice(0, 20).join(", ")}` : null;
    await client.execute({ sql: "UPDATE job_runs SET status = 'succeeded', items = ?, error = ?, finished_at = ? WHERE id = ?", args: [result.items, error, new Date().toISOString(), id] });
    if (error) await notify(`【${job} ${JOBS[job]}】一部失敗しました（対象日 ${date}）。翌朝のJ-04で補完されます。${error}`);
    return { status: "succeeded", items: result.items, error };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await client.execute({ sql: "UPDATE job_runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?", args: [message.slice(0, 2000), new Date().toISOString(), id] });
    if (err instanceof SbAuthError) {
      await notify("Squad beyondのログインが切れています。6:30までにログインしてください（復旧後はA-06から取得漏れの補完を実行できます）");
    } else if (!(err instanceof SbNotConfiguredError)) {
      await notify(`【${job} ${JOBS[job]}】失敗しました（対象日 ${date}）: ${message.slice(0, 300)}`);
    }
    return { status: "failed", items: null, error: message };
  }
}

export async function runScheduled(now = new Date()): Promise<void> {
  const jstHour = (now.getUTCHours() + 9) % 24;
  for (const job of SCHEDULE[jstHour] ?? []) await runJob(job);
}

async function execute(job: JobId, date: string): Promise<JobResult> {
  switch (job) {
    case "J-01":
      return healthCheck(getSquadBeyondClient(), date);
    case "J-02":
      return syncMaster(getSquadBeyondClient());
    case "J-03":
      return fetchDays(getSquadBeyondClient(), [date]);
    case "J-04":
      return fetchMissingDays(getSquadBeyondClient(), date);
    case "J-05":
      return backfill(getSquadBeyondClient(), date);
    case "J-07": {
      const r = await recomputeJudgments();
      return { items: r.total };
    }
    case "J-08": {
      const r = await extractCandidates();
      return { items: r.upserted };
    }
    case "J-09": {
      const r = await sweepMissingEmbeddings();
      return { items: r.embedded };
    }
    case "J-10":
      return checkKeysAndUsage(date);
    case "J-14":
      return purgeDeleted();
    case "J-15":
      return backup();
  }
}

async function healthCheck(sb: SquadBeyondClient, date: string): Promise<JobResult> {
  const pages = await sb.listPages({ activeOnly: true });
  if (pages.length === 0) return { items: 0 };
  await sb.getBranchOperation(pages[0].id, addDays(date, -1)); // 前々日分を最小範囲で
  return { items: 1 };
}

async function syncMaster(sb: SquadBeyondClient): Promise<JobResult> {
  const client = getRawClient();
  const now = new Date().toISOString();
  const pages = await sb.listPages({ activeOnly: true });
  const known = new Set((await client.execute("SELECT id FROM sb_versions WHERE body_text IS NOT NULL")).rows.map((r) => String(r.id)));
  let statements: InStatement[] = pages.map((p) => ({
    sql: `INSERT INTO sb_pages (id, name, folder, status, url, raw_json, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET name = excluded.name, folder = excluded.folder, status = excluded.status, url = excluded.url, raw_json = excluded.raw_json, synced_at = excluded.synced_at`,
    args: [p.id, p.name, p.folder, p.status, p.url, JSON.stringify(p.raw), now],
  }));
  const failures: string[] = [];
  for (const p of pages) {
    try {
      const master = await sb.getPageMaster(p.id);
      for (const v of master.versions) {
        const body = known.has(v.id) ? null : (await sb.getVersionContent(v.id)).text; // 新しいVersionだけ本文を取得
        statements = [...statements, {
          sql: `INSERT INTO sb_versions (id, page_id, name, url, body_text, raw_json, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET name = excluded.name, url = excluded.url, body_text = COALESCE(excluded.body_text, sb_versions.body_text), raw_json = excluded.raw_json, synced_at = excluded.synced_at`,
          args: [v.id, p.id, v.name, v.url, body, JSON.stringify(v.raw), now],
        }];
      }
      for (const c of master.creatives) {
        statements = [...statements, {
          sql: `INSERT INTO sb_creatives (id, page_id, name, parameter, raw_json, synced_at) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET name = excluded.name, parameter = excluded.parameter, raw_json = excluded.raw_json, synced_at = excluded.synced_at`,
          args: [c.id, p.id, c.name, c.parameter, JSON.stringify(c.raw), now],
        }];
      }
    } catch (err) {
      if (err instanceof SbAuthError) throw err;
      failures.push(p.id);
    }
  }
  if (statements.length > 0) await client.batch(statements, "write");
  return { items: pages.length, partialFailures: failures };
}

/**
 * Fetches "day × page" Branch Operation rows and upserts by primary key.
 * TODO: move the per-page loop onto Cloudflare Queues (spec ch.7) once page counts grow;
 * it runs inline for now and records per-page success for J-04.
 */
async function fetchDays(sb: SquadBeyondClient, dates: readonly string[], onlyPages?: Map<string, Set<string>>): Promise<JobResult> {
  const client = getRawClient();
  const pages = await client.execute("SELECT id FROM sb_pages WHERE status = 'active'");
  const failures: string[] = [];
  let items = 0;
  for (const date of dates) {
    for (const p of pages.rows) {
      const pageId = String(p.id);
      if (onlyPages && !onlyPages.get(date)?.has(pageId)) continue;
      try {
        const rows = await sb.getBranchOperation(pageId, date);
        const now = new Date().toISOString();
        const statements: InStatement[] = rows.map((r) => ({
          sql: `INSERT OR REPLACE INTO sb_metrics_daily (date, sb_version_id, sb_creative_id, media, spend, pv, click, ctr, cv, cvr, ctvr, cpa, mcv, mcvr, mcpa, fver, sver, fsver, oar, media_imp, media_ctr, media_cpm, media_cpc, raw_json, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [r.date, r.versionId, r.creativeId, r.media, r.spend, r.pv, r.click, r.ctr, r.cv, r.cvr, r.ctvr, r.cpa, r.mcv, r.mcvr, r.mcpa, r.fver, r.sver, r.fsver, r.oar, r.mediaImp, r.mediaCtr, r.mediaCpm, r.mediaCpc, JSON.stringify(r.raw), now],
        }));
        // Success marker per (day, page) so J-04 knows what to re-fetch.
        statements.push({ sql: "INSERT INTO job_runs (id, job, target_date, status, items, started_at, finished_at) VALUES (?, ?, ?, 'succeeded', ?, ?, ?)", args: [ulid(), `J-03:${pageId}`, date, rows.length, now, now] });
        await client.batch(statements, "write");
        items += rows.length;
      } catch (err) {
        if (err instanceof SbAuthError) throw err;
        failures.push(`${date}/${pageId}`);
      }
    }
  }
  return { items, partialFailures: failures };
}

async function fetchMissingDays(sb: SquadBeyondClient, date: string): Promise<JobResult> {
  const client = getRawClient();
  const dates = Array.from({ length: 7 }, (_, i) => addDays(date, -i));
  const pages = (await client.execute("SELECT id FROM sb_pages WHERE status = 'active'")).rows.map((r) => String(r.id));
  const done = await client.execute({
    sql: `SELECT job, target_date FROM job_runs WHERE job LIKE 'J-03:%' AND status = 'succeeded' AND target_date IN (${dates.map(() => "?").join(",")})`,
    args: dates,
  });
  const ok = new Set(done.rows.map((r) => `${r.target_date}|${String(r.job).slice(5)}`));
  const missing = new Map<string, Set<string>>();
  for (const d of dates) for (const p of pages) if (!ok.has(`${d}|${p}`)) missing.set(d, (missing.get(d) ?? new Set()).add(p));
  if (missing.size === 0) return { items: 0 };
  return fetchDays(sb, [...missing.keys()], missing);
}

/** J-05: oldest available day (U-03; 90 days assumed) up to yesterday; resumable. */
async function backfill(sb: SquadBeyondClient, date: string): Promise<JobResult> {
  const dates = Array.from({ length: 90 }, (_, i) => addDays(date, -i));
  return fetchMissingDaysFor(sb, dates);
}

async function fetchMissingDaysFor(sb: SquadBeyondClient, dates: string[]): Promise<JobResult> {
  let items = 0;
  const failures: string[] = [];
  for (const d of dates) {
    const r = await fetchMissingDays(sb, d);
    items += r.items;
    failures.push(...(r.partialFailures ?? []));
  }
  return { items, partialFailures: failures };
}

async function checkKeysAndUsage(date: string): Promise<JobResult> {
  const client = getRawClient();
  const expiry = (await client.execute("SELECT key, value_json FROM settings WHERE key IN ('sb_key_expiry', 'dpro_key_expiry')")).rows;
  for (const row of expiry) {
    const on = (JSON.parse(String(row.value_json)) as { expiresOn?: string }).expiresOn;
    if (!on) continue;
    const days = Math.ceil((Date.parse(on) - Date.now()) / 86_400_000);
    if ([30, 14, 7, 1].includes(days)) await notify(`${row.key === "sb_key_expiry" ? "Squad beyond" : "DPro"}のAPIキーが${days}日後（${on}）に期限切れになります。第12章の手順で更新してください`);
  }
  const usage = Number((await client.execute({ sql: "SELECT SUM(count) n FROM api_usage WHERE provider = 'squadbeyond' AND date = ?", args: [date] })).rows[0]?.n ?? 0);
  if (usage > 15_000 * 0.8) await notify(`Squad beyond APIの前日の利用回数が上限の8割を超えました（${usage}回）`);
  const j03 = await client.execute({ sql: "SELECT status FROM job_runs WHERE job = 'J-03' AND target_date = ? ORDER BY started_at DESC LIMIT 1", args: [date] });
  if (j03.rows[0]?.status !== "succeeded") await notify(`前日（${date}）のSquad beyond日次取得（J-03）が成功していません`);
  return { items: expiry.length };
}

async function purgeDeleted(): Promise<JobResult> {
  const client = getRawClient();
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const rows = await client.execute({ sql: "SELECT id FROM combinations WHERE deleted_at IS NOT NULL AND deleted_at < ?", args: [cutoff] });
  const ids = rows.rows.map((r) => String(r.id));
  if (ids.length === 0) return { items: 0 };
  const ph = ids.map(() => "?").join(",");
  // Orphaned creatives/articles (no live combination) are purged with their R2 files.
  const files = await client.execute({
    sql: `SELECT cr.r2_key, cr.thumbnail_r2_key, a.screenshot_r2_key, a.fv_r2_key FROM combinations c
          JOIN creatives cr ON cr.id = c.creative_id JOIN articles a ON a.id = c.article_id WHERE c.id IN (${ph})
          AND NOT EXISTS (SELECT 1 FROM combinations o WHERE o.creative_id = c.creative_id AND o.id NOT IN (${ph}))`,
    args: [...ids, ...ids],
  });
  await client.batch([
    { sql: `DELETE FROM memos WHERE combination_id IN (${ph})`, args: ids },
    { sql: `DELETE FROM manual_metrics WHERE combination_id IN (${ph})`, args: ids },
    { sql: `DELETE FROM market_metrics WHERE combination_id IN (${ph})`, args: ids },
    { sql: `DELETE FROM collection_items WHERE combination_id IN (${ph})`, args: ids },
    { sql: `DELETE FROM generation_refs WHERE combination_id IN (${ph})`, args: ids },
    { sql: `UPDATE sb_candidates SET combination_id = NULL WHERE combination_id IN (${ph})`, args: ids },
    { sql: `DELETE FROM combinations WHERE id IN (${ph})`, args: ids },
  ], "write");
  const keys = files.rows.flatMap((r) => [r.r2_key, r.thumbnail_r2_key, r.screenshot_r2_key, r.fv_r2_key]).filter((k): k is string => typeof k === "string");
  await deleteFiles(keys).catch(() => undefined);
  return { items: ids.length };
}

/** J-15: dumps every table as JSON Lines into R2 (backups/ prefix, 30 days kept). */
async function backup(): Promise<JobResult> {
  const r2 = getBindings().FILES;
  if (!r2) throw new Error("R2 binding FILES is not configured");
  const client = getRawClient();
  const tables = (await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%' AND name NOT LIKE 'libsql_%'")).rows.map((r) => String(r.name));
  const day = jstToday();
  let rows = 0;
  for (const t of tables) {
    const cols = (await client.execute(`PRAGMA table_info(${t})`)).rows.map((c) => String(c.name)).filter((c) => c !== "embedding");
    const res = await client.execute(`SELECT ${cols.map((c) => `"${c}"`).join(", ")} FROM "${t}"`);
    rows += res.rows.length;
    await r2.put(`backups/${day}/${t}.jsonl`, res.rows.map((r) => JSON.stringify(r)).join("\n"), { httpMetadata: { contentType: "application/x-ndjson" } });
  }
  const old = addDays(day, -30);
  await r2.delete(tables.map((t) => `backups/${old}/${t}.jsonl`)).catch(() => undefined);
  return { items: rows };
}
