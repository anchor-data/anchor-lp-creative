import { z } from "zod";
import { handler, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { checkRateLimit, regenerate } from "@/server/services/generation";
import { sseResponse } from "@/server/sse";

const schema = z.object({
  planIndex: z.number().int().min(0).max(9),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("whole") }),
    z.object({ kind: z.literal("copy") }),
    z.object({ kind: z.literal("article-structure") }),
    z.object({ kind: z.literal("video-hook") }),
    z.object({ kind: z.literal("block"), index: z.number().int().min(0) }),
  ]),
});

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("generate");
  const { id } = await params;
  const input = await parseJson(req, schema);
  await checkRateLimit(user.id);
  return sseResponse((emit) => regenerate(user, id, input.planIndex, input.target, emit));
});
