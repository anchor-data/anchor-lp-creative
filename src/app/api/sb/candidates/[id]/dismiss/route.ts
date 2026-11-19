import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { dismissSbCandidate, dismissSchema } from "@/server/services/candidates";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("review_candidates");
  await dismissSbCandidate(user, (await params).id, await parseJson(req, dismissSchema));
  return ok({ ok: true });
});
