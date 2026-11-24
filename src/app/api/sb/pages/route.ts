import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { searchSbPages } from "@/server/services/sb-picker";

/** Page search for the registration picker: ?q= matches name, id or folder (50 at most). */
export const GET = handler(async (req: Request) => {
  await requireUser("register");
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 200);
  return ok({ items: await searchSbPages(q) });
});
