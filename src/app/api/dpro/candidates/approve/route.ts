import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { approveDproCandidates } from "@/server/services/candidates";

export const POST = handler(async (req: Request) => {
  const user = await requireUser("review_candidates");
  const { ids } = await parseJson(req, z.object({ ids: z.array(z.string()).min(1, "承認する候補を選んでください").max(100) }));
  return ok(await approveDproCandidates(user, ids));
});
