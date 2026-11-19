import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { candidatePrefill } from "@/server/services/candidates";

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser("register");
  return ok(await candidatePrefill((await params).id));
});
