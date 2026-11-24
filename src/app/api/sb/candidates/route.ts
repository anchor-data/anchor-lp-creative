import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { listSbCandidates } from "@/server/services/candidates";

export const GET = handler(async (req: Request) => {
  await requireUser("review_candidates");
  const sp = new URL(req.url).searchParams;
  return ok(
    await listSbCandidates({
      status: sp.get("status") === "dismissed" ? "dismissed" : "open",
      judge: sp.getAll("judge").filter((j) => ["hit", "fair", "pending", "miss"].includes(j)),
      media: sp.get("media") ?? undefined,
      page: sp.get("page") ?? undefined,
      limit: Number(sp.get("limit")) || undefined,
    }),
  );
});
