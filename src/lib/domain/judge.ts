// 当たり判定 (spec ch.8). Pure: shared by combinations (J-07) and SB candidates (J-08).

export type MetricKey = "spend" | "cpa" | "mcvr" | "cv" | "fsver" | "oar";
export type Direction = "gte" | "lte";
export type JudgeResult = "hit" | "fair" | "miss" | "pending";
export type MetricOutcome = "hit" | "fair" | "miss" | "no_data";

export const METRIC_KEYS: readonly MetricKey[] = ["spend", "cpa", "mcvr", "cv", "fsver", "oar"];

/** Default "good" direction per metric (spec ch.8 table). */
export const DEFAULT_DIRECTION: Record<MetricKey, Direction> = {
  spend: "gte",
  cpa: "lte",
  mcvr: "gte",
  cv: "gte",
  fsver: "lte",
  oar: "gte",
};

export interface JudgeRule {
  metric: MetricKey;
  enabled: boolean;
  direction: Direction;
  /** Target (31日目以降) hit threshold */
  hit: number | null;
  /** まずまず threshold; null everywhere => two-stage judging */
  fair: number | null;
  /** Initial-period (early_days まで) hit threshold */
  early: number | null;
}

export interface JudgeSettings {
  windowType: "cumulative" | "last_n_days";
  windowDays: number | null;
  minDays: number;
  minSpend: number;
  earlyDays: number;
}

/** Totals over the judging window. Rates are "% numbers" (1.4 = 1.4%). */
export interface MetricTotals {
  spend: number | null;
  cv: number | null;
  mcv: number | null;
  /** MCVR denominator (PV or click per Squad beyond's definition, U-08) */
  mcvrBase: number | null;
  fsver: number | null;
  oar: number | null;
}

export interface JudgeInput {
  rules: readonly JudgeRule[];
  settings: JudgeSettings;
  totals: MetricTotals;
  /** Days with delivery in the window (compared against minDays) */
  deliveryDays: number;
  /** Days since start_date up to the window end, 1-based (decides early vs target phase) */
  elapsedDays: number;
  window: { from: string; to: string };
  rulesUpdatedAt: string | null;
}

export interface MetricBasis {
  metric: MetricKey;
  value: number | null;
  direction?: Direction;
  hit?: number | null;
  fair?: number | null;
  result: MetricOutcome;
}

export interface JudgeBasis {
  window: { type: JudgeSettings["windowType"]; from: string; to: string; days: number };
  rulesUpdatedAt: string | null;
  phase: "early" | "target";
  reason?: "min_days" | "min_spend" | "no_rules" | "no_data";
  metrics: MetricBasis[];
  judge: JudgeResult;
}

export function metricValue(metric: MetricKey, t: MetricTotals): number | null {
  switch (metric) {
    case "spend":
      return t.spend;
    case "cv":
      return t.cv;
    case "cpa":
      return t.spend !== null && t.cv !== null && t.cv > 0 ? t.spend / t.cv : null;
    case "mcvr":
      return t.mcv !== null && t.mcvrBase !== null && t.mcvrBase > 0
        ? (t.mcv / t.mcvrBase) * 100
        : null;
    case "fsver":
      return t.fsver;
    case "oar":
      return t.oar;
  }
}

function meets(value: number, direction: Direction, threshold: number): boolean {
  return direction === "gte" ? value >= threshold : value <= threshold;
}

export function judge(input: JudgeInput): JudgeBasis {
  const { rules, settings, totals } = input;
  const phase: JudgeBasis["phase"] = input.elapsedDays <= settings.earlyDays ? "early" : "target";
  const base = {
    window: { type: settings.windowType, ...input.window, days: input.deliveryDays },
    rulesUpdatedAt: input.rulesUpdatedAt,
    phase,
  };

  if (input.deliveryDays < settings.minDays) {
    return { ...base, reason: "min_days", metrics: [], judge: "pending" };
  }
  if ((totals.spend ?? 0) < settings.minSpend) {
    return { ...base, reason: "min_spend", metrics: [], judge: "pending" };
  }

  const hitThreshold = (r: JudgeRule): number | null =>
    phase === "early" ? (r.early ?? r.hit) : r.hit;
  const usable = rules.filter((r) => r.enabled && hitThreshold(r) !== null);
  if (usable.length === 0) {
    return { ...base, reason: "no_rules", metrics: [], judge: "pending" };
  }

  const twoStage = usable.every((r) => r.fair === null);
  const metrics: MetricBasis[] = usable.map((rule) => {
    const hit = hitThreshold(rule) as number;
    const fair = phase === "target" && !twoStage ? (rule.fair ?? hit) : null;
    const value = metricValue(rule.metric, totals);
    const basis = { metric: rule.metric, value, direction: rule.direction, hit, fair };

    if (value === null) {
      // CPA with CV=0 is "基準を満たさない"; anything else without data is excluded.
      const cpaWithoutCv = rule.metric === "cpa" && totals.spend !== null && totals.cv === 0;
      return { ...basis, result: cpaWithoutCv ? "miss" : "no_data" };
    }
    if (meets(value, rule.direction, hit)) return { ...basis, result: "hit" };
    if (fair !== null && meets(value, rule.direction, fair)) return { ...basis, result: "fair" };
    return { ...basis, result: "miss" };
  });

  const judged = metrics.filter((m) => m.result !== "no_data");
  if (judged.length === 0) {
    return { ...base, reason: "no_data", metrics, judge: "pending" };
  }

  let result: JudgeResult;
  if (judged.every((m) => m.result === "hit")) result = "hit";
  else if (phase === "target" && !twoStage && judged.every((m) => m.result !== "miss")) result = "fair";
  else result = "miss";

  return { ...base, metrics, judge: result };
}

export interface DailyRow {
  spend: number | null;
  cv: number | null;
  mcv: number | null;
  pv: number | null;
  click: number | null;
  fsver: number | null;
  oar: number | null;
}

function sumOrNull(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
}

/** PV-weighted average for rates Squad beyond only returns as percentages (spec ch.8 【仮】). */
function weightedRate(rows: readonly DailyRow[], key: "fsver" | "oar"): number | null {
  let weight = 0;
  let total = 0;
  let plain: number[] = [];
  for (const row of rows) {
    const v = row[key];
    if (v === null) continue;
    plain = [...plain, v];
    if (row.pv !== null && row.pv > 0) {
      weight += row.pv;
      total += v * row.pv;
    }
  }
  if (plain.length === 0) return null;
  return weight > 0 ? total / weight : plain.reduce((a, b) => a + b, 0) / plain.length;
}

export function aggregateDaily(rows: readonly DailyRow[]): MetricTotals {
  const pv = sumOrNull(rows.map((r) => r.pv));
  return {
    spend: sumOrNull(rows.map((r) => r.spend)),
    cv: sumOrNull(rows.map((r) => r.cv)),
    mcv: sumOrNull(rows.map((r) => r.mcv)),
    mcvrBase: pv ?? sumOrNull(rows.map((r) => r.click)),
    fsver: weightedRate(rows, "fsver"),
    oar: weightedRate(rows, "oar"),
  };
}

/** 画面で使う最終判定 = COALESCE(judge_manual, judge_auto) */
export function finalJudge(
  manual: "hit" | "fair" | "miss" | null,
  auto: JudgeResult | null,
): JudgeResult | null {
  return manual ?? auto;
}
