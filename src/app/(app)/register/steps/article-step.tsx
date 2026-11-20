"use client";
// STEP3 記事LP (Figma 5-3). AI decomposes the article into blocks as soon as the body is available.
import { useEffect, useRef, useState } from "react";
import { ARTICLE_BLOCK_TYPES, blockLabel } from "@/lib/domain/constants";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";
import type { BlockRow, FormState } from "../form-state";
import { ReadonlyValue, Toggle, ToggleGroup, upload, type SbOption, type StepProps } from "./shared";

interface SbVersion extends SbOption {
  url: string | null;
  bodyText: string | null;
}
interface CaptureResult {
  title: string | null;
  bodyText: string;
  existing: { id: string; title: string | null } | null;
}

export function ArticleStep({ state, update, errors }: StepProps) {
  const a = state.article;
  const toast = useToast();
  const [decomposing, setDecomposing] = useState(false);
  const set = (patch: Partial<FormState["article"]>) => update((s) => ({ ...s, article: { ...s.article, ...patch } }));

  const decompose = async (body: string) => {
    if (!body.trim()) return;
    setDecomposing(true);
    try {
      const res = await api<{ items: BlockRow[] }>("/api/ai/article-blocks", { method: "POST", json: { body } });
      set({ blocks: res.items });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDecomposing(false);
    }
  };
  /** New body text arrived: keep it and let AI split it unless blocks already exist. */
  const onBody = (patch: Partial<FormState["article"]>) => {
    set(patch);
    if (patch.bodyText && a.blocks.length === 0) void decompose(patch.bodyText);
  };

  return (
    <div className="flex flex-col gap-5">
      <ToggleGroup>
        <Toggle active={a.source === "sb"} onClick={() => set({ source: "sb" })}>Squad beyondから選ぶ</Toggle>
        <Toggle active={a.source === "url"} onClick={() => set({ source: "url", sbPageId: "", sbVersionId: "" })}>URLを入力</Toggle>
      </ToggleGroup>
      {a.existingId ? (
        <div className="border border-orange bg-orange-tint px-4 py-3 text-sm flex flex-wrap justify-between items-center gap-2">
          既存の記事LP「{a.title || a.url}」を使います
          <Button size="xs" onClick={() => set({ existingId: "" })}>やめる</Button>
        </div>
      ) : null}

      {a.source === "sb" ? <SbSource state={state} set={set} onBody={onBody} errors={errors} /> : <UrlSource state={state} set={set} onBody={onBody} errors={errors} />}

      <Field label="記事タイトル">
        <Input value={a.title} maxLength={300} onChange={(e) => set({ title: e.target.value })} placeholder="40代からの乾燥対策" />
      </Field>

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <ScreenshotPanel state={state} set={set} />
        <BlockEditor state={state} set={set} decomposing={decomposing} onDecompose={() => decompose(a.bodyText)} />
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-ink-3">記事本文（取得できないときは貼り付けてください）</summary>
        <Textarea className="mt-2" value={a.bodyText} onChange={(e) => set({ bodyText: e.target.value })} rows={6} />
      </details>

      <Field label="遷移先の商品LP（URLのみ保存）" error={errors.finalLpUrl}>
        <Input value={a.finalLpUrl} onChange={(e) => set({ finalLpUrl: e.target.value })} placeholder="https://" invalid={Boolean(errors.finalLpUrl)} />
      </Field>
    </div>
  );
}

interface SourceProps {
  state: FormState;
  set: (patch: Partial<FormState["article"]>) => void;
  onBody: (patch: Partial<FormState["article"]>) => void;
  errors: Record<string, string>;
}

function SbSource({ state, set, onBody, errors }: SourceProps) {
  const a = state.article;
  const toast = useToast();
  const [pages, setPages] = useState<SbOption[]>([]);
  const [versions, setVersions] = useState<SbVersion[]>([]);

  useEffect(() => {
    api<{ items: SbOption[] }>("/api/sb/pages").then((r) => setPages(r.items)).catch((err) => toast.error(errorMessage(err)));
  }, [toast]);
  useEffect(() => {
    if (!a.sbPageId) return;
    api<{ items: SbVersion[] }>(`/api/sb/pages/${a.sbPageId}/versions`).then((r) => setVersions(r.items)).catch((err) => toast.error(errorMessage(err)));
  }, [a.sbPageId, toast]);

  const chooseVersion = (id: string) => {
    const v = versions.find((x) => x.id === id);
    onBody({ sbVersionId: id, url: v?.url ?? a.url, title: a.title || v?.name || "", bodyText: v?.bodyText ?? a.bodyText });
  };

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="beyondページ" required>
          <Select value={a.sbPageId} onChange={(e) => { set({ sbPageId: e.target.value, sbVersionId: "" }); setVersions([]); }}>
            <option value="">選んでください</option>
            {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Version" required>
          <Select value={a.sbVersionId} onChange={(e) => chooseVersion(e.target.value)} disabled={!a.sbPageId}>
            <option value="">選んでください</option>
            {versions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        </Field>
      </div>
      {pages.length === 0 ? <p className="text-xs text-ink-3">Squad beyondのページがまだ取り込まれていません。「URLを入力」から登録できます。</p> : null}
      <Field label="記事LPのURL（自動入力）" error={errors.url}>
        <ReadonlyValue>{a.url || "https://［Versionの公開URL］"}</ReadonlyValue>
      </Field>
    </>
  );
}

function UrlSource({ state, set, onBody, errors }: SourceProps) {
  const a = state.article;
  const toast = useToast();
  const [capturing, setCapturing] = useState(false);
  const lastCaptured = useRef("");

  const capture = async () => {
    const url = a.url.trim();
    if (!url.startsWith("https://") || url === lastCaptured.current) return;
    lastCaptured.current = url;
    setCapturing(true);
    try {
      const res = await api<CaptureResult>("/api/articles/capture", { method: "POST", json: { url } });
      if (res.existing && window.confirm(`同じURLの記事LP「${res.existing.title ?? ""}」が登録済みです。既存の記事LPを使いますか？`)) {
        set({ existingId: res.existing.id, title: res.existing.title ?? "" });
        return;
      }
      onBody({ title: a.title || res.title || "", bodyText: res.bodyText });
    } catch (err) {
      toast.error(`${errorMessage(err)}　本文を貼り付けてください`);
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
      <Field label="記事LPのURL" required error={errors.url}>
        <Input value={a.url} onChange={(e) => set({ url: e.target.value })} onBlur={capture} placeholder="https://" invalid={Boolean(errors.url)} />
      </Field>
      <Button onClick={() => { lastCaptured.current = ""; void capture(); }} disabled={capturing || !a.url.trim().startsWith("https://")}>{capturing ? "取得中…" : "本文を取得"}</Button>
    </div>
  );
}

function ScreenshotPanel({ state, set }: Pick<SourceProps, "state" | "set">) {
  const a = state.article;
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const res = await upload("screenshot", file);
      set({ screenshotKey: res.key });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <div className="bg-canvas border border-line p-3 flex flex-col gap-2 self-start">
      <div className="h-[300px] bg-thumb-2 overflow-hidden flex items-center justify-center">
        {a.screenshotKey ? (
          // eslint-disable-next-line @next/next/no-img-element -- private R2 file
          <img src={`/api/files/${a.screenshotKey}`} alt="記事LPのスクリーンショット" className="w-full h-full object-cover object-top" />
        ) : (
          <span className="text-xs text-ink-4">スクリーンショット未登録</span>
        )}
      </div>
      <p className="text-xs text-ink-3">全画面スクリーンショット（自動撮影は今後対応予定）</p>
      <button type="button" className="text-xs font-bold underline text-left" onClick={() => inputRef.current?.click()}>
        {a.screenshotKey ? "別の画像に差し替える" : "手動でアップロード"}
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
    </div>
  );
}

function BlockEditor({ state, set, decomposing, onDecompose }: Pick<SourceProps, "state" | "set"> & { decomposing: boolean; onDecompose: () => void }) {
  const blocks = state.article.blocks;
  const [editing, setEditing] = useState<number | null>(null);
  const setBlock = (i: number, patch: Partial<BlockRow>) => set({ blocks: blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    set({ blocks: next });
  };

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold">{decomposing ? "AIが記事の構成を分解しています…" : "記事の構成（AIで分解・修正できます）"}</p>
        <button type="button" className="text-xs underline disabled:text-ink-4" onClick={onDecompose} disabled={decomposing || !state.article.bodyText.trim()}>AIで分解し直す</button>
      </div>
      <p className="text-xs text-ink-3 mb-2">矢印で順番、クリックで種類と見出しを変更できます</p>
      {blocks.length === 0 && !decomposing ? (
        <p className="text-sm text-ink-4 border border-dashed border-line-2 px-3 py-6 text-center">本文を取得すると、AIが構成ブロックに分解します</p>
      ) : null}
      <ol className="flex flex-col gap-1.5">
        {blocks.map((b, i) => (
          <li key={i} className="border border-line bg-white">
            {editing === i ? (
              <div className="grid gap-2 grid-cols-[9rem_1fr_auto] items-center p-1.5">
                <Select value={b.type} onChange={(e) => setBlock(i, { type: e.target.value })} className="!h-9">
                  {ARTICLE_BLOCK_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                </Select>
                <Input value={b.heading} onChange={(e) => setBlock(i, { heading: e.target.value })} className="!h-9" placeholder="見出し" autoFocus />
                <Button size="xs" onClick={() => setEditing(null)}>完了</Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-3 h-10">
                <span className="text-sm font-bold text-orange w-6 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <button type="button" className="flex-1 min-w-0 text-left text-sm truncate" onClick={() => setEditing(i)}>
                  <span className="font-bold mr-2.5">{blockLabel(b.type)}</span>
                  {b.heading || <span className="text-ink-4">（見出しなし）</span>}
                </button>
                <span className="flex shrink-0 text-ink-4">
                  <button type="button" className="px-1 hover:text-ink" onClick={() => move(i, -1)} aria-label="上へ">↑</button>
                  <button type="button" className="px-1 hover:text-ink" onClick={() => move(i, 1)} aria-label="下へ">↓</button>
                  <button type="button" className="px-1 hover:text-ink" onClick={() => set({ blocks: blocks.filter((_, j) => j !== i) })} aria-label="削除">×</button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ol>
      <button type="button" className="text-xs underline mt-2" onClick={() => { set({ blocks: [...blocks, { type: "fv", heading: "", summary: "" }] }); setEditing(blocks.length); }}>＋ ブロックを追加</button>
    </div>
  );
}
