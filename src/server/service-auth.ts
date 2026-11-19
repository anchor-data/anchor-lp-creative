import "server-only";
import { getEnv } from "./env";
import { ApiError } from "./http";

/** Service-token check for machine callers (cron self-call, DPro method B). Constant-time compare. */
export function requireServiceToken(req: Request): void {
  const expected = getEnv().SERVICE_TOKEN;
  const got = req.headers.get("x-service-token") ?? "";
  if (!expected || got.length !== expected.length) throw new ApiError("UNAUTHENTICATED", "認証に失敗しました");
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  if (diff !== 0) throw new ApiError("UNAUTHENTICATED", "認証に失敗しました");
}
