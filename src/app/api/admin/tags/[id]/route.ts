import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { patchTag, tagPatchSchema } from "@/server/services/admin";

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("admin");
  await patchTag(user, (await params).id, await parseJson(req, tagPatchSchema));
  return ok({ ok: true });
});
