import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { categoryPatchSchema, patchCategory } from "@/server/services/admin";

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("admin");
  await patchCategory(user, (await params).id, await parseJson(req, categoryPatchSchema));
  return ok({ ok: true });
});
