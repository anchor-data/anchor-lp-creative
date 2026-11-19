// 似た事例の推薦スコア (spec 9-2). Pure; the DB layer supplies candidates.
import type { JudgeResult } from "./judge";

export interface RecWeights {
  sim: number;
  judge: number;
  recency: number;
  origin: number;
  cat: number;
}

export const DEFAULT_REC_WEIGHTS: RecWeights = { sim: 0.5, judge: 0.2, recency: 0.1, origin: 0.1, cat: 0.1 };
const HALF_LIFE_DAYS = 180;

export interface RecCandidate {
  id: string;
  similarity: number; // 0..1
  judge: JudgeResult | null;
  endDate: string | null; // null = 配信中
  origin: "own" | "market";
  categoryId: string;
  parentCategoryId: string | null;
  recBonus: number;
  tagNames: readonly string[];
  targetText: string;
}

export interface RecQuery {
  categoryId: string;
  parentCategoryId: string | null;
  targetText: string;
  tagNames?: readonly string[];
}

export function recencyScore(endDate: string | null, today: string): number {
  if (!endDate) return 1;
  const days = Math.max(0, (Date.parse(today) - Date.parse(endDate)) / 86_400_000);
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

export function categoryScore(c: Pick<RecCandidate, "categoryId" | "parentCategoryId">, q: RecQuery): number {
  if (c.categoryId === q.categoryId) return 1;
  if (c.parentCategoryId && c.parentCategoryId === q.parentCategoryId) return 0.5;
  return 0;
}

export function score(c: RecCandidate, q: RecQuery, w: RecWeights, today: string): number {
  const judgeScore = c.judge === "hit" ? 1 : c.judge === "fair" ? 0.5 : 0;
  return (
    w.sim * c.similarity +
    w.judge * judgeScore +
    w.recency * recencyScore(c.endDate, today) +
    w.origin * (c.origin === "own" ? 1 : 0.5) +
    w.cat * categoryScore(c, q) +
    c.recBonus
  );
}

/** Rule-based one-line reason (spec: AIは使わない) */
export function reason(c: RecCandidate, q: RecQuery): string {
  const parts: string[] = [];
  const cat = categoryScore(c, q);
  if (cat === 1) parts.push("同じ中分類");
  else if (cat === 0.5) parts.push("同じ大分類");
  const shared = (q.tagNames ?? []).filter((t) => c.tagNames.includes(t));
  if (shared.length > 0) parts.push(`共通タグ：${shared.slice(0, 3).join("・")}`);
  const qWords = tokens(q.targetText);
  if (qWords.some((w) => c.targetText.includes(w))) parts.push("ターゲットが近い");
  if (c.similarity >= 0.8) parts.push("訴求内容が近い");
  return parts.length > 0 ? parts.join("／") : "内容の類似度が高い";
}

function tokens(text: string): string[] {
  return text
    .split(/[\s・、,／/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

export interface Ranked {
  id: string;
  score: number;
  reason: string;
}

export function rank(
  candidates: readonly RecCandidate[],
  q: RecQuery,
  w: RecWeights,
  today: string,
  limit = 20,
): Ranked[] {
  return candidates
    .filter((c) => c.judge === "hit" || c.judge === "fair")
    .map((c) => ({ id: c.id, score: score(c, q, w, today), reason: reason(c, q) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
