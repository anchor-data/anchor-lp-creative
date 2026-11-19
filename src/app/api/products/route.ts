import { handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { findSameProduct, searchProducts } from "@/server/services/registration";

export const GET = handler(async (req: Request) => {
  await requireUser("view");
  const sp = new URL(req.url).searchParams;
  const name = sp.get("name");
  const clientName = sp.get("clientName");
  if (name && clientName) return ok({ existingId: await findSameProduct(name, clientName) });
  return ok({ items: await searchProducts((sp.get("q") ?? "").slice(0, 100)) });
});
