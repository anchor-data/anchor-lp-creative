import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { weightsSchema } from "@/server/services/admin";
import { recommend } from "@/server/services/recommendations";
import { productInputSchema } from "@/lib/domain/plan";

export const POST = handler(async (req: Request) => {
  await requireUser("admin");
  const { product, weights } = await parseJson(req, z.object({ product: productInputSchema, weights: weightsSchema }));
  return ok({ items: await recommend(product, weights) });
});
