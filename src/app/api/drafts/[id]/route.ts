import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { deleteDraft, getDraft, saveDraft } from "@/server/services/registration";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser("register");
  return ok(await getDraft(user, (await params).id));
});

export const PUT = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser("register");
  const { payload, sbCandidateId } = await parseJson(req, z.object({ payload: z.unknown(), sbCandidateId: z.string().nullable().default(null) }));
  return ok(await saveDraft(user, (await params).id, payload, sbCandidateId));
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser("register");
  await deleteDraft(user, (await params).id);
  return ok({ ok: true });
});
