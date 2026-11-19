import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { getGeneration } from "@/server/services/generation";

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("generate");
  return ok(await getGeneration(user, (await params).id));
});
