import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { linkCombination } from "@/server/services/generation";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("register");
  const { combinationId } = await parseJson(req, z.object({ combinationId: z.string().min(1) }));
  await linkCombination(user, (await params).id, combinationId);
  return ok({ ok: true });
});
