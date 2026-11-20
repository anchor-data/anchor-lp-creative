import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createRemoteJWKSet } from "jose";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb } from "./db/client";
import { users } from "./db/schema";
import { getEnv } from "./env";
import { verifyAccessToken } from "./access-jwt";
import { ApiError, forbidden } from "./http";
import { can, type Action } from "@/lib/domain/permissions";
import type { Role } from "@/lib/domain/constants";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwks(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  const existing = jwksCache.get(teamDomain);
  if (existing) return existing;
  const set = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  jwksCache.set(teamDomain, set);
  return set;
}

/** Verifies Cf-Access-Jwt-Assertion (see verifyAccessToken) and returns the email. */
async function emailFromAccess(token: string | null): Promise<string> {
  const env = getEnv();
  if (!token) throw new ApiError("UNAUTHENTICATED", "ログインが必要です");
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) {
    throw new Error("CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD are not configured");
  }
  try {
    const { email } = await verifyAccessToken(token, {
      teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
      audience: env.CF_ACCESS_AUD,
      keySet: jwks(env.CF_ACCESS_TEAM_DOMAIN),
    });
    return email;
  } catch (error: unknown) {
    console.error(JSON.stringify({ level: "warn", msg: "Cf-Access JWT rejected", error: error instanceof Error ? error.message : String(error) }));
    throw new ApiError("UNAUTHENTICATED", "ログイン情報を確認できませんでした。再度ログインしてください");
  }
}

async function resolveEmail(): Promise<string> {
  const env = getEnv();
  if (env.AUTH_MODE === "dev") {
    if (!env.DEV_USER_EMAIL) throw new Error("DEV_USER_EMAIL is required when AUTH_MODE=dev");
    return env.DEV_USER_EMAIL.toLowerCase();
  }
  const h = await headers();
  return emailFromAccess(h.get("cf-access-jwt-assertion"));
}

function initialRole(email: string): Role {
  const admins = (getEnv().INITIAL_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email) ? "admin" : "viewer";
}

/**
 * Current user for this request. Unknown users are auto-created as viewers
 * (spec ch.3 step 3); deactivated users get 403 even past Access (step 5).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const email = await resolveEmail();
  const db = getDb();
  const now = new Date().toISOString();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    if (existing.isActive !== 1) throw new ApiError("FORBIDDEN", "このアカウントは無効化されています");
    // Throttle last_seen_at writes to once per hour.
    if (!existing.lastSeenAt || Date.parse(now) - Date.parse(existing.lastSeenAt) > 3_600_000) {
      await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, existing.id));
    }
    return { id: existing.id, email: existing.email, name: existing.name, role: existing.role };
  }

  const created = {
    id: ulid(),
    email,
    name: email.split("@")[0],
    role: initialRole(email),
    isActive: 1,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(users).values(created).onConflictDoNothing();
  return { id: created.id, email, name: created.name, role: created.role };
});

export async function requireUser(action: Action = "view"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!can(user.role, action)) throw forbidden();
  return user;
}
