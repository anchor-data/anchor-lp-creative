import "server-only";
import { getRawClient } from "../db/client";
import { DEFAULT_REC_WEIGHTS, rank, type RecCandidate, type RecQuery, type RecWeights } from "@/lib/domain/recommend";
import { bigramCoverage } from "@/lib/domain/text-sim";
import { jstToday } from "@/lib/format";
import type { ProductInput } from "@/lib/domain/plan";
import type { JudgeResult } from "@/lib/domain/judge";
import { embed, vectorSearch } from "./embeddings";

export interface Recommendation {
  id: string;
  score: number;
  reason: string;
  origin: "own" | "market";
  title: string;
  media: string;
  judge: JudgeResult | null;
  cpa: number | null;
  estSpend: number | null;
  deliveryDays: number | null;
}

export async function getRecWeights(): Promise<RecWeights> {
  const res = await getRawClient().execute("SELECT value_json FROM settings WHERE key = 'rec_weights'");
  const row = res.rows[0];
  return row ? { ...DEFAULT_REC_WEIGHTS, ...(JSON.parse(String(row.value_json)) as Partial<RecWeights>) } : DEFAULT_REC_WEIGHTS;
}

export function queryText(p: ProductInput): string {
  return [p.name, p.target, p.usp, p.offer, p.referenceText.slice(0, 2000)].filter(Boolean).join("\n");
}

/** Spec 9-2: vector top-100 → drop deleted/pending/miss → backfill same parent → score → top 20. */
export async function recommend(p: ProductInput, weights?: RecWeights, limit = 20): Promise<Recommendation[]> {
  const client = getRawClient();
  const w = weights ?? (await getRecWeights());
  const parent = await client.execute({ sql: "SELECT parent_id FROM categories WHERE id = ?", args: [p.categoryId] });
  const q: RecQuery = { categoryId: p.categoryId, parentCategoryId: parent.rows[0]?.parent_id ? String(parent.rows[0].parent_id) : null, targetText: p.target };
  const text = queryText(p);

  let sims: Map<string, number> | null = null;
  try {
    const vec = await embed([text]);
    if (vec) sims = await vectorSearch(vec[0], 100);
  } catch {
    sims = null; // fall back to lexical similarity below
  }

  const idFilter = sims && sims.size > 0 ? `AND (c.id IN (${[...sims.keys()].map(() => "?").join(",")}) OR cat.parent_id = ?)` : "";
  const res = await client.execute({
    sql: `SELECT c.id, c.origin, c.media, c.end_date, c.rec_bonus, c.search_text, p.name pname, a.title,
                 p.category_id, cat.parent_id, p.target_gender, p.target_age, p.target_pain,
                 COALESCE(c.judge_manual, c.judge_auto, CASE WHEN c.origin = 'market' THEN 'hit' END) judge,
                 (SELECT GROUP_CONCAT(t.name, '|') FROM tags t WHERE t.id IN (SELECT tag_id FROM creative_tags WHERE creative_id = c.creative_id UNION SELECT tag_id FROM article_tags WHERE article_id = c.article_id)) tag_names,
                 (SELECT SUM(spend) * 1.0 / NULLIF(SUM(cv), 0) FROM sb_metrics_keyed s WHERE s.sb_version_id = c.sb_version_id AND s.sb_creative_id = c.sb_creative_id AND s.media = c.media) sb_cpa,
                 (SELECT SUM(spend) * 1.0 / NULLIF(SUM(cv), 0) FROM manual_metrics mm WHERE mm.combination_id = c.id) mm_cpa,
                 (SELECT est_spend FROM market_metrics WHERE combination_id = c.id ORDER BY snapshot_date DESC LIMIT 1) est_spend,
                 (SELECT delivery_days FROM market_metrics WHERE combination_id = c.id ORDER BY snapshot_date DESC LIMIT 1) delivery_days
          FROM combinations c JOIN products p ON p.id = c.product_id JOIN categories cat ON cat.id = p.category_id
          JOIN articles a ON a.id = c.article_id
          WHERE c.deleted_at IS NULL ${idFilter}
          LIMIT 500`,
    args: sims && sims.size > 0 ? [...sims.keys(), q.parentCategoryId] : [],
  });

  const candidates: (RecCandidate & { row: Record<string, unknown> })[] = res.rows.map((r) => ({
    id: String(r.id),
    similarity: sims?.get(String(r.id)) ?? bigramCoverage(text, String(r.search_text ?? "")),
    judge: (r.judge as JudgeResult | null) ?? null,
    endDate: r.end_date ? String(r.end_date) : null,
    origin: r.origin as "own" | "market",
    categoryId: String(r.category_id),
    parentCategoryId: r.parent_id ? String(r.parent_id) : null,
    recBonus: Number(r.rec_bonus ?? 0),
    tagNames: r.tag_names ? String(r.tag_names).split("|") : [],
    targetText: [r.target_gender, r.target_age, r.target_pain].filter(Boolean).join(" "),
    row: r,
  }));
  const byId = new Map(candidates.map((c) => [c.id, c]));
  return rank(candidates, q, w, jstToday(), limit).map((r) => {
    const c = byId.get(r.id)!;
    const row = c.row;
    return {
      ...r,
      origin: c.origin,
      title: `${String(row.pname)} × 記事「${String(row.title ?? "")}」`,
      media: String(row.media),
      judge: c.origin === "market" ? null : c.judge,
      cpa: row.sb_cpa !== null ? Number(row.sb_cpa) : row.mm_cpa !== null ? Number(row.mm_cpa) : null,
      estSpend: row.est_spend !== null ? Number(row.est_spend) : null,
      deliveryDays: row.delivery_days !== null ? Number(row.delivery_days) : null,
    };
  });
}

export interface PlaybookRef {
  id: string;
  kind: "win" | "avoid";
  versionNo: number;
  categoryName: string;
  bodyMd: string;
  itemCount: number;
}

/** Latest approved playbooks for the category, else the parent category, else none (spec 9-3). */
export async function latestPlaybooks(categoryId: string): Promise<{ win: PlaybookRef | null; avoid: PlaybookRef | null }> {
  const client = getRawClient();
  const parent = (await client.execute({ sql: "SELECT parent_id FROM categories WHERE id = ?", args: [categoryId] })).rows[0]?.parent_id;
  const pick = async (kind: "win" | "avoid"): Promise<PlaybookRef | null> => {
    for (const cat of [categoryId, parent].filter(Boolean)) {
      const r = (
        await client.execute({
          sql: `SELECT pb.*, c.name cname FROM playbooks pb JOIN categories c ON c.id = pb.category_id
                WHERE pb.category_id = ? AND pb.kind = ? AND pb.status = 'approved' ORDER BY pb.version_no DESC LIMIT 1`,
          args: [String(cat), kind],
        })
      ).rows[0];
      if (r) {
        const body = String(r.body_md);
        return { id: String(r.id), kind, versionNo: Number(r.version_no), categoryName: String(r.cname), bodyMd: body, itemCount: body.split("\n").filter((l) => l.trim().startsWith("-")).length };
      }
    }
    return null;
  };
  const [win, avoid] = await Promise.all([pick("win"), pick("avoid")]);
  return { win, avoid };
}
