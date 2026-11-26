// S-03 「編集」: what a registered combination's detail page lets people change.
import { z } from "zod";
import { MEDIA } from "./constants";
import { judgeReasonSchema } from "./registration";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません");

/** "auto" leaves the judgment to the criteria; anything else is a manual judgment. */
export const EDIT_JUDGES = ["auto", "hit", "fair", "miss"] as const;
export type EditJudge = (typeof EDIT_JUDGES)[number];

export const combinationEditSchema = z
  .object({
    updatedAt: z.string().min(1),
    productName: z.string().trim().min(1, "商材名を入れてください").max(100, "商材名は100文字以内にしてください"),
    categoryId: z.string().min(1, "業種カテゴリを選んでください"),
    articleTitle: z.string().trim().max(200, "記事タイトルは200文字以内にしてください"),
    media: z.enum(MEDIA.map((m) => m.code) as [string, ...string[]], { message: "媒体を選んでください" }),
    startDate: isoDate,
    endDate: isoDate.nullable(),
    targetCpa: z.number().int("目標CPAは整数で入れてください").min(0, "目標CPAは0以上にしてください").nullable(),
    judge: z.enum(EDIT_JUDGES),
    judgeReason: judgeReasonSchema,
  })
  .refine((v) => v.endDate === null || v.endDate >= v.startDate, { message: "配信終了日は開始日以降にしてください", path: ["endDate"] });

export type CombinationEdit = z.infer<typeof combinationEditSchema>;

export interface ManualJudgeState {
  judge: "hit" | "fair" | "miss" | null;
  reason: string | null;
  by: string | null;
  at: string | null;
}

/**
 * The manual-judgment columns after an edit. Who/when only move when the judgment or its reason
 * actually changed, so saving other fields does not re-stamp an old manual judgment.
 */
export function nextManualJudge(current: ManualJudgeState, judge: EditJudge, reason: string, userId: string, now: string): ManualJudgeState {
  if (judge === "auto") return { judge: null, reason: null, by: null, at: null };
  const nextReason = reason || null;
  if (current.judge === judge && current.reason === nextReason) return current;
  return { judge, reason: nextReason, by: userId, at: now };
}
