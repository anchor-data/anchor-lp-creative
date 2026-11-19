import { z } from "zod";
import { ApiError, handler, ok } from "@/server/http";
import { requireUser } from "@/server/auth";
import { storeUpload } from "@/server/services/files";
import { getRawClient } from "@/server/db/client";

const purposeSchema = z.enum(["video", "banner", "screenshot", "reference"]);

/** Multipart upload through the Worker into R2 (type checked by content). */
export const POST = handler(async (req: Request) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw new ApiError("VALIDATION_ERROR", "ファイルを選んでください");
  const purpose = purposeSchema.parse(form.get("purpose"));
  await requireUser(purpose === "reference" ? "generate" : "register");
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError("VALIDATION_ERROR", "ファイルを選んでください");
  const result = await storeUpload(purpose, file);
  // F-12: tell the wizard if the same file is already registered
  const dup = (await getRawClient().execute({ sql: "SELECT id FROM creatives WHERE file_sha256 = ? AND deleted_at IS NULL", args: [result.sha256] })).rows[0];
  return ok({ ...result, duplicateCreativeId: dup ? String(dup.id) : null }, { status: 201 });
});
