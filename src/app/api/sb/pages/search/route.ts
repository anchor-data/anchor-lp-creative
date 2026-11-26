import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { searchSbPagesRemote } from "@/server/services/sb-search";

/** 取り込み候補 search: ?q= is a beyond page name, folder name, URL or UID (looked up in Squad beyond). */
export const GET = handler(async (req: Request) => {
  await requireUser("review_candidates");
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 200);
  return ok({ items: await searchSbPagesRemote(q) });
});
