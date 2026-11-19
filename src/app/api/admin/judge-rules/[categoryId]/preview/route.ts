import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { criteriaSchema, previewCriteria } from "@/server/services/admin";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ categoryId: string }> }) => {
  await requireUser("admin");
  return ok(await previewCriteria((await params).categoryId, await parseJson(req, criteriaSchema)));
});
