import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { countOpenCandidates } from "@/server/services/candidates";

export const GET = handler(async () => {
  const user = await requireUser("view");
  const pending = user.role === "viewer" ? { sb: 0, dpro: 0 } : await countOpenCandidates();
  return ok({ user, pending });
});
