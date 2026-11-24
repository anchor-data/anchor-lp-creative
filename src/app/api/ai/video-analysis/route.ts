import { z } from "zod";
import { ApiError, handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { analyzeVideo, VIDEO_LIMITS, type VideoFrame } from "@/server/services/video-analysis";

const metaSchema = z.object({
  times: z.array(z.number().min(0).max(36_000)).max(VIDEO_LIMITS.maxFrames),
  durationSec: z.number().min(0).max(36_000).nullable(),
  mainCopy: z.string().max(2000).nullable().default(null),
  productName: z.string().max(200).nullable().default(null),
});

const isJpeg = (b: Uint8Array): boolean => b[0] === 0xff && b[1] === 0xd8;
const isWav = (b: Uint8Array): boolean => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WAVE";

/**
 * F-13: multipart with `meta` (JSON), `frame0..N` (JPEG) and optional `audio` (16 kHz mono WAV).
 * Frames and audio are captured in the browser so large videos never pass through the Worker.
 */
export const POST = handler(async (req: Request) => {
  await requireUser("register");
  const form = await req.formData().catch(() => null);
  if (!form) throw new ApiError("VALIDATION_ERROR", "リクエストの形式が正しくありません");
  let meta: z.infer<typeof metaSchema>;
  try {
    meta = metaSchema.parse(JSON.parse(String(form.get("meta") ?? "")));
  } catch {
    throw new ApiError("VALIDATION_ERROR", "解析の条件が正しくありません");
  }
  const frames: VideoFrame[] = [];
  for (let i = 0; i < meta.times.length; i++) {
    const f = form.get(`frame${i}`);
    if (!(f instanceof File)) continue;
    if (f.size > VIDEO_LIMITS.maxFrameBytes) throw new ApiError("VALIDATION_ERROR", "フレーム画像が大きすぎます");
    const buf = await f.arrayBuffer();
    if (!isJpeg(new Uint8Array(buf.slice(0, 2)))) throw new ApiError("VALIDATION_ERROR", "フレーム画像の形式が正しくありません");
    frames.push({ t: meta.times[i], jpeg: buf });
  }
  const audioFile = form.get("audio");
  let audio: ArrayBuffer | null = null;
  if (audioFile instanceof File && audioFile.size > 0) {
    if (audioFile.size > VIDEO_LIMITS.maxAudioBytes) throw new ApiError("VALIDATION_ERROR", "音声が長すぎます");
    audio = await audioFile.arrayBuffer();
    if (!isWav(new Uint8Array(audio.slice(0, 12)))) throw new ApiError("VALIDATION_ERROR", "音声の形式が正しくありません");
  }
  return ok(await analyzeVideo({ frames, audio, durationSec: meta.durationSec, mainCopy: meta.mainCopy, productName: meta.productName }));
});
