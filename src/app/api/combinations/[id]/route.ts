import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { getCombinationDetail, softDelete } from "@/server/services/combination-detail";
import { editCombination } from "@/server/services/combination-edit";
import { combinationEditSchema } from "@/lib/domain/combination-edit";

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

/** S-03 「編集」: product name / category, article title, media, period, target CPA and judgment. */
export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser("edit_own");
  await editCombination(user, (await params).id, await parseJson(req, combinationEditSchema));
  return ok({ ok: true });
});
