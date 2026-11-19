import type { JudgeResult, MetricKey } from "./judge";

export type Role = "viewer" | "editor" | "admin";
export type Origin = "own" | "market";
export type CreativeKind = "video" | "banner";

export const MEDIA = [
  { code: "meta", label: "Meta" },
  { code: "tiktok", label: "TikTok" },
  { code: "line", label: "LINE" },
  { code: "youtube", label: "YouTube" },
  { code: "google", label: "Google" },
  { code: "yahoo", label: "Yahoo!" },
  { code: "x", label: "X" },
  { code: "smartnews", label: "SmartNews" },
  { code: "other", label: "その他" },
] as const;
export type MediaCode = (typeof MEDIA)[number]["code"];

export function mediaLabel(code: string): string {
  return MEDIA.find((m) => m.code === code)?.label ?? code;
}

export const JUDGE_LABEL: Record<JudgeResult, string> = {
  hit: "当たり",
  fair: "まずまず",
  miss: "外れ",
  pending: "判定保留",
};

export const METRIC_LABEL: Record<MetricKey, string> = {
  spend: "配信金額",
  cpa: "CPA",
  mcvr: "MCVR",
  cv: "CV数",
  fsver: "FSVER",
  oar: "OAR",
};

/** Metrics shown in yen vs percent vs count */
export const METRIC_UNIT: Record<MetricKey, "yen" | "pct" | "count"> = {
  spend: "yen",
  cpa: "yen",
  mcvr: "pct",
  cv: "count",
  fsver: "pct",
  oar: "pct",
};

/** 記事構成ブロックの種類 (要件定義書の記事構成ブロック) */
export const ARTICLE_BLOCK_TYPES = [
  { code: "fv", label: "ファーストビュー" },
  { code: "pain", label: "悩み提起" },
  { code: "cause", label: "原因解説" },
  { code: "solution", label: "解決策" },
  { code: "product", label: "商品紹介" },
  { code: "authority", label: "権威・専門家" },
  { code: "review", label: "口コミ" },
  { code: "comparison", label: "比較" },
  { code: "offer", label: "オファー" },
  { code: "faq", label: "よくある質問" },
  { code: "cta", label: "CTA" },
] as const;
export type ArticleBlockType = (typeof ARTICLE_BLOCK_TYPES)[number]["code"];

export function blockLabel(code: string): string {
  return ARTICLE_BLOCK_TYPES.find((b) => b.code === code)?.label ?? code;
}

export const SORTS = [
  { code: "cpa_asc", label: "CPAが低い順" },
  { code: "mcvr_desc", label: "MCVRが高い順" },
  { code: "cvr_desc", label: "CVRが高い順" },
  { code: "spend_desc", label: "配信金額が多い順" },
  { code: "cv_desc", label: "CV数が多い順" },
  { code: "created_desc", label: "登録が新しい順" },
] as const;
export type SortCode = (typeof SORTS)[number]["code"];

export const DISMISS_REASONS = ["テスト配信", "商材が対象外", "その他"] as const;

export const PAGE_SIZE = 24;
