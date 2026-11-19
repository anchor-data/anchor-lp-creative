import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { sbCreatives } from "@/server/services/registration";

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser("register");
  return ok({ items: await sbCreatives((await params).id) });
});
