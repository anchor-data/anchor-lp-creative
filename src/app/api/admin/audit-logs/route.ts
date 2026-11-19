import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { auditQuerySchema, listAuditLogs, toCsv } from "@/server/services/admin";

export const GET = handler(async (req: Request) => {
  await requireUser("admin");
  const sp = new URL(req.url).searchParams;
  const q = auditQuerySchema.parse(Object.fromEntries(sp.entries()));
  const rows = await listAuditLogs(q);
  if (sp.get("format") === "csv") {
    return new Response(toCsv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="audit-logs.csv"' } });
  }
  return ok({ items: rows });
});
