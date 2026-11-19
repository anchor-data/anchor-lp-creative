import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { setKeyExpiry } from "@/server/services/admin";

export const PUT = handler(async (req: Request, { params }: { params: Promise<{ provider: string }> }) => {
  const user = await requireUser("admin");
  const provider = z.enum(["squadbeyond", "dpro"]).parse((await params).provider);
  const { expiresOn } = await parseJson(req, z.object({ expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません") }));
  await setKeyExpiry(user, provider, expiresOn);
  return ok({ ok: true });
});
