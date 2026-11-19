import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { dproPatchSchema, patchDproCandidate } from "@/server/services/candidates";

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("review_candidates");
  await patchDproCandidate(user, (await params).id, await parseJson(req, dproPatchSchema));
  return ok({ ok: true });
});
