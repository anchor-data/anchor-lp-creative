import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { addMemo } from "@/server/services/combination-detail";

const schema = z.object({
  combinationId: z.string().min(1),
  kind: z.enum(["win", "next", "miss"]),
  body: z.string().trim().min(1, "メモを入力してください").max(2000, "勝因メモは2,000文字以内にしてください"),
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser("register");
  return ok({ id: await addMemo(user, await parseJson(req, schema)) }, { status: 201 });
});
