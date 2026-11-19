import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { getWeights, saveWeights, weightsSchema } from "@/server/services/admin";

export const GET = handler(async () => {
  await requireUser("admin");
  return ok(await getWeights());
});

export const PUT = handler(async (req: Request) => {
  const user = await requireUser("admin");
  await saveWeights(user, await parseJson(req, weightsSchema));
  return ok({ ok: true });
});
