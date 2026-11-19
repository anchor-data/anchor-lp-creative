import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { getCombinationDetail, softDelete } from "@/server/services/combination-detail";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  await requireUser("view");
  return ok(await getCombinationDetail((await params).id));
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser("delete_own");
  await softDelete(user, (await params).id);
  return ok({ ok: true });
});
