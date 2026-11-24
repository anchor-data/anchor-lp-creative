import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb, getRawClient } from "../db/client";
import { combinations, memos, ngExpressions } from "../db/schema";
import { auditInsert } from "../audit";
import { ApiError, conflict, forbidden, notFound } from "../http";
import { checkExpressions, type ExpressionHit, type NgExpression } from "@/lib/domain/expressions";
import { canDelete } from "@/lib/domain/permissions";
import { finalJudge, type JudgeBasis, type JudgeResult } from "@/lib/domain/judge";
import type { CurrentUser } from "../auth";
import { parseLpPreview, type LpPreview } from "@/lib/domain/lp-preview";
import { parseVideoAnalysis, type VideoAnalysis } from "@/lib/domain/video-analysis";
import { loadCriteria, type CategoryCriteria } from "./judging";

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export interface ScriptScene {
  from: number;
  to: number;
  visual?: string;
  telop?: string;
  narration?: string;
}
export interface ArticleBlock {
  type: string;
  heading: string;
  summary?: string;
}

export interface Totals {
  spend: number | null;
  cpa: number | null;
  mcvr: number | null;
  cv: number | null;
  fsver: number | null;
  oar: number | null;
  pv: number | null;
  click: number | null;
  ctr: number | null;
  cvr: number | null;
  ctvr: number | null;
  mcpa: number | null;
  fver: number | null;
  sver: number | null;
  mediaImp: number | null;
  mediaCtr: number | null;
  mediaCpm: number | null;
  mediaCpc: number | null;
}

export interface CombinationDetail {
  id: string;
  updatedAt: string;
  origin: "own" | "market";
  media: string;
  startDate: string;
  endDate: string | null;
  metricsSource: string;
  targetCpa: number | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  category: { id: string; name: string; parentId: string | null; parentName: string | null };
  product: { id: string; name: string; clientName: string; targetGender: string | null; targetAge: string | null; targetPain: string | null; usp: string | null; offer: string | null };
  creative: { id: string; kind: "video" | "banner"; durationSec: number | null; width: number | null; height: number | null; mainCopy: string | null; script: ScriptScene[]; r2Key: string | null; sourceUrl: string | null; thumbnailKey: string | null; analysis: VideoAnalysis | null };
  article: { id: string; url: string; finalLpUrl: string | null; title: string | null; blocks: ArticleBlock[]; screenshotKey: string | null; fvKey: string | null; bodyText: string | null; preview: LpPreview | null };
  judge: JudgeResult | null;
  judgeAuto: JudgeResult | null;
  judgeManual: { value: JudgeResult; reason: string; by: string | null; at: string } | null;
  autoChangedSinceManual: boolean;
  basis: JudgeBasis | null;
  criteria: CategoryCriteria | null;
  totals: Totals;
  market: { estSpend: number | null; deliveryDays: number | null; views: number | null; snapshotDate: string } | null;
  tags: { type: string; name: string }[];
  memos: { id: string; kind: "win" | "next" | "miss"; body: string; author: string; createdAt: string }[];
  sb: { pageName: string | null; versionName: string | null; creativeName: string | null; fetchedAt: string | null } | null;
  dpro: { adId: string; advertiser: string | null; detailUrl: string | null; fetchedAt: string | null } | null;
  expressionHits: ExpressionHit[];
  deletedAt: string | null;
}

function ratio(a: number | null, b: number | null): number | null {
  return a !== null && b !== null && b > 0 ? (a / b) * 100 : null;
}

async function sbTotals(versionId: string, creativeId: string, media: string): Promise<Totals> {
  const res = await getRawClient().execute({
    sql: `SELECT SUM(spend) spend, SUM(cv) cv, SUM(mcv) mcv, SUM(pv) pv, SUM(click) click, SUM(media_imp) media_imp,
                 SUM(fsver * pv) / NULLIF(SUM(CASE WHEN fsver IS NOT NULL THEN pv END), 0) fsver,
                 SUM(oar * pv) / NULLIF(SUM(CASE WHEN oar IS NOT NULL THEN pv END), 0) oar,
                 SUM(fver * pv) / NULLIF(SUM(CASE WHEN fver IS NOT NULL THEN pv END), 0) fver,
                 SUM(sver * pv) / NULLIF(SUM(CASE WHEN sver IS NOT NULL THEN pv END), 0) sver,
                 SUM(ctvr * pv) / NULLIF(SUM(CASE WHEN ctvr IS NOT NULL THEN pv END), 0) ctvr,
                 SUM(media_ctr * media_imp) / NULLIF(SUM(CASE WHEN media_ctr IS NOT NULL THEN media_imp END), 0) media_ctr
          FROM sb_metrics_daily WHERE sb_version_id = ? AND sb_creative_id = ? AND media = ?`,
    args: [versionId, creativeId, media],
  });
  const r = res.rows[0] ?? {};
  const spend = num(r.spend), cv = num(r.cv), mcv = num(r.mcv), pv = num(r.pv), click = num(r.click), imp = num(r.media_imp);
  const mediaCtr = num(r.media_ctr);
  return {
    spend, cv, pv, click,
    cpa: cv && spend !== null ? spend / cv : null,
    mcvr: ratio(mcv, pv ?? click),
    fsver: num(r.fsver), oar: num(r.oar), fver: num(r.fver), sver: num(r.sver), ctvr: num(r.ctvr),
    // beyond's click is the article → LP click (MCV), so the ad CTR comes from the media columns.
    ctr: mediaCtr, cvr: ratio(cv, click),
    mcpa: mcv && spend !== null ? spend / mcv : null,
    mediaImp: imp, mediaCtr, mediaCpm: imp && spend !== null ? (spend / imp) * 1000 : null,
    mediaCpc: imp && mediaCtr && spend !== null ? spend / ((imp * mediaCtr) / 100) : null,
  };
}

async function manualTotals(combinationId: string): Promise<Totals> {
  const res = await getRawClient().execute({
    sql: `SELECT SUM(spend) spend, SUM(cv) cv, SUM(mcv) mcv, SUM(pv) pv, SUM(click) click, SUM(imp) imp,
                 AVG(fsver) fsver, AVG(oar) oar FROM manual_metrics WHERE combination_id = ?`,
    args: [combinationId],
  });
  const r = res.rows[0] ?? {};
  const spend = num(r.spend), cv = num(r.cv), mcv = num(r.mcv), pv = num(r.pv), click = num(r.click), imp = num(r.imp);
  return {
    spend, cv, pv, click,
    cpa: cv && spend !== null ? spend / cv : null,
    mcvr: ratio(mcv, pv ?? click),
    fsver: num(r.fsver), oar: num(r.oar), fver: null, sver: null, ctvr: null,
    // CTR is the ad's click-through (clicks / impressions); without impressions it is unknown, not clicks / PV.
    ctr: ratio(click, imp), cvr: ratio(cv, click),
    mcpa: mcv && spend !== null ? spend / mcv : null,
    mediaImp: imp, mediaCtr: ratio(click, imp), mediaCpm: imp && spend !== null ? (spend / imp) * 1000 : null, mediaCpc: click && spend !== null ? spend / click : null,
  };
}

const EMPTY_TOTALS: Totals = { spend: null, cpa: null, mcvr: null, cv: null, fsver: null, oar: null, pv: null, click: null, ctr: null, cvr: null, ctvr: null, mcpa: null, fver: null, sver: null, mediaImp: null, mediaCtr: null, mediaCpm: null, mediaCpc: null };

export async function loadNgDictionary(categoryId: string | null): Promise<NgExpression[]> {
  const res = await getRawClient().execute({
    sql: "SELECT phrase, match_type, law, alternative, severity FROM ng_expressions WHERE is_active = 1 AND (category_id IS NULL OR category_id = ?)",
    args: [categoryId],
  });
  return res.rows.map((r) => ({ phrase: String(r.phrase), matchType: r.match_type as "contains" | "regex", law: str(r.law), alternative: str(r.alternative), severity: r.severity as "warn" | "ng" }));
}

export async function getCombinationDetail(id: string, opts: { includeDeleted?: boolean } = {}): Promise<CombinationDetail> {
  const client = getRawClient();
  const res = await client.execute({
    sql: `SELECT c.*, p.name p_name, p.client_name, p.target_gender, p.target_age, p.target_pain, p.usp, p.offer, p.category_id,
                 cat.name cat_name, cat.parent_id cat_parent, pc.name parent_name,
                 cr.kind, cr.duration_sec, cr.width, cr.height, cr.main_copy, cr.script_json, cr.r2_key, cr.source_url, cr.thumbnail_r2_key, cr.analysis_json,
                 a.url a_url, a.final_lp_url, a.title a_title, a.blocks_json, a.screenshot_r2_key, a.fv_r2_key, a.body_text, a.preview_json,
                 u.name creator_name, mu.name manual_by_name
          FROM combinations c
          JOIN products p ON p.id = c.product_id
          JOIN categories cat ON cat.id = p.category_id
          LEFT JOIN categories pc ON pc.id = cat.parent_id
          JOIN creatives cr ON cr.id = c.creative_id
          JOIN articles a ON a.id = c.article_id
          LEFT JOIN users u ON u.id = c.created_by
          LEFT JOIN users mu ON mu.id = c.judge_manual_by
          WHERE c.id = ?`,
    args: [id],
  });
  const r = res.rows[0];
  if (!r || (r.deleted_at && !opts.includeDeleted)) throw notFound("組み合わせ");

  const origin = r.origin as "own" | "market";
  const categoryId = String(r.category_id);
  const [totals, tagsRes, memosRes, marketRes, criteria, dict] = await Promise.all([
    r.metrics_source === "sb" && r.sb_version_id && r.sb_creative_id
      ? sbTotals(String(r.sb_version_id), String(r.sb_creative_id), String(r.media))
      : origin === "own" ? manualTotals(id) : Promise.resolve(EMPTY_TOTALS),
    client.execute({
      sql: `SELECT DISTINCT tt.name type, t.name, tt.sort_order FROM tags t JOIN tag_types tt ON tt.id = t.tag_type_id
            WHERE t.id IN (SELECT tag_id FROM creative_tags WHERE creative_id = ? UNION SELECT tag_id FROM article_tags WHERE article_id = ?)
            ORDER BY tt.sort_order, t.sort_order`,
      args: [String(r.creative_id), String(r.article_id)],
    }),
    client.execute({ sql: "SELECT m.*, u.name author FROM memos m LEFT JOIN users u ON u.id = m.created_by WHERE combination_id = ? ORDER BY created_at", args: [id] }),
    client.execute({ sql: "SELECT * FROM market_metrics WHERE combination_id = ? ORDER BY snapshot_date DESC LIMIT 1", args: [id] }),
    origin === "own" ? loadCriteria(categoryId) : Promise.resolve(null),
    loadNgDictionary(categoryId),
  ]);

  let sb: CombinationDetail["sb"] = null;
  if (r.sb_version_id) {
    const sbRes = await client.execute({
      sql: `SELECT sp.name page_name, v.name version_name, sc.name creative_name,
                   (SELECT MAX(fetched_at) FROM sb_metrics_daily WHERE sb_version_id = ? AND sb_creative_id = ?) fetched_at
            FROM sb_versions v LEFT JOIN sb_pages sp ON sp.id = v.page_id LEFT JOIN sb_creatives sc ON sc.id = ? WHERE v.id = ?`,
      args: [r.sb_version_id, r.sb_creative_id, r.sb_creative_id, r.sb_version_id],
    });
    const s = sbRes.rows[0];
    sb = { pageName: str(s?.page_name), versionName: str(s?.version_name), creativeName: str(s?.creative_name), fetchedAt: str(s?.fetched_at) };
  }
  let dpro: CombinationDetail["dpro"] = null;
  if (r.dpro_ad_id) {
    const d = (await client.execute({ sql: "SELECT advertiser, dpro_detail_url, fetched_at FROM dpro_candidates WHERE dpro_ad_id = ?", args: [r.dpro_ad_id] })).rows[0];
    dpro = { adId: String(r.dpro_ad_id), advertiser: str(d?.advertiser), detailUrl: str(d?.dpro_detail_url), fetchedAt: str(d?.fetched_at) };
  }

  const script = r.script_json ? (JSON.parse(String(r.script_json)) as ScriptScene[]) : [];
  const blocks = r.blocks_json ? (JSON.parse(String(r.blocks_json)) as ArticleBlock[]) : [];
  const judgeAuto = (r.judge_auto as JudgeResult | null) ?? null;
  const manual = r.judge_manual
    ? { value: r.judge_manual as JudgeResult, reason: String(r.judge_manual_reason ?? ""), by: str(r.manual_by_name), at: String(r.judge_manual_at) }
    : null;
  const m = marketRes.rows[0];

  return {
    id,
    updatedAt: String(r.updated_at),
    origin,
    media: String(r.media),
    startDate: String(r.start_date),
    endDate: str(r.end_date),
    metricsSource: String(r.metrics_source),
    targetCpa: num(r.target_cpa),
    createdBy: { id: String(r.created_by), name: String(r.creator_name ?? "—") },
    createdAt: String(r.created_at),
    category: { id: categoryId, name: String(r.cat_name), parentId: str(r.cat_parent), parentName: str(r.parent_name) },
    product: { id: String(r.product_id), name: String(r.p_name), clientName: String(r.client_name), targetGender: str(r.target_gender), targetAge: str(r.target_age), targetPain: str(r.target_pain), usp: str(r.usp), offer: str(r.offer) },
    creative: { id: String(r.creative_id), kind: r.kind as "video" | "banner", durationSec: num(r.duration_sec), width: num(r.width), height: num(r.height), mainCopy: str(r.main_copy), script, r2Key: str(r.r2_key), sourceUrl: str(r.source_url), thumbnailKey: str(r.thumbnail_r2_key), analysis: parseVideoAnalysis(r.analysis_json) },
    article: { id: String(r.article_id), url: String(r.a_url), finalLpUrl: str(r.final_lp_url), title: str(r.a_title), blocks, screenshotKey: str(r.screenshot_r2_key), fvKey: str(r.fv_r2_key), bodyText: str(r.body_text), preview: parseLpPreview(r.preview_json) },
    judge: origin === "market" ? null : finalJudge(manual?.value as "hit" | "fair" | "miss" | null ?? null, judgeAuto),
    judgeAuto,
    judgeManual: manual,
    autoChangedSinceManual: Boolean(manual && r.judged_at && String(r.judged_at) > manual.at && judgeAuto !== manual.value),
    basis: r.judge_basis_json ? (JSON.parse(String(r.judge_basis_json)) as JudgeBasis) : null,
    criteria,
    totals,
    market: m ? { estSpend: num(m.est_spend), deliveryDays: num(m.delivery_days), views: num(m.views), snapshotDate: String(m.snapshot_date) } : null,
    tags: tagsRes.rows.map((t) => ({ type: String(t.type), name: String(t.name) })),
    memos: memosRes.rows.map((mm) => ({ id: String(mm.id), kind: mm.kind as "win" | "next" | "miss", body: String(mm.body), author: String(mm.author ?? "—"), createdAt: String(mm.created_at) })),
    sb,
    dpro,
    expressionHits: checkExpressions(
      { メインコピー: str(r.main_copy), 台本: script.map((s) => [s.narration, s.telop].filter(Boolean).join(" ")).join("\n"), 記事タイトル: str(r.a_title), 記事本文: str(r.body_text) },
      dict,
    ),
    deletedAt: str(r.deleted_at),
  };
}

export interface RelatedRow {
  id: string;
  label: string;
  cpa: number | null;
  mcvr: number | null;
  judge: JudgeResult | null;
  isSelf: boolean;
}

/** 同じクリエイティブ × 別の記事 / 同じ記事 × 別のクリエイティブ */
export async function getRelated(id: string): Promise<{ sameCreative: RelatedRow[]; sameArticle: RelatedRow[] }> {
  const client = getRawClient();
  const self = (await client.execute({ sql: "SELECT creative_id, article_id FROM combinations WHERE id = ?", args: [id] })).rows[0];
  if (!self) throw notFound("組み合わせ");
  const query = (col: "creative_id" | "article_id", value: unknown) =>
    client.execute({
      sql: `SELECT c.id, a.title, cr.main_copy, cr.kind, c.media, COALESCE(c.judge_manual, c.judge_auto) judge,
                   COALESCE(s.spend, mm.spend) spend, COALESCE(s.cv, mm.cv) cv, COALESCE(s.mcv, mm.mcv) mcv, COALESCE(s.pv, mm.pv, mm.click) base
            FROM combinations c JOIN articles a ON a.id = c.article_id JOIN creatives cr ON cr.id = c.creative_id
            LEFT JOIN (SELECT sb_version_id, sb_creative_id, media, SUM(spend) spend, SUM(cv) cv, SUM(mcv) mcv, SUM(pv) pv FROM sb_metrics_daily GROUP BY 1,2,3) s
              ON c.metrics_source = 'sb' AND s.sb_version_id = c.sb_version_id AND s.sb_creative_id = c.sb_creative_id AND s.media = c.media
            LEFT JOIN (SELECT combination_id, SUM(spend) spend, SUM(cv) cv, SUM(mcv) mcv, SUM(pv) pv, SUM(click) click FROM manual_metrics GROUP BY 1) mm ON mm.combination_id = c.id
            WHERE c.deleted_at IS NULL AND c.${col} = ? ORDER BY (c.id = ?) DESC, c.created_at DESC LIMIT 20`,
      args: [value as string, id],
    });
  const [a, b] = await Promise.all([query("creative_id", self.creative_id), query("article_id", self.article_id)]);
  const map = (labelOf: (r: Record<string, unknown>) => string) => (r: Record<string, unknown>): RelatedRow => {
    const spend = num(r.spend), cv = num(r.cv);
    return { id: String(r.id), label: labelOf(r), cpa: cv && spend !== null ? spend / cv : null, mcvr: ratio(num(r.mcv), num(r.base)), judge: (r.judge as JudgeResult | null) ?? null, isSelf: r.id === id };
  };
  return {
    sameCreative: a.rows.map(map((r) => String(r.title ?? "（無題）"))),
    sameArticle: b.rows.map(map((r) => `${r.kind === "video" ? "動画" : "バナー"}：${String(r.main_copy ?? "").slice(0, 40)}`)),
  };
}

export interface DailyPoint {
  date: string;
  media: string;
  spend: number | null;
  cpa: number | null;
}

export async function getDailyMetrics(id: string, media?: string): Promise<DailyPoint[]> {
  const client = getRawClient();
  const c = (await client.execute({ sql: "SELECT sb_version_id, sb_creative_id, media FROM combinations WHERE id = ? AND deleted_at IS NULL", args: [id] })).rows[0];
  if (!c) throw notFound("組み合わせ");
  if (!c.sb_version_id) return [];
  const res = await client.execute({
    sql: `SELECT date, media, spend, cv FROM sb_metrics_daily WHERE sb_version_id = ? AND sb_creative_id = ? AND media = ? ORDER BY date`,
    args: [c.sb_version_id, c.sb_creative_id, media ?? c.media],
  });
  return res.rows.map((r) => ({ date: String(r.date), media: String(r.media), spend: num(r.spend), cpa: num(r.cv) ? (num(r.spend) ?? 0) / Number(r.cv) : null }));
}

async function loadForUpdate(id: string, updatedAt: string) {
  const db = getDb();
  const [row] = await db.select().from(combinations).where(eq(combinations.id, id)).limit(1);
  if (!row) throw notFound("組み合わせ");
  if (row.updatedAt !== updatedAt) throw conflict();
  return row;
}

export async function overrideJudge(user: CurrentUser, id: string, input: { judge: "hit" | "fair" | "miss"; reason: string; updatedAt: string }): Promise<void> {
  const db = getDb();
  const row = await loadForUpdate(id, input.updatedAt);
  if (row.deletedAt) throw notFound("組み合わせ");
  if (row.origin === "market") throw new ApiError("UNPROCESSABLE", "市場事例は当たり判定の対象外です");
  const now = new Date().toISOString();
  const after = { judgeManual: input.judge, judgeManualReason: input.reason || null, judgeManualBy: user.id, judgeManualAt: now, updatedAt: now };
  await db.batch([
    db.update(combinations).set(after).where(and(eq(combinations.id, id), eq(combinations.updatedAt, input.updatedAt))),
    auditInsert(db, { userId: user.id, action: "judge_override", targetType: "combination", targetId: id, before: { judgeManual: row.judgeManual, reason: row.judgeManualReason }, after: { judgeManual: input.judge, reason: input.reason } }),
  ]);
}

export async function clearJudgeOverride(user: CurrentUser, id: string, updatedAt: string): Promise<void> {
  const db = getDb();
  const row = await loadForUpdate(id, updatedAt);
  const now = new Date().toISOString();
  await db.batch([
    db.update(combinations).set({ judgeManual: null, judgeManualReason: null, judgeManualBy: null, judgeManualAt: null, updatedAt: now }).where(eq(combinations.id, id)),
    auditInsert(db, { userId: user.id, action: "judge_override", targetType: "combination", targetId: id, before: { judgeManual: row.judgeManual }, after: { judgeManual: null } }),
  ]);
}

export async function softDelete(user: CurrentUser, id: string): Promise<void> {
  const db = getDb();
  const [row] = await db.select().from(combinations).where(and(eq(combinations.id, id), isNull(combinations.deletedAt))).limit(1);
  if (!row) throw notFound("組み合わせ");
  if (!canDelete(user.role, user.id, row.createdBy)) throw forbidden();
  const now = new Date().toISOString();
  await db.batch([
    db.update(combinations).set({ deletedAt: now, updatedAt: now }).where(eq(combinations.id, id)),
    auditInsert(db, { userId: user.id, action: "delete", targetType: "combination", targetId: id, before: { deletedAt: null }, after: { deletedAt: now } }),
  ]);
}

export async function restore(user: CurrentUser, id: string): Promise<void> {
  const db = getDb();
  const [row] = await db.select().from(combinations).where(eq(combinations.id, id)).limit(1);
  if (!row || !row.deletedAt) throw notFound("削除済みの組み合わせ");
  if (!canDelete(user.role, user.id, row.createdBy)) throw forbidden();
  if (Date.now() - Date.parse(row.deletedAt) > 30 * 86_400_000) throw new ApiError("UNPROCESSABLE", "削除から30日を過ぎたため復元できません");
  const now = new Date().toISOString();
  await db.batch([
    db.update(combinations).set({ deletedAt: null, updatedAt: now }).where(eq(combinations.id, id)),
    auditInsert(db, { userId: user.id, action: "restore", targetType: "combination", targetId: id, before: { deletedAt: row.deletedAt }, after: { deletedAt: null } }),
  ]);
}

export async function addMemo(user: CurrentUser, input: { combinationId: string; kind: "win" | "next" | "miss"; body: string }): Promise<string> {
  const db = getDb();
  const [c] = await db.select({ id: combinations.id }).from(combinations).where(and(eq(combinations.id, input.combinationId), isNull(combinations.deletedAt))).limit(1);
  if (!c) throw notFound("組み合わせ");
  const id = ulid();
  const now = new Date().toISOString();
  const row = { id, combinationId: input.combinationId, kind: input.kind, body: input.body, createdBy: user.id, createdAt: now, updatedAt: now };
  await db.batch([db.insert(memos).values(row), auditInsert(db, { userId: user.id, action: "create", targetType: "memo", targetId: id, after: row })]);
  return id;
}

export async function updateMemo(user: CurrentUser, id: string, input: { body: string; updatedAt: string }): Promise<void> {
  const db = getDb();
  const [row] = await db.select().from(memos).where(eq(memos.id, id)).limit(1);
  if (!row) throw notFound("メモ");
  if (row.updatedAt !== input.updatedAt) throw conflict();
  const now = new Date().toISOString();
  await db.batch([
    db.update(memos).set({ body: input.body, updatedAt: now }).where(eq(memos.id, id)),
    auditInsert(db, { userId: user.id, action: "update", targetType: "memo", targetId: id, before: { body: row.body }, after: { body: input.body } }),
  ]);
}

export async function activeNgExpressions(): Promise<number> {
  const rows = await getDb().select({ id: ngExpressions.id }).from(ngExpressions).where(eq(ngExpressions.isActive, 1));
  return rows.length;
}
