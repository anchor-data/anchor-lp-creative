import { handler, ok } from "@/server/http";
import { requireServiceToken } from "@/server/service-auth";
import { runScheduled } from "@/server/jobs";

/** Called by the Worker's scheduled() handler through the self service binding. */
export const POST = handler(async (req: Request) => {
  requireServiceToken(req);
  await runScheduled();
  return ok({ ok: true });
});
