"use client";
// Browser-side sampling for 動画解析 (F-13). The video plays once at PLAYBACK_RATE with pitch
// preservation off: frames are grabbed at the sample times, and the audio graph records the sound,
// which at 3× speed and a 48 kHz context is exactly the original track at 16 kHz (Whisper's rate).
// Videos stream from a same-origin URL, so nothing larger than the frames and the WAV is uploaded.
import { frameTimes } from "@/lib/domain/video-analysis";

const PLAYBACK_RATE = 3;
const FRAME_WIDTH = 640;
const LOAD_TIMEOUT_MS = 45_000;
/** Longest stretch analysed: keeps the 16 kHz WAV under the API's 12 MB audio limit. */
const MAX_SECONDS = 300;
/** Give up when playback makes no progress for this long (stalled download). */
const STALL_TIMEOUT_MS = 60_000;

export interface CapturedFrame {
  t: number;
  blob: Blob;
}
export interface CaptureResult {
  frames: CapturedFrame[];
  audio: Blob | null;
  durationSec: number;
  width: number;
  height: number;
}
export interface CaptureOptions {
  maxFrames?: number;
  /** Seconds of the clip to analyse (from the start). */
  maxSeconds?: number;
  onProgress?: (ratio: number) => void;
}

type VideoWithFrameCallback = HTMLVideoElement & { preservesPitch?: boolean };

function waitFor(video: HTMLVideoElement, event: "loadedmetadata" | "seeked", timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error("動画の読み込みがタイムアウトしました")); }, timeoutMs);
    const onOk = () => { cleanup(); resolve(); };
    const onErr = () => { cleanup(); reject(new Error("動画を読み込めませんでした（形式に対応していないか、取得に失敗しました）")); };
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, onOk);
      video.removeEventListener("error", onErr);
    };
    video.addEventListener(event, onOk, { once: true });
    video.addEventListener("error", onErr, { once: true });
  });
}

function grab(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<Blob | null> {
  const ctx = canvas.getContext("2d");
  if (!ctx || !video.videoWidth) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.8));
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** Peak level, to drop silent tracks (no point transcribing them). */
function isSilent(samples: Float32Array): boolean {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 16) peak = Math.max(peak, Math.abs(samples[i]));
  return peak < 0.01;
}

export async function captureVideo(src: string, opts: CaptureOptions = {}): Promise<CaptureResult> {
  const video = document.createElement("video") as VideoWithFrameCallback;
  video.preload = "auto";
  video.playsInline = true;
  video.src = src;
  await waitFor(video, "loadedmetadata", LOAD_TIMEOUT_MS);

  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const width = video.videoWidth;
  const height = video.videoHeight;
  const span = Math.min(duration || 0, Math.min(opts.maxSeconds ?? 180, MAX_SECONDS));
  const times = frameTimes(span, opts.maxFrames ?? 24);
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(FRAME_WIDTH, video.videoWidth || FRAME_WIDTH);
  canvas.height = Math.round((canvas.width / (video.videoWidth || 16)) * (video.videoHeight || 9));

  // Audio: element → recorder (→ silent gain → destination, so the user hears nothing).
  const audioCtx = new AudioContext({ sampleRate: 48_000 });
  await audioCtx.resume();
  const source = audioCtx.createMediaElementSource(video);
  const recorder = audioCtx.createScriptProcessor(4096, 2, 1);
  const mute = audioCtx.createGain();
  mute.gain.value = 0;
  source.connect(recorder);
  recorder.connect(mute);
  mute.connect(audioCtx.destination);
  const chunks: Float32Array[] = [];
  let recording = true;
  recorder.onaudioprocess = (e) => {
    // Skip buffers while the stream is stalled so the transcript timing stays aligned.
    if (!recording || video.paused || video.readyState < 3) return;
    const l = e.inputBuffer.getChannelData(0);
    const r = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : l;
    const mono = new Float32Array(l.length);
    for (let i = 0; i < l.length; i++) mono[i] = (l[i] + r[i]) / 2;
    chunks.push(mono);
  };

  const frames: CapturedFrame[] = [];
  const pending: Promise<void>[] = [];
  let next = 0;
  /** Set once playback is over (or failed) so late frame callbacks do nothing. */
  let done = false;
  const take = (t: number) => {
    if (done) return;
    pending.push(grab(video, canvas).then((blob) => { if (blob) frames.push({ t, blob }); }));
  };

  const listeners = new AbortController();
  try {
    await new Promise<void>((resolve, reject) => {
      let lastProgress = Date.now();
      const stall = setInterval(() => {
        if (Date.now() - lastProgress > STALL_TIMEOUT_MS) { clearInterval(stall); reject(new Error("動画の再生が止まりました。通信状況を確認して、もう一度お試しください")); }
      }, 2000);
      const finish = () => { clearInterval(stall); video.pause(); resolve(); };
      const onTime = (mediaTime: number) => {
        if (done) return;
        lastProgress = Date.now();
        opts.onProgress?.(span ? Math.min(1, mediaTime / span) : 1);
        while (next < times.length && mediaTime >= times[next]) take(times[next++]);
        if (mediaTime >= span) finish();
      };
      const loop = () => {
        video.requestVideoFrameCallback((_, meta) => {
          onTime(meta.mediaTime);
          if (!done && !video.paused && !video.ended) loop();
        });
      };
      const hasFrameCallback = typeof (video as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback === "function";
      if (hasFrameCallback) loop();
      else video.addEventListener("timeupdate", () => onTime(video.currentTime), { signal: listeners.signal });
      video.addEventListener("ended", finish, { once: true });
      video.addEventListener("error", () => { clearInterval(stall); reject(new Error("動画の再生に失敗しました")); }, { once: true });
      video.preservesPitch = false;
      video.playbackRate = PLAYBACK_RATE;
      video.play().catch((err: unknown) => { clearInterval(stall); reject(err instanceof Error ? err : new Error("動画を再生できませんでした")); });
    });
    recording = false;
    done = true;
    listeners.abort();
    await Promise.all(pending);
    // Times the playback skipped past (fast seek / early end): seek and grab them.
    for (const t of times.slice(next)) {
      video.currentTime = t;
      await waitFor(video, "seeked", 15_000).catch(() => undefined);
      const blob = await grab(video, canvas);
      if (blob) frames.push({ t, blob });
    }
  } finally {
    recording = false;
    done = true;
    listeners.abort();
    recorder.onaudioprocess = null;
    source.disconnect();
    await audioCtx.close().catch(() => undefined);
    video.removeAttribute("src");
    video.load();
  }

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const samples = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) { samples.set(c, offset); offset += c.length; }
  const audioRate = Math.round(audioCtx.sampleRate / PLAYBACK_RATE);
  return {
    frames: frames.sort((a, b) => a.t - b.t),
    audio: total > audioRate && !isSilent(samples) ? encodeWav(samples, audioRate) : null,
    durationSec: duration,
    width,
    height,
  };
}
