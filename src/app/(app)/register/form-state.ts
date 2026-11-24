// Wizard form state (all strings while editing) and conversion to the API payload.
import { STEP_SCHEMAS, type RegistrationInput, type StepKey } from "@/lib/domain/registration";
import type { LpPreview } from "@/lib/domain/lp-preview";
import type { VideoAnalysis } from "@/lib/domain/video-analysis";

export interface ScriptRow {
  from: string;
  to: string;
  narration: string;
  telop: string;
  visual: string;
}
export interface BlockRow {
  type: string;
  heading: string;
  summary: string;
}

/** Read-only details of a product picked from 登録済み (STEP1 "（自動）" fields). */
export interface ExistingProductInfo {
  clientName: string;
  categoryName: string;
  target: string;
  priceRange: string;
  offer: string;
  usp: string;
}

export type ManualJudge = "" | "hit" | "fair" | "miss";

export interface FormState {
  sbCandidateId: string | null;
  product: {
    mode: "existing" | "new";
    id: string;
    label: string; // for summary
    categoryIdOfExisting: string;
    existingInfo: ExistingProductInfo | null;
    name: string;
    clientName: string;
    categoryId: string;
    targetGender: string;
    targetAge: string;
    targetPain: string;
    priceRange: string;
    offer: string;
    usp: string;
  };
  creative: {
    existingId: string;
    kind: "video" | "banner" | "";
    r2Key: string;
    fileName: string;
    fileSha256: string;
    thumbnailKey: string;
    sourceUrl: string;
    durationSec: string;
    width: string;
    height: string;
    mainCopy: string;
    script: ScriptRow[];
    sbCreativeId: string;
    analysis: VideoAnalysis | null;
  };
  article: {
    source: "sb" | "url";
    existingId: string;
    url: string;
    finalLpUrl: string;
    title: string;
    bodyText: string;
    blocks: BlockRow[];
    screenshotKey: string;
    sbPageId: string;
    sbPageName: string;
    sbVersionId: string;
    sbVersionName: string;
    preview: LpPreview | null;
  };
  combination: {
    media: string;
    startDate: string;
    endDate: string;
    metricsSource: "sb" | "manual";
    sbCreativeId: string;
    manual: Record<"spend" | "imp" | "click" | "pv" | "cv" | "mcv" | "fsver" | "oar", string>;
    targetCpa: string;
    /** 当面は手動判定で運用する。空なら自動判定（基準未設定なら判定保留）。 */
    judge: ManualJudge;
    judgeReason: string;
  };
  tags: { tagIds: string[]; aiTagIds: string[]; winMemo: string; nextMemo: string };
}

export function emptyState(): FormState {
  return {
    sbCandidateId: null,
    product: { mode: "existing", id: "", label: "", categoryIdOfExisting: "", existingInfo: null, name: "", clientName: "", categoryId: "", targetGender: "", targetAge: "", targetPain: "", priceRange: "", offer: "", usp: "" },
    creative: { existingId: "", kind: "video", r2Key: "", fileName: "", fileSha256: "", thumbnailKey: "", sourceUrl: "", durationSec: "", width: "", height: "", mainCopy: "", script: [], sbCreativeId: "", analysis: null },
    article: { source: "url", existingId: "", url: "", finalLpUrl: "", title: "", bodyText: "", blocks: [], screenshotKey: "", sbPageId: "", sbPageName: "", sbVersionId: "", sbVersionName: "", preview: null },
    combination: {
      media: "", startDate: "", endDate: "", metricsSource: "manual", sbCreativeId: "",
      manual: { spend: "", imp: "", click: "", pv: "", cv: "", mcv: "", fsver: "", oar: "" },
      targetCpa: "", judge: "", judgeReason: "",
    },
    tags: { tagIds: [], aiTagIds: [], winMemo: "", nextMemo: "" },
  };
}

/** Merges a saved draft over the empty state step by step, so drafts from older layouts still load. */
export function restoreState(saved: Partial<FormState> | null | undefined): FormState {
  const base = emptyState();
  if (!saved) return base;
  const combination = { ...base.combination, ...(saved.combination ?? {}) };
  return {
    sbCandidateId: saved.sbCandidateId ?? null,
    product: { ...base.product, ...(saved.product ?? {}) },
    creative: { ...base.creative, ...(saved.creative ?? {}) },
    article: { ...base.article, ...(saved.article ?? {}), source: saved.article?.source ?? (saved.article?.sbVersionId ? "sb" : "url") },
    combination: { ...combination, metricsSource: combination.metricsSource === "sb" ? "sb" : "manual", manual: { ...base.combination.manual, ...(saved.combination?.manual ?? {}) } },
    tags: { ...base.tags, ...(saved.tags ?? {}) },
  };
}

const opt = (v: string): string | undefined => (v.trim() === "" ? undefined : v.trim());
const num = (v: string): number | undefined => (v.trim() === "" ? undefined : Number(v.replaceAll(",", "")));

export function stepPayload(s: FormState, step: StepKey): unknown {
  switch (step) {
    case "product":
      return s.product.mode === "existing"
        ? { mode: "existing", id: s.product.id }
        : { mode: "new", name: s.product.name, clientName: s.product.clientName, categoryId: s.product.categoryId, targetGender: opt(s.product.targetGender), targetAge: opt(s.product.targetAge), targetPain: opt(s.product.targetPain), priceRange: opt(s.product.priceRange), offer: opt(s.product.offer), usp: opt(s.product.usp) };
    case "creative":
      return {
        existingId: opt(s.creative.existingId), kind: s.creative.kind || undefined, r2Key: opt(s.creative.r2Key), fileSha256: opt(s.creative.fileSha256),
        thumbnailKey: opt(s.creative.thumbnailKey), sourceUrl: opt(s.creative.sourceUrl), durationSec: num(s.creative.durationSec), width: num(s.creative.width), height: num(s.creative.height),
        mainCopy: opt(s.creative.mainCopy), sbCreativeId: opt(s.creative.sbCreativeId), analysis: s.creative.analysis ?? undefined,
        script: s.creative.script.filter((r) => r.narration || r.telop || r.visual).map((r) => ({ from: Number(r.from) || 0, to: Number(r.to) || 0, narration: r.narration, telop: r.telop, visual: r.visual })),
      };
    case "article": {
      const a = s.article;
      return {
        existingId: opt(a.existingId), url: a.url.trim(), finalLpUrl: a.finalLpUrl.trim(), title: opt(a.title), bodyText: opt(a.bodyText),
        blocks: a.blocks.filter((b) => b.heading.trim()), screenshotKey: opt(a.screenshotKey), fvKey: opt(a.screenshotKey),
        // Linked from either source: picked in 「Squad beyondから選ぶ」, or matched from the URL / name.
        sbPageId: opt(a.sbPageId), sbVersionId: opt(a.sbVersionId),
        preview: a.preview ?? undefined,
      };
    }
    case "combination": {
      const c = s.combination;
      const sb = c.metricsSource === "sb";
      return {
        media: c.media, startDate: c.startDate, endDate: c.endDate, metricsSource: c.metricsSource,
        // beyondページ・Version come from STEP3 (Figma STEP4 note).
        sbVersionId: sb ? opt(s.article.sbVersionId) : undefined, sbCreativeId: sb ? opt(c.sbCreativeId) : undefined,
        manual: sb ? undefined : Object.fromEntries(Object.entries(c.manual).map(([k, v]) => [k, num(v)])),
        targetCpa: num(c.targetCpa),
        override: c.judge ? { judge: c.judge, reason: c.judgeReason } : undefined,
      };
    }
    case "tags":
      return s.tags;
  }
}

export interface StepValidation {
  ok: boolean;
  errors: Record<string, string>;
}

export function validateStep(s: FormState, step: StepKey): StepValidation {
  const result = STEP_SCHEMAS[step].safeParse(stepPayload(s, step));
  if (result.success) return { ok: true, errors: {} };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

export function toPayload(s: FormState, draftId: string | null): RegistrationInput {
  return {
    draftId: draftId ?? undefined,
    sbCandidateId: s.sbCandidateId ?? undefined,
    product: stepPayload(s, "product"),
    creative: stepPayload(s, "creative"),
    article: stepPayload(s, "article"),
    combination: stepPayload(s, "combination"),
    tags: stepPayload(s, "tags"),
  } as RegistrationInput;
}
