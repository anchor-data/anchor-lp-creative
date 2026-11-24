import "server-only";
import { getRawClient } from "../db/client";
import { getEnv } from "../env";
import { htmlToText } from "@/lib/domain/files";
import {
  SB_DEFAULT_BASE_URL, joinUrl, parseArticles, parseHtml, parseOperationRows, parsePagesResponse,
  type SbCreative, type SbOperationRow, type SbPage, type SbVersion,
} from "./squad-beyond-mapping";

// Squad beyond public API client (spec 6-1). Endpoints and fields follow
// https://public-api.squadbeyond.com/api-docs/v1/swagger.yaml; mapping lives in squad-beyond-mapping.ts.

export type { SbCreative, SbOperationRow, SbPage, SbVersion } from "./squad-beyond-mapping";
export { mapMedia } from "./squad-beyond-mapping";

export class SbAuthError extends Error {}
export class SbRateLimitError extends Error {}
export class SbNotConfiguredError extends Error {}

export interface SquadBeyondClient {
  listPages(opts: { activeOnly: boolean }): Promise<SbPage[]>;
  getPageMaster(pageId: string): Promise<{ versions: SbVersion[]; creatives: SbCreative[] }>;
  getVersionContent(versionId: string): Promise<{ text: string }>;
  getBranchOperation(pageId: string, date: string, media: string): Promise<SbOperationRow[]>;
}

// Our own ceilings, below Squad beyond's 120/min and 20,000/day (spec 6-1).
const LIMIT_PER_MIN = 100;
const LIMIT_PER_DAY = 15_000;

const PAGE_SIZE = 100;

/** Reserves one call. Waits for the next minute when the per-minute budget is used up; fails on the daily one. */
async function reserveCall(): Promise<void> {
  const client = getRawClient();
  for (;;) {
    const t = new Date().toISOString();
    const date = t.slice(0, 10);
    const minute = t.slice(11, 16);
    const usage = await client.execute({
      sql: "SELECT SUM(count) day, SUM(CASE WHEN minute = ? THEN count END) min FROM api_usage WHERE provider = 'squadbeyond' AND date = ?",
      args: [minute, date],
    });
    if (Number(usage.rows[0]?.day ?? 0) >= LIMIT_PER_DAY) throw new SbRateLimitError("daily budget exhausted");
    if (Number(usage.rows[0]?.min ?? 0) < LIMIT_PER_MIN) {
      await recordCall(date, minute);
      return;
    }
    await new Promise((r) => setTimeout(r, 60_000 - (Date.now() % 60_000) + 250));
  }
}

async function recordCall(date: string, minute: string): Promise<void> {
  const client = getRawClient();
  await client.execute({
    sql: "INSERT INTO api_usage (provider, date, minute, count) VALUES ('squadbeyond', ?, ?, 1) ON CONFLICT (provider, date, minute) DO UPDATE SET count = count + 1",
    args: [date, minute],
  });
}

class HttpSquadBeyondClient implements SquadBeyondClient {
  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    await reserveCall();
    const url = new URL(joinUrl(this.baseUrl, path));
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" } }).catch((e: unknown) => e);
      if (res instanceof Response) {
        if (res.status === 401 || res.status === 403) throw new SbAuthError(`auth failed (${res.status})`);
        if (res.status === 429) throw new SbRateLimitError("429 from Squad beyond");
        if (res.ok) return (await res.json()) as T;
        if (res.status < 500) throw new Error(`Squad beyond ${res.status}`);
        lastError = new Error(`Squad beyond ${res.status}`);
      } else {
        lastError = res;
      }
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
    throw lastError instanceof Error ? lastError : new Error("Squad beyond request failed");
  }

  async listPages(opts: { activeOnly: boolean }): Promise<SbPage[]> {
    let all: SbPage[] = [];
    for (let page = 1, totalPages = 1; page <= totalPages; page++) {
      const r = parsePagesResponse(await this.get<unknown>("ab_tests", { page: String(page), per_page: String(PAGE_SIZE) }));
      all = [...all, ...r.pages];
      totalPages = r.totalPages;
    }
    return opts.activeOnly ? all.filter((p) => p.status === "active") : all;
  }

  async getPageMaster(pageId: string): Promise<{ versions: SbVersion[]; creatives: SbCreative[] }> {
    const uid = encodeURIComponent(pageId);
    // Creatives (ad parameters) come with the daily rows, so J-03 upserts them; no extra call here.
    return { versions: parseArticles(pageId, await this.get<unknown>(`ab_tests/${uid}/articles`)), creatives: [] };
  }

  async getVersionContent(versionId: string): Promise<{ text: string }> {
    const html = parseHtml(await this.get<unknown>(`articles/${encodeURIComponent(versionId)}/html`));
    return { text: htmlToText(html).text };
  }

  async getBranchOperation(pageId: string, date: string, media: string): Promise<SbOperationRow[]> {
    const body = await this.get<unknown>(`branch_operations/ab_tests/${encodeURIComponent(pageId)}/parameter_summary`, {
      start_date: date, end_date: date, granularity: "daily",
    });
    return parseOperationRows(pageId, date, media, body);
  }
}

export function getSquadBeyondClient(): SquadBeyondClient {
  const env = getEnv();
  if (!env.SQUAD_BEYOND_API_KEY) throw new SbNotConfiguredError("SQUAD_BEYOND_API_KEY is not set");
  return new HttpSquadBeyondClient(env.SQUAD_BEYOND_BASE_URL || SB_DEFAULT_BASE_URL, env.SQUAD_BEYOND_API_KEY);
}
