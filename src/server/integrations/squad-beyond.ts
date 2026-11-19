import "server-only";
import { getRawClient } from "../db/client";
import { getEnv } from "../env";

// Squad beyond external API client (spec 6-1). Endpoint names, auth header format and
// response fields are still pending (U-08), so the HTTP mapping below is a placeholder
// to fill in once the API document arrives. The interface is what the jobs depend on.

export interface SbPage { id: string; name: string; folder: string | null; status: string; url: string | null; raw: unknown }
export interface SbVersion { id: string; pageId: string; name: string; url: string | null; raw: unknown }
export interface SbCreative { id: string; pageId: string; name: string; parameter: string | null; raw: unknown }
export interface SbOperationRow {
  date: string;
  versionId: string;
  creativeId: string;
  media: string;
  spend: number | null; pv: number | null; click: number | null; ctr: number | null; cv: number | null; cvr: number | null; ctvr: number | null;
  cpa: number | null; mcv: number | null; mcvr: number | null; mcpa: number | null;
  fver: number | null; sver: number | null; fsver: number | null; oar: number | null;
  mediaImp: number | null; mediaCtr: number | null; mediaCpm: number | null; mediaCpc: number | null;
  raw: unknown;
}

export class SbAuthError extends Error {}
export class SbRateLimitError extends Error {}
export class SbNotConfiguredError extends Error {}

export interface SquadBeyondClient {
  listPages(opts: { activeOnly: boolean }): Promise<SbPage[]>;
  getPageMaster(pageId: string): Promise<{ versions: SbVersion[]; creatives: SbCreative[] }>;
  getVersionContent(versionId: string): Promise<{ text: string }>;
  getBranchOperation(pageId: string, date: string): Promise<SbOperationRow[]>;
}

// Our own ceilings, below Squad beyond's 120/min and 20,000/day (spec 6-1).
const LIMIT_PER_MIN = 100;
const LIMIT_PER_DAY = 15_000;

const MEDIA_MAP: Record<string, string> = {
  facebook: "meta", meta: "meta", instagram: "meta", tiktok: "tiktok", line: "line", youtube: "youtube",
  google: "google", yahoo: "yahoo", x: "x", twitter: "x", smartnews: "smartnews",
};
export function mapMedia(raw: string): string {
  return MEDIA_MAP[raw.trim().toLowerCase()] ?? "other";
}

async function reserveCall(): Promise<void> {
  const client = getRawClient();
  const t = new Date().toISOString();
  const date = t.slice(0, 10);
  const minute = t.slice(11, 16);
  const usage = await client.execute({
    sql: "SELECT SUM(count) day, SUM(CASE WHEN minute = ? THEN count END) min FROM api_usage WHERE provider = 'squadbeyond' AND date = ?",
    args: [minute, date],
  });
  if (Number(usage.rows[0]?.min ?? 0) >= LIMIT_PER_MIN) throw new SbRateLimitError("per-minute budget exhausted");
  if (Number(usage.rows[0]?.day ?? 0) >= LIMIT_PER_DAY) throw new SbRateLimitError("daily budget exhausted");
  await client.execute({
    sql: "INSERT INTO api_usage (provider, date, minute, count) VALUES ('squadbeyond', ?, ?, 1) ON CONFLICT (provider, date, minute) DO UPDATE SET count = count + 1",
    args: [date, minute],
  });
}

class HttpSquadBeyondClient implements SquadBeyondClient {
  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    await reserveCall();
    const url = new URL(path, this.baseUrl);
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

  // TODO(U-08): replace paths and field mapping with the real API definitions.
  async listPages(opts: { activeOnly: boolean }): Promise<SbPage[]> {
    const data = await this.get<{ pages: Record<string, unknown>[] }>("/pages", opts.activeOnly ? { status: "active" } : {});
    return data.pages.map((p) => ({ id: String(p.id), name: String(p.name ?? ""), folder: (p.folder as string) ?? null, status: String(p.status ?? ""), url: (p.url as string) ?? null, raw: p }));
  }

  async getPageMaster(pageId: string): Promise<{ versions: SbVersion[]; creatives: SbCreative[] }> {
    const data = await this.get<{ versions: Record<string, unknown>[]; creatives: Record<string, unknown>[] }>(`/pages/${encodeURIComponent(pageId)}`);
    return {
      versions: data.versions.map((v) => ({ id: String(v.id), pageId, name: String(v.name ?? ""), url: (v.url as string) ?? null, raw: v })),
      creatives: data.creatives.map((c) => ({ id: String(c.id), pageId, name: String(c.name ?? ""), parameter: (c.parameter as string) ?? null, raw: c })),
    };
  }

  async getVersionContent(versionId: string): Promise<{ text: string }> {
    const data = await this.get<{ text?: string }>(`/versions/${encodeURIComponent(versionId)}/content`);
    return { text: data.text ?? "" };
  }

  async getBranchOperation(pageId: string, date: string): Promise<SbOperationRow[]> {
    const data = await this.get<{ rows: Record<string, unknown>[] }>(`/pages/${encodeURIComponent(pageId)}/branch_operation`, { date });
    const n = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));
    return data.rows.map((r) => ({
      date, versionId: String(r.version_id), creativeId: String(r.creative_id), media: mapMedia(String(r.media ?? "")),
      spend: n(r.spend), pv: n(r.pv), click: n(r.click), ctr: n(r.ctr), cv: n(r.cv), cvr: n(r.cvr), ctvr: n(r.ctvr),
      cpa: n(r.cpa), mcv: n(r.mcv), mcvr: n(r.mcvr), mcpa: n(r.mcpa), fver: n(r.fver), sver: n(r.sver), fsver: n(r.fsver), oar: n(r.oar),
      mediaImp: n(r.media_imp), mediaCtr: n(r.media_ctr), mediaCpm: n(r.media_cpm), mediaCpc: n(r.media_cpc), raw: r,
    }));
  }
}

export function getSquadBeyondClient(): SquadBeyondClient {
  const env = getEnv();
  if (!env.SQUAD_BEYOND_BASE_URL || !env.SQUAD_BEYOND_API_KEY) throw new SbNotConfiguredError("SQUAD_BEYOND_BASE_URL / SQUAD_BEYOND_API_KEY are not set");
  return new HttpSquadBeyondClient(env.SQUAD_BEYOND_BASE_URL, env.SQUAD_BEYOND_API_KEY);
}
