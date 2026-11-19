import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { loadNgDictionary } from "@/server/services/combination-detail";
import { checkExpressions } from "@/lib/domain/expressions";

export const POST = handler(async (req: Request) => {
  await requireUser("view");
  const { text, categoryId } = await parseJson(req, z.object({ text: z.string().max(50000), categoryId: z.string().nullable().default(null) }));
  return ok({ items: checkExpressions({ text }, await loadNgDictionary(categoryId)) });
});
