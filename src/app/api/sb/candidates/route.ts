import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { listSbCandidates } from "@/server/services/candidates";

export const GET = handler(async (req: Request) => {
  await requireUser("review_candidates");
  const sp = new URL(req.url).searchParams;
  return ok({
    items: await listSbCandidates({
      status: sp.get("status") === "dismissed" ? "dismissed" : "open",
      judge: sp.getAll("judge").filter((j) => ["hit", "fair", "miss"].includes(j)),
      media: sp.get("media") ?? undefined,
      page: sp.get("page") ?? undefined,
      includeMiss: sp.get("includeMiss") === "1",
    }),
  });
});
