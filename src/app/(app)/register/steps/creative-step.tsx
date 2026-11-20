"use client";
// STEP2 クリエイティブ (Figma 5-2)
import { useRef, useState, type DragEvent } from "react";
import { Button, Field, Input } from "@/components/ui";
import { errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";
import type { FormState, ScriptRow } from "../form-state";
import { SectionLabel, Toggle, ToggleGroup, upload, type StepProps } from "./shared";

const ACCEPT = { video: "video/mp4,video/quicktime", banner: "image/jpeg,image/png,image/webp,image/gif" } as const;

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

function aspect(w: number, h: number): string {
  const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
  const d = g(w, h);
  return d ? `${w / d}:${h / d}` : "";
}

interface Pending {
  duplicateId: string;
  file: File;
}

export function CreativeStep({ state, update, errors }: StepProps) {
  const c = state.creative;
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [duplicate, setDuplicate] = useState<Pending | null>(null);
  const [showUrl, setShowUrl] = useState(Boolean(c.sourceUrl));
  const set = (patch: Partial<FormState["creative"]>) => update((s) => ({ ...s, creative: { ...s.creative, ...patch } }));
  const kind = c.kind || "video";

  const store = async (file: File, key: string, sha256: string) => {
    if (kind === "video") {
      const meta = await captureVideoFrame(file);
      const thumb = meta.thumb ? await upload("screenshot", meta.thumb, "thumb.jpg") : null;
      set({ r2Key: key, fileSha256: sha256, fileName: file.name, existingId: "", thumbnailKey: thumb?.key ?? "", durationSec: meta.duration ? meta.duration.toFixed(1) : "", width: String(meta.width || ""), height: String(meta.height || "") });
    } else {
      const size = await imageSize(file);
      set({ r2Key: key, fileSha256: sha256, fileName: file.name, existingId: "", thumbnailKey: key, width: String(size.width || ""), height: String(size.height || "") });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setDuplicate(null);
    try {
      const res = await upload(kind, file);
      if (res.duplicateCreativeId) {
        setDuplicate({ duplicateId: res.duplicateCreativeId, file });
        await store(file, res.key, res.sha256);
        return;
      }
      await store(file, res.key, res.sha256);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    void onFile(e.dataTransfer.files?.[0]);
  };

  const setRow = (i: number, patch: Partial<ScriptRow>) => set({ script: c.script.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const addRow = () => {
    const last = c.script.at(-1);
    const from = last ? last.to : "0";
    set({ script: [...c.script, { from, to: String(Number(from) + 3), narration: "", telop: "", visual: "" }] });
  };
  const fileMeta = kind === "video"
    ? [c.durationSec ? `${Math.round(Number(c.durationSec))}秒` : "", c.width && c.height ? aspect(Number(c.width), Number(c.height)) : ""].filter(Boolean).join("・")
    : c.width && c.height ? `${c.width}×${c.height}` : "";

  return (
    <div className="flex flex-col gap-5">
      <ToggleGroup>
        <Toggle active={kind === "video"} onClick={() => set({ kind: "video", r2Key: "", thumbnailKey: "", fileName: "" })}>動画</Toggle>
        <Toggle active={kind === "banner"} onClick={() => set({ kind: "banner", r2Key: "", thumbnailKey: "", fileName: "", durationSec: "", script: [] })}>バナー</Toggle>
      </ToggleGroup>

      {c.existingId ? (
        <div className="border border-orange bg-orange-tint px-4 py-3 text-sm flex flex-wrap justify-between items-center gap-2">
          既存のクリエイティブを使います
          <Button size="xs" onClick={() => set({ existingId: "" })}>やめる</Button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`border border-dashed px-4 py-6 text-center ${dragging ? "border-orange bg-orange-tint" : errors.sourceUrl ? "border-red" : "border-line-2"}`}
        >
          <p className="text-sm font-bold">
            ファイルをここにドラッグ　または
            <button type="button" className="underline underline-offset-2" onClick={() => inputRef.current?.click()} disabled={uploading}>ファイルを選ぶ</button>
            {" ／ "}
            <button type="button" className="underline underline-offset-2" onClick={() => setShowUrl(true)}>URLを入力</button>
          </p>
          <p className="text-xs text-ink-3 mt-1">動画：mp4・mov（現在は95MBまで）　画像：jpg・png・webp・gif（20MBまで）</p>
          <input ref={inputRef} type="file" accept={ACCEPT[kind]} className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          {errors.sourceUrl && !c.r2Key ? <p className="text-xs text-red mt-2">{errors.sourceUrl}</p> : null}
        </div>
      )}

      {uploading ? <p className="text-sm text-ink-3">アップロードしています…</p> : null}
      {c.fileName && !c.existingId ? (
        <div className="border border-line flex items-center gap-4 p-2.5">
          <div className="w-24 h-14 bg-ink-3 flex items-center justify-center text-white shrink-0 overflow-hidden">
            {c.thumbnailKey ? (
              // eslint-disable-next-line @next/next/no-img-element -- private R2 file
              <img src={`/api/files/${c.thumbnailKey}`} alt="" className="w-full h-full object-cover" />
            ) : (
              <span aria-hidden>▶</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{c.fileName}</p>
            <p className="text-xs text-ink-3">{fileMeta ? `${fileMeta}（自動取得）　` : ""}{c.r2Key ? "アップロード完了 ✓" : ""}</p>
          </div>
        </div>
      ) : null}

      {duplicate ? (
        <div className="border border-orange px-4 py-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-2">
          <span>同じファイルが登録済みです。同じファイルは既存のクリエイティブを使います。</span>
          <span className="flex gap-3">
            <button type="button" className="underline" onClick={() => { set({ existingId: duplicate.duplicateId, r2Key: "", fileName: duplicate.file.name }); setDuplicate(null); }}>［既存を使う］</button>
            <button type="button" className="underline" onClick={() => { set({ r2Key: "", fileSha256: "", fileName: "", thumbnailKey: "" }); setDuplicate(null); inputRef.current?.click(); }}>［別のファイルを選ぶ］</button>
          </span>
        </div>
      ) : null}

      {showUrl ? (
        <Field label="クリエイティブのURL" hint="ファイルかURLのどちらかが必要です">
          <Input value={c.sourceUrl} onChange={(e) => set({ sourceUrl: e.target.value })} placeholder="https://" />
        </Field>
      ) : null}

      <Field label="メインコピー">
        <Input value={c.mainCopy} maxLength={2000} onChange={(e) => set({ mainCopy: e.target.value })} placeholder="40代になって、急に乾燥が気になりませんか？" />
      </Field>

      {kind === "video" ? (
        <div className="flex flex-col gap-2">
          <SectionLabel>台本（秒数ごと・修正できます）</SectionLabel>
          {c.script.length > 0 ? (
            <div className="flex flex-col">
              {c.script.map((r, i) => (
                <div key={i} className="grid grid-cols-[6.5rem_1fr_auto] items-center border border-line -mt-px first:mt-0 bg-white">
                  <div className="flex items-center gap-0.5 px-2 text-sm font-bold">
                    <input value={r.from} onChange={(e) => setRow(i, { from: e.target.value })} aria-label="開始秒" inputMode="numeric" className="w-7 text-right outline-none focus:bg-canvas" />
                    〜
                    <input value={r.to} onChange={(e) => setRow(i, { to: e.target.value })} aria-label="終了秒" inputMode="numeric" className="w-7 text-right outline-none focus:bg-canvas" />
                    秒
                  </div>
                  <input value={r.narration} onChange={(e) => setRow(i, { narration: e.target.value })} placeholder="セリフ・テロップ・映像の内容" className="h-10 px-2 text-sm outline-none focus:bg-canvas min-w-0" />
                  <button type="button" onClick={() => set({ script: c.script.filter((_, j) => j !== i) })} aria-label="行を削除" className="px-3 h-10 text-ink-4 hover:text-ink">×</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-4">台本はまだありません。秒数ごとに行を追加してください。</p>
          )}
          <Button size="sm" className="w-fit" onClick={addRow}>＋ 行を追加</Button>
        </div>
      ) : null}
    </div>
  );
}
