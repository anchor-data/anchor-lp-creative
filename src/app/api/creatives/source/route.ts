import { ApiError, handler } from "@/server/http";
import { requireUser } from "@/server/auth";
import { safeFetch } from "@/server/safe-fetch";
import { driveDownloadUrl, driveFileId } from "@/lib/domain/drive";

const PASS_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"];
/** Same ceiling as the spec's largest video upload. */
const MAX_BYTES = 500 * 1024 * 1024;
const CONNECT_TIMEOUT_MS = 20_000;
const SINGLE_RANGE = /^bytes=\d*-\d*$/;
const GOOGLE_HOSTS = /(^|\.)(google\.com|googleusercontent\.com)$/i;

/** Stops the stream once more than `limit` bytes have passed (covers responses without content-length). */
function capped(body: ReadableStream<Uint8Array>, limit: number): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > limit) controller.error(new Error("too large"));
      else controller.enqueue(chunk);
    },
  }));
}

/**
 * Same-origin stream of a creative registered by URL (Google Drive or a direct video link), so the
 * browser can sample frames and audio for 動画解析. Single byte ranges pass through, so seeking does
 * not download the whole file. Only public files work (Drive: 「リンクを知っている全員」).
 */
export const GET = handler(async (req: Request) => {
  await requireUser("register");
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  const driveId = driveFileId(raw);
  const range = req.headers.get("range");
  const upstream = await safeFetch(driveId ? driveDownloadUrl(driveId) : raw, {
    headers: range && SINGLE_RANGE.test(range) ? { range } : {},
    timeoutMs: CONNECT_TIMEOUT_MS,
    signal: req.signal,
    // Drive downloads stay on Google hosts through their redirects.
    allow: driveId ? (u) => GOOGLE_HOSTS.test(u.hostname) : undefined,
  });
  const type = upstream.headers.get("content-type") ?? "";
  // Drive serves some videos as octet-stream; direct links must say video/*.
  const typeOk = /^video\//i.test(type) || (Boolean(driveId) && /^application\/octet-stream/i.test(type));
  const length = Number(upstream.headers.get("content-length") ?? 0);
  if (!upstream.ok || !typeOk || !upstream.body || length > MAX_BYTES) {
    await upstream.body?.cancel();
    throw new ApiError(
      "UPSTREAM_ERROR",
      length > MAX_BYTES ? "動画が大きすぎます（500MBまで）"
        : driveId ? "Googleドライブの動画を取得できませんでした。共有設定を「リンクを知っている全員」にするか、ファイルをアップロードしてください"
          : "このURLから動画を取得できませんでした",
    );
  }
  const headers = new Headers({ "cache-control": "private, no-store", "x-content-type-options": "nosniff" });
  for (const h of PASS_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(capped(upstream.body, MAX_BYTES), { status: upstream.status, headers });
});
