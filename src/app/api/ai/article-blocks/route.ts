import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { decomposeArticle } from "@/server/services/ai";
import { ARTICLE_BLOCK_TYPES } from "@/lib/domain/constants";

export const POST = handler(async (req: Request) => {
  await requireUser("register");
  const { body } = await parseJson(req, z.object({ body: z.string().trim().min(1, "記事本文がありません").max(200000) }));
  return ok({ items: await decomposeArticle(body, ARTICLE_BLOCK_TYPES) });
});
