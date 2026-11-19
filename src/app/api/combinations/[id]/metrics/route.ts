import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { getDailyMetrics } from "@/server/services/combination-detail";

export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser("view");
  const media = new URL(req.url).searchParams.get("media") ?? undefined;
  return ok({ items: await getDailyMetrics((await params).id, media) });
});
