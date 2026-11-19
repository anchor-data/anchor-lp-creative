// 生成案の形 (spec 9-3 「出力の形（1案分）」). Shared by server validation and the UI.
import { z } from "zod";

export const sceneSchema = z.object({
  from: z.number(),
  to: z.number(),
  visual: z.string().default(""),
  telop: z.string().default(""),
  narration: z.string().default(""),
});

export const planSchema = z.object({
  axis: z.string().min(1),
  banner: z
    .object({
      mainCopies: z.array(z.string()).min(1),
      subCopy: z.string().default(""),
      composition: z.string().default(""),
    })
    .optional(),
  video: z
    .object({
      durationSec: z.number(),
      hooks: z.array(z.string()).default([]),
      scenes: z.array(sceneSchema).min(1),
    })
    .optional(),
  article: z.object({
    title: z.string().min(1),
    firstView: z.string().default(""),
    blocks: z.array(z.object({ type: z.string(), heading: z.string(), body: z.string().default("") })).min(1),
    cta: z.string().default(""),
  }),
  rationale: z.object({
    aim: z.string().default(""),
    hypothesis: z.string().default(""),
    inherited: z.array(z.object({ combinationId: z.string(), element: z.string() })).default([]),
    playbookItemsUsed: z.array(z.string()).default([]),
  }),
  checks: z
    .object({
      expression: z.array(z.object({ text: z.string(), law: z.string().nullable(), alternative: z.string().nullable(), severity: z.enum(["warn", "ng"]) })).default([]),
      similarity: z.array(z.object({ text: z.string(), combinationId: z.string(), score: z.number() })).default([]),
    })
    .default({ expression: [], similarity: [] }),
});
export type Plan = z.infer<typeof planSchema>;

export const productInputSchema = z.object({
  productId: z.string().optional(),
  name: z.string().trim().min(1, "商材名を入力してください").max(100, "商材名は100文字以内にしてください"),
  categoryId: z.string().min(1, "業種カテゴリを選んでください"),
  target: z.string().trim().min(1, "ターゲットを入力してください").max(500),
  usp: z.string().trim().min(1, "強み（USP）を入力してください").max(2000),
  offer: z.string().trim().max(500).default(""),
  ngWords: z.string().trim().max(2000).default(""),
  referenceText: z.string().max(20000).default(""),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const genOptionsSchema = z.object({
  count: z.union([z.literal(3), z.literal(5)]).default(3),
  kind: z.enum(["banner", "video", "both"]).default("both"),
  durationSec: z.union([z.literal(6), z.literal(15), z.literal(30), z.literal(60)]).default(15),
  tone: z.string().max(100).default(""),
});
export type GenOptions = z.infer<typeof genOptionsSchema>;

export type RegenerateTarget = { kind: "copy" } | { kind: "article-structure" } | { kind: "block"; index: number } | { kind: "video-hook" };

export const PART_LABEL: Record<RegenerateTarget["kind"], string> = {
  copy: "バナーのコピーと動画のフック",
  "article-structure": "記事LPの構成ブロックと各本文",
  block: "記事LPの指定ブロック",
  "video-hook": "動画のフック案",
};
