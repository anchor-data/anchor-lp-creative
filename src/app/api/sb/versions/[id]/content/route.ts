import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { pickerVersionContent } from "@/server/services/sb-picker";

/** Body text, preview images and URL of a Version (fetched from Squad beyond once, then cached). */
export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser("register");
  return ok(await pickerVersionContent((await params).id));
});
