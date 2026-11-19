import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { restoreSbCandidate } from "@/server/services/candidates";

export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("review_candidates");
  await restoreSbCandidate(user, (await params).id);
  return ok({ ok: true });
});
