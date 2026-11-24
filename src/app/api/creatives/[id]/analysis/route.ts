import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { saveCreativeAnalysis } from "@/server/services/media-analysis";
import { videoAnalysisSchema } from "@/lib/domain/video-analysis";

const bodySchema = z.object({
  analysis: videoAnalysisSchema,
  /** Fill the 台本 from the scenes (replaces the current script). */
  applyScript: z.boolean().default(false),
  thumbnailKey: z.string().max(200).optional(),
  width: z.number().int().min(0).max(10_000).optional(),
  height: z.number().int().min(0).max(10_000).optional(),
});

/** Saves a video analysis on a registered creative (detail page「AIで動画を解析」). */
export const PUT = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("register");
  const body = await parseJson(req, bodySchema);
  await saveCreativeAnalysis(user, (await params).id, body);
  return ok({ ok: true });
});
