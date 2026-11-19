import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { createTag, listTags, tagCreateSchema } from "@/server/services/admin";

/** Tag options are readable by registrants too (wizard step 5). */
export const GET = handler(async () => {
  await requireUser("view");
  return ok(await listTags());
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser("admin");
  return ok({ id: await createTag(user, await parseJson(req, tagCreateSchema)) }, { status: 201 });
});
