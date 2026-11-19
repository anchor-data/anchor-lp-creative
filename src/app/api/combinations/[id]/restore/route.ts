import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { restore } from "@/server/services/combination-detail";

export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("delete_own");
  await restore(user, (await params).id);
  return ok({ ok: true });
});
