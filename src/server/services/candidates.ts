import "server-only";
import type { InStatement, InValue } from "@libsql/client";
import { ulid } from "ulid";
import { z } from "zod";
import { getRawClient } from "../db/client";
import { ApiError, notFound } from "../http";
import type { CurrentUser } from "../auth";
import type { JudgeBasis, JudgeResult } from "@/lib/domain/judge";
import { DISMISS_REASONS } from "@/lib/domain/constants";
import { refreshSearchIndex } from "./embeddings";

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// --- S-05 Squad beyond candidates -------------------------------------------------

export interface SbCandidate {
  id: string;
  pageId: string | null;
  pageName: string | null;
  versionName: string | null;
  versionUrl: string | null;
  creativeName: string | null;
  media: string;
  judge: JudgeResult;
  basis: JudgeBasis;
  status: string;
  dismissReason: string | null;
  firstSeenAt: string;
  categoryId: string | null;
  totals: Record<"spend" | "cpa" | "mcvr" | "cv" | "fsver" | "oar", number | null>;
}

export async function listSbCandidates(filter: { status: "open" | "dismissed"; judge: string[]; media?: string; page?: string; includeMiss: boolean }): Promise<SbCandidate[]> {
  const clauses = ["sc.status = ?"];
  const args: InValue[] = [filter.status];
  const judges = filter.judge.length > 0 ? filter.judge : filter.includeMiss ? ["hit", "fair", "miss"] : ["hit", "fair"];
  clauses.push(`sc.judge IN (${judges.map(() => "?").join(",")})`);
  args.push(...judges);
  if (filter.media) {
    clauses.push("sc.media = ?");
    args.push(filter.media);
  }
  if (filter.page) {
    clauses.push("v.page_id = ?");
    args.push(filter.page);
  }
  const res = await getRawClient().execute({
    sql: `SELECT sc.*, v.page_id, v.name vname, v.url vurl, sp.name pname, cr.name cname,
                 t.spend t_spend, t.cv t_cv, t.mcv t_mcv, t.base t_base, t.fsver t_fsver, t.oar t_oar
          FROM sb_candidates sc LEFT JOIN sb_versions v ON v.id = sc.sb_version_id
          LEFT JOIN (
            SELECT sb_version_id, sb_creative_id, media, SUM(spend) spend, SUM(cv) cv, SUM(mcv) mcv, COALESCE(SUM(pv), SUM(click)) base,
                   SUM(fsver * pv) / NULLIF(SUM(CASE WHEN fsver IS NOT NULL THEN pv END), 0) fsver,
                   SUM(oar * pv) / NULLIF(SUM(CASE WHEN oar IS NOT NULL THEN pv END), 0) oar
            FROM sb_metrics_daily GROUP BY sb_version_id, sb_creative_id, media
          ) t ON t.sb_version_id = sc.sb_version_id AND t.sb_creative_id = sc.sb_creative_id AND t.media = sc.media
          LEFT JOIN sb_pages sp ON sp.id = v.page_id LEFT JOIN sb_creatives cr ON cr.id = sc.sb_creative_id
          WHERE ${clauses.join(" AND ")}
          ORDER BY CASE sc.judge WHEN 'hit' THEN 0 WHEN 'fair' THEN 1 ELSE 2 END, sc.first_seen_at DESC LIMIT 200`,
    args,
  });
  return res.rows.map((r) => ({
    id: String(r.id), pageId: str(r.page_id), pageName: str(r.pname), versionName: str(r.vname), versionUrl: str(r.vurl), creativeName: str(r.cname),
    media: String(r.media), judge: r.judge as JudgeResult, basis: JSON.parse(String(r.summary_json)) as JudgeBasis, status: String(r.status),
    dismissReason: str(r.dismiss_reason), firstSeenAt: String(r.first_seen_at), categoryId: str(r.category_id),
    totals: {
      spend: num(r.t_spend), cv: num(r.t_cv), fsver: num(r.t_fsver), oar: num(r.t_oar),
      cpa: num(r.t_cv) ? (num(r.t_spend) ?? 0) / Number(r.t_cv) : null,
      mcvr: num(r.t_base) ? ((num(r.t_mcv) ?? 0) / Number(r.t_base)) * 100 : null,
    },
  }));
}

export async function countOpenCandidates(): Promise<{ sb: number; dpro: number }> {
  const client = getRawClient();
  const [sb, dpro] = await Promise.all([
    client.execute("SELECT COUNT(*) n FROM sb_candidates WHERE status = 'open' AND judge IN ('hit','fair')"),
    client.execute("SELECT COUNT(*) n FROM dpro_candidates WHERE status = 'pending'"),
  ]);
  return { sb: Number(sb.rows[0]?.n ?? 0), dpro: Number(dpro.rows[0]?.n ?? 0) };
}

export const dismissSchema = z.object({ reason: z.enum(DISMISS_REASONS, { message: "理由を選んでください" }), note: z.string().max(500).optional() });

export async function dismissSbCandidate(user: CurrentUser, id: string, input: z.infer<typeof dismissSchema>): Promise<void> {
  const client = getRawClient();
  const row = (await client.execute({ sql: "SELECT status FROM sb_candidates WHERE id = ?", args: [id] })).rows[0];
  if (!row) throw notFound("登録候補");
  if (row.status !== "open") throw new ApiError("UNPROCESSABLE", "この候補は対象外にできません");
  const now = new Date().toISOString();
  const reason = input.note ? `${input.reason}：${input.note}` : input.reason;
  await client.batch(
    [
      { sql: "UPDATE sb_candidates SET status = 'dismissed', dismiss_reason = ?, dismissed_by = ?, updated_at = ? WHERE id = ?", args: [reason, user.id, now, id] },
      { sql: "INSERT INTO audit_logs (id, at, user_id, action, target_type, target_id, before_json, after_json) VALUES (?, ?, ?, 'reject', 'sb_candidate', ?, ?, ?)", args: [ulid(), now, user.id, id, JSON.stringify({ status: "open" }), JSON.stringify({ status: "dismissed", reason })] },
    ],
    "write",
  );
}

export async function restoreSbCandidate(user: CurrentUser, id: string): Promise<void> {
  const client = getRawClient();
  const row = (await client.execute({ sql: "SELECT status FROM sb_candidates WHERE id = ?", args: [id] })).rows[0];
  if (!row) throw notFound("登録候補");
  if (row.status !== "dismissed") throw new ApiError("UNPROCESSABLE", "対象外にした候補だけを戻せます");
  const now = new Date().toISOString();
  await client.batch(
    [
      { sql: "UPDATE sb_candidates SET status = 'open', dismiss_reason = NULL, dismissed_by = NULL, updated_at = ? WHERE id = ?", args: [now, id] },
      { sql: "INSERT INTO audit_logs (id, at, user_id, action, target_type, target_id, before_json, after_json) VALUES (?, ?, ?, 'restore', 'sb_candidate', ?, ?, ?)", args: [ulid(), now, user.id, id, JSON.stringify({ status: "dismissed" }), JSON.stringify({ status: "open" })] },
    ],
    "write",
  );
}

/** Prefill for S-04 when opened from a candidate (F-63). */
export async function candidatePrefill(id: string): Promise<{
  candidateId: string; media: string; startDate: string | null; endDate: string | null;
  pageId: string | null; versionId: string; versionUrl: string | null; versionName: string | null; bodyText: string | null;
  creativeId: string; creativeName: string | null; productId: string | null; categoryId: string | null;
}> {
  const r = (
    await getRawClient().execute({
      sql: `SELECT sc.*, v.page_id, v.url vurl, v.name vname, v.body_text, cr.name cname, sp.product_id,
                   (SELECT MIN(date) FROM sb_metrics_daily m WHERE m.sb_version_id = sc.sb_version_id AND m.sb_creative_id = sc.sb_creative_id AND m.media = sc.media) first_date,
                   (SELECT MAX(date) FROM sb_metrics_daily m WHERE m.sb_version_id = sc.sb_version_id AND m.sb_creative_id = sc.sb_creative_id AND m.media = sc.media) last_date
            FROM sb_candidates sc LEFT JOIN sb_versions v ON v.id = sc.sb_version_id LEFT JOIN sb_creatives cr ON cr.id = sc.sb_creative_id
            LEFT JOIN sb_pages sp ON sp.id = v.page_id WHERE sc.id = ?`,
      args: [id],
    })
  ).rows[0];
  if (!r) throw notFound("登録候補");
  return {
    candidateId: id, media: String(r.media), startDate: str(r.first_date), endDate: str(r.last_date), pageId: str(r.page_id),
    versionId: String(r.sb_version_id), versionUrl: str(r.vurl), versionName: str(r.vname), bodyText: str(r.body_text),
    creativeId: String(r.sb_creative_id), creativeName: str(r.cname), productId: str(r.product_id), categoryId: str(r.category_id),
  };
}

// --- S-06 DPro candidates ---------------------------------------------------------

export interface DproCandidate {
  id: string;
  dproAdId: string;
  advertiser: string | null;
  productName: string | null;
  media: string | null;
  adText: string | null;
  durationSec: number | null;
  estSpend: number | null;
  deliveryDays: number | null;
  views: number | null;
  lpUrl: string | null;
  lpType: "article" | "product" | "unknown" | null;
  tags: string[];
  categoryId: string | null;
  categoryName: string | null;
  thumbnailUrl: string | null;
  detailUrl: string | null;
  fetchedAt: string;
}

export async function listDproCandidates(): Promise<{ items: DproCandidate[]; lastFetchedAt: string | null; conditions: { category: string | null; media: string[]; minEstSpend: number | null; minDays: number | null; lpType: string }[] }> {
  const client = getRawClient();
  const [items, last, conds] = await Promise.all([
    client.execute(`SELECT d.*, c.name cname FROM dpro_candidates d LEFT JOIN categories c ON c.id = d.category_id WHERE d.status = 'pending' ORDER BY d.est_spend DESC LIMIT 200`),
    client.execute("SELECT MAX(fetched_at) t FROM dpro_candidates"),
    client.execute("SELECT dc.*, c.name cname FROM dpro_conditions dc LEFT JOIN categories c ON c.id = dc.category_id WHERE dc.is_active = 1"),
  ]);
  return {
    items: items.rows.map((r) => ({
      id: String(r.id), dproAdId: String(r.dpro_ad_id), advertiser: str(r.advertiser), productName: str(r.product_name), media: str(r.media), adText: str(r.ad_text),
      durationSec: num(r.duration_sec), estSpend: num(r.est_spend), deliveryDays: num(r.delivery_days), views: num(r.views), lpUrl: str(r.lp_url),
      lpType: (r.lp_type as DproCandidate["lpType"]) ?? null, tags: r.ai_tags_json ? (JSON.parse(String(r.ai_tags_json)) as string[]) : [],
      categoryId: str(r.category_id), categoryName: str(r.cname), thumbnailUrl: str(r.thumbnail_url), detailUrl: str(r.dpro_detail_url), fetchedAt: String(r.fetched_at),
    })),
    lastFetchedAt: str(last.rows[0]?.t),
    conditions: conds.rows.map((c) => ({ category: str(c.cname), media: c.media_json ? (JSON.parse(String(c.media_json)) as string[]) : [], minEstSpend: num(c.min_est_spend), minDays: num(c.min_days), lpType: String(c.lp_type) })),
  };
}

export const dproPatchSchema = z.object({ categoryId: z.string().nullable().optional(), tags: z.array(z.string().max(50)).max(20).optional() });

export async function patchDproCandidate(user: CurrentUser, id: string, patch: z.infer<typeof dproPatchSchema>): Promise<void> {
  const client = getRawClient();
  const row = (await client.execute({ sql: "SELECT category_id, ai_tags_json, status FROM dpro_candidates WHERE id = ?", args: [id] })).rows[0];
  if (!row) throw notFound("取り込み候補");
  const now = new Date().toISOString();
  const sets: string[] = [];
  const args: InValue[] = [];
  if (patch.categoryId !== undefined) {
    sets.push("category_id = ?");
    args.push(patch.categoryId);
  }
  if (patch.tags) {
    sets.push("ai_tags_json = ?");
    args.push(JSON.stringify(patch.tags));
  }
  if (sets.length === 0) return;
  await client.batch(
    [
      { sql: `UPDATE dpro_candidates SET ${sets.join(", ")} WHERE id = ?`, args: [...args, id] },
      { sql: "INSERT INTO audit_logs (id, at, user_id, action, target_type, target_id, before_json, after_json) VALUES (?, ?, ?, 'update', 'dpro_candidate', ?, ?, ?)", args: [ulid(), now, user.id, id, JSON.stringify({ categoryId: row.category_id, tags: row.ai_tags_json }), JSON.stringify(patch)] },
    ],
    "write",
  );
}

/** Approving turns DPro candidates into market cases (combinations origin=market). */
export async function approveDproCandidates(user: CurrentUser, ids: readonly string[]): Promise<{ approved: string[] }> {
  if (ids.length === 0) throw new ApiError("VALIDATION_ERROR", "承認する候補を選んでください");
  const client = getRawClient();
  const res = await client.execute({ sql: `SELECT * FROM dpro_candidates WHERE status = 'pending' AND id IN (${ids.map(() => "?").join(",")})`, args: [...ids] });
  const missingCategory = res.rows.filter((r) => !r.category_id);
  if (missingCategory.length > 0) {
    throw new ApiError("VALIDATION_ERROR", "業種カテゴリが未割り当ての候補は承認できません", missingCategory.map((r) => ({ field: "categoryId", reason: "required", id: String(r.id) })));
  }
  const now = new Date().toISOString();
  const tagRows = await client.execute("SELECT id, name FROM tags WHERE is_active = 1");
  const tagByName = new Map(tagRows.rows.map((t) => [String(t.name), String(t.id)]));
  const statements: InStatement[] = [];
  const combinationIds: string[] = [];

  for (const r of res.rows) {
    const productId = ulid(), creativeId = ulid(), articleId = ulid(), combinationId = ulid();
    combinationIds.push(combinationId);
    const date = String(r.first_seen_date ?? now.slice(0, 10));
    statements.push(
      { sql: "INSERT INTO products (id, name, client_name, category_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", args: [productId, String(r.product_name ?? "（市場事例）"), String(r.advertiser ?? "（市場事例）"), String(r.category_id), user.id, now, now] },
      { sql: "INSERT INTO creatives (id, product_id, kind, source_url, duration_sec, main_copy, script_json, created_by, created_at, updated_at) VALUES (?, ?, 'video', ?, ?, ?, ?, ?, ?, ?)", args: [creativeId, productId, String(r.dpro_detail_url ?? r.lp_url ?? "https://example.com"), r.duration_sec, r.ad_text, r.narration ? JSON.stringify([{ from: 0, to: Number(r.duration_sec ?? 0), visual: "", telop: "", narration: String(r.narration) }]) : null, user.id, now, now] },
      { sql: "INSERT INTO articles (id, product_id, url, title, body_text, blocks_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?)", args: [articleId, productId, String(r.lp_url ?? ""), String(r.product_name ?? ""), r.lp_text, user.id, now, now] },
      { sql: `INSERT INTO combinations (id, product_id, creative_id, article_id, media, start_date, origin, metrics_source, dpro_ad_id, created_by, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, 'market', 'dpro', ?, ?, ?, ?)`, args: [combinationId, productId, creativeId, articleId, String(r.media ?? "other"), date, String(r.dpro_ad_id), user.id, now, now] },
      { sql: "INSERT INTO market_metrics (combination_id, snapshot_date, est_spend, delivery_days, views, like_rate) VALUES (?, ?, ?, ?, ?, ?)", args: [combinationId, now.slice(0, 10), r.est_spend, r.delivery_days, r.views, r.like_rate] },
      { sql: "UPDATE dpro_candidates SET status = 'approved', reviewed_by = ?, reviewed_at = ? WHERE id = ?", args: [user.id, now, String(r.id)] },
      { sql: "INSERT INTO audit_logs (id, at, user_id, action, target_type, target_id, after_json) VALUES (?, ?, ?, 'approve', 'dpro_candidate', ?, ?)", args: [ulid(), now, user.id, String(r.id), JSON.stringify({ combinationId })] },
    );
    for (const name of r.ai_tags_json ? (JSON.parse(String(r.ai_tags_json)) as string[]) : []) {
      const tagId = tagByName.get(name);
      if (tagId) statements.push({ sql: "INSERT OR IGNORE INTO creative_tags (creative_id, tag_id, source) VALUES (?, ?, 'ai')", args: [creativeId, tagId] });
    }
  }
  await client.batch(statements, "write");
  await refreshSearchIndex(combinationIds).catch(() => undefined);
  return { approved: res.rows.map((r) => String(r.id)) };
}

export async function rejectDproCandidate(user: CurrentUser, id: string, reason: string | undefined): Promise<void> {
  const client = getRawClient();
  const row = (await client.execute({ sql: "SELECT status FROM dpro_candidates WHERE id = ?", args: [id] })).rows[0];
  if (!row) throw notFound("取り込み候補");
  if (row.status !== "pending") throw new ApiError("UNPROCESSABLE", "この候補は処理済みです");
  const now = new Date().toISOString();
  await client.batch(
    [
      { sql: "UPDATE dpro_candidates SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, reject_reason = ? WHERE id = ?", args: [user.id, now, reason ?? null, id] },
      { sql: "INSERT INTO audit_logs (id, at, user_id, action, target_type, target_id, after_json) VALUES (?, ?, ?, 'reject', 'dpro_candidate', ?, ?)", args: [ulid(), now, user.id, id, JSON.stringify({ reason })] },
    ],
    "write",
  );
}

/** Method B (spec 6-2): candidates posted by a member's AI tool with the service token. */
export const dproIngestSchema = z.object({
  items: z.array(
    z.object({
      dproAdId: z.string().min(1),
      categoryId: z.string().optional(),
      advertiser: z.string().optional(),
      productName: z.string().optional(),
      media: z.string().optional(),
      adText: z.string().max(5000).optional(),
      narration: z.string().max(5000).optional(),
      durationSec: z.number().optional(),
      estSpend: z.number().int().optional(),
      deliveryDays: z.number().int().optional(),
      views: z.number().int().optional(),
      lpUrl: z.string().url().optional(),
      lpText: z.string().max(100_000).optional(),
      detailUrl: z.string().url().optional(),
      tags: z.array(z.string()).optional(),
    }),
  ).max(200),
});

export async function ingestDproCandidates(input: z.infer<typeof dproIngestSchema>): Promise<{ inserted: number; updated: number }> {
  const client = getRawClient();
  const now = new Date().toISOString();
  let inserted = 0, updated = 0;
  const statements: InStatement[] = [];
  for (const it of input.items) {
    const existing = (await client.execute({ sql: "SELECT id, status FROM dpro_candidates WHERE dpro_ad_id = ?", args: [it.dproAdId] })).rows[0];
    if (existing) {
      updated++;
      statements.push({ sql: "UPDATE dpro_candidates SET est_spend = COALESCE(?, est_spend), delivery_days = COALESCE(?, delivery_days), views = COALESCE(?, views), last_seen_date = ?, fetched_at = ? WHERE id = ?", args: [it.estSpend ?? null, it.deliveryDays ?? null, it.views ?? null, now.slice(0, 10), now, String(existing.id)] });
      // Already accumulated: append the estimate snapshot (F-45)
      statements.push({ sql: `INSERT OR REPLACE INTO market_metrics (combination_id, snapshot_date, est_spend, delivery_days, views) SELECT id, ?, ?, ?, ? FROM combinations WHERE dpro_ad_id = ? AND deleted_at IS NULL`, args: [now.slice(0, 10), it.estSpend ?? null, it.deliveryDays ?? null, it.views ?? null, it.dproAdId] });
    } else {
      inserted++;
      statements.push({
        sql: `INSERT INTO dpro_candidates (id, dpro_ad_id, category_id, advertiser, product_name, media, ad_text, narration, duration_sec, est_spend, delivery_days, views, lp_url, lp_text, dpro_detail_url, ai_tags_json, first_seen_date, last_seen_date, raw_json, fetched_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [ulid(), it.dproAdId, it.categoryId ?? null, it.advertiser ?? null, it.productName ?? null, it.media ?? null, it.adText ?? null, it.narration ?? null, it.durationSec ?? null, it.estSpend ?? null, it.deliveryDays ?? null, it.views ?? null, it.lpUrl ?? null, it.lpText ?? null, it.detailUrl ?? null, JSON.stringify(it.tags ?? []), now.slice(0, 10), now.slice(0, 10), JSON.stringify(it), now],
      });
    }
  }
  if (statements.length > 0) await client.batch(statements, "write");
  return { inserted, updated };
}
