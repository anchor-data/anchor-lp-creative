import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { criteriaSchema, getCriteria, saveCriteria } from "@/server/services/admin";

type Ctx = { params: Promise<{ categoryId: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  await requireUser("admin");
  return ok(await getCriteria((await params).categoryId));
});

/** Saves and re-judges that category (J-07 for one category). */
export const PUT = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser("admin");
  return ok(await saveCriteria(user, (await params).categoryId, await parseJson(req, criteriaSchema)));
});
