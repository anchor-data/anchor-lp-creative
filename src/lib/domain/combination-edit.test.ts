import { describe, expect, it } from "vitest";
import { combinationEditSchema, nextManualJudge, type ManualJudgeState } from "./combination-edit";

const VALID = {
  updatedAt: "2026-11-27T00:00:00Z", productName: " Aurelie. ", categoryId: "cat-skin", articleTitle: "4/19首_母の日シミ追加",
  media: "meta", startDate: "2026-04-19", endDate: "2026-05-18", targetCpa: 12000, judge: "hit", judgeReason: "",
};

describe("combinationEditSchema", () => {
  it("accepts a full edit and trims text", () => {
    const r = combinationEditSchema.parse(VALID);
    expect(r.productName).toBe("Aurelie.");
    expect(r.judge).toBe("hit");
  });

  it("allows an open-ended period and no target CPA", () => {
    expect(combinationEditSchema.safeParse({ ...VALID, endDate: null, targetCpa: null }).success).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    const r = combinationEditSchema.safeParse({ ...VALID, endDate: "2026-04-01" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["endDate"]);
  });

  it("rejects unknown media, empty product names and negative or fractional CPA", () => {
    expect(combinationEditSchema.safeParse({ ...VALID, media: "myspace" }).success).toBe(false);
    expect(combinationEditSchema.safeParse({ ...VALID, productName: "  " }).success).toBe(false);
    expect(combinationEditSchema.safeParse({ ...VALID, targetCpa: -1 }).success).toBe(false);
    expect(combinationEditSchema.safeParse({ ...VALID, targetCpa: 10.5 }).success).toBe(false);
  });
});

describe("nextManualJudge", () => {
  const manual: ManualJudgeState = { judge: "hit", reason: "CPA目標内", by: "u-old", at: "2026-11-01T00:00:00Z" };
  const NOW = "2026-11-27T01:00:00Z";

  it("clears every column when the judgment goes back to auto", () => {
    expect(nextManualJudge(manual, "auto", "ignored", "u-new", NOW)).toEqual({ judge: null, reason: null, by: null, at: null });
  });

  it("keeps who and when if neither the judgment nor the reason changed", () => {
    expect(nextManualJudge(manual, "hit", "CPA目標内", "u-new", NOW)).toBe(manual);
  });

  it("re-stamps when the judgment or the reason changes", () => {
    expect(nextManualJudge(manual, "miss", "CPA目標内", "u-new", NOW)).toEqual({ judge: "miss", reason: "CPA目標内", by: "u-new", at: NOW });
    expect(nextManualJudge(manual, "hit", "", "u-new", NOW)).toEqual({ judge: "hit", reason: null, by: "u-new", at: NOW });
  });

  it("stamps a first manual judgment", () => {
    const none: ManualJudgeState = { judge: null, reason: null, by: null, at: null };
    expect(nextManualJudge(none, "fair", "", "u-new", NOW)).toEqual({ judge: "fair", reason: null, by: "u-new", at: NOW });
  });
});
