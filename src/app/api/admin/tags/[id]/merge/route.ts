import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { mergeTag } from "@/server/services/admin";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("admin");
  const { intoId } = await parseJson(req, z.object({ intoId: z.string().min(1) }));
  await mergeTag(user, (await params).id, intoId);
  return ok({ ok: true });
});
