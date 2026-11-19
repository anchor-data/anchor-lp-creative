import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { updateMemo } from "@/server/services/combination-detail";

const schema = z.object({ body: z.string().trim().min(1).max(2000, "勝因メモは2,000文字以内にしてください"), updatedAt: z.string() });

export const PATCH = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("edit_any");
  await updateMemo(user, (await params).id, await parseJson(req, schema));
  return ok({ ok: true });
});
