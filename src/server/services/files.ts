import "server-only";
import { ulid } from "ulid";
import { getBindings } from "../env";
import { ApiError } from "../http";
import { CONTENT_TYPE, htmlToText, isSafePublicUrl, sniff, UPLOAD_RULES, type UploadPurpose } from "@/lib/domain/files";

function bucket() {
  const r2 = getBindings().FILES;
  if (!r2) throw new ApiError("INTERNAL", "ファイル保存先（R2）が設定されていません");
  return r2;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface UploadResult {
  key: string;
  sha256: string;
  contentType: string;
  size: number;
}

/**
 * Stores an upload in R2 after checking type by content and size.
 * Goes through the Worker (request body limit applies); large videos via presigned
 * multipart upload are a follow-up (spec ch.10 「大きなファイル」).
 */
export async function storeUpload(purpose: UploadPurpose, file: File): Promise<UploadResult> {
  const rule = UPLOAD_RULES[purpose];
  if (file.size > rule.maxBytes) {
    throw new ApiError("VALIDATION_ERROR", `ファイルが大きすぎます（${Math.round(rule.maxBytes / 1024 / 1024)}MB以内）`, [{ field: "file", reason: "too_large" }]);
  }
  const buf = await file.arrayBuffer();
  const type = sniff(new Uint8Array(buf.slice(0, 16)));
  if (!type || !rule.types.includes(type)) {
    throw new ApiError("VALIDATION_ERROR", `${rule.label}のファイルを選んでください`, [{ field: "file", reason: "bad_type" }]);
  }
  const key = `${purpose}/${new Date().toISOString().slice(0, 7)}/${ulid()}.${type}`;
  const contentType = CONTENT_TYPE[type];
  await bucket().put(key, buf, { httpMetadata: { contentType } });
  return { key, sha256: await sha256Hex(buf), contentType, size: file.size };
}

export async function readFile(key: string): Promise<{ body: ReadableStream; contentType: string } | null> {
  if (!/^[a-z]+\/\d{4}-\d{2}\/[0-9A-Z]{26}\.[a-z0-9]+$/.test(key)) return null;
  const obj = await bucket().get(key);
  if (!obj) return null;
  return { body: obj.body, contentType: obj.httpMetadata?.contentType ?? "application/octet-stream" };
}

export async function deleteFiles(keys: readonly string[]): Promise<void> {
  if (keys.length > 0) await bucket().delete([...keys]);
}

/**
 * J-11 (partial): fetches the LP and extracts title + body text.
 * Full-page / first-view screenshots need the Browser Rendering binding (follow-up);
 * until then the wizard offers manual screenshot upload.
 */
export async function captureArticle(url: string): Promise<{ title: string | null; bodyText: string }> {
  if (!isSafePublicUrl(url)) throw new ApiError("VALIDATION_ERROR", "このURLは取得できません（社内ネットワーク宛てなど）", [{ field: "url", reason: "unsafe_url" }]);
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (compatible; LPKnowledgeBot/1.0)", accept: "text/html" }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ApiError("UPSTREAM_ERROR", "記事LPを取得できませんでした。本文を貼り付けてください");
  }
  if (!isSafePublicUrl(res.url || url)) throw new ApiError("VALIDATION_ERROR", "リダイレクト先のURLは取得できません");
  if (!res.ok) throw new ApiError("UPSTREAM_ERROR", `記事LPを取得できませんでした（HTTP ${res.status}）。本文を貼り付けてください`);
  const html = (await res.text()).slice(0, 3_000_000);
  const { title, text } = htmlToText(html);
  return { title, bodyText: text.slice(0, 100_000) };
}
