import { z } from "zod";
import { handler, ok, parseJson } from "@/server/http";
import { requireUser } from "@/server/auth";
import { suggestTags } from "@/server/services/ai";
import { listTags } from "@/server/services/admin";

const schema = z.object({ copy: z.string().max(5000).optional(), script: z.string().max(10000).optional(), body: z.string().max(50000).optional() });

export const POST = handler(async (req: Request) => {
  await requireUser("register");
  const input = await parseJson(req, schema);
  const { types, tags } = await listTags();
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const options = tags.filter((t) => t.isActive).map((t) => ({ id: t.id, type: typeName.get(t.typeId) ?? "", name: t.name }));
  return ok({ items: await suggestTags(input, options) });
});
