import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { categoryTree, parseListQuery } from "@/server/services/combination-list";

export const GET = handler(async (req: Request) => {
  await requireUser("view");
  return ok({ items: await categoryTree(parseListQuery(new URL(req.url).searchParams)) });
});
