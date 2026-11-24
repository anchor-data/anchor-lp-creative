import { z } from "zod";
import { ApiError, handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { pickerVersionTotals } from "@/server/services/sb-picker";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z.object({ from: ymd, to: ymd.optional() });

/** Version-level totals (spend, PV, MCV, CV, FSVER, OAR) for a delivery period, to fill manual metrics. */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser("register");
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "配信期間を入力してください");
  return ok(await pickerVersionTotals((await params).id, parsed.data.from, parsed.data.to ?? null));
});
