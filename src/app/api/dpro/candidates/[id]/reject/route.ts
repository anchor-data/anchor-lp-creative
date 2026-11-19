import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { rejectDproCandidate } from "@/server/services/candidates";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("review_candidates");
  const { reason } = await parseJson(req, z.object({ reason: z.string().max(500).optional() }));
  await rejectDproCandidate(user, (await params).id, reason);
  return ok({ ok: true });
});
