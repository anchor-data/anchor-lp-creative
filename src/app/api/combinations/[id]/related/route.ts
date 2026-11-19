import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { getRelated } from "@/server/services/combination-detail";

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser("view");
  return ok(await getRelated((await params).id));
});
