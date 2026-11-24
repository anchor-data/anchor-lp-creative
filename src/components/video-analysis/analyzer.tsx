"use client";
// 「AIで動画を解析」 button + result view, shared by the wizard (STEP2) and the detail page.
import { useState } from "react";
import { Button } from "@/components/ui";
import { api, errorMessage } from "@/components/client";
import { useToast } from "@/components/toast";
import type { VideoAnalysis } from "@/lib/domain/video-analysis";
import { captureVideo } from "./capture";

export interface VideoSource {
  r2Key?: string | null;
  url?: string | null;
}

export interface AnalyzedVideo {
  analysis: VideoAnalysis;
  /** First-frame thumbnail uploaded to R2 (null when the upload failed). */
  thumbnailKey: string | null;
  width: number;
  height: number;
}

interface VideoAnalyzerProps {
  source: VideoSource;
  mainCopy?: string | null;
  productName?: string | null;
  hasResult: boolean;
  onAnalyzed: (result: AnalyzedVideo) => Promise<void> | void;
}

type Phase = { kind: "idle" } | { kind: "capture"; ratio: number } | { kind: "upload" } | { kind: "analyze" };

/** Same-origin stream for the source (R2 file or proxied URL). */
export function videoSrc(source: VideoSource): string | null {
  if (source.r2Key) return `/api/files/${source.r2Key}`;
  if (source.url && /^https?:\/\//.test(source.url)) return `/api/creatives/source?url=${encodeURIComponent(source.url)}`;
  return null;
}

async function uploadThumb(blob: Blob): Promise<string | null> {
  const fd = new FormData();
  fd.set("purpose", "screenshot");
  fd.set("file", new File([blob], "thumb.jpg", { type: "image/jpeg" }));
  try {
    const res = await api<{ key: string }>("/api/uploads", { method: "POST", body: fd });
    return res.key;
  } catch {
    return null;
  }
}

/** Checks the proxied URL first so a private Drive file gets the clear sharing message, not a codec error. */
async function assertReachable(src: string): Promise<void> {
  if (!src.startsWith("/api/creatives/source")) return;
  const res = await fetch(src, { headers: { range: "bytes=0-1023" } });
  if (res.ok) {
    await res.body?.cancel();
    return;
  }
  let message = `動画を取得できませんでした（${res.status}）`;
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    if (body.error?.message) message = body.error.message;
  } catch {
    /* not JSON */
  }
  throw new Error(message);
}

export function VideoAnalyzer({ source, mainCopy, productName, hasResult, onAnalyzed }: VideoAnalyzerProps) {
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const src = videoSrc(source);

  const run = async () => {
    if (!src) return;
    setPhase({ kind: "capture", ratio: 0 });
    try {
      await assertReachable(src);
      const cap = await captureVideo(src, { onProgress: (ratio) => setPhase({ kind: "capture", ratio }) });
      if (cap.frames.length === 0) throw new Error("動画のフレームを取得できませんでした");
      setPhase({ kind: "upload" });
      const poster = cap.frames.find((f) => f.t >= 1) ?? cap.frames[0];
      const thumbnailKey = await uploadThumb(poster.blob);
      const fd = new FormData();
      fd.set("meta", JSON.stringify({ times: cap.frames.map((f) => f.t), durationSec: cap.durationSec || null, mainCopy: mainCopy || null, productName: productName || null }));
      cap.frames.forEach((f, i) => fd.set(`frame${i}`, new File([f.blob], `f${i}.jpg`, { type: "image/jpeg" })));
      if (cap.audio) fd.set("audio", new File([cap.audio], "audio.wav", { type: "audio/wav" }));
      setPhase({ kind: "analyze" });
      const analysis = await api<VideoAnalysis>("/api/ai/video-analysis", { method: "POST", body: fd });
      await onAnalyzed({ analysis, thumbnailKey, width: cap.width, height: cap.height });
      toast.info(analysis.transcriptSource === "whisper" ? "動画を解析しました（音声の文字起こしつき）" : "動画を解析しました（音声なし・画面の文字から解析）");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPhase({ kind: "idle" });
    }
  };

  const busy = phase.kind !== "idle";
  const label =
    phase.kind === "capture" ? `動画を読み込んでいます… ${Math.round(phase.ratio * 100)}%`
      : phase.kind === "upload" ? "フレームを送信しています…"
        : phase.kind === "analyze" ? "AIが解析しています（30秒ほど）…"
          : hasResult ? "AIで解析し直す" : "AIで動画を解析";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant={hasResult ? "secondary" : "primary"} onClick={run} disabled={!src || busy}>{label}</Button>
      {!src ? <span className="text-xs text-ink-4">ファイルかURLを入れると解析できます</span> : null}
      {busy ? <span className="text-xs text-ink-3">このタブを開いたままにしてください（動画を3倍速で読み込みます）</span> : null}
    </div>
  );
}

/** Analysis summary (scenes are shown as the 台本). */
export function VideoAnalysisView({ analysis, showScenes = false }: { analysis: VideoAnalysis; showScenes?: boolean }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      {analysis.summary ? <p>{analysis.summary}</p> : null}
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5">
        {analysis.hook.text || analysis.hook.type ? (
          <>
            <dt className="text-ink-3">フック</dt>
            <dd>
              {analysis.hook.type ? <span className="font-bold mr-1.5">［{analysis.hook.type}］</span> : null}
              {analysis.hook.text}
              {analysis.hook.why ? <span className="block text-xs text-ink-3 mt-0.5">{analysis.hook.why}</span> : null}
            </dd>
          </>
        ) : null}
        {analysis.appealPoints.length ? (
          <>
            <dt className="text-ink-3">訴求ポイント</dt>
            <dd><ul className="list-disc pl-4">{analysis.appealPoints.map((p) => <li key={p}>{p}</li>)}</ul></dd>
          </>
        ) : null}
        {analysis.structure ? (<><dt className="text-ink-3">構成</dt><dd>{analysis.structure}</dd></>) : null}
        {analysis.cta ? (<><dt className="text-ink-3">CTA</dt><dd>{analysis.cta}</dd></>) : null}
      </dl>
      {showScenes && analysis.scenes.length ? (
        <ol className="flex flex-col gap-1.5 border-t border-line-3 pt-2">
          {analysis.scenes.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-16 shrink-0 text-ink-3">{s.from}〜{s.to}秒</span>
              <span>{[s.narration, s.telop && `［テロップ］${s.telop}`, s.visual && `［映像］${s.visual}`].filter(Boolean).join(" ")}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {analysis.transcript ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-ink-3">音声の文字起こし</summary>
          <p className="mt-1.5 whitespace-pre-wrap text-ink-2">{analysis.transcript}</p>
        </details>
      ) : null}
      <p className="text-[11px] text-ink-4">
        {analysis.transcriptSource === "whisper" ? "音声の文字起こしとフレーム" : "フレーム（画面の文字）のみ"} {analysis.frameCount}枚から解析・{new Date(analysis.analyzedAt).toLocaleString("ja-JP")}
      </p>
    </div>
  );
}
