import { z } from "zod";

// Pure request/response mapping for the Squad beyond public API
// (https://public-api.squadbeyond.com/api-docs/v1/swagger.yaml). Kept free of
// server-only imports so it can be unit-tested.
//
// Vocabulary: an "ab_test" is a beyond page, an "article" is a version, and the
// ad "parameter" on Branch Operation rows identifies the creative.

export const SB_DEFAULT_BASE_URL = "https://public-api.squadbeyond.com/v1";

export interface SbPage { id: string; name: string; folder: string | null; status: string; url: string | null; media: string; raw: unknown }
export interface SbVersion { id: string; pageId: string; name: string; url: string | null; raw: unknown }
export interface SbCreative { id: string; pageId: string; name: string; parameter: string | null; raw: unknown }
export interface SbOperationRow {
  date: string;
  versionId: string;
  creativeId: string;
  parameter: string | null;
  media: string;
  spend: number | null; pv: number | null; click: number | null; ctr: number | null; cv: number | null; cvr: number | null; ctvr: number | null;
  cpa: number | null; mcv: number | null; mcvr: number | null; mcpa: number | null;
  fver: number | null; sver: number | null; fsver: number | null; oar: number | null;
  mediaImp: number | null; mediaCtr: number | null; mediaCpm: number | null; mediaCpc: number | null;
  raw: unknown;
}

/** Branch Operation accepts at most this many days per request. */
export const SB_MAX_RANGE_DAYS = 30;

function shiftDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Splits the `days` days ending at `endDate` (inclusive) into [start, end] ranges, newest first. */
export function dateChunks(endDate: string, days: number, max = SB_MAX_RANGE_DAYS): [string, string][] {
  const chunks: [string, string][] = [];
  for (let offset = 0; offset < days; offset += max) {
    const end = shiftDays(endDate, -offset);
    const start = shiftDays(endDate, -Math.min(offset + max, days) + 1);
    chunks.push([start, end]);
  }
  return chunks;
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

const MEDIA_EXACT: Record<string, string> = {
  facebook: "meta", meta: "meta", instagram: "meta", tiktok: "tiktok", line: "line", youtube: "youtube",
  google: "google", yahoo: "yahoo", x: "x", twitter: "x", smartnews: "smartnews",
};
// Longer keys first so containment matching prefers the most specific name. "x" is exact-only.
const MEDIA_CONTAINS = Object.keys(MEDIA_EXACT).filter((k) => k.length > 1).sort((a, b) => b.length - a.length);

export function mapMedia(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (!key) return "other";
  if (MEDIA_EXACT[key]) return MEDIA_EXACT[key];
  const hit = MEDIA_CONTAINS.find((k) => key.includes(k));
  return hit ? MEDIA_EXACT[hit] : "other";
}

// Observed ad_status values: "delivered" (配信中), "prepared" (未配信) and "undelivered" (配信停止).
// Only delivering pages have new Branch Operation data. The spec does not enumerate the values,
// so an unknown one stays active rather than silently dropping data.
const INACTIVE_STATUSES = new Set(["prepared", "undelivered"]);
export function isActiveStatus(adStatus: string | null | undefined): boolean {
  return !adStatus || !INACTIVE_STATUSES.has(adStatus.trim().toLowerCase());
}

const num = z.union([z.number(), z.string(), z.null()]).optional().transform((v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
});

const pageSchema = z.object({
  uid: z.string(),
  title: z.string().nullish(),
  ad_status: z.string().nullish(),
  delivery_url: z.string().nullish(),
  media: z.object({ name: z.string().nullish() }).passthrough().nullish(),
  folder: z.object({ name: z.string().nullish() }).passthrough().nullish(),
}).passthrough();

const pagesResponseSchema = z.object({
  pagination: z.object({ total_pages: z.number().int().optional() }).passthrough().optional(),
  ab_tests: z.array(pageSchema),
});

export function parsePagesResponse(body: unknown): { pages: SbPage[]; totalPages: number } {
  const data = pagesResponseSchema.parse(body);
  const pages = data.ab_tests.map((p) => ({
    id: p.uid,
    name: p.title ?? "",
    folder: p.folder?.name ?? null,
    status: isActiveStatus(p.ad_status) ? "active" : "inactive",
    url: p.delivery_url ?? null,
    media: mapMedia(p.media?.name ?? ""),
    raw: p as unknown,
  }));
  return { pages, totalPages: data.pagination?.total_pages ?? 1 };
}

const rankingsResponseSchema = z.object({
  pagination: z.object({ total_pages: z.number().int().optional() }).passthrough().optional(),
  ab_tests: z.array(pageSchema.extend({ metrics: z.object({ page_view_count: num }).passthrough().nullish() })),
});

export interface SbRankedPage extends SbPage { pageViews: number }

/** /ab_tests/rankings: pages ordered by a metric over a period, with that period's totals. */
export function parseRankingsResponse(body: unknown): { pages: SbRankedPage[]; totalPages: number } {
  const data = rankingsResponseSchema.parse(body);
  const pages = data.ab_tests.map((p) => ({
    id: p.uid,
    name: p.title ?? "",
    folder: p.folder?.name ?? null,
    status: isActiveStatus(p.ad_status) ? "active" : "inactive",
    url: p.delivery_url ?? null,
    media: mapMedia(p.media?.name ?? ""),
    pageViews: p.metrics?.page_view_count ?? 0,
    raw: p as unknown,
  }));
  return { pages, totalPages: data.pagination?.total_pages ?? 1 };
}

/** True when the ranking has another page and the batch just loaded was full of pages that still had views. */
export function hasMoreBatches(batch: number, totalPages: number, returned: number, withViews: number): boolean {
  return returned > 0 && withViews === returned && batch < totalPages;
}

/** Media of a page from its stored sb_pages.raw_json (the Branch Operation rows carry none). */
export function pageMediaFromRaw(rawJson: string | null): string {
  if (!rawJson) return "other";
  try {
    const parsed = pageSchema.pick({ media: true }).safeParse(JSON.parse(rawJson));
    return parsed.success ? mapMedia(parsed.data.media?.name ?? "") : "other";
  } catch {
    return "other";
  }
}

const articlesResponseSchema = z.object({
  articles: z.array(z.object({ uid: z.string(), memo: z.string().nullish(), archived: z.boolean().nullish() }).passthrough()),
});

export function parseArticles(pageId: string, body: unknown): SbVersion[] {
  return articlesResponseSchema.parse(body).articles
    .filter((a) => !a.archived)
    .map((a) => ({ id: a.uid, pageId, name: a.memo?.trim() || a.uid, url: null, raw: a as unknown }));
}

const htmlResponseSchema = z.object({ html: z.string() });
export function parseHtml(body: unknown): string {
  return htmlResponseSchema.parse(body).html;
}

const operationRowSchema = z.object({
  date: z.string().nullish(),
  article_uid: z.string().nullish(),
  parameter: z.string().nullish(),
  ad_spending: num, pv: num, click: num, ctr: num, cv: num, cvr: num, ctvr: num, cpa: num, mcpa: num,
  fver: num, sver: num, fsver: num, oar: num, media_imp: num, media_ctr: num, media_cpm: num, media_cpc: num,
}).passthrough();
const operationResponseSchema = z.object({ rows: z.array(operationRowSchema) });

export function creativeId(pageId: string, parameter: string | null | undefined): string {
  return `${pageId}:${parameter ?? ""}`;
}

export function parseOperationRows(pageId: string, date: string, media: string, body: unknown): SbOperationRow[] {
  return operationResponseSchema.parse(body).rows.flatMap((r) => r.article_uid ? [{
    date: r.date ?? date,
    versionId: r.article_uid,
    creativeId: creativeId(pageId, r.parameter),
    parameter: r.parameter ?? null,
    media,
    spend: r.ad_spending, pv: r.pv, click: r.click, ctr: r.ctr, cv: r.cv, cvr: r.cvr, ctvr: r.ctvr,
    cpa: r.cpa, mcv: null, mcvr: null, mcpa: r.mcpa, // the public API has no micro-CV count/rate
    fver: r.fver, sver: r.sver, fsver: r.fsver, oar: r.oar,
    mediaImp: r.media_imp, mediaCtr: r.media_ctr, mediaCpm: r.media_cpm, mediaCpc: r.media_cpc,
    raw: r as unknown,
  }] : []);
}

const parameterKey = (parameter: string | null): string => (parameter ?? "").split("=")[0] ?? "";

/**
 * Branch Operation breaks traffic down by every URL parameter separately, so one ad's visits appear
 * under snuuid=…, utm_source=…, utm_medium=… and so on. Spend is attributed only to the ad-linked
 * key, so the keys that carry spend identify creatives; the rest double-count the same traffic.
 * Pages with no spend at all (no ad cooperation) keep every row.
 */
export function selectCreativeRows(rows: readonly SbOperationRow[]): SbOperationRow[] {
  const keys = new Set(rows.filter((r) => (r.spend ?? 0) > 0).map((r) => parameterKey(r.parameter)));
  return keys.size === 0 ? [...rows] : rows.filter((r) => keys.has(parameterKey(r.parameter)));
}
