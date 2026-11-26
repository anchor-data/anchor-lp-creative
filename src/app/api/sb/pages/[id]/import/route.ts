import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { importSbPage } from "@/server/services/sb-search";

/** Imports one beyond page's last 30 days into 取り込み候補 (2 Squad beyond calls). */
export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser("review_candidates");
  return ok(await importSbPage((await params).id));
});
