// F-13 動画の自動解析: result shape shared by the API, the wizard and the detail page.
import { z } from "zod";

export const videoSceneSchema = z.object({
  from: z.number().min(0),
  to: z.number().min(0),
  visual: z.string().max(500).default(""),
  telop: z.string().max(500).default(""),
  narration: z.string().max(1000).default(""),
});

export const videoAnalysisSchema = z.object({
  summary: z.string().max(1000).default(""),
  hook: z.object({ type: z.string().max(50).default(""), text: z.string().max(300).default(""), why: z.string().max(500).default("") }),
  appealPoints: z.array(z.string().max(200)).max(8).default([]),
  structure: z.string().max(500).default(""),
  cta: z.string().max(300).default(""),
  scenes: z.array(videoSceneSchema).max(60).default([]),
  transcript: z.string().max(20000).default(""),
  /** "whisper" when narration came from speech recognition, "frames" when only on-screen text was read. */
  transcriptSource: z.enum(["whisper", "frames"]),
  frameCount: z.number().int().min(0),
  durationSec: z.number().min(0).nullable(),
  model: z.string().max(100),
  analyzedAt: z.string(),
});
export type VideoAnalysis = z.infer<typeof videoAnalysisSchema>;
export type VideoScene = z.infer<typeof videoSceneSchema>;

/** What the model is asked to return (the rest is filled in by the server). */
export const videoAnalysisModelSchema = videoAnalysisSchema.pick({ summary: true, hook: true, appealPoints: true, structure: true, cta: true, scenes: true });

export function parseVideoAnalysis(raw: unknown): VideoAnalysis | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = videoAnalysisSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Evenly spaced sample times (seconds), skipping the very last frame which is often black. */
export function frameTimes(durationSec: number, max = 24, minGap = 1): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [0];
  const usable = Math.max(0, durationSec - 0.2);
  const count = Math.max(1, Math.min(max, Math.floor(usable / minGap) + 1));
  const step = count === 1 ? 0 : usable / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step * 10) / 10);
}
