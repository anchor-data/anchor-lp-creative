import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { patchUser, userPatchSchema } from "@/server/services/admin";

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("admin");
  await patchUser(user, (await params).id, await parseJson(req, userPatchSchema));
  return ok({ ok: true });
});
