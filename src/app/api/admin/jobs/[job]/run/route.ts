import { z } from "zod";
import { ulid } from "ulid";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { JOBS, runJob, type JobId } from "@/server/jobs";
import { getRawClient } from "@/server/db/client";

/** Manual re-run from A-06 (target date selectable). */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ job: string }> }) => {
  const user = await requireUser("admin");
  const job = z.enum(Object.keys(JOBS) as [JobId, ...JobId[]]).parse((await params).job);
  const { targetDate } = await parseJson(req, z.object({ targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }));
  await getRawClient().execute({
    sql: "INSERT INTO audit_logs (id, at, user_id, action, target_type, target_id, after_json) VALUES (?, ?, ?, 'update', 'job', ?, ?)",
    args: [ulid(), new Date().toISOString(), user.id, job, JSON.stringify({ manualRun: true, targetDate: targetDate ?? null })],
  });
  return ok(await runJob(job, targetDate));
});
