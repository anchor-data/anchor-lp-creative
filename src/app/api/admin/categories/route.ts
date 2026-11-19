import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { categoryCreateSchema, createCategory, listCategoriesAdmin } from "@/server/services/admin";

export const GET = handler(async () => {
  await requireUser("admin");
  return ok({ items: await listCategoriesAdmin() });
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser("admin");
  return ok({ id: await createCategory(user, await parseJson(req, categoryCreateSchema)) }, { status: 201 });
});
