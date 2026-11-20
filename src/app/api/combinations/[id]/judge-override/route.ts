import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { clearJudgeOverride, overrideJudge } from "@/server/services/combination-detail";
import { judgeReasonSchema } from "@/lib/domain/registration";

type Ctx = { params: Promise<{ id: string }> };
const putSchema = z.object({
  judge: z.enum(["hit", "fair", "miss"]),
  reason: judgeReasonSchema,
  updatedAt: z.string(),
});

export const PUT = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser("judge_override");
  await overrideJudge(user, (await params).id, await parseJson(req, putSchema));
  return ok({ ok: true });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser("judge_override");
  const updatedAt = new URL(req.url).searchParams.get("updatedAt") ?? "";
  await clearJudgeOverride(user, (await params).id, updatedAt);
  return ok({ ok: true });
});
