import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { register } from "@/server/services/registration";
import { registrationSchema } from "@/lib/domain/registration";

export const POST = handler(async (req: Request) => {
  const user = await requireUser("register");
  return ok(await register(user, await parseJson(req, registrationSchema)), { status: 201 });
});
