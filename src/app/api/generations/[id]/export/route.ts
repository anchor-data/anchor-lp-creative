import { ulid } from "ulid";
import { handler } from "@/server/http";
import { requireUser } from "@/server/auth";
import { getGeneration, toMarkdown } from "@/server/services/generation";
import { getRawClient } from "@/server/db/client";

/** 制作指示書 (F-37). format=md downloads Markdown; PDF is printed from /generate/[id]/print. */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("generate");
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const g = await getGeneration(user, id);
  const versionNo = sp.get("version") ? Number(sp.get("version")) : undefined;
  const md = toMarkdown(g, versionNo);
  await getRawClient().execute({
    sql: "INSERT INTO audit_logs (id, at, user_id, action, target_type, target_id, after_json) VALUES (?, ?, ?, 'export', 'generation', ?, ?)",
    args: [ulid(), new Date().toISOString(), user.id, id, JSON.stringify({ format: "md", versionNo: versionNo ?? null })],
  });
  const filename = encodeURIComponent(`制作指示書_${g.input.product.name}.md`);
  return new Response(md, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${filename}` } });
});
