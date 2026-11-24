import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { pickerVersions } from "@/server/services/sb-picker";

/** Versions of a beyond page, loaded from Squad beyond when not synced yet (?refresh=1 reloads). */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser("register");
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  return ok({ items: await pickerVersions((await params).id, { refresh }) });
});
