import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { requireServiceToken } from "@/server/service-auth";
import { dproIngestSchema, ingestDproCandidates, listDproCandidates } from "@/server/services/candidates";

export const GET = handler(async () => {
  await requireUser("review_candidates");
  return ok(await listDproCandidates());
});

/** Method B (spec 6-2): members' AI tools post DPro search results with the service token. */
export const POST = handler(async (req: Request) => {
  requireServiceToken(req);
  return ok(await ingestDproCandidates(await parseJson(req, dproIngestSchema)), { status: 201 });
});
