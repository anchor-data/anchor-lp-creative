import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { checkRateLimit, generate, listGenerations } from "@/server/services/generation";
import { sseResponse } from "@/server/sse";
import { genOptionsSchema, productInputSchema } from "@/lib/domain/plan";

const schema = z.object({
  product: productInputSchema,
  options: genOptionsSchema,
  refIds: z.array(z.string()).min(1, "参照する事例を1件以上選んでください").max(10, "参照する事例は10件までです"),
  autoRefIds: z.array(z.string()).default([]),
});

export const GET = handler(async () => {
  const user = await requireUser("generate");
  return ok({ items: await listGenerations(user) });
});

/** Set generation, streamed per plan as SSE. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser("generate");
  const input = await parseJson(req, schema);
  await checkRateLimit(user.id);
  return sseResponse((emit) => generate(user, input, emit));
});
