import "server-only";
import { parseLpPreview, previewImage } from "@/lib/domain/lp-preview";
import { z } from "zod";
import type { InValue } from "@libsql/client";
import { getRawClient } from "../db/client";
import { PAGE_SIZE, SORTS, type SortCode } from "@/lib/domain/constants";
import { ApiError } from "../http";

// GET /api/combinations query (spec ch.10). Arrays come as repeated params.
export const listQuerySchema = z
  .object({
    category: z.string().optional(),
    origin: z.enum(["all", "own", "market"]).default("all"),
    judge: z.array(z.enum(["hit", "fair", "miss", "pending"])).default(["hit"]),
    kind: z.array(z.enum(["video", "banner"])).default([]),
    tag: z.array(z.string()).default([]),
    media: z.array(z.string()).default([]),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    spendMin: z.coerce.number().optional(),
    spendMax: z.coerce.number().optional(),
    cpaMin: z.coerce.number().optional(),
    cpaMax: z.coerce.number().optional(),
    mcvrMin: z.coerce.number().optional(),
    mcvrMax: z.coerce.number().optional(),
    cvMin: z.coerce.number().optional(),
    cvMax: z.coerce.number().optional(),
    q: z.string().trim().max(200).optional(),
    sort: z.enum(SORTS.map((s) => s.code) as [SortCode, ...SortCode[]]).default("cpa_asc"),
    limit: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
    cursor: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    for (const k of ["spend", "cpa", "mcvr", "cv"] as const) {
      const min = v[`${k}Min`];
      const max = v[`${k}Max`];
      if (min !== undefined && max !== undefined && min > max) {
        ctx.addIssue({ code: "custom", path: [`${k}Min`], message: "下限は上限以下にしてください" });
      }
    }
    if (v.from && v.to && v.from > v.to) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "開始日は終了日以前にしてください" });
    }
  });
export type ListQuery = z.infer<typeof listQuerySchema>;

const ARRAY_KEYS = new Set(["judge", "kind", "tag", "media"]);

/** URLSearchParams -> ListQuery (also used by the gallery page for shareable URLs). */
export function parseListQuery(params: URLSearchParams): ListQuery {
  const raw: Record<string, unknown> = {};
  for (const key of new Set(params.keys())) {
    raw[key] = ARRAY_KEYS.has(key) ? params.getAll(key).flatMap((v) => v.split(",")).filter(Boolean) : params.get(key) || undefined;
  }
  return listQuerySchema.parse(raw);
}

export interface CardRow {
  id: string;
  origin: "own" | "market";
  media: string;
  kind: "video" | "banner";
  durationSec: number | null;
  productName: string;
  articleTitle: string | null;
  judge: "hit" | "fair" | "miss" | "pending" | null;
  judgeManual: boolean;
  spend: number | null;
  cpa: number | null;
  mcvr: number | null;
  cvr: number | null;
  cv: number | null;
  estSpend: number | null;
  deliveryDays: number | null;
  views: number | null;
  thumbnailKey: string | null;
  fvKey: string | null;
  /** Creative URL (Drive poster fallback when no thumbnail was stored). */
  sourceUrl: string | null;
  /** LP image captured at registration (OGP or first view) when no screenshot was uploaded. */
  lpImage: string | null;
  tags: string[];
  createdAt: string;
}

/**
 * Totals per combination: Squad beyond daily rows (by SB ids) or manual/CSV periods,
 * plus the latest DPro estimate for market cases. Display totals are cumulative.
 */
const METRICS_CTE = `
WITH sbt AS (
  SELECT sb_version_id, sb_creative_id, media,
         SUM(spend) AS spend, SUM(cv) AS cv, SUM(mcv) AS mcv, SUM(pv) AS pv, SUM(click) AS click
  FROM sb_metrics_daily GROUP BY sb_version_id, sb_creative_id, media
),
mmt AS (
  SELECT combination_id, SUM(spend) AS spend, SUM(cv) AS cv, SUM(mcv) AS mcv, SUM(pv) AS pv, SUM(click) AS click
  FROM manual_metrics GROUP BY combination_id
),
mkt AS (
  SELECT combination_id, est_spend, delivery_days, views
  FROM market_metrics m1
  WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM market_metrics m2 WHERE m2.combination_id = m1.combination_id)
),
base AS (
  SELECT c.*, p.name AS product_name, p.category_id, cat.parent_id AS parent_category_id,
         cr.kind, cr.duration_sec, cr.thumbnail_r2_key, cr.source_url, a.title AS article_title, a.fv_r2_key, a.preview_json,
         COALESCE(c.judge_manual, c.judge_auto, CASE WHEN c.origin = 'market' THEN 'hit' END) AS final_judge,
         COALESCE(sbt.spend, mmt.spend) AS t_spend, COALESCE(sbt.cv, mmt.cv) AS t_cv,
         COALESCE(sbt.mcv, mmt.mcv) AS t_mcv, COALESCE(sbt.pv, mmt.pv) AS t_pv,
         COALESCE(sbt.click, mmt.click) AS t_click,
         mkt.est_spend, mkt.delivery_days, mkt.views
  FROM combinations c
  JOIN products p ON p.id = c.product_id
  JOIN categories cat ON cat.id = p.category_id
  JOIN creatives cr ON cr.id = c.creative_id
  JOIN articles a ON a.id = c.article_id
  LEFT JOIN sbt ON c.metrics_source = 'sb' AND sbt.sb_version_id = c.sb_version_id
            AND sbt.sb_creative_id = c.sb_creative_id AND sbt.media = c.media
  LEFT JOIN mmt ON mmt.combination_id = c.id
  LEFT JOIN mkt ON mkt.combination_id = c.id
  WHERE c.deleted_at IS NULL
),
calc AS (
  SELECT base.*,
         CASE WHEN t_cv > 0 THEN 1.0 * t_spend / t_cv END AS cpa,
         CASE WHEN COALESCE(t_pv, t_click) > 0 THEN 100.0 * t_mcv / COALESCE(t_pv, t_click) END AS mcvr,
         CASE WHEN t_click > 0 THEN 100.0 * t_cv / t_click END AS cvr
  FROM base
)`;

interface Where {
  clauses: string[];
  args: InValue[];
}

function buildWhere(q: ListQuery, opts: { includeCategory: boolean }): Where {
  const clauses: string[] = [];
  const args: InValue[] = [];
  const inList = (col: string, values: readonly string[]): void => {
    clauses.push(`${col} IN (${values.map(() => "?").join(",")})`);
    args.push(...values);
  };

  if (opts.includeCategory && q.category) {
    clauses.push("(category_id = ? OR parent_category_id = ?)");
    args.push(q.category, q.category);
  }
  if (q.origin !== "all") {
    clauses.push("origin = ?");
    args.push(q.origin);
  }
  if (q.judge.length > 0) inList("final_judge", q.judge);
  if (q.kind.length > 0) inList("kind", q.kind);
  if (q.media.length > 0) inList("media", q.media);
  for (const tagId of q.tag) {
    clauses.push(
      "(EXISTS (SELECT 1 FROM creative_tags ct WHERE ct.creative_id = calc.creative_id AND ct.tag_id = ?) OR EXISTS (SELECT 1 FROM article_tags at WHERE at.article_id = calc.article_id AND at.tag_id = ?))",
    );
    args.push(tagId, tagId);
  }
  // Delivery period overlaps [from, to]
  if (q.from) {
    clauses.push("(end_date IS NULL OR end_date >= ?)");
    args.push(q.from);
  }
  if (q.to) {
    clauses.push("start_date <= ?");
    args.push(q.to);
  }
  const ranges: [keyof ListQuery, string, ">=" | "<="][] = [
    ["spendMin", "t_spend", ">="], ["spendMax", "t_spend", "<="],
    ["cpaMin", "cpa", ">="], ["cpaMax", "cpa", "<="],
    ["mcvrMin", "mcvr", ">="], ["mcvrMax", "mcvr", "<="],
    ["cvMin", "t_cv", ">="], ["cvMax", "t_cv", "<="],
  ];
  for (const [key, col, op] of ranges) {
    const v = q[key];
    if (typeof v === "number") {
      clauses.push(`${col} ${op} ?`);
      args.push(v);
    }
  }
  // Keyword search over search_text (product, copy, script, article, memos).
  // FTS5 trigram is pending verification on Turso (U-01); LIKE is acceptable at thousands of rows.
  if (q.q) {
    for (const word of q.q.split(/\s+/).filter(Boolean)) {
      clauses.push("search_text LIKE ? ESCAPE '\\'");
      args.push(`%${word.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    }
  }
  return { clauses, args };
}

// Market cases have no CPA etc., so metric sorts push them to the end (spec S-01).
const ORDER: Record<SortCode, string> = {
  cpa_asc: "(cpa IS NULL), cpa ASC",
  mcvr_desc: "(mcvr IS NULL), mcvr DESC",
  cvr_desc: "(cvr IS NULL), cvr DESC",
  spend_desc: "(t_spend IS NULL), t_spend DESC",
  cv_desc: "(t_cv IS NULL), t_cv DESC",
  created_desc: "created_at DESC",
};

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const n = Number.parseInt(cursor, 36);
  if (!Number.isFinite(n) || n < 0) throw new ApiError("VALIDATION_ERROR", "ページ指定が正しくありません");
  return n;
}

export interface ListResult {
  items: CardRow[];
  nextCursor: string | null;
  total: number;
}

export async function listCombinations(q: ListQuery): Promise<ListResult> {
  const client = getRawClient();
  const where = buildWhere(q, { includeCategory: true });
  const whereSql = where.clauses.length > 0 ? `WHERE ${where.clauses.join(" AND ")}` : "";
  const offset = decodeCursor(q.cursor);

  const [rows, count] = await Promise.all([
    client.execute({
      sql: `${METRICS_CTE}
        SELECT calc.*,
          (SELECT GROUP_CONCAT(name, '|') FROM (
             SELECT DISTINCT t.name FROM tags t
             WHERE t.id IN (SELECT tag_id FROM creative_tags WHERE creative_id = calc.creative_id
                            UNION SELECT tag_id FROM article_tags WHERE article_id = calc.article_id)
             LIMIT 3)) AS tag_names
        FROM calc ${whereSql} ORDER BY ${ORDER[q.sort]}, id LIMIT ? OFFSET ?`,
      args: [...where.args, q.limit + 1, offset],
    }),
    client.execute({ sql: `${METRICS_CTE} SELECT COUNT(*) AS n FROM calc ${whereSql}`, args: where.args }),
  ]);

  const items = rows.rows.slice(0, q.limit).map(toCard);
  const hasMore = rows.rows.length > q.limit;
  return {
    items,
    nextCursor: hasMore ? (offset + q.limit).toString(36) : null,
    total: Number(count.rows[0]?.n ?? 0),
  };
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function toCard(r: Record<string, unknown>): CardRow {
  return {
    id: String(r.id),
    origin: r.origin as CardRow["origin"],
    media: String(r.media),
    kind: r.kind as CardRow["kind"],
    durationSec: num(r.duration_sec),
    productName: String(r.product_name),
    articleTitle: strOrNull(r.article_title),
    judge: (r.origin === "market" ? null : strOrNull(r.final_judge)) as CardRow["judge"],
    judgeManual: r.judge_manual !== null,
    spend: num(r.t_spend),
    cpa: num(r.cpa),
    mcvr: num(r.mcvr),
    cvr: num(r.cvr),
    cv: num(r.t_cv),
    estSpend: num(r.est_spend),
    deliveryDays: num(r.delivery_days),
    views: num(r.views),
    thumbnailKey: strOrNull(r.thumbnail_r2_key),
    fvKey: strOrNull(r.fv_r2_key),
    sourceUrl: strOrNull(r.source_url),
    lpImage: previewImage(parseLpPreview(r.preview_json)),
    tags: r.tag_names ? String(r.tag_names).split("|") : [],
    createdAt: String(r.created_at),
  };
}

export interface CategoryNode {
  id: string;
  name: string;
  count: number;
  children: { id: string; name: string; count: number }[];
}

/** Category tree with counts under the current filters (category itself excluded). */
export async function categoryTree(q: ListQuery): Promise<CategoryNode[]> {
  const client = getRawClient();
  const where = buildWhere(q, { includeCategory: false });
  const whereSql = where.clauses.length > 0 ? `WHERE ${where.clauses.join(" AND ")}` : "";
  const [cats, counts] = await Promise.all([
    client.execute("SELECT id, parent_id, name FROM categories WHERE is_active = 1 ORDER BY sort_order, name"),
    client.execute({
      sql: `${METRICS_CTE} SELECT category_id, COUNT(*) AS n FROM calc ${whereSql} GROUP BY category_id`,
      args: where.args,
    }),
  ]);
  const countBy = new Map(counts.rows.map((r) => [String(r.category_id), Number(r.n)]));
  const parents = cats.rows.filter((c) => c.parent_id === null);
  return parents.map((p) => {
    const children = cats.rows
      .filter((c) => c.parent_id === p.id)
      .map((c) => ({ id: String(c.id), name: String(c.name), count: countBy.get(String(c.id)) ?? 0 }));
    return { id: String(p.id), name: String(p.name), count: children.reduce((a, c) => a + c.count, 0), children };
  });
}
