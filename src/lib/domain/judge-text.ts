import type { JudgeBasis, MetricBasis, MetricKey } from "./judge";
import { METRIC_LABEL, METRIC_UNIT } from "./constants";

export function formatMetric(metric: MetricKey, value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  switch (METRIC_UNIT[metric]) {
    case "yen":
      return `¥${Math.round(value).toLocaleString("ja-JP")}`;
    case "pct":
      return `${value.toFixed(1)}%`;
    case "count":
      return Math.round(value).toLocaleString("ja-JP");
  }
}

export function thresholdText(m: Pick<MetricBasis, "metric" | "direction">, value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${formatMetric(m.metric, value)}${m.direction === "gte" ? "以上" : "以下"}`;
}

const RESULT_MARK = { hit: "○", fair: "△", miss: "×", no_data: "データなし" } as const;

/** One-line explanation of which criteria passed (S-02 header). */
export function basisSummary(basis: JudgeBasis | null): string {
  if (!basis) return "判定前です";
  if (basis.reason === "min_days") return `配信日数が最低配信日数に届かないため判定保留（${basis.window.days}日）`;
  if (basis.reason === "min_spend") return "配信金額が最低配信金額に届かないため判定保留";
  if (basis.reason === "no_rules") return "このカテゴリには当たり基準が設定されていないため判定保留";
  if (basis.reason === "no_data") return "判定に使える指標のデータがないため判定保留";
  const phase = basis.phase === "early" ? "初期基準" : "目標基準";
  const parts = basis.metrics.map((m) => `${METRIC_LABEL[m.metric]} ${formatMetric(m.metric, m.value)}${m.result === "no_data" ? "（データなし）" : `（${thresholdText(m, m.hit)} ${RESULT_MARK[m.result]}）`}`);
  return `${phase}：${parts.join(" ／ ")}`;
}
