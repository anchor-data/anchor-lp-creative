import "server-only";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { getEnv } from "../env";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

let cached: { url: string; client: Client; db: Db } | null = null;

/** Turso over HTTP (libSQL web client on Workers, file/remote client under Node). */
export function getDb(): Db {
  return getConnection().db;
}

/** Raw libSQL client for vector search and statements Drizzle can't express. */
export function getRawClient(): Client {
  return getConnection().client;
}

function getConnection(): { client: Client; db: Db } {
  const env = getEnv();
  if (cached && cached.url === env.TURSO_DATABASE_URL) return cached;
  const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
  cached = { url: env.TURSO_DATABASE_URL, client, db: drizzle(client, { schema }) };
  return cached;
}
