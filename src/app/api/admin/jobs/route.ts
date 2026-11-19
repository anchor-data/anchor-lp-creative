import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { listJobRuns } from "@/server/services/admin";

export const GET = handler(async () => {
  await requireUser("admin");
  return ok({ items: (await listJobRuns(200)).filter((r) => !r.job.includes(":")) });
});
