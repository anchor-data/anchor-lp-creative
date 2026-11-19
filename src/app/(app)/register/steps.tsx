"use client";
import { useEffect, useState } from "react";
import { ARTICLE_BLOCK_TYPES, JUDGE_LABEL, MEDIA } from "@/lib/domain/constants";
import type { JudgeBasis, JudgeResult } from "@/lib/domain/judge";
import { basisSummary } from "@/lib/domain/judge-text";
import { pct, ratio, yen } from "@/lib/format";
import { Button, Field, Input, Pill, Select, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";
import type { FormState } from "./form-state";

export interface CategoryOption {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}
export interface TagTypeOption {
  id: string;
  code: string;
  name: string;
  required: boolean;
}
export interface TagOption {
  id: string;
  typeId: string;
  name: string;
}
interface StepProps {
  state: FormState;
  update: (fn: (s: FormState) => FormState) => void;
  errors: Record<string, string>;
}

function CategorySelect({ value, onChange, categories, invalid }: { value: string; onChange: (v: string) => void; categories: CategoryOption[]; invalid?: boolean }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} invalid={invalid}>
      <option value="">選んでください</option>
      {categories.map((c) => (
        <optgroup key={c.id} label={c.name}>
          {c.children.map((ch) => (
            <option key={ch.id} value={ch.id}>
              {c.name} ＞ {ch.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

async function upload(purpose: "video" | "banner" | "screenshot", file: File | Blob, name = "file"): Promise<{ key: string; sha256: string; duplicateCreativeId: string | null }> {
  const fd = new FormData();
  fd.set("purpose", purpose);
  fd.set("file", file instanceof File ? file : new File([file], name));
  return api("/api/uploads", { method: "POST", body: fd });
}

// --- 1. 商材 -------------------------------------------------------------------

interface ProductHit {
  id: string;
  name: string;
  clientName: string;
  categoryId: string;
  categoryName: string;
  target: string;
}

export function ProductStep({ state, update, errors, categories }: StepProps & { categories: CategoryOption[] }) {
  const p = state.product;
  const toast = useToast();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const set = (patch: Partial<FormState["product"]>) => update((s) => ({ ...s, product: { ...s.product, ...patch } }));

  useEffect(() => {
    if (p.mode !== "existing") return;
    const t = setTimeout(async () => {
      try {
        const res = await api<{ items: ProductHit[] }>(`/api/products?q=${encodeURIComponent(q)}`);
        setHits(res.items);
      } catch (err) {
        toast.error(errorMessage(err));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, p.mode, toast]);

  // "同じクライアントで同名の商材があれば確認"
  const checkSame = async () => {
    if (!p.name.trim() || !p.clientName.trim()) return;
    const res = await api<{ existingId: string | null }>(`/api/products?name=${encodeURIComponent(p.name.trim())}&clientName=${encodeURIComponent(p.clientName.trim())}`);
    if (res.existingId && window.confirm("同じクライアントで同名の商材が登録されています。既存の商材を使いますか？")) {
      set({ mode: "existing", id: res.existingId, label: `${p.name}（${p.clientName}）`, categoryIdOfExisting: p.categoryId });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-1.5">
        <Pill active={p.mode === "existing"} onClick={() => set({ mode: "existing" })}>登録済みから選ぶ</Pill>
        <Pill active={p.mode === "new"} onClick={() => set({ mode: "new" })}>新規登録</Pill>
      </div>
      {p.mode === "existing" ? (
        <div className="flex flex-col gap-3">
          <Input placeholder="商材名・クライアント名で検索" value={q} onChange={(e) => setQ(e.target.value)} />
          {errors.id ? <p className="text-xs text-red">{errors.id}</p> : null}
          <ul className="border border-line divide-y divide-line-3 max-h-80 overflow-auto">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => set({ id: h.id, label: `${h.name}（${h.categoryName}）`, categoryIdOfExisting: h.categoryId })} className={`w-full text-left px-4 py-3 text-sm ${p.id === h.id ? "bg-orange-tint" : "hover:bg-canvas"}`}>
                  <span className="font-bold">{h.name}</span>
                  <span className="text-ink-3 ml-2">{h.clientName}・{h.categoryName}</span>
                  {h.target ? <span className="block text-xs text-ink-4">{h.target}</span> : null}
                </button>
              </li>
            ))}
            {hits.length === 0 ? <li className="px-4 py-3 text-sm text-ink-3">該当する商材がありません。「新規登録」から登録してください。</li> : null}
          </ul>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="商材名" required error={errors.name}>
            <Input value={p.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} onBlur={checkSame} invalid={Boolean(errors.name)} />
          </Field>
          <Field label="クライアント名" required error={errors.clientName}>
            <Input value={p.clientName} onChange={(e) => set({ clientName: e.target.value })} onBlur={checkSame} invalid={Boolean(errors.clientName)} />
          </Field>
          <Field label="業種カテゴリ（中分類）" required error={errors.categoryId}>
            <CategorySelect value={p.categoryId} onChange={(v) => set({ categoryId: v })} categories={categories} invalid={Boolean(errors.categoryId)} />
          </Field>
          <Field label="価格帯">
            <Input value={p.priceRange} onChange={(e) => set({ priceRange: e.target.value })} />
          </Field>
          <Field label="ターゲット（性別）">
            <Input value={p.targetGender} onChange={(e) => set({ targetGender: e.target.value })} placeholder="女性" />
          </Field>
          <Field label="ターゲット（年代）">
            <Input value={p.targetAge} onChange={(e) => set({ targetAge: e.target.value })} placeholder="40代" />
          </Field>
          <Field label="ターゲットの悩み" className="md:col-span-2">
            <Input value={p.targetPain} onChange={(e) => set({ targetPain: e.target.value })} />
          </Field>
          <Field label="オファー">
            <Input value={p.offer} onChange={(e) => set({ offer: e.target.value })} placeholder="初回980円" />
          </Field>
          <Field label="強み（USP）">
            <Input value={p.usp} onChange={(e) => set({ usp: e.target.value })} />
          </Field>
        </div>
      )}
    </div>
  );
}

// --- 2. クリエイティブ ------------------------------------------------------------

function captureVideoFrame(file: File): Promise<{ thumb: Blob | null; duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = url;
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, video.duration / 2);
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(720, video.videoWidth);
      canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        resolve({ thumb: blob, duration: video.duration, width: video.videoWidth, height: video.videoHeight });
      }, "image/jpeg", 0.85);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ thumb: null, duration: 0, width: 0, height: 0 });
    };
  });
}

function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

export function CreativeStep({ state, update, errors }: StepProps) {
  const c = state.creative;
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const set = (patch: Partial<FormState["creative"]>) => update((s) => ({ ...s, creative: { ...s.creative, ...patch } }));

  const onFile = async (file: File | undefined) => {
    if (!file || !c.kind) return;
    setUploading(true);
    try {
      const res = await upload(c.kind, file);
      if (res.duplicateCreativeId && window.confirm("同じファイルのクリエイティブが登録済みです。既存のクリエイティブを使いますか？")) {
        set({ existingId: res.duplicateCreativeId, r2Key: "", fileName: file.name });
        return;
      }
      if (c.kind === "video") {
        const meta = await captureVideoFrame(file);
        const thumb = meta.thumb ? await upload("screenshot", meta.thumb, "thumb.jpg") : null;
        set({ r2Key: res.key, fileSha256: res.sha256, fileName: file.name, existingId: "", thumbnailKey: thumb?.key ?? "", durationSec: meta.duration ? meta.duration.toFixed(1) : "", width: String(meta.width || ""), height: String(meta.height || "") });
      } else {
        const size = await imageSize(file);
        set({ r2Key: res.key, fileSha256: res.sha256, fileName: file.name, existingId: "", thumbnailKey: res.key, width: String(size.width || ""), height: String(size.height || "") });
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const setRow = (i: number, patch: Partial<FormState["creative"]["script"][number]>) => set({ script: c.script.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-5">
      {c.existingId ? (
        <div className="bg-orange-tint border border-orange px-4 py-3 text-sm flex justify-between items-center">
          既存のクリエイティブを使います
          <Button size="xs" onClick={() => set({ existingId: "" })}>やめる</Button>
        </div>
      ) : null}
      <Field label="種別" required error={errors.kind}>
        <div className="flex gap-1.5">
          <Pill active={c.kind === "video"} onClick={() => set({ kind: "video", r2Key: "", thumbnailKey: "" })}>動画</Pill>
          <Pill active={c.kind === "banner"} onClick={() => set({ kind: "banner", r2Key: "", thumbnailKey: "", durationSec: "" })}>バナー</Pill>
        </div>
      </Field>
      {c.kind ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="ファイル" hint={c.kind === "video" ? "mp4・mov（現在は95MBまで）" : "jpg・png・webp・gif、20MBまで"} error={errors.sourceUrl && !c.r2Key ? errors.sourceUrl : null}>
            <input type="file" accept={c.kind === "video" ? "video/mp4,video/quicktime" : "image/jpeg,image/png,image/webp,image/gif"} disabled={uploading} onChange={(e) => onFile(e.target.files?.[0])} className="block text-sm" />
            {uploading ? <span className="text-xs text-ink-3">アップロード中…</span> : c.fileName ? <span className="text-xs text-ink-3">{c.fileName}</span> : null}
          </Field>
          <Field label="またはURL" hint="ファイルかURLのどちらかが必要です">
            <Input value={c.sourceUrl} onChange={(e) => set({ sourceUrl: e.target.value })} placeholder="https://" />
          </Field>
          <Field label={c.kind === "video" ? "尺（秒）" : "サイズ"} hint="ファイルから自動取得します">
            <div className="flex gap-2">
              {c.kind === "video" ? <Input value={c.durationSec} onChange={(e) => set({ durationSec: e.target.value })} inputMode="decimal" /> : null}
              <Input value={c.width} onChange={(e) => set({ width: e.target.value })} placeholder="幅" inputMode="numeric" />
              <Input value={c.height} onChange={(e) => set({ height: e.target.value })} placeholder="高さ" inputMode="numeric" />
            </div>
          </Field>
          <Field label="メインコピー" className="md:col-span-2">
            <Textarea value={c.mainCopy} onChange={(e) => set({ mainCopy: e.target.value })} rows={2} />
          </Field>
        </div>
      ) : null}
      {c.kind === "video" ? (
        <div>
          <p className="text-xs text-ink-3 mb-2">台本（秒数ごと）</p>
          <div className="flex flex-col gap-2">
            {c.script.map((r, i) => (
              <div key={i} className="grid gap-2 grid-cols-[4rem_4rem_1fr_1fr_auto] items-center">
                <Input value={r.from} onChange={(e) => setRow(i, { from: e.target.value })} aria-label="開始秒" inputMode="numeric" className="h-9" />
                <Input value={r.to} onChange={(e) => setRow(i, { to: e.target.value })} aria-label="終了秒" inputMode="numeric" className="h-9" />
                <Input value={r.narration} onChange={(e) => setRow(i, { narration: e.target.value })} placeholder="ナレーション・セリフ" className="h-9" />
                <Input value={r.telop} onChange={(e) => setRow(i, { telop: e.target.value })} placeholder="テロップ・映像" className="h-9" />
                <Button size="xs" onClick={() => set({ script: c.script.filter((_, j) => j !== i) })} aria-label="行を削除">×</Button>
              </div>
            ))}
            <Button size="sm" className="w-fit" onClick={() => {
              const last = c.script.at(-1);
              const from = last ? last.to : "0";
              set({ script: [...c.script, { from, to: String(Number(from) + 3), narration: "", telop: "", visual: "" }] });
            }}>＋ 行を追加</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// --- 3. 記事LP ------------------------------------------------------------------

export function ArticleStep({ state, update, errors }: StepProps) {
  const a = state.article;
  const toast = useToast();
  const [capturing, setCapturing] = useState(false);
  const [decomposing, setDecomposing] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const set = (patch: Partial<FormState["article"]>) => update((s) => ({ ...s, article: { ...s.article, ...patch } }));

  const capture = async () => {
    setCapturing(true);
    setCaptureFailed(false);
    try {
      const res = await api<{ title: string | null; bodyText: string; existing: { id: string; title: string | null } | null }>("/api/articles/capture", { method: "POST", json: { url: a.url.trim() } });
      if (res.existing && window.confirm(`同じURLの記事LP「${res.existing.title ?? ""}」が登録済みです。既存の記事LPを使いますか？`)) {
        set({ existingId: res.existing.id, title: res.existing.title ?? "" });
        return;
      }
      set({ title: a.title || res.title || "", bodyText: res.bodyText });
    } catch (err) {
      setCaptureFailed(true);
      toast.error(errorMessage(err));
    } finally {
      setCapturing(false);
    }
  };

  const decompose = async () => {
    setDecomposing(true);
    try {
      const res = await api<{ items: { type: string; heading: string; summary: string }[] }>("/api/ai/article-blocks", { method: "POST", json: { body: a.bodyText } });
      set({ blocks: res.items });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDecomposing(false);
    }
  };

  const onScreenshot = async (file: File | undefined) => {
    if (!file) return;
    try {
      const res = await upload("screenshot", file);
      set({ screenshotKey: res.key });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const setBlock = (i: number, patch: Partial<FormState["article"]["blocks"][number]>) => set({ blocks: a.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= a.blocks.length) return;
    const blocks = [...a.blocks];
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    set({ blocks });
  };

  return (
    <div className="flex flex-col gap-5">
      {a.existingId ? (
        <div className="bg-orange-tint border border-orange px-4 py-3 text-sm flex justify-between items-center">
          既存の記事LPを使います
          <Button size="xs" onClick={() => set({ existingId: "" })}>やめる</Button>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-[1fr_auto] items-end">
        <Field label="記事LPのURL" required error={errors.url} hint={a.sbVersionId ? "Squad beyondのVersionから自動入力しました" : undefined}>
          <Input value={a.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" invalid={Boolean(errors.url)} />
        </Field>
        <Button onClick={capture} disabled={capturing || !a.url.startsWith("https://")}>{capturing ? "取得中…" : "本文を取得"}</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="最終LPのURL" error={errors.finalLpUrl}>
          <Input value={a.finalLpUrl} onChange={(e) => set({ finalLpUrl: e.target.value })} placeholder="https://" />
        </Field>
        <Field label="記事タイトル">
          <Input value={a.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
      </div>
      <Field label="スクリーンショット" hint={captureFailed ? "自動取得に失敗しました。スクリーンショットを手動でアップロードしてください" : "全画面のスクリーンショット（jpg・png・webp）。自動撮影は今後対応予定です"}>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => onScreenshot(e.target.files?.[0])} className="block text-sm" />
        {a.screenshotKey ? <span className="text-xs text-ink-3">アップロード済み</span> : null}
      </Field>
      <Field label="記事本文" hint={captureFailed ? "取得できない場合は本文を貼り付けてください" : undefined}>
        <Textarea value={a.bodyText} onChange={(e) => set({ bodyText: e.target.value })} rows={6} />
      </Field>
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-ink-3">記事の構成ブロック（順番・種類は修正できます）</p>
          <Button size="sm" onClick={decompose} disabled={decomposing || !a.bodyText.trim()}>{decomposing ? "分解中…" : "AIで構成を分解"}</Button>
        </div>
        <div className="flex flex-col gap-2">
          {a.blocks.map((b, i) => (
            <div key={i} className="grid gap-2 grid-cols-[2rem_10rem_1fr_auto] items-center">
              <span className="text-sm text-ink-3 text-right">{i + 1}.</span>
              <Select value={b.type} onChange={(e) => setBlock(i, { type: e.target.value })} className="h-9">
                {ARTICLE_BLOCK_TYPES.map((t) => (
                  <option key={t.code} value={t.code}>{t.label}</option>
                ))}
              </Select>
              <Input value={b.heading} onChange={(e) => setBlock(i, { heading: e.target.value })} className="h-9" placeholder="見出し" />
              <div className="flex gap-1">
                <Button size="xs" onClick={() => move(i, -1)} aria-label="上へ">↑</Button>
                <Button size="xs" onClick={() => move(i, 1)} aria-label="下へ">↓</Button>
                <Button size="xs" onClick={() => set({ blocks: a.blocks.filter((_, j) => j !== i) })} aria-label="削除">×</Button>
              </div>
            </div>
          ))}
          <Button size="sm" className="w-fit" onClick={() => set({ blocks: [...a.blocks, { type: "fv", heading: "", summary: "" }] })}>＋ ブロックを追加</Button>
        </div>
      </div>
    </div>
  );
}

// --- 4. 組み合わせと実績 ---------------------------------------------------------

interface SbOption {
  id: string;
  name: string;
}

export function CombinationStep({ state, update, errors, categoryId, categoryName, onPreview }: StepProps & { categoryId: string | null; categoryName: string; onPreview: (p: { judge: JudgeResult; cpa: number | null } | null) => void }) {
  const c = state.combination;
  const toast = useToast();
  const [pages, setPages] = useState<SbOption[]>([]);
  const [versions, setVersions] = useState<SbOption[]>([]);
  const [creatives, setCreatives] = useState<SbOption[]>([]);
  const [basis, setBasis] = useState<JudgeBasis | null>(null);
  const set = (patch: Partial<FormState["combination"]>) => update((s) => ({ ...s, combination: { ...s.combination, ...patch } }));
  const setManual = (k: keyof FormState["combination"]["manual"], v: string) => set({ manual: { ...c.manual, [k]: v } });

  useEffect(() => {
    if (c.metricsSource !== "sb") return;
    api<{ items: SbOption[] }>("/api/sb/pages").then((r) => setPages(r.items)).catch((err) => toast.error(errorMessage(err)));
  }, [c.metricsSource, toast]);
  useEffect(() => {
    if (c.metricsSource !== "sb" || !c.sbPageId) return;
    Promise.all([api<{ items: SbOption[] }>(`/api/sb/pages/${c.sbPageId}/versions`), api<{ items: SbOption[] }>(`/api/sb/pages/${c.sbPageId}/creatives`)])
      .then(([v, cr]) => {
        setVersions(v.items);
        setCreatives(cr.items);
      })
      .catch((err) => toast.error(errorMessage(err)));
  }, [c.metricsSource, c.sbPageId, toast]);

  // Live judgment (Figma: 自動計算 / 判定 / 基準)
  const manualKey = JSON.stringify(c.manual);
  useEffect(() => {
    if (!c.startDate) return;
    const t = setTimeout(async () => {
      const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replaceAll(",", "")));
      const body =
        c.metricsSource === "sb" && c.sbVersionId && c.sbCreativeId && c.media
          ? { categoryId, startDate: c.startDate, endDate: c.endDate || undefined, sb: { sbVersionId: c.sbVersionId, sbCreativeId: c.sbCreativeId, media: c.media } }
          : c.metricsSource === "manual" && c.manual.spend && c.manual.cv
            ? { categoryId, startDate: c.startDate, endDate: c.endDate || undefined, manual: Object.fromEntries(Object.entries(c.manual).map(([k, v]) => [k, num(v)])) }
            : null;
      if (!body) {
        setBasis(null);
        onPreview(null);
        return;
      }
      try {
        const res = await api<{ basis: JudgeBasis }>("/api/registrations/preview-judge", { method: "POST", json: body });
        setBasis(res.basis);
        const spend = num(c.manual.spend) ?? null;
        const cv = num(c.manual.cv) ?? null;
        onPreview({ judge: res.basis.judge, cpa: res.basis.metrics.find((m) => m.metric === "cpa")?.value ?? (spend !== null && cv ? spend / cv : null) });
      } catch {
        setBasis(null);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- manual is tracked via manualKey
  }, [c.metricsSource, c.startDate, c.endDate, c.sbVersionId, c.sbCreativeId, c.media, manualKey, categoryId]);

  const m = c.manual;
  const n = (v: string) => (v.trim() === "" ? null : Number(v.replaceAll(",", "")));
  const judge = c.overrideOn ? c.overrideJudge : basis?.judge;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="媒体" required error={errors.media}>
          <Select value={c.media} onChange={(e) => set({ media: e.target.value })} invalid={Boolean(errors.media)}>
            <option value="">選んでください</option>
            {MEDIA.map((md) => (
              <option key={md.code} value={md.code}>{md.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="配信期間" required error={errors.startDate} hint="配信中なら終了日は空欄">
          <div className="flex items-center gap-2">
            <Input type="date" value={c.startDate} onChange={(e) => set({ startDate: e.target.value })} invalid={Boolean(errors.startDate)} />
            <span>〜</span>
            <Input type="date" value={c.endDate} onChange={(e) => set({ endDate: e.target.value })} />
          </div>
        </Field>
      </div>

      <div className="flex gap-1.5">
        <Pill active={c.metricsSource === "sb"} onClick={() => set({ metricsSource: "sb" })}>Squad beyond連携</Pill>
        <Pill active={c.metricsSource === "manual"} onClick={() => set({ metricsSource: "manual" })}>手入力</Pill>
        <Pill active={c.metricsSource === "csv"} onClick={() => set({ metricsSource: "csv" })}>CSVを取り込む</Pill>
      </div>

      {c.metricsSource === "sb" ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="beyondページ" required>
            <Select value={c.sbPageId} onChange={(e) => set({ sbPageId: e.target.value, sbVersionId: "", sbCreativeId: "" })}>
              <option value="">選んでください</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Version" required error={errors.sbVersionId}>
            <Select value={c.sbVersionId} onChange={(e) => { set({ sbVersionId: e.target.value }); update((s) => ({ ...s, article: { ...s.article, sbVersionId: e.target.value, sbPageId: c.sbPageId } })); }} disabled={!c.sbPageId}>
              <option value="">選んでください</option>
              {versions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </Field>
          <Field label="クリエイティブ" required>
            <Select value={c.sbCreativeId} onChange={(e) => set({ sbCreativeId: e.target.value })} disabled={!c.sbPageId}>
              <option value="">選んでください</option>
              {creatives.map((cr) => <option key={cr.id} value={cr.id}>{cr.name}</option>)}
            </Select>
          </Field>
        </div>
      ) : null}

      {c.metricsSource === "manual" ? (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {([["spend", "消化額（円）", true], ["imp", "表示回数", false], ["click", "クリック数", false], ["cv", "CV数", true], ["pv", "PV", false], ["mcv", "MCV数", false], ["fsver", "FSVER（%）", false], ["oar", "OAR（%）", false]] as const).map(([k, label, req]) => (
            <Field key={k} label={label} required={req} error={errors[`manual.${k}`]}>
              <Input value={m[k]} onChange={(e) => setManual(k, e.target.value)} inputMode="decimal" invalid={Boolean(errors[`manual.${k}`])} />
            </Field>
          ))}
        </div>
      ) : null}

      {c.metricsSource === "csv" ? (
        <p className="text-sm bg-canvas px-4 py-3">CSV取り込み（S-12）は準備中です。登録後に詳細画面から実績を取り込めるようになります。いまは「手入力」をお使いください。</p>
      ) : null}

      <div className={`border-2 px-4 py-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 ${judge === "hit" ? "border-red" : judge === "fair" ? "border-orange" : "border-line-2"}`}>
        {c.metricsSource === "manual" ? (
          <span className="text-sm">自動計算：CPA {yen(n(m.spend) !== null && n(m.cv) ? n(m.spend)! / n(m.cv)! : null)} ／ CVR {pct(ratio(n(m.cv), n(m.click)))} ／ CTR {pct(ratio(n(m.click), n(m.imp)))}</span>
        ) : null}
        <span className={`text-lg font-bold ${judge === "hit" ? "text-red" : ""}`}>判定：{judge ? JUDGE_LABEL[judge] : "—"}{c.overrideOn ? "（手動）" : ""}</span>
        <span className="text-xs text-ink-3 flex-1 min-w-60">{categoryName ? `${categoryName}の基準 — ` : ""}{basis ? basisSummary(basis) : "実績を入力すると自動で判定します"}</span>
        <button type="button" className="text-sm underline" onClick={() => set({ overrideOn: !c.overrideOn })}>{c.overrideOn ? "自動判定に戻す" : "判定を手動で変える"}</button>
      </div>
      {c.overrideOn ? (
        <div className="grid gap-3 md:grid-cols-[12rem_1fr]">
          <Field label="手動の判定" required>
            <Select value={c.overrideJudge} onChange={(e) => set({ overrideJudge: e.target.value as typeof c.overrideJudge })}>
              <option value="hit">当たり</option>
              <option value="fair">まずまず</option>
              <option value="miss">外れ</option>
            </Select>
          </Field>
          <Field label="理由" required error={errors["override.reason"]} hint="1〜500文字">
            <Input value={c.overrideReason} maxLength={500} onChange={(e) => set({ overrideReason: e.target.value })} invalid={Boolean(errors["override.reason"])} />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

// --- 5. タグと勝因メモ -----------------------------------------------------------

export function TagsStep({ state, update, errors, tagTypes, tags, isMiss }: StepProps & { tagTypes: TagTypeOption[]; tags: TagOption[]; isMiss: boolean }) {
  const t = state.tags;
  const toast = useToast();
  const [suggesting, setSuggesting] = useState(false);
  const set = (patch: Partial<FormState["tags"]>) => update((s) => ({ ...s, tags: { ...s.tags, ...patch } }));
  const chosen = new Set([...t.tagIds, ...t.aiTagIds]);
  const toggle = (id: string) => {
    if (chosen.has(id)) set({ tagIds: t.tagIds.filter((x) => x !== id), aiTagIds: t.aiTagIds.filter((x) => x !== id) });
    else set({ tagIds: [...t.tagIds, id] });
  };
  const axisType = tagTypes.find((tt) => tt.required);
  const axisMissing = axisType ? !tags.some((tg) => tg.typeId === axisType.id && chosen.has(tg.id)) : false;

  const suggest = async () => {
    setSuggesting(true);
    try {
      const res = await api<{ items: { id: string; confidence: number }[] }>("/api/ai/tags", {
        method: "POST",
        json: { copy: state.creative.mainCopy, script: state.creative.script.map((r) => r.narration).join("\n"), body: state.article.bodyText.slice(0, 20000) },
      });
      set({ aiTagIds: res.items.filter((i) => i.confidence >= 0.4 && !t.tagIds.includes(i.id)).map((i) => i.id) });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={suggest} disabled={suggesting}>{suggesting ? "提案中…" : "AIでタグを提案"}</Button>
        {t.aiTagIds.length > 0 ? <span className="text-xs text-ink-3">AIの提案タグ（クリックで外せます）</span> : null}
      </div>
      {t.aiTagIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {t.aiTagIds.map((id) => (
            <button key={id} type="button" className="bg-orange-tint border border-orange text-xs px-2.5 py-1" onClick={() => set({ aiTagIds: t.aiTagIds.filter((x) => x !== id) })}>
              {tags.find((tg) => tg.id === id)?.name} ×
            </button>
          ))}
        </div>
      ) : null}
      {tagTypes.map((tt) => (
        <div key={tt.id}>
          <p className={`text-xs mb-1.5 ${tt.required && axisMissing ? "text-red" : "text-ink-3"}`}>
            {tt.name}
            {tt.required ? "（1つ以上必須）" : ""}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {tags.filter((tg) => tg.typeId === tt.id).map((tg) => (
              <button key={tg.id} type="button" onClick={() => toggle(tg.id)} className={`text-xs px-2.5 py-1 border ${chosen.has(tg.id) ? "bg-ink text-white border-ink" : "bg-white border-line-2 hover:border-ink"}`}>
                {tg.name}
              </button>
            ))}
          </div>
        </div>
      ))}
      {errors["tags.tagIds"] ? <p className="text-xs text-red">{errors["tags.tagIds"]}</p> : null}
      <Field label={isMiss ? "外れた理由メモ" : "勝因メモ（何が効いたか）"} error={errors.winMemo} hint="2,000文字以内">
        <Textarea value={t.winMemo} maxLength={2000} onChange={(e) => set({ winMemo: e.target.value })} rows={4} />
      </Field>
      <Field label="次に試したいこと">
        <Textarea value={t.nextMemo} maxLength={2000} onChange={(e) => set({ nextMemo: e.target.value })} rows={2} />
      </Field>
    </div>
  );
}
