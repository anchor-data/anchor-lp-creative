import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { saveEditedVersion } from "@/server/services/generation";
import { planSchema } from "@/lib/domain/plan";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("generate");
  const { plans } = await parseJson(req, z.object({ plans: z.array(planSchema.nullable()).min(1).max(10) }));
  return ok(await saveEditedVersion(user, (await params).id, plans), { status: 201 });
});
