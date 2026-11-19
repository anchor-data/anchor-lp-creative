import { describe, expect, it } from "vitest";
import { DEFAULT_REC_WEIGHTS, rank, recencyScore, score, type RecCandidate, type RecQuery } from "./recommend";

const q: RecQuery = { categoryId: "c-gut", parentCategoryId: "c-health", targetText: "40代女性 すっきりしない", tagNames: ["悩み共感"] };
const base: RecCandidate = {
  id: "a",
  similarity: 0.8,
  judge: "hit",
  endDate: null,
  origin: "own",
  categoryId: "c-gut",
  parentCategoryId: "c-health",
  recBonus: 0,
  tagNames: ["悩み共感"],
  targetText: "40代女性",
};

describe("recommend", () => {
  it("halves recency every 180 days and treats ongoing as 1", () => {
    expect(recencyScore(null, "2026-11-19")).toBe(1);
    expect(recencyScore("2026-05-23", "2026-11-19")).toBeCloseTo(0.5, 2);
  });

  it("computes the weighted score from spec 9-2", () => {
    // 0.5*0.8 + 0.2*1 + 0.1*1 + 0.1*1 + 0.1*1 = 0.9
    expect(score(base, q, DEFAULT_REC_WEIGHTS, "2026-11-19")).toBeCloseTo(0.9);
  });

  it("drops misses/pending and orders by score", () => {
    const ranked = rank(
      [
        base,
        { ...base, id: "b", judge: "fair", origin: "market" },
        { ...base, id: "c", judge: "miss" },
        { ...base, id: "d", judge: "pending" },
      ],
      q,
      DEFAULT_REC_WEIGHTS,
      "2026-11-19",
    );
    expect(ranked.map((r) => r.id)).toEqual(["a", "b"]);
    expect(ranked[0].reason).toContain("同じ中分類");
  });
});
