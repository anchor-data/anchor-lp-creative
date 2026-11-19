import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { judgeManualRows, judgeSb, loadCriteria, loadDefaultCriteria } from "@/server/services/judging";
import { manualMetricsSchema } from "@/lib/domain/registration";

const schema = z.object({
  categoryId: z.string().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().optional(),
  manual: manualMetricsSchema.optional(),
  sb: z.object({ sbVersionId: z.string(), sbCreativeId: z.string(), media: z.string() }).optional(),
});

/** Live judgment for wizard step 4 (nothing is saved). */
export const POST = handler(async (req: Request) => {
  await requireUser("register");
  const input = await parseJson(req, schema);
  const criteria = input.categoryId ? await loadCriteria(input.categoryId) : await loadDefaultCriteria();
  if (input.sb) return ok({ basis: await judgeSb(input.sb, input.startDate, criteria), criteria });
  const m = input.manual;
  const end = input.endDate || new Date().toISOString().slice(0, 10);
  const basis = judgeManualRows(
    m ? [{ periodStart: input.startDate, periodEnd: end, spend: m.spend, cv: m.cv, mcv: m.mcv ?? null, pv: m.pv ?? null, click: m.click ?? null, fsver: m.fsver ?? null, oar: m.oar ?? null }] : [],
    input.startDate,
    input.endDate || null,
    criteria,
  );
  return ok({ basis, criteria });
});
