// Wizard form state (all strings while editing) and conversion to the API payload.
import { STEP_SCHEMAS, type RegistrationInput, type StepKey } from "@/lib/domain/registration";

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

export interface FormState {
  sbCandidateId: string | null;
  product: {
    mode: "existing" | "new";
    id: string;
    label: string; // for summary
    categoryIdOfExisting: string;
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
  };
  article: {
    existingId: string;
    url: string;
    finalLpUrl: string;
    title: string;
    bodyText: string;
    blocks: BlockRow[];
    screenshotKey: string;
    sbPageId: string;
    sbVersionId: string;
  };
  combination: {
    media: string;
    startDate: string;
    endDate: string;
    metricsSource: "sb" | "manual" | "csv";
    sbPageId: string;
    sbVersionId: string;
    sbCreativeId: string;
    manual: Record<"spend" | "imp" | "click" | "pv" | "cv" | "mcv" | "fsver" | "oar", string>;
    overrideOn: boolean;
    overrideJudge: "hit" | "fair" | "miss";
    overrideReason: string;
  };
  tags: { tagIds: string[]; aiTagIds: string[]; winMemo: string; nextMemo: string };
}

export function emptyState(): FormState {
  return {
    sbCandidateId: null,
    product: { mode: "existing", id: "", label: "", categoryIdOfExisting: "", name: "", clientName: "", categoryId: "", targetGender: "", targetAge: "", targetPain: "", priceRange: "", offer: "", usp: "" },
    creative: { existingId: "", kind: "", r2Key: "", fileName: "", fileSha256: "", thumbnailKey: "", sourceUrl: "", durationSec: "", width: "", height: "", mainCopy: "", script: [], sbCreativeId: "" },
    article: { existingId: "", url: "", finalLpUrl: "", title: "", bodyText: "", blocks: [], screenshotKey: "", sbPageId: "", sbVersionId: "" },
    combination: {
      media: "", startDate: "", endDate: "", metricsSource: "manual", sbPageId: "", sbVersionId: "", sbCreativeId: "",
      manual: { spend: "", imp: "", click: "", pv: "", cv: "", mcv: "", fsver: "", oar: "" },
      overrideOn: false, overrideJudge: "hit", overrideReason: "",
    },
    tags: { tagIds: [], aiTagIds: [], winMemo: "", nextMemo: "" },
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
        mainCopy: opt(s.creative.mainCopy), sbCreativeId: opt(s.creative.sbCreativeId),
        script: s.creative.script.filter((r) => r.narration || r.telop || r.visual).map((r) => ({ from: Number(r.from) || 0, to: Number(r.to) || 0, narration: r.narration, telop: r.telop, visual: r.visual })),
      };
    case "article":
      return {
        existingId: opt(s.article.existingId), url: s.article.url.trim(), finalLpUrl: s.article.finalLpUrl.trim(), title: opt(s.article.title), bodyText: opt(s.article.bodyText),
        blocks: s.article.blocks.filter((b) => b.heading.trim()), screenshotKey: opt(s.article.screenshotKey), fvKey: opt(s.article.screenshotKey),
        sbPageId: opt(s.article.sbPageId), sbVersionId: opt(s.article.sbVersionId),
      };
    case "combination": {
      const c = s.combination;
      return {
        media: c.media, startDate: c.startDate, endDate: c.endDate, metricsSource: c.metricsSource,
        sbVersionId: c.metricsSource === "sb" ? opt(c.sbVersionId) : undefined, sbCreativeId: c.metricsSource === "sb" ? opt(c.sbCreativeId) : undefined,
        manual: c.metricsSource === "manual" ? Object.fromEntries(Object.entries(c.manual).map(([k, v]) => [k, num(v)])) : undefined,
        override: c.overrideOn ? { judge: c.overrideJudge, reason: c.overrideReason } : undefined,
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
