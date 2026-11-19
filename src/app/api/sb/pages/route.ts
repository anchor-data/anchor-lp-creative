import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { sbPages } from "@/server/services/registration";

export const GET = handler(async () => {
  await requireUser("register");
  return ok({ items: await sbPages() });
});
