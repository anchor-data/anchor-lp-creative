import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { analyzeArticle } from "@/server/services/media-analysis";

/** Re-captures the LP (text + preview) if missing and decomposes it into blocks (detail page「AIで分析」). */
export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("register");
  return ok(await analyzeArticle(user, (await params).id));
});
