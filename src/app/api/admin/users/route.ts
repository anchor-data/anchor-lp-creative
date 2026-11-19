import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { listUsers } from "@/server/services/admin";

export const GET = handler(async () => {
  await requireUser("admin");
  return ok({ items: await listUsers() });
});
