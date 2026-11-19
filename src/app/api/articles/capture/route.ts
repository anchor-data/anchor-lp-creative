import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { captureArticle } from "@/server/services/files";
import { findArticleByUrl } from "@/server/services/registration";
import { httpsUrl } from "@/lib/domain/registration";

export const POST = handler(async (req: Request) => {
  await requireUser("register");
  const { url } = await parseJson(req, z.object({ url: httpsUrl }));
  const existing = await findArticleByUrl(url);
  const captured = await captureArticle(url);
  return ok({ ...captured, existing });
});
