import "server-only";
import { isSafePublicUrl } from "@/lib/domain/files";
import { ApiError } from "./http";

// Outbound fetch for user-supplied URLs (LP capture, video proxy). Redirects are followed by hand so
// every hop is checked before it is requested, not after (the Worker also runs with
// global_fetch_strictly_public, which blocks private addresses at the network layer).

const MAX_REDIRECTS = 5;

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Extra per-hop check (e.g. a host allowlist). */
  allow?: (url: URL) => boolean;
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions): Promise<Response> {
  const signal = opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(opts.timeoutMs)]) : AbortSignal.timeout(opts.timeoutMs);
  let url = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isSafePublicUrl(url) || (opts.allow && !opts.allow(new URL(url)))) {
      throw new ApiError("VALIDATION_ERROR", hop === 0 ? "このURLは取得できません" : "リダイレクト先のURLは取得できません");
    }
    let res: Response;
    try {
      res = await fetch(url, { redirect: "manual", headers: opts.headers, signal });
    } catch {
      throw new ApiError("UPSTREAM_ERROR", "URLの取得に失敗しました（タイムアウトまたは接続エラー）");
    }
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      url = new URL(location, url).toString();
      continue;
    }
    return res;
  }
  throw new ApiError("UPSTREAM_ERROR", "リダイレクトが多すぎます");
}
