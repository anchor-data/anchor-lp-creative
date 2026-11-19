import { handler, notFound } from "@/server/http";
import { requireUser } from "@/server/auth";
import { readFile } from "@/server/services/files";

/** R2 files are private; served only to authenticated users (spec ch.4 画像・動画). */
export const GET = handler(async (_req: Request, { params }: { params: Promise<{ key: string[] }> }) => {
  await requireUser("view");
  const file = await readFile((await params).key.join("/"));
  if (!file) throw notFound("ファイル");
  return new Response(file.body, {
    headers: { "content-type": file.contentType, "cache-control": "private, max-age=900", "x-content-type-options": "nosniff" },
  });
});
