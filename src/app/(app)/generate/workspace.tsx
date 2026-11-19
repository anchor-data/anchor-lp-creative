"use client";
import { useEffect, useRef, useState } from "react";
import type { GenerationView } from "@/server/services/generation";
import type { Recommendation, PlaybookRef } from "@/server/services/recommendations";
import type { GenOptions, Plan, ProductInput } from "@/lib/domain/plan";
import { productInputSchema } from "@/lib/domain/plan";
import { mediaLabel } from "@/lib/domain/constants";
import { yen, yenCompact } from "@/lib/format";
import { Button, Checkbox, Field, Input, LegalNote, Select, Textarea } from "@/components/ui";
import { api, errorMessage, postSse, type SseEvent } from "@/components/client";
import { useToast } from "@/components/toast";
import { PlanView, type RegenTarget } from "./plan-view";

interface CategoryOption {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

interface PlanSlot {
  axis: string;
  status: "waiting" | "streaming" | "done" | "error";
  chars: number;
  plan: Plan | null;
  error?: string;
}

const EMPTY_PRODUCT: ProductInput = { name: "", categoryId: "", target: "", usp: "", offer: "", ngWords: "", referenceText: "" };
const DEFAULT_OPTIONS: GenOptions = { count: 3, kind: "both", durationSec: 15, tone: "" };

export function GenerateWorkspace({ categories, refId, initial, canLink }: { categories: CategoryOption[]; refId: string | null; initial: GenerationView | null; canLink: boolean }) {
  const toast = useToast();
  const [product, setProduct] = useState<ProductInput>(initial?.input.product ?? EMPTY_PRODUCT);
  const [options, setOptions] = useState<GenOptions>(initial?.input.options ?? DEFAULT_OPTIONS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [playbooks, setPlaybooks] = useState<{ win: PlaybookRef | null; avoid: PlaybookRef | null } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set(initial?.refs.map((r) => r.combinationId) ?? []));
  const [autoPicked, setAutoPicked] = useState<Set<string>>(new Set());
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [generationId, setGenerationId] = useState<string | null>(initial?.id ?? null);
  const [versionNo, setVersionNo] = useState<number | null>(initial?.versions.at(-1)?.versionNo ?? null);
  const [slots, setSlots] = useState<PlanSlot[]>(
    (initial?.versions.at(-1)?.plans ?? []).map((p, i) => ({ axis: p?.axis ?? initial?.input.axes[i] ?? "", status: p ? "done" : "error", chars: 0, plan: p, error: p ? undefined : "この案は作成に失敗しました" })),
  );
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productHits, setProductHits] = useState<{ id: string; name: string; categoryId: string; categoryName: string; target: string; usp: string | null; offer: string | null }[]>([]);
  const abort = useRef<AbortController | null>(null);
  const refTitles = [...(recs ?? []).map((r) => ({ id: r.id, title: r.title })), ...(initial?.refs ?? []).map((r) => ({ id: r.combinationId, title: r.title }))];

  const set = (patch: Partial<ProductInput>) => setProduct((p) => ({ ...p, ...patch }));

  useEffect(() => {
    if (productQuery.trim().length < 1) {
      setProductHits([]);
      return;
    }
    const t = setTimeout(() => {
      api<{ items: typeof productHits }>(`/api/products?q=${encodeURIComponent(productQuery)}`).then((r) => setProductHits(r.items)).catch(() => setProductHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [productQuery]);

  const findRecs = async () => {
    const parsed = productInputSchema.safeParse(product);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setLoadingRecs(true);
    try {
      const res = await api<{ items: Recommendation[]; playbooks: { win: PlaybookRef | null; avoid: PlaybookRef | null } }>("/api/recommendations", { method: "POST", json: { product: parsed.data } });
      let items = res.items;
      // "この組み合わせを参考に生成" from S-02: make sure that case is listed and checked.
      if (refId && !items.some((i) => i.id === refId)) {
        const d = await api<{ id: string; origin: "own" | "market"; product: { name: string }; article: { title: string | null }; media: string; judge: Recommendation["judge"]; totals: { cpa: number | null } }>(`/api/combinations/${refId}`).catch(() => null);
        if (d) items = [{ id: d.id, score: 1, reason: "詳細画面から選んだ事例", origin: d.origin, title: `${d.product.name} × 記事「${d.article.title ?? ""}」`, media: d.media, judge: d.judge, cpa: d.totals.cpa, estSpend: null, deliveryDays: null }, ...items];
      }
      setRecs(items);
      setPlaybooks(res.playbooks);
      const top = new Set(items.slice(0, 5).map((i) => i.id));
      if (refId) top.add(refId);
      setPicked(top);
      setAutoPicked(new Set(items.slice(0, 5).map((i) => i.id)));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoadingRecs(false);
    }
  };

  const handleEvent = (e: SseEvent) => {
    const d = e.data as Record<string, unknown>;
    switch (e.event) {
      case "meta": {
        const axes = d.axes as string[];
        setGenerationId(String(d.generationId));
        setSlots(axes.map((axis) => ({ axis, status: "waiting", chars: 0, plan: null })));
        setTab(0);
        break;
      }
      case "plan-start":
        setSlots((s) => s.map((x, i) => (i === d.index ? { ...x, axis: String(d.axis) || x.axis, status: "streaming", chars: 0, error: undefined } : x)));
        break;
      case "plan-delta":
        setSlots((s) => s.map((x, i) => (i === d.index ? { ...x, chars: x.chars + String(d.text).length } : x)));
        break;
      case "plan-done":
        setSlots((s) => s.map((x, i) => (i === d.index ? { ...x, status: "done", plan: d.plan as Plan } : x)));
        break;
      case "plan-error":
        setSlots((s) => s.map((x, i) => (i === d.index ? { ...x, status: "error", error: String(d.message) } : x)));
        break;
      case "done":
        setGenerationId(String(d.generationId));
        setVersionNo(Number(d.versionNo));
        break;
      case "error":
        toast.error(String(d.message));
        break;
    }
  };

  const generate = async () => {
    if (picked.size < 1 || picked.size > 10) {
      toast.error("参照する事例は1〜10件選んでください");
      return;
    }
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(true);
    setSlots([]);
    try {
      await postSse("/api/generations", { product, options, refIds: [...picked], autoRefIds: [...autoPicked].filter((id) => picked.has(id)) }, handleEvent, abort.current.signal);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async (index: number, target: RegenTarget) => {
    if (!generationId) return;
    setBusy(true);
    try {
      await postSse(`/api/generations/${generationId}/regenerate`, { planIndex: index, target }, handleEvent);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (index: number, plan: Plan) => {
    if (!generationId) return;
    setBusy(true);
    try {
      const plans = slots.map((s, i) => (i === index ? plan : s.plan));
      const res = await api<{ versionNo: number }>(`/api/generations/${generationId}/versions`, { method: "POST", json: { plans } });
      setSlots((s) => s.map((x, i) => (i === index ? { ...x, plan } : x)));
      setVersionNo(res.versionNo);
      toast.info(`第${res.versionNo}版として保存しました`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const link = async () => {
    if (!generationId) return;
    const input = window.prompt("配信した組み合わせのURLまたはIDを入力してください");
    if (!input) return;
    const combinationId = input.trim().split("/").filter(Boolean).at(-1) ?? "";
    try {
      await api(`/api/generations/${generationId}/link`, { method: "POST", json: { combinationId } });
      toast.info("組み合わせとひも付けました");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const current = slots[tab];

  return (
    <div className="flex flex-col xl:flex-row gap-5 items-start">
      {/* 1. 商材情報 */}
      <section className="bg-white border border-line p-5 w-full xl:w-[320px] shrink-0 flex flex-col gap-3.5">
        <h2 className="text-base font-bold">1. 商材情報</h2>
        <div className="relative">
          <Input placeholder="登録済み商材から呼び出す" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} className="h-9 text-xs" />
          {productHits.length > 0 ? (
            <ul className="absolute z-20 left-0 right-0 bg-white border border-line-2 max-h-60 overflow-auto">
              {productHits.map((h) => (
                <li key={h.id}>
                  <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-canvas" onClick={() => { set({ productId: h.id, name: h.name, categoryId: h.categoryId, target: h.target || product.target, usp: h.usp ?? product.usp, offer: h.offer ?? product.offer }); setProductQuery(""); }}>
                    {h.name}<span className="text-xs text-ink-3 ml-1.5">{h.categoryName}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Field label="商材名" required error={errors.name}><Input value={product.name} onChange={(e) => set({ name: e.target.value })} invalid={Boolean(errors.name)} /></Field>
        <Field label="業種カテゴリ" required error={errors.categoryId}>
          <Select value={product.categoryId} onChange={(e) => set({ categoryId: e.target.value })} invalid={Boolean(errors.categoryId)}>
            <option value="">選んでください</option>
            {categories.map((c) => (
              <optgroup key={c.id} label={c.name}>
                {c.children.map((ch) => <option key={ch.id} value={ch.id}>{c.name} ＞ {ch.name}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="ターゲット" required error={errors.target}><Input value={product.target} onChange={(e) => set({ target: e.target.value })} placeholder="40代女性・すっきりしない悩み" invalid={Boolean(errors.target)} /></Field>
        <Field label="強み（USP）" required error={errors.usp}><Textarea value={product.usp} onChange={(e) => set({ usp: e.target.value })} rows={2} invalid={Boolean(errors.usp)} /></Field>
        <Field label="価格・オファー"><Input value={product.offer} onChange={(e) => set({ offer: e.target.value })} placeholder="初回980円・定期縛りなし" /></Field>
        <Field label="使えない表現"><Textarea value={product.ngWords} onChange={(e) => set({ ngWords: e.target.value })} rows={2} placeholder="「痩せる」「治る」など効能をうたう表現" /></Field>
        <Field label="参考資料（テキスト）" hint="商品資料などの本文を貼り付け"><Textarea value={product.referenceText} onChange={(e) => set({ referenceText: e.target.value })} rows={2} /></Field>
        <Button onClick={findRecs} disabled={loadingRecs}>{loadingRecs ? "探しています…" : "似た当たり事例を探す"}</Button>
      </section>

      {/* 2. 参照するもの */}
      <section className="bg-white border border-line p-5 w-full xl:w-[340px] shrink-0 flex flex-col gap-3.5">
        <h2 className="text-base font-bold">2. 参照するもの</h2>
        {recs === null ? (
          <p className="text-sm text-ink-3">{initial ? `この生成で参照した事例：${initial.refs.length}件` : "商材情報を入れて「似た当たり事例を探す」を押してください"}</p>
        ) : (
          <>
            <p className="text-xs text-ink-3">似た当たり事例（おすすめ順・{picked.size}件選択中／1〜10件）</p>
            <div className="flex flex-col gap-2.5 max-h-[520px] overflow-auto">
              {recs.length === 0 ? <p className="text-sm text-ink-3">似た当たり事例が見つかりませんでした</p> : null}
              {recs.map((r) => {
                const on = picked.has(r.id);
                return (
                  <div key={r.id} className={`p-3 border flex gap-2.5 ${on ? "bg-orange-tint border-orange" : "bg-white border-line"}`}>
                    <Checkbox checked={on} onChange={(v) => setPicked((s) => { const n = new Set(s); if (v) n.add(r.id); else n.delete(r.id); return n; })} />
                    <div className="min-w-0">
                      <a href={`/combinations/${r.id}`} target="_blank" rel="noreferrer" className="text-sm font-bold leading-snug hover:underline">{r.title}</a>
                      <p className="text-[11px] text-ink-3 mt-1">
                        {r.origin === "own" ? `自社実績・CPA ${yen(r.cpa)}` : `市場事例・推定消化額 ${yenCompact(r.estSpend)}${r.deliveryDays ? `・配信${r.deliveryDays}日` : ""}`}・{mediaLabel(r.media)}
                      </p>
                      <p className="text-[11px] text-ink-4 mt-0.5">{r.reason}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-ink-3">あわせて渡す知見</p>
            <div className="bg-canvas px-3 py-2 text-xs">{playbooks?.win ? `勝ちパターン集：${playbooks.win.categoryName}（第${playbooks.win.versionNo}版・承認済み）` : "承認済みの勝ちパターン集はありません"}</div>
            <div className="bg-orange-tint px-3 py-2 text-xs">{playbooks?.avoid ? `避けるパターン：${playbooks.avoid.categoryName}（${playbooks.avoid.itemCount}件）` : "避けるパターンはありません"}</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="作る案の数"><Select value={options.count} onChange={(e) => setOptions({ ...options, count: Number(e.target.value) as 3 | 5 })} className="h-9"><option value={3}>3案</option><option value={5}>5案</option></Select></Field>
              <Field label="種別"><Select value={options.kind} onChange={(e) => setOptions({ ...options, kind: e.target.value as GenOptions["kind"] })} className="h-9"><option value="both">両方</option><option value="banner">バナー</option><option value="video">動画</option></Select></Field>
              <Field label="動画の尺"><Select value={options.durationSec} onChange={(e) => setOptions({ ...options, durationSec: Number(e.target.value) as GenOptions["durationSec"] })} className="h-9" disabled={options.kind === "banner"}>{[6, 15, 30, 60].map((d) => <option key={d} value={d}>{d}秒</option>)}</Select></Field>
              <Field label="トンマナ"><Input value={options.tone} onChange={(e) => setOptions({ ...options, tone: e.target.value })} className="h-9" placeholder="信頼感" /></Field>
            </div>
            <Button variant="primary" onClick={generate} disabled={busy || picked.size === 0 || picked.size > 10}>
              {busy ? "生成しています…" : `選んだ${picked.size}件を参考にセットで生成`}
            </Button>
          </>
        )}
      </section>

      {/* 3. 生成案 */}
      <section className="bg-white border border-line p-5 flex-1 min-w-0 w-full">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-base font-bold">3. 生成案{versionNo ? <span className="text-xs text-ink-3 font-normal ml-2">第{versionNo}版</span> : null}</h2>
          <div className="flex gap-1.5" role="tablist">
            {slots.map((s, i) => (
              <button key={i} type="button" role="tab" aria-selected={tab === i} onClick={() => setTab(i)} className={`h-10 px-4 text-sm border ${tab === i ? "bg-ink text-white border-ink" : "bg-white border-ink"}`}>
                案{i + 1}{s.status === "streaming" ? "…" : s.status === "error" ? "!" : ""}
              </button>
            ))}
          </div>
        </div>
        {!current ? (
          <p className="text-sm text-ink-3">{busy ? "訴求軸を考えています…" : "参照する事例を選んで生成すると、案ごとにここに表示されます"}</p>
        ) : current.status === "done" && current.plan ? (
          <PlanView key={`${tab}-${versionNo}`} plan={current.plan} refs={refTitles} busy={busy} onRegenerate={(t) => regenerate(tab, t)} onSave={(p) => saveEdit(tab, p)} />
        ) : current.status === "error" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-red">{current.error}</p>
            <Button className="w-fit" disabled={busy || !generationId} onClick={() => regenerate(tab, { kind: "whole" })}>もう一度作る</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="font-bold">訴求軸：{current.axis}</p>
            <div className="skeleton h-24" />
            <div className="skeleton h-32" />
            <p className="text-xs text-ink-3">{current.status === "waiting" ? "順番を待っています…" : `書いています…（${current.chars}文字）`}</p>
          </div>
        )}
        {generationId && versionNo ? (
          <div className="flex flex-wrap justify-end gap-2.5 mt-6 pt-4 border-t border-line-3">
            {canLink ? <Button onClick={link}>この案で配信した</Button> : null}
            <a href={`/api/generations/${generationId}/export?format=md`} className="inline-flex items-center h-11 px-[18px] text-sm border border-ink bg-white hover:bg-canvas">Markdownで出力</a>
            <a href={`/generate/${generationId}/print`} target="_blank" rel="noreferrer" className="inline-flex items-center h-11 px-[18px] text-sm font-bold bg-ink text-white hover:bg-ink-2">制作指示書を出力（PDF）</a>
          </div>
        ) : null}
        <div className="mt-4"><LegalNote /></div>
      </section>
    </div>
  );
}
