import { z } from "zod";
import { ApiError, handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { pickerCreatives } from "@/server/services/sb-picker";

const querySchema = z.object({
  versionId: z.string().min(1).max(100).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  refresh: z.literal("1").optional(),
});

/** Creatives (ad parameters) of a page; with versionId + from/to, the delivery period is loaded on demand. */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser("register");
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "検索条件が正しくありません");
  const q = parsed.data;
  return ok({ items: await pickerCreatives((await params).id, { versionId: q.versionId, from: q.from, to: q.to ?? null, refresh: q.refresh === "1" }) });
});
