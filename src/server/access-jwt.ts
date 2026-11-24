import { jwtVerify, type JWTVerifyGetKey } from "jose";

/** Key resolver for Access tokens: a remote JWKS in production, a local one in tests. */
export type AccessKeySet = JWTVerifyGetKey;

export interface AccessVerifyOptions {
  /** e.g. "your-team.cloudflareaccess.com" (no scheme). */
  teamDomain: string;
  /** The Access application's AUD tag. */
  audience: string;
  keySet: AccessKeySet;
}

export interface AccessIdentity {
  email: string;
  sub: string;
}

/** Cloudflare Access signs application tokens with RS256 only. */
const ACCESS_ALGORITHMS = ["RS256"];

/**
 * Verifies a Cf-Access-Jwt-Assertion token: signature (RS256 only), issuer,
 * audience and expiry, and requires the email and sub claims (spec ch.3 step 2).
 * Throws on any failure; callers map that to an UNAUTHENTICATED response.
 */
export async function verifyAccessToken(token: string, opts: AccessVerifyOptions): Promise<AccessIdentity> {
  const { payload } = await jwtVerify(token, opts.keySet, {
    issuer: `https://${opts.teamDomain}`,
    audience: opts.audience,
    algorithms: ACCESS_ALGORITHMS,
  });
  if (typeof payload.email !== "string" || payload.email.length === 0) throw new Error("email claim missing");
  if (typeof payload.sub !== "string" || payload.sub.length === 0) throw new Error("sub claim missing");
  return { email: payload.email.trim().toLowerCase(), sub: payload.sub };
}
