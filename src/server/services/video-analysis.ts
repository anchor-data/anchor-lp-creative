import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getBindings, getEnv } from "../env";
import { ApiError } from "../http";
import { claude, extractJson, material, MATERIAL_RULE } from "./ai";
import { logAiUsage } from "./ai-usage";
import { videoAnalysisModelSchema, type VideoAnalysis } from "@/lib/domain/video-analysis";

// F-13 動画の自動解析. The browser samples frames and records the audio track (see
// components/video-analysis/capture.ts); here the audio is transcribed with Workers AI Whisper and
// Claude reads the frames + transcript into scenes (台本), hook and appeal points.

const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";

export const VIDEO_LIMITS = { maxFrames: 30, maxFrameBytes: 1_500_000, maxAudioBytes: 12_000_000 } as const;

export interface VideoFrame {
  t: number;
  jpeg: ArrayBuffer;
}

export interface AnalyzeVideoInput {
  frames: readonly VideoFrame[];
  /** 16-bit PCM WAV, 16 kHz mono. */
  audio: ArrayBuffer | null;
  durationSec: number | null;
  mainCopy: string | null;
  productName: string | null;
}

interface Transcript {
  text: string;
  segments: { start: number; end: number; text: string }[];
}

function base64(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64");
}

function logWarn(msg: string, err: unknown): void {
  console.error(JSON.stringify({ level: "warn", msg, error: err instanceof Error ? err.message : String(err) }));
}

/** Speech-to-text; null when Workers AI is unavailable or the clip has no speech (analysis then reads on-screen text only). */
async function transcribe(audio: ArrayBuffer | null): Promise<Transcript | null> {
  const ai = getBindings().AI;
  if (!ai || !audio || audio.byteLength < 2_000) return null;
  try {
    const res = await ai.run<{ text?: string; segments?: { start?: number; end?: number; text?: string }[] }>(WHISPER_MODEL, {
      audio: base64(audio),
      language: "ja",
      task: "transcribe",
      vad_filter: true,
    });
    const segments = (res.segments ?? [])
      .filter((s) => typeof s.text === "string" && s.text.trim())
      .map((s) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text).trim() }));
    const text = (res.text ?? segments.map((s) => s.text).join("\n")).trim();
    return text ? { text, segments } : null;
  } catch (err) {
    logWarn("whisper transcription failed", err);
    return null;
  }
}

const SYSTEM = `あなたは縦型・横型の動画広告を分析する広告クリエイティブの専門家です。${MATERIAL_RULE}
与えられた動画のフレーム画像（秒数つき）と音声の文字起こしから、次のJSONだけを出力してください。
{
  "summary": "動画全体の要約（150字以内）",
  "hook": { "type": "冒頭3秒のフックの種類（問いかけ／意外な事実／ビフォーアフター／数字の提示／共感／その他）", "text": "冒頭のセリフかテロップ", "why": "なぜ止まるか（80字以内）" },
  "appealPoints": ["訴求ポイント（各40字以内、最大6個）"],
  "structure": "構成の流れ（例：悩み提示→原因→商品登場→根拠→オファー→CTA、120字以内）",
  "cta": "最後の行動喚起（テロップ・セリフ）",
  "scenes": [{ "from": 0, "to": 3, "visual": "映像の内容（60字以内）", "telop": "画面上の文字（そのまま）", "narration": "セリフ・ナレーション（文字起こしに基づく）" }]
}
scenes は映像の切り替わりごとに分け、秒数は与えられたフレームの秒数と文字起こしの時刻に合わせてください。テロップは画像に見える文字を正確に書き写し、読めない場合は空文字にします。文字起こしが無い場合、narration は空文字にしてテロップから内容を読み取ってください。`;

function userContent(input: AnalyzeVideoInput, transcript: Transcript | null): Anthropic.ContentBlockParam[] {
  const head = [
    input.productName ? `商材：${input.productName}` : null,
    input.durationSec ? `動画の長さ：${input.durationSec.toFixed(1)}秒` : null,
    input.mainCopy ? material("メインコピー", input.mainCopy, 500) : null,
    transcript
      ? material("音声の文字起こし（開始秒〜終了秒）", transcript.segments.length ? transcript.segments.map((s) => `${s.start.toFixed(1)}〜${s.end.toFixed(1)}秒：${s.text}`).join("\n") : transcript.text, 8000)
      : "音声の文字起こしはありません（音声なし、または取得できませんでした）。",
    `以下は動画から一定間隔で切り出したフレーム ${input.frames.length} 枚です。`,
  ].filter(Boolean).join("\n");
  const frames = input.frames.flatMap((f): Anthropic.ContentBlockParam[] => [
    { type: "text", text: `${f.t.toFixed(1)}秒` },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64(f.jpeg) } },
  ]);
  return [{ type: "text", text: head }, ...frames];
}

export async function analyzeVideo(input: AnalyzeVideoInput): Promise<VideoAnalysis> {
  if (input.frames.length === 0) throw new ApiError("VALIDATION_ERROR", "動画のフレームを取得できませんでした");
  const env = getEnv();
  const transcript = await transcribe(input.audio);
  let text: string;
  try {
    const msg = await claude().messages.create({
      model: env.CLAUDE_MODEL_MAIN,
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: "user", content: userContent(input, transcript) }],
    });
    logAiUsage(`video-analysis（フレーム${input.frames.length}枚${transcript ? "・文字起こしあり" : ""}）`, msg);
    if (msg.stop_reason === "refusal") throw new ApiError("UPSTREAM_ERROR", "AIが応答を返せませんでした");
    text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logWarn("video analysis call failed", err);
    throw new ApiError("UPSTREAM_ERROR", "AIの呼び出しに失敗しました。時間を置いて再度お試しください");
  }
  let parsed;
  try {
    parsed = videoAnalysisModelSchema.parse(extractJson(text));
  } catch (err) {
    logWarn("video analysis output not parseable", err);
    throw new ApiError("UPSTREAM_ERROR", "AIの応答を解釈できませんでした。もう一度お試しください");
  }
  const end = input.durationSec ?? Infinity;
  return {
    ...parsed,
    scenes: parsed.scenes
      .map((s) => ({ ...s, from: Math.max(0, Math.min(s.from, end)), to: Math.max(0, Math.min(s.to, end)) }))
      .filter((s) => s.to >= s.from)
      .sort((a, b) => a.from - b.from),
    transcript: transcript?.text.slice(0, 20000) ?? "",
    transcriptSource: transcript ? "whisper" : "frames",
    frameCount: input.frames.length,
    durationSec: input.durationSec,
    model: env.CLAUDE_MODEL_MAIN,
    analyzedAt: new Date().toISOString(),
  };
}
