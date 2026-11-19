// 登録ウィザード (S-04) payload. Shared by the wizard UI and POST /api/registrations.
import { z } from "zod";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません");
const nonNegInt = z.coerce.number().int("整数で入力してください").min(0, "0以上の整数で入力してください");
const optInt = z.preprocess((v) => (v === "" || v === null ? undefined : v), nonNegInt.optional());
const optRate = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().min(0).max(100).optional());

export const httpsUrl = z
  .string()
  .trim()
  .url("URLの形式が正しくありません")
  .refine((u) => u.startsWith("https://"), "URLはhttpsのみ使えます");

export const productStepSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), id: z.string().min(1, "商材を選んでください") }),
  z.object({
    mode: z.literal("new"),
    name: z.string().trim().min(1, "商材名を入力してください").max(100, "商材名は100文字以内にしてください"),
    clientName: z.string().trim().min(1, "クライアント名を入力してください").max(100),
    categoryId: z.string().min(1, "業種カテゴリを選んでください"),
    targetGender: z.string().max(50).optional(),
    targetAge: z.string().max(50).optional(),
    targetPain: z.string().max(500).optional(),
    priceRange: z.string().max(100).optional(),
    offer: z.string().max(500).optional(),
    usp: z.string().max(2000).optional(),
  }),
]);

export const creativeStepSchema = z
  .object({
    existingId: z.string().optional(),
    kind: z.enum(["video", "banner"], { message: "種別を選んでください" }),
    r2Key: z.string().optional(),
    fileSha256: z.string().optional(),
    thumbnailKey: z.string().optional(),
    sourceUrl: z.string().trim().optional(),
    durationSec: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().min(0).optional()),
    width: optInt,
    height: optInt,
    mainCopy: z.string().max(2000).optional(),
    script: z.array(z.object({ from: z.number(), to: z.number(), visual: z.string().default(""), telop: z.string().default(""), narration: z.string().default("") })).default([]),
    sbCreativeId: z.string().optional(),
  })
  .refine((c) => c.existingId || c.r2Key || (c.sourceUrl && c.sourceUrl.length > 0), { message: "ファイルかURLのどちらかを指定してください", path: ["sourceUrl"] })
  .refine((c) => !c.sourceUrl || /^https?:\/\//.test(c.sourceUrl), { message: "URLの形式が正しくありません", path: ["sourceUrl"] });

export const articleStepSchema = z.object({
  existingId: z.string().optional(),
  url: httpsUrl,
  finalLpUrl: z.union([httpsUrl, z.literal("")]).optional(),
  title: z.string().max(300).optional(),
  bodyText: z.string().max(200_000).optional(),
  blocks: z.array(z.object({ type: z.string(), heading: z.string().max(200), summary: z.string().max(1000).default("") })).default([]),
  screenshotKey: z.string().optional(),
  fvKey: z.string().optional(),
  sbPageId: z.string().optional(),
  sbVersionId: z.string().optional(),
});

export const manualMetricsSchema = z.object({
  spend: nonNegInt,
  imp: optInt,
  click: optInt,
  pv: optInt,
  cv: nonNegInt,
  mcv: optInt,
  fsver: optRate,
  oar: optRate,
});
export type ManualMetricsInput = z.infer<typeof manualMetricsSchema>;

export const combinationStepSchema = z
  .object({
    media: z.string().min(1, "媒体を選んでください"),
    startDate: ymd,
    endDate: z.union([ymd, z.literal("")]).optional(),
    metricsSource: z.enum(["sb", "manual", "csv"]),
    sbVersionId: z.string().optional(),
    sbCreativeId: z.string().optional(),
    manual: manualMetricsSchema.optional(),
    override: z.object({ judge: z.enum(["hit", "fair", "miss"]), reason: z.string().trim().min(1, "理由を入力してください").max(500, "理由は500文字以内にしてください") }).optional(),
    generationVersionId: z.string().optional(),
  })
  .refine((c) => !c.endDate || c.startDate <= c.endDate, { message: "開始日は終了日以前にしてください", path: ["startDate"] })
  .refine((c) => c.metricsSource !== "sb" || (c.sbVersionId && c.sbCreativeId), { message: "Squad beyondのVersionとクリエイティブを選んでください", path: ["sbVersionId"] })
  .refine((c) => c.metricsSource !== "manual" || c.manual, { message: "実績を入力してください", path: ["manual"] });

export const tagsStepSchema = z.object({
  tagIds: z.array(z.string()).default([]),
  aiTagIds: z.array(z.string()).default([]),
  winMemo: z.string().max(2000, "勝因メモは2,000文字以内にしてください").default(""),
  nextMemo: z.string().max(2000).default(""),
});

export const registrationSchema = z.object({
  draftId: z.string().optional(),
  sbCandidateId: z.string().optional(),
  product: productStepSchema,
  creative: creativeStepSchema,
  article: articleStepSchema,
  combination: combinationStepSchema,
  tags: tagsStepSchema,
});
export type RegistrationInput = z.infer<typeof registrationSchema>;

export const STEP_KEYS = ["product", "creative", "article", "combination", "tags"] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export const STEP_LABEL: Record<StepKey, string> = {
  product: "商材",
  creative: "クリエイティブ",
  article: "記事LP",
  combination: "組み合わせと実績",
  tags: "タグと勝因メモ",
};

export const STEP_SCHEMAS = {
  product: productStepSchema,
  creative: creativeStepSchema,
  article: articleStepSchema,
  combination: combinationStepSchema,
  tags: tagsStepSchema,
} as const;
