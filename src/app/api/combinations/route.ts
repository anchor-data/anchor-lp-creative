import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { listCombinations, parseListQuery } from "@/server/services/combination-list";

export const GET = handler(async (req: Request) => {
  await requireUser("view");
  return ok(await listCombinations(parseListQuery(new URL(req.url).searchParams)));
});
