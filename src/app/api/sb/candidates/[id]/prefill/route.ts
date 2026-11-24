import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { candidatePrefill } from "@/server/services/candidates";
import { getSquadBeyondClient } from "@/server/integrations/squad-beyond";
import { ensureVersionBody } from "@/server/sb-sync";

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser("register");
  const prefill = await candidatePrefill((await params).id);
  if (prefill.bodyText !== null) return ok(prefill);
  // Version HTML is fetched only when someone registers the candidate (one Squad beyond call).
  try {
    return ok({ ...prefill, bodyText: await ensureVersionBody(getSquadBeyondClient(), prefill.versionId) });
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", msg: "version body fetch failed", versionId: prefill.versionId, error: err instanceof Error ? err.message : String(err) }));
    return ok(prefill); // registration still works; the body can be pasted by hand
  }
});
