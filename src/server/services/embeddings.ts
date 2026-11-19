import "server-only";
import type { InStatement } from "@libsql/client";
import { getRawClient } from "../db/client";
import { getBindings } from "../env";

// Workers AI multilingual model, 1024 dims (U-02: model choice still pending).
export const EMBEDDING_MODEL = "@cf/baai/bge-m3";
const MAX_SEARCH_TEXT = 8000;

export async function embed(texts: string[]): Promise<number[][] | null> {
  const ai = getBindings().AI;
  if (!ai || texts.length === 0) return null;
  const res = await ai.run(EMBEDDING_MODEL, { text: texts });
  return res.data;
}

/**
 * Builds search_text (spec 9-1): category, product target/pain/USP/offer, tags, copy,
 * script, article title, block headings, first 2,000 chars of the body, memos. Max 8,000 chars.
 */
async function buildSearchTexts(ids: readonly string[]): Promise<Map<string, string>> {
  const client = getRawClient();
  const placeholders = ids.map(() => "?").join(",");
  const res = await client.execute({
    sql: `SELECT c.id, cat.name cat, p.name pname, p.target_gender, p.target_age, p.target_pain, p.usp, p.offer,
                 cr.main_copy, cr.script_json, a.title, a.blocks_json, SUBSTR(a.body_text, 1, 2000) body,
                 (SELECT GROUP_CONCAT(t.name, ' ') FROM tags t WHERE t.id IN (
                    SELECT tag_id FROM creative_tags WHERE creative_id = c.creative_id
                    UNION SELECT tag_id FROM article_tags WHERE article_id = c.article_id)) tag_names,
                 (SELECT GROUP_CONCAT(body, '\n') FROM memos WHERE combination_id = c.id) memo_text
          FROM combinations c JOIN products p ON p.id = c.product_id JOIN categories cat ON cat.id = p.category_id
          JOIN creatives cr ON cr.id = c.creative_id JOIN articles a ON a.id = c.article_id
          WHERE c.id IN (${placeholders})`,
    args: [...ids],
  });
  const out = new Map<string, string>();
  for (const r of res.rows) {
    const script = r.script_json ? (JSON.parse(String(r.script_json)) as { narration?: string; telop?: string }[]).map((s) => [s.telop, s.narration].filter(Boolean).join(" ")).join("\n") : "";
    const headings = r.blocks_json ? (JSON.parse(String(r.blocks_json)) as { heading?: string }[]).map((b) => b.heading ?? "").join(" / ") : "";
    const text = [r.cat, r.pname, [r.target_gender, r.target_age, r.target_pain].filter(Boolean).join(" "), r.usp, r.offer, r.tag_names, r.main_copy, script, r.title, headings, r.body, r.memo_text]
      .filter((v) => v !== null && v !== undefined && String(v).length > 0)
      .join("\n")
      .slice(0, MAX_SEARCH_TEXT);
    out.set(String(r.id), text);
  }
  return out;
}

/**
 * J-09: refresh search_text and re-embed when it changed. Market cases whose data may not
 * be stored (U-11) should be excluded by the caller. Embedding failures leave the row
 * for the nightly sweep.
 */
export async function refreshSearchIndex(ids: readonly string[]): Promise<{ updated: number; embedded: number }> {
  if (ids.length === 0) return { updated: 0, embedded: 0 };
  const client = getRawClient();
  const texts = await buildSearchTexts(ids);
  const current = await client.execute({
    sql: `SELECT id, search_text, embedding_model, embedding IS NULL AS no_vec FROM combinations WHERE id IN (${ids.map(() => "?").join(",")})`,
    args: [...ids],
  });
  const stale = current.rows.filter((r) => {
    const next = texts.get(String(r.id));
    return next !== undefined && (next !== r.search_text || Number(r.no_vec) === 1 || r.embedding_model !== EMBEDDING_MODEL);
  });
  if (stale.length === 0) return { updated: 0, embedded: 0 };

  let vectors: number[][] | null = null;
  try {
    vectors = await embed(stale.map((r) => texts.get(String(r.id)) as string));
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", msg: "embedding failed", error: err instanceof Error ? err.message : String(err) }));
  }
  const now = new Date().toISOString();
  const statements: InStatement[] = stale.map((r, i) => {
    const text = texts.get(String(r.id)) as string;
    return vectors
      ? { sql: "UPDATE combinations SET search_text = ?, embedding = vector32(?), embedding_model = ?, embedding_updated_at = ? WHERE id = ?", args: [text, JSON.stringify(vectors[i]), EMBEDDING_MODEL, now, String(r.id)] }
      : { sql: "UPDATE combinations SET search_text = ? WHERE id = ?", args: [text, String(r.id)] };
  });
  await client.batch(statements, "write");
  return { updated: stale.length, embedded: vectors ? stale.length : 0 };
}

/** Nightly sweep for rows missing a vector (J-09 漏れ拾い). */
export async function sweepMissingEmbeddings(limit = 200): Promise<{ updated: number; embedded: number }> {
  const res = await getRawClient().execute({
    sql: "SELECT id FROM combinations WHERE deleted_at IS NULL AND (embedding IS NULL OR embedding_model IS NOT ?) LIMIT ?",
    args: [EMBEDDING_MODEL, limit],
  });
  return refreshSearchIndex(res.rows.map((r) => String(r.id)));
}

/** vector_top_k over comb_vec_idx; similarity = 1 - cosine distance. */
export async function vectorSearch(queryVector: number[], k = 100): Promise<Map<string, number>> {
  const res = await getRawClient().execute({
    sql: `SELECT c.id, vector_distance_cos(c.embedding, vector32(?)) AS d
          FROM vector_top_k('comb_vec_idx', vector32(?), ?) v JOIN combinations c ON c.rowid = v.id
          WHERE c.embedding_model = ?`,
    args: [JSON.stringify(queryVector), JSON.stringify(queryVector), k, EMBEDDING_MODEL],
  });
  return new Map(res.rows.map((r) => [String(r.id), Math.max(0, Math.min(1, 1 - Number(r.d)))]));
}
