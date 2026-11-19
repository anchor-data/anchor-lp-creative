import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface AppEnv {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN?: string;
  AUTH_MODE: "access" | "dev";
  DEV_USER_EMAIL?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  INITIAL_ADMIN_EMAILS?: string;
  ANTHROPIC_API_KEY?: string;
  CLAUDE_MODEL_MAIN: string;
  CLAUDE_MODEL_LIGHT: string;
  SQUAD_BEYOND_BASE_URL?: string;
  SQUAD_BEYOND_API_KEY?: string;
  NOTIFY_WEBHOOK_URL?: string;
  SERVICE_TOKEN?: string;
}

/** Minimal shapes of the Cloudflare bindings we use (see wrangler.jsonc). */
export interface R2Like {
  put(key: string, value: ArrayBuffer | ReadableStream | string, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string | string[]): Promise<void>;
}
export interface AiLike {
  run(model: string, input: { text: string[] }): Promise<{ data: number[][] }>;
}
export interface Bindings {
  FILES?: R2Like;
  AI?: AiLike;
}

type RawEnv = Record<string, unknown>;

function cloudflareEnv(): RawEnv {
  try {
    return getCloudflareContext().env as unknown as RawEnv;
  } catch {
    return {};
  }
}

function str(raw: RawEnv, key: string): string | undefined {
  const v = raw[key] ?? process.env[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Reads config from Cloudflare vars/secrets, falling back to process.env (next dev, scripts). */
export function getEnv(): AppEnv {
  const raw = cloudflareEnv();
  const url = str(raw, "TURSO_DATABASE_URL");
  if (!url) throw new Error("TURSO_DATABASE_URL is not configured");
  const authMode = str(raw, "AUTH_MODE") === "dev" ? "dev" : "access";
  return {
    TURSO_DATABASE_URL: url,
    TURSO_AUTH_TOKEN: str(raw, "TURSO_AUTH_TOKEN"),
    AUTH_MODE: authMode,
    DEV_USER_EMAIL: str(raw, "DEV_USER_EMAIL"),
    CF_ACCESS_TEAM_DOMAIN: str(raw, "CF_ACCESS_TEAM_DOMAIN"),
    CF_ACCESS_AUD: str(raw, "CF_ACCESS_AUD"),
    INITIAL_ADMIN_EMAILS: str(raw, "INITIAL_ADMIN_EMAILS"),
    ANTHROPIC_API_KEY: str(raw, "ANTHROPIC_API_KEY"),
    CLAUDE_MODEL_MAIN: str(raw, "CLAUDE_MODEL_MAIN") ?? "claude-sonnet-5-5",
    CLAUDE_MODEL_LIGHT: str(raw, "CLAUDE_MODEL_LIGHT") ?? "claude-haiku-5-5",
    SQUAD_BEYOND_BASE_URL: str(raw, "SQUAD_BEYOND_BASE_URL"),
    SQUAD_BEYOND_API_KEY: str(raw, "SQUAD_BEYOND_API_KEY"),
    NOTIFY_WEBHOOK_URL: str(raw, "NOTIFY_WEBHOOK_URL"),
    SERVICE_TOKEN: str(raw, "SERVICE_TOKEN"),
  };
}

export function getBindings(): Bindings {
  const raw = cloudflareEnv();
  return { FILES: raw.FILES as R2Like | undefined, AI: raw.AI as AiLike | undefined };
}
