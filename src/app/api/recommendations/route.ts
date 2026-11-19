import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { latestPlaybooks, recommend } from "@/server/services/recommendations";
import { productInputSchema } from "@/lib/domain/plan";

export const POST = handler(async (req: Request) => {
  await requireUser("generate");
  const { product } = await parseJson(req, z.object({ product: productInputSchema }));
  const [items, playbooks] = await Promise.all([recommend(product), latestPlaybooks(product.categoryId)]);
  return ok({ items, playbooks });
});
