"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { STEP_KEYS, STEP_LABEL, type StepKey } from "@/lib/domain/registration";
import { JUDGE_LABEL, mediaLabel } from "@/lib/domain/constants";
import { yen } from "@/lib/format";
import { Button, LinkButton } from "@/components/ui";
import { api, ClientApiError, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";
import { emptyState, restoreState, toPayload, validateStep, type FormState } from "./form-state";
import { ProductStep } from "./steps/product-step";
import { CreativeStep } from "./steps/creative-step";
import { ArticleStep } from "./steps/article-step";
import { CombinationStep, type JudgePreview } from "./steps/combination-step";
import { TagsStep } from "./steps/tags-step";
import type { CategoryOption, TagOption, TagTypeOption } from "./steps/shared";

interface Prefill {
  candidateId: string; media: string; startDate: string | null; endDate: string | null; pageId: string | null;
  versionId: string; versionUrl: string | null; versionName: string | null; bodyText: string | null;
  creativeId: string; creativeName: string | null; productId: string | null; categoryId: string | null;
}

/** Section headings in the Figma frames (tabs keep STEP_LABEL). */
const STEP_HEADING: Record<StepKey, string> = { ...STEP_LABEL, product: "商材を選ぶ" };

export interface WizardProps {
  categories: CategoryOption[];
  tagTypes: TagTypeOption[];
  tags: TagOption[];
  candidateId: string | null;
  draftId: string | null;
}

export function RegisterWizard({ categories, tagTypes, tags, candidateId, draftId: initialDraftId }: WizardProps) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<FormState>(emptyState);
  const [step, setStep] = useState<StepKey>("product");
  const [visited, setVisited] = useState<Set<StepKey>>(new Set(["product"]));
  const [attempted, setAttempted] = useState<Set<StepKey>>(new Set());
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!initialDraftId && !candidateId);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<JudgePreview | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const dirty = useRef(false);

  const update = useCallback((fn: (s: FormState) => FormState) => {
    dirty.current = true;
    setState((s) => fn(s));
  }, []);

  // Load a draft or candidate prefill (S-05 → S-04).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (initialDraftId) {
          const d = await api<{ payload: { state: FormState; step: StepKey } }>(`/api/drafts/${initialDraftId}`);
          if (!cancelled && d.payload?.state) {
            setState(restoreState(d.payload.state));
            setStep(d.payload.step ?? "product");
          }
        } else if (candidateId) {
          const p = await api<Prefill>(`/api/sb/candidates/${candidateId}/prefill`);
          if (cancelled) return;
          setState((s) => ({
            ...s,
            sbCandidateId: p.candidateId,
            product: p.productId ? { ...s.product, mode: "existing", id: p.productId, label: "（beyondページにひも付いた商材）", categoryIdOfExisting: p.categoryId ?? "" } : { ...s.product, mode: "new", categoryId: p.categoryId ?? "" },
            creative: { ...s.creative, sbCreativeId: p.creativeId, mainCopy: s.creative.mainCopy || "" },
            article: { ...s.article, source: "sb", url: p.versionUrl ?? "", bodyText: p.bodyText ?? "", title: p.versionName ?? "", sbPageId: p.pageId ?? "", sbVersionId: p.versionId },
            combination: { ...s.combination, media: p.media, startDate: p.startDate ?? "", endDate: p.endDate ?? "", metricsSource: "sb", sbCreativeId: p.creativeId },
          }));
          dirty.current = true;
        }
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDraftId, candidateId, toast]);

  // Auto-save the draft (resume later from the user menu).
  useEffect(() => {
    if (!loaded || !dirty.current) return;
    const t = setTimeout(async () => {
      try {
        const body = { payload: { state, step }, sbCandidateId: state.sbCandidateId };
        const res = draftId ? await api<{ id: string; updatedAt: string }>(`/api/drafts/${draftId}`, { method: "PUT", json: body }) : await api<{ id: string; updatedAt: string }>("/api/drafts", { method: "POST", json: body });
        if (!draftId) {
          setDraftId(res.id);
          window.history.replaceState(null, "", `/register?draft=${res.id}`);
        }
        setSavedAt(new Date(res.updatedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }));
        dirty.current = false;
      } catch {
        /* draft save failures are non-blocking */
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [state, step, loaded, draftId]);

  const validations = Object.fromEntries(STEP_KEYS.map((k) => [k, validateStep(state, k)])) as Record<StepKey, ReturnType<typeof validateStep>>;
  const stepIndex = STEP_KEYS.indexOf(step);
  const go = (k: StepKey) => {
    setVisited((v) => new Set([...v, k]));
    setStep(k);
    window.scrollTo({ top: 0 });
  };
  const next = () => {
    setAttempted((v) => new Set([...v, step]));
    if (!validations[step].ok) {
      toast.error("必須項目を入力してください");
      return;
    }
    if (stepIndex < STEP_KEYS.length - 1) go(STEP_KEYS[stepIndex + 1]);
  };

  const submit = async () => {
    setAttempted(new Set(STEP_KEYS));
    const firstBad = STEP_KEYS.find((k) => !validations[k].ok);
    if (firstBad) {
      go(firstBad);
      toast.error(`「${STEP_LABEL[firstBad]}」に未入力の必須項目があります`);
      return;
    }
    setSubmitting(true);
    setServerErrors({});
    try {
      const res = await api<{ combinationId: string }>("/api/registrations", { method: "POST", json: toPayload(state, draftId) });
      router.push(`/combinations/${res.combinationId}?registered=1`);
    } catch (err) {
      if (err instanceof ClientApiError) {
        setServerErrors(err.fieldErrors());
        const dup = err.body.details?.find((d) => d.reason === "duplicate_file");
        if (dup && typeof dup.existingId === "string" && window.confirm(`${err.message}\n既存のクリエイティブを使いますか？`)) {
          update((s) => ({ ...s, creative: { ...s.creative, existingId: dup.existingId as string } }));
          setSubmitting(false);
          return;
        }
      }
      toast.error(errorMessage(err));
      setSubmitting(false);
    }
  };

  const categoryName = (id: string) => categories.flatMap((c) => c.children).find((c) => c.id === id)?.name ?? "";
  const effectiveCategoryId = state.product.mode === "new" ? state.product.categoryId : state.product.categoryIdOfExisting;
  const summary: Record<StepKey, string> = {
    product: state.product.mode === "existing" ? state.product.label || "未入力" : state.product.name ? `${state.product.name}（${categoryName(state.product.categoryId) || "カテゴリ未選択"}）` : "未入力",
    creative: state.creative.existingId ? "既存のクリエイティブを使用" : state.creative.r2Key || state.creative.sourceUrl.trim() ? `${state.creative.kind === "video" ? "動画" : "バナー"}${state.creative.durationSec ? ` ${Math.round(Number(state.creative.durationSec))}秒` : ""}${state.creative.script.length ? "・台本あり" : ""}` : "未入力",
    article: state.article.existingId ? "既存の記事LPを使用" : state.article.url ? `${state.article.title || state.article.url}（${state.article.blocks.length}ブロック）` : "未入力",
    combination: state.combination.media ? [mediaLabel(state.combination.media), preview ? `CPA ${yen(preview.cpa)}` : "", state.combination.judge ? JUDGE_LABEL[state.combination.judge] : ""].filter(Boolean).join("・") : "未入力",
    tags: state.tags.tagIds.length + state.tags.aiTagIds.length > 0 ? `タグ${new Set([...state.tags.tagIds, ...state.tags.aiTagIds]).size}件${state.tags.winMemo ? "・メモあり" : ""}` : "未入力",
  };
  const isMiss = (state.combination.judge || preview?.judge) === "miss";

  if (!loaded) return <div className="skeleton h-96" />;

  return (
    <div className="flex flex-col gap-6">
      <ol className="grid gap-2 grid-cols-2 md:grid-cols-5">
        {STEP_KEYS.map((k, i) => {
          const active = k === step;
          const done = visited.has(k) && validations[k].ok && !active;
          const bad = attempted.has(k) && !validations[k].ok;
          const tone = active ? "bg-orange-tint border-2 border-orange" : done ? "bg-canvas border border-ink" : "bg-white border border-line-2";
          return (
            <li key={k}>
              <button type="button" onClick={() => go(k)} className={`w-full h-full text-left px-4 py-2.5 ${tone} ${bad ? "!border-red" : ""}`} aria-current={active ? "step" : undefined}>
                <span className={`block text-xs ${bad ? "text-red font-bold" : ""}`}>
                  STEP {i + 1}
                  {done ? "　✓" : ""}
                </span>
                <span className="block text-[15px] font-bold">{STEP_LABEL[k]}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col xl:flex-row gap-5 items-start">
        <section className="bg-white border border-line px-5 py-6 md:px-7 md:py-8 flex-1 min-w-0 w-full">
          <h2 className="text-xl font-bold mb-6">
            {stepIndex + 1}. {STEP_HEADING[step]}
          </h2>
          {(() => {
            const errors = attempted.has(step) ? { ...validations[step].errors, ...serverErrors } : {};
            switch (step) {
              case "product":
                return <ProductStep state={state} update={update} categories={categories} errors={errors} />;
              case "creative":
                return <CreativeStep state={state} update={update} errors={errors} />;
              case "article":
                return <ArticleStep state={state} update={update} errors={errors} />;
              case "combination":
                return <CombinationStep state={state} update={update} errors={errors} categoryId={effectiveCategoryId || null} onPreview={setPreview} categoryName={categoryName(effectiveCategoryId)} />;
              case "tags":
                return <TagsStep state={state} update={update} errors={errors} tagTypes={tagTypes} tags={tags} isMiss={isMiss} attempted={attempted.has("tags")} />;
            }
          })()}
          <div className="flex justify-between items-center gap-3 mt-6 pt-4 border-t border-line-3">
            {stepIndex === 0 ? (
              <LinkButton href="/" className="w-32">キャンセル</LinkButton>
            ) : (
              <Button className="w-24" onClick={() => go(STEP_KEYS[stepIndex - 1])}>戻る</Button>
            )}
            <span className="text-xs text-ink-4 text-center">{savedAt ? `下書きを保存しました（${savedAt}）` : ""}</span>
            {stepIndex < STEP_KEYS.length - 1 ? (
              <Button variant="primary" className="w-24" onClick={next}>
                次へ
              </Button>
            ) : (
              <Button variant="primary" className="w-28" onClick={submit} disabled={submitting}>
                {submitting ? "登録しています…" : "登録する"}
              </Button>
            )}
          </div>
        </section>

        <aside className="bg-white border border-line p-5 w-full xl:w-[340px] shrink-0 xl:sticky xl:top-6">
          <h2 className="font-bold mb-3">登録内容</h2>
          <dl className="flex flex-col">
            {STEP_KEYS.map((k) => (
              <div key={k} className="border-b border-line-3 py-2.5">
                <dt className="text-xs text-ink-3">{STEP_LABEL[k]}</dt>
                <dd className={`text-sm font-bold ${summary[k] === "未入力" ? "text-ink-4 font-normal" : ""}`}>{summary[k]}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[13px] text-ink-3 mt-3">外れた組み合わせも登録してください。比べる相手があると、何が効いたかが分かります。</p>
        </aside>
      </div>
    </div>
  );
}
