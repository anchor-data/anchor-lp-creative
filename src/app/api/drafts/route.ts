import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { listDrafts, saveDraft } from "@/server/services/registration";

export const GET = handler(async () => {
  const user = await requireUser("register");
  return ok({ items: await listDrafts(user) });
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser("register");
  const { payload, sbCandidateId } = await parseJson(req, z.object({ payload: z.unknown(), sbCandidateId: z.string().nullable().default(null) }));
  return ok(await saveDraft(user, null, payload, sbCandidateId), { status: 201 });
});
