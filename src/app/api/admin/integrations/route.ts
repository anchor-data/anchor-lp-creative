import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { integrationStatus } from "@/server/services/admin";

export const GET = handler(async () => {
  await requireUser("admin");
  return ok(await integrationStatus());
});
