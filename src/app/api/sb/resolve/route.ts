import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { resolveSbArticle } from "@/server/services/sb-picker";

const schema = z.object({
  url: z.string().trim().url().max(2000).optional().or(z.literal("")),
  title: z.string().max(300).optional(),
  productName: z.string().max(200).optional(),
});

/** Finds the beyond page / Version for an article entered by URL (or name candidates). */
export const POST = handler(async (req: Request) => {
  await requireUser("register");
  const input = await parseJson(req, schema);
  return ok(await resolveSbArticle({ url: input.url || undefined, title: input.title, productName: input.productName }));
});
