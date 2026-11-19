import "server-only";
import type { InStatement, InValue } from "@libsql/client";
import { ulid } from "ulid";
import { getRawClient } from "../db/client";
import {
  aggregateDaily,
  judge,
  type DailyRow,
  type JudgeBasis,
  type JudgeResult,
  type JudgeRule,
  type JudgeSettings,
  type MetricKey,
} from "@/lib/domain/judge";
import { addDays, daysBetween, jstToday } from "@/lib/format";

export interface CategoryCriteria {
  rules: JudgeRule[];
  settings: JudgeSettings;
  updatedAt: string | null;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function loadCriteria(categoryId: string): Promise<CategoryCriteria> {
  const client = getRawClient();
  const [rules, settings] = await Promise.all([
    client.execute({ sql: "SELECT * FROM judge_rules WHERE category_id = ?", args: [categoryId] }),
    client.execute({ sql: "SELECT * FROM judge_settings WHERE category_id = ?", args: [categoryId] }),
  ]);
  const s = settings.rows[0];
  const updatedAts = [...rules.rows.map((r) => String(r.updated_at)), s ? String(s.updated_at) : ""].filter(Boolean).sort();
  return {
    rules: rules.rows.map((r) => ({
      metric: r.metric as MetricKey,
      enabled: Number(r.enabled) === 1,
      direction: r.direction as "gte" | "lte",
      hit: num(r.hit_value),
      fair: num(r.fair_value),
      early: num(r.early_value),
    })),
    settings: {
      windowType: (s?.window_type as JudgeSettings["windowType"]) ?? "cumulative",
      windowDays: num(s?.window_days),
      minDays: num(s?.min_days) ?? 7,
      minSpend: num(s?.min_spend) ?? 0,
      earlyDays: num(s?.early_days) ?? 30,
    },
    updatedAt: updatedAts.at(-1) ?? null,
  };
}

/** Default criteria for SB candidates whose category is unknown (U-04). */
export async function loadDefaultCriteria(): Promise<CategoryCriteria> {
  const res = await getRawClient().execute("SELECT value_json, updated_at FROM settings WHERE key = 'default_judge_rules'");
  const row = res.rows[0];
  if (!row) return { rules: [], settings: { windowType: "cumulative", windowDays: null, minDays: 7, minSpend: 0, earlyDays: 30 }, updatedAt: null };
  const parsed = JSON.parse(String(row.value_json)) as { rules: JudgeRule[]; settings: JudgeSettings };
  return { ...parsed, updatedAt: String(row.updated_at) };
}

interface SbKey {
  sbVersionId: string;
  sbCreativeId: string;
  media: string;
}

/** Judge an SB (Version × creative × media) from sb_metrics_daily. */
export async function judgeSb(key: SbKey, startDate: string | null, criteria: CategoryCriteria, asOf = addDays(jstToday(), -1)): Promise<JudgeBasis> {
  const client = getRawClient();
  const first = await client.execute({
    sql: "SELECT MIN(date) AS d FROM sb_metrics_daily WHERE sb_version_id = ? AND sb_creative_id = ? AND media = ?",
    args: [key.sbVersionId, key.sbCreativeId, key.media],
  });
  const start = startDate ?? (first.rows[0]?.d ? String(first.rows[0].d) : asOf);
  const from = windowFrom(criteria.settings, start, asOf);
  const rows = await client.execute({
    sql: `SELECT date, spend, cv, mcv, pv, click, fsver, oar FROM sb_metrics_daily
          WHERE sb_version_id = ? AND sb_creative_id = ? AND media = ? AND date BETWEEN ? AND ?`,
    args: [key.sbVersionId, key.sbCreativeId, key.media, from, asOf],
  });
  const daily: DailyRow[] = rows.rows.map((r) => ({
    spend: num(r.spend), cv: num(r.cv), mcv: num(r.mcv), pv: num(r.pv), click: num(r.click), fsver: num(r.fsver), oar: num(r.oar),
  }));
  const lastDate = rows.rows.length > 0 ? String(rows.rows[rows.rows.length - 1].date) : asOf;
  return judge({
    rules: criteria.rules,
    settings: criteria.settings,
    totals: aggregateDaily(daily),
    deliveryDays: daily.filter((d) => (d.spend ?? 0) > 0).length,
    elapsedDays: daysBetween(start, lastDate),
    window: { from, to: lastDate },
    rulesUpdatedAt: criteria.updatedAt,
  });
}

function windowFrom(settings: JudgeSettings, start: string, asOf: string): string {
  if (settings.windowType === "last_n_days" && settings.windowDays) {
    const from = addDays(asOf, -(settings.windowDays - 1));
    return from > start ? from : start;
  }
  return start;
}

/** Judge a manual/CSV combination: periods overlapping the window are summed (spec ch.8 step 1). */
export async function judgeManual(combinationId: string, startDate: string, endDate: string | null, criteria: CategoryCriteria): Promise<JudgeBasis> {
  const res = await getRawClient().execute({
    sql: "SELECT * FROM manual_metrics WHERE combination_id = ? ORDER BY period_start",
    args: [combinationId],
  });
  return judgeManualRows(
    res.rows.map((r) => ({
      periodStart: String(r.period_start), periodEnd: String(r.period_end),
      spend: num(r.spend), cv: num(r.cv), mcv: num(r.mcv), pv: num(r.pv), click: num(r.click), fsver: num(r.fsver), oar: num(r.oar),
    })),
    startDate,
    endDate,
    criteria,
  );
}

export interface ManualPeriod extends DailyRow {
  periodStart: string;
  periodEnd: string;
}

/** Also used for the wizard's live judgment preview (S-04 step 4). */
export function judgeManualRows(periods: readonly ManualPeriod[], startDate: string, endDate: string | null, criteria: CategoryCriteria): JudgeBasis {
  const asOf = endDate ?? addDays(jstToday(), -1);
  const from = windowFrom(criteria.settings, startDate, asOf);
  const inWindow = periods.filter((p) => p.periodEnd >= from && p.periodStart <= asOf);
  const lastEnd = inWindow.reduce((m, p) => (p.periodEnd > m ? p.periodEnd : m), from);
  const days = inWindow.length === 0 ? 0 : daysBetween(inWindow.reduce((m, p) => (p.periodStart < m ? p.periodStart : m), lastEnd), lastEnd);
  return judge({
    rules: criteria.rules,
    settings: criteria.settings,
    totals: aggregateDaily(inWindow),
    deliveryDays: days,
    elapsedDays: daysBetween(startDate, lastEnd < startDate ? startDate : lastEnd),
    window: { from, to: lastEnd },
    rulesUpdatedAt: criteria.updatedAt,
  });
}

interface CombinationForJudge {
  id: string;
  categoryId: string;
  metricsSource: string;
  startDate: string;
  endDate: string | null;
  sbVersionId: string | null;
  sbCreativeId: string | null;
  media: string;
  judgeAuto: JudgeResult | null;
}

export async function judgeCombination(c: CombinationForJudge, criteria: CategoryCriteria): Promise<JudgeBasis | null> {
  if (c.metricsSource === "dpro") return null; // 市場事例は自社の当たり判定の対象外
  if (c.metricsSource === "sb" && c.sbVersionId && c.sbCreativeId) {
    return judgeSb({ sbVersionId: c.sbVersionId, sbCreativeId: c.sbCreativeId, media: c.media }, c.startDate, criteria);
  }
  return judgeManual(c.id, c.startDate, c.endDate, criteria);
}

/**
 * J-07: recompute judge_auto for own combinations (optionally one category / ids).
 * Changes are written with an audit row (user 'system' unless given).
 */
export async function recomputeJudgments(opts: { categoryId?: string; ids?: string[]; userId?: string } = {}): Promise<{ total: number; changed: number }> {
  const client = getRawClient();
  const clauses = ["c.deleted_at IS NULL", "c.origin = 'own'"];
  const args: InValue[] = [];
  if (opts.categoryId) {
    clauses.push("p.category_id = ?");
    args.push(opts.categoryId);
  }
  if (opts.ids && opts.ids.length > 0) {
    clauses.push(`c.id IN (${opts.ids.map(() => "?").join(",")})`);
    args.push(...opts.ids);
  }
  const res = await client.execute({
    sql: `SELECT c.id, p.category_id, c.metrics_source, c.start_date, c.end_date, c.sb_version_id, c.sb_creative_id, c.media, c.judge_auto
          FROM combinations c JOIN products p ON p.id = c.product_id WHERE ${clauses.join(" AND ")}`,
    args,
  });

  const criteriaCache = new Map<string, CategoryCriteria>();
  const now = new Date().toISOString();
  let statements: InStatement[] = [];
  let changed = 0;

  for (const r of res.rows) {
    const c: CombinationForJudge = {
      id: String(r.id), categoryId: String(r.category_id), metricsSource: String(r.metrics_source),
      startDate: String(r.start_date), endDate: r.end_date ? String(r.end_date) : null,
      sbVersionId: r.sb_version_id ? String(r.sb_version_id) : null, sbCreativeId: r.sb_creative_id ? String(r.sb_creative_id) : null,
      media: String(r.media), judgeAuto: (r.judge_auto as JudgeResult | null) ?? null,
    };
    let criteria = criteriaCache.get(c.categoryId);
    if (!criteria) {
      criteria = await loadCriteria(c.categoryId);
      criteriaCache.set(c.categoryId, criteria);
    }
    const basis = await judgeCombination(c, criteria);
    if (!basis) continue;
    statements = [
      ...statements,
      { sql: "UPDATE combinations SET judge_auto = ?, judge_basis_json = ?, judged_at = ? WHERE id = ?", args: [basis.judge, JSON.stringify(basis), now, c.id] },
    ];
    if (basis.judge !== c.judgeAuto) {
      changed++;
      statements = [
        ...statements,
        {
          sql: "INSERT INTO audit_logs (id, at, user_id, action, target_type, target_id, before_json, after_json) VALUES (?, ?, ?, 'judge_change', 'combination', ?, ?, ?)",
          args: [ulid(), now, opts.userId ?? "system", c.id, JSON.stringify({ judgeAuto: c.judgeAuto }), JSON.stringify({ judgeAuto: basis.judge })],
        },
      ];
    }
    if (statements.length >= 200) {
      await client.batch(statements, "write");
      statements = [];
    }
  }
  if (statements.length > 0) await client.batch(statements, "write");
  return { total: res.rows.length, changed };
}

/** A-01 preview: how judgments would change under new criteria (nothing is saved). */
export async function previewCriteriaChange(categoryId: string, next: CategoryCriteria): Promise<{ total: number; changes: Record<string, number> }> {
  const client = getRawClient();
  const res = await client.execute({
    sql: `SELECT c.id, c.metrics_source, c.start_date, c.end_date, c.sb_version_id, c.sb_creative_id, c.media, c.judge_auto
          FROM combinations c JOIN products p ON p.id = c.product_id
          WHERE c.deleted_at IS NULL AND c.origin = 'own' AND p.category_id = ?`,
    args: [categoryId],
  });
  const changes: Record<string, number> = {};
  for (const r of res.rows) {
    const basis = await judgeCombination(
      {
        id: String(r.id), categoryId, metricsSource: String(r.metrics_source), startDate: String(r.start_date),
        endDate: r.end_date ? String(r.end_date) : null, sbVersionId: r.sb_version_id ? String(r.sb_version_id) : null,
        sbCreativeId: r.sb_creative_id ? String(r.sb_creative_id) : null, media: String(r.media), judgeAuto: null,
      },
      next,
    );
    const before = (r.judge_auto as string | null) ?? "pending";
    if (basis && basis.judge !== before) {
      const key = `${before}->${basis.judge}`;
      changes[key] = (changes[key] ?? 0) + 1;
    }
  }
  return { total: res.rows.length, changes };
}

/**
 * J-08: aggregate unregistered (Version × creative × media), judge with the page's
 * category (via sb_pages.product_id) or the default criteria, and upsert hit/fair
 * into sb_candidates. Dismissed candidates are never touched.
 */
export async function extractCandidates(): Promise<{ upserted: number }> {
  const client = getRawClient();
  const res = await client.execute(`
    SELECT m.sb_version_id, m.sb_creative_id, m.media, MIN(m.date) AS first_date, p.category_id
    FROM sb_metrics_daily m
    LEFT JOIN sb_versions v ON v.id = m.sb_version_id
    LEFT JOIN sb_pages sp ON sp.id = v.page_id
    LEFT JOIN products p ON p.id = sp.product_id
    WHERE NOT EXISTS (
      SELECT 1 FROM combinations c WHERE c.deleted_at IS NULL AND c.sb_version_id = m.sb_version_id
        AND c.sb_creative_id = m.sb_creative_id AND c.media = m.media)
    GROUP BY m.sb_version_id, m.sb_creative_id, m.media`);
  const existing = await client.execute("SELECT sb_version_id, sb_creative_id, media, status FROM sb_candidates");
  const statusBy = new Map(existing.rows.map((r) => [`${r.sb_version_id}|${r.sb_creative_id}|${r.media}`, String(r.status)]));

  const defaults = await loadDefaultCriteria();
  const criteriaCache = new Map<string, CategoryCriteria>();
  const now = new Date().toISOString();
  const statements: InStatement[] = [];

  for (const r of res.rows) {
    const key = { sbVersionId: String(r.sb_version_id), sbCreativeId: String(r.sb_creative_id), media: String(r.media) };
    const status = statusBy.get(`${key.sbVersionId}|${key.sbCreativeId}|${key.media}`);
    if (status === "dismissed" || status === "registered") continue;
    const categoryId = r.category_id ? String(r.category_id) : null;
    let criteria = defaults;
    if (categoryId) {
      criteria = criteriaCache.get(categoryId) ?? (await loadCriteria(categoryId));
      criteriaCache.set(categoryId, criteria);
    }
    const basis = await judgeSb(key, String(r.first_date), criteria);
    // Misses are kept too so S-05 can show them on demand ("同じ商材の外れも表示").
    statements.push({
      sql: `INSERT INTO sb_candidates (id, sb_version_id, sb_creative_id, media, category_id, judge, summary_json, status, first_seen_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
            ON CONFLICT (sb_version_id, sb_creative_id, media) DO UPDATE SET
              judge = excluded.judge, summary_json = excluded.summary_json, category_id = excluded.category_id, updated_at = excluded.updated_at
            WHERE sb_candidates.status = 'open'`,
      args: [ulid(), key.sbVersionId, key.sbCreativeId, key.media, categoryId, basis.judge, JSON.stringify(basis), now, now],
    });
  }
  if (statements.length > 0) await client.batch(statements, "write");
  return { upserted: statements.length };
}
