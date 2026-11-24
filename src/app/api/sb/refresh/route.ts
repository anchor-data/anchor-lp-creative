import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { getRefreshView, loadBatch } from "@/server/sb-refresh";

/** What has been loaded into 取り込み候補 so far. */
export const GET = handler(async () => {
  await requireUser("review_candidates");
  return ok(await getRefreshView());
});

/** Loads the top beyond pages ("latest") or the next few ("more") from Squad beyond. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser("review_candidates");
  const { mode } = await parseJson(req, z.object({ mode: z.enum(["latest", "more"]).default("latest") }));
  return ok(await loadBatch(mode, user.id));
});
