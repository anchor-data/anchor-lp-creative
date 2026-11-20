import "server-only";
import type { InStatement } from "@libsql/client";
import { ulid } from "ulid";
import { getRawClient } from "../db/client";
import { ApiError, notFound } from "../http";
import type { CurrentUser } from "../auth";
import type { RegistrationInput } from "@/lib/domain/registration";
import { recomputeJudgments } from "./judging";
import { refreshSearchIndex } from "./embeddings";

/** Required tag types (訴求軸) must have at least one tag. */
async function assertRequiredTags(tagIds: readonly string[]): Promise<void> {
  const client = getRawClient();
  const required = await client.execute("SELECT id, name FROM tag_types WHERE required = 1");
  if (required.rows.length === 0) return;
  const chosen = tagIds.length
    ? await client.execute({ sql: `SELECT DISTINCT tag_type_id FROM tags WHERE id IN (${tagIds.map(() => "?").join(",")})`, args: [...tagIds] })
    : { rows: [] };
  const have = new Set(chosen.rows.map((r) => String(r.tag_type_id)));
  const missing = required.rows.filter((r) => !have.has(String(r.id)));
  if (missing.length > 0) {
    throw new ApiError("VALIDATION_ERROR", `${missing.map((m) => String(m.name)).join("・")}タグを1つ以上選んでください`, missing.map((m) => ({ field: "tags.tagIds", reason: "required_tag_type", tagType: String(m.name) })));
  }
}

/** POST /api/registrations: product → memo in one transaction, then judge + index (spec ch.10). */
export async function register(user: CurrentUser, input: RegistrationInput): Promise<{ combinationId: string }> {
  const client = getRawClient();
  const now = new Date().toISOString();
  const tagIds = [...new Set([...input.tags.tagIds, ...input.tags.aiTagIds])];
  await assertRequiredTags(tagIds);
  const statements: InStatement[] = [];
  const audit = (targetType: string, targetId: string, after: unknown): InStatement => ({
    sql: "INSERT INTO audit_logs (id, at, user_id, action, target_type, target_id, after_json) VALUES (?, ?, ?, 'create', ?, ?, ?)",
    args: [ulid(), now, user.id, targetType, targetId, JSON.stringify(after)],
  });

  // 1. Product
  let productId: string;
  if (input.product.mode === "existing") {
    const p = (await client.execute({ sql: "SELECT id FROM products WHERE id = ? AND deleted_at IS NULL", args: [input.product.id] })).rows[0];
    if (!p) throw notFound("商材");
    productId = input.product.id;
  } else {
    const p = input.product;
    productId = ulid();
    statements.push({
      sql: `INSERT INTO products (id, name, client_name, category_id, target_gender, target_age, target_pain, price_range, offer, usp, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [productId, p.name, p.clientName, p.categoryId, p.targetGender ?? null, p.targetAge ?? null, p.targetPain ?? null, p.priceRange ?? null, p.offer ?? null, p.usp ?? null, user.id, now, now],
    });
    statements.push(audit("product", productId, p));
  }

  // 2. Creative (F-12: same file hash must reuse the existing creative)
  let creativeId: string;
  const c = input.creative;
  if (c.existingId) {
    creativeId = c.existingId;
  } else {
    if (c.fileSha256) {
      const dup = (await client.execute({ sql: "SELECT id FROM creatives WHERE file_sha256 = ? AND deleted_at IS NULL", args: [c.fileSha256] })).rows[0];
      if (dup) throw new ApiError("DUPLICATE", "同じファイルのクリエイティブが登録済みです。既存のクリエイティブを使ってください", [{ field: "creative", reason: "duplicate_file", existingId: String(dup.id) }]);
    }
    creativeId = ulid();
    statements.push({
      sql: `INSERT INTO creatives (id, product_id, kind, r2_key, source_url, file_sha256, thumbnail_r2_key, duration_sec, width, height, main_copy, script_json, sb_creative_id, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [creativeId, productId, c.kind, c.r2Key ?? null, c.sourceUrl || null, c.fileSha256 ?? null, c.thumbnailKey ?? null, c.durationSec ?? null, c.width ?? null, c.height ?? null, c.mainCopy ?? null, c.script.length ? JSON.stringify(c.script) : null, c.sbCreativeId ?? input.combination.sbCreativeId ?? null, user.id, now, now],
    });
    statements.push(audit("creative", creativeId, { kind: c.kind, r2Key: c.r2Key, sourceUrl: c.sourceUrl }));
  }

  // 3. Article
  let articleId: string;
  const a = input.article;
  if (a.existingId) {
    articleId = a.existingId;
  } else {
    articleId = ulid();
    statements.push({
      sql: `INSERT INTO articles (id, product_id, url, final_lp_url, title, screenshot_r2_key, fv_r2_key, body_text, blocks_json, sb_page_id, sb_version_id, captured_at, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [articleId, productId, a.url, a.finalLpUrl || null, a.title ?? null, a.screenshotKey ?? null, a.fvKey ?? null, a.bodyText ?? null, JSON.stringify(a.blocks), a.sbPageId ?? null, a.sbVersionId ?? input.combination.sbVersionId ?? null, a.screenshotKey || a.bodyText ? now : null, user.id, now, now],
    });
    statements.push(audit("article", articleId, { url: a.url, title: a.title }));
  }

  // 4. Combination (SB combos are unique per Version × creative × media)
  const cb = input.combination;
  if (cb.metricsSource === "sb") {
    const dup = (await client.execute({ sql: "SELECT id FROM combinations WHERE sb_version_id = ? AND sb_creative_id = ? AND media = ? AND deleted_at IS NULL", args: [cb.sbVersionId!, cb.sbCreativeId!, cb.media] })).rows[0];
    if (dup) throw new ApiError("DUPLICATE", "このSquad beyondの組み合わせは登録済みです", [{ field: "combination", reason: "duplicate_sb", existingId: String(dup.id) }]);
  }
  const combinationId = ulid();
  statements.push({
    sql: `INSERT INTO combinations (id, product_id, creative_id, article_id, media, start_date, end_date, origin, metrics_source, sb_version_id, sb_creative_id,
            judge_manual, judge_manual_reason, judge_manual_by, judge_manual_at, target_cpa, generation_version_id, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'own', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      combinationId, productId, creativeId, articleId, cb.media, cb.startDate, cb.endDate || null, cb.metricsSource,
      cb.metricsSource === "sb" ? cb.sbVersionId! : null, cb.metricsSource === "sb" ? cb.sbCreativeId! : null,
      cb.override?.judge ?? null, cb.override?.reason || null, cb.override ? user.id : null, cb.override ? now : null, cb.targetCpa ?? null,
      cb.generationVersionId ?? null, user.id, now, now,
    ],
  });
  statements.push(audit("combination", combinationId, cb));
  if (cb.metricsSource === "manual" && cb.manual) {
    const m = cb.manual;
    statements.push({
      sql: `INSERT INTO manual_metrics (id, combination_id, period_start, period_end, spend, imp, click, pv, cv, mcv, fsver, oar, source, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
      args: [ulid(), combinationId, cb.startDate, cb.endDate || now.slice(0, 10), m.spend, m.imp ?? null, m.click ?? null, m.pv ?? null, m.cv, m.mcv ?? null, m.fsver ?? null, m.oar ?? null, user.id, now],
    });
  }

  // 5. Tags & memos
  const aiSet = new Set(input.tags.aiTagIds);
  for (const tagId of tagIds) {
    const source = aiSet.has(tagId) && !input.tags.tagIds.includes(tagId) ? "ai" : "human";
    statements.push({ sql: "INSERT OR IGNORE INTO creative_tags (creative_id, tag_id, source) VALUES (?, ?, ?)", args: [creativeId, tagId, source] });
    statements.push({ sql: "INSERT OR IGNORE INTO article_tags (article_id, tag_id, source) VALUES (?, ?, ?)", args: [articleId, tagId, source] });
  }
  const isMiss = cb.override?.judge === "miss";
  if (input.tags.winMemo.trim()) {
    statements.push({ sql: "INSERT INTO memos (id, combination_id, kind, body, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", args: [ulid(), combinationId, isMiss ? "miss" : "win", input.tags.winMemo.trim(), user.id, now, now] });
  }
  if (input.tags.nextMemo.trim()) {
    statements.push({ sql: "INSERT INTO memos (id, combination_id, kind, body, created_by, created_at, updated_at) VALUES (?, ?, 'next', ?, ?, ?, ?)", args: [ulid(), combinationId, input.tags.nextMemo.trim(), user.id, now, now] });
  }

  // From a candidate (S-05): mark registered; remember page → product for later category inference.
  if (input.sbCandidateId) {
    statements.push({ sql: "UPDATE sb_candidates SET status = 'registered', combination_id = ?, updated_at = ? WHERE id = ?", args: [combinationId, now, input.sbCandidateId] });
  }
  if (a.sbPageId) {
    statements.push({ sql: "UPDATE sb_pages SET product_id = COALESCE(product_id, ?) WHERE id = ?", args: [productId, a.sbPageId] });
  }
  if (input.draftId) {
    statements.push({ sql: "DELETE FROM drafts WHERE id = ? AND user_id = ?", args: [input.draftId, user.id] });
  }

  await client.batch(statements, "write");

  // Judge and index right away; failures are picked up by J-07 / J-09.
  await recomputeJudgments({ ids: [combinationId], userId: user.id }).catch(logWarn("judge after register"));
  await refreshSearchIndex([combinationId]).catch(logWarn("index after register"));
  return { combinationId };
}

function logWarn(msg: string) {
  return (err: unknown): void => {
    console.error(JSON.stringify({ level: "warn", msg, error: err instanceof Error ? err.message : String(err) }));
  };
}

// --- drafts (auto-saved wizard state) -------------------------------------------

export async function listDrafts(user: CurrentUser): Promise<{ id: string; updatedAt: string; label: string }[]> {
  const res = await getRawClient().execute({ sql: "SELECT id, payload_json, updated_at FROM drafts WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20", args: [user.id] });
  return res.rows.map((r) => {
    const p = JSON.parse(String(r.payload_json)) as { product?: { name?: string }; article?: { title?: string } };
    return { id: String(r.id), updatedAt: String(r.updated_at), label: [p.product?.name, p.article?.title].filter(Boolean).join(" × ") || "（無題の下書き）" };
  });
}

export async function getDraft(user: CurrentUser, id: string): Promise<{ id: string; payload: unknown; sbCandidateId: string | null; updatedAt: string }> {
  const r = (await getRawClient().execute({ sql: "SELECT * FROM drafts WHERE id = ? AND user_id = ?", args: [id, user.id] })).rows[0];
  if (!r) throw notFound("下書き");
  return { id, payload: JSON.parse(String(r.payload_json)), sbCandidateId: r.sb_candidate_id ? String(r.sb_candidate_id) : null, updatedAt: String(r.updated_at) };
}

export async function saveDraft(user: CurrentUser, id: string | null, payload: unknown, sbCandidateId: string | null): Promise<{ id: string; updatedAt: string }> {
  const client = getRawClient();
  const now = new Date().toISOString();
  const draftId = id ?? ulid();
  const json = JSON.stringify(payload);
  if (json.length > 500_000) throw new ApiError("VALIDATION_ERROR", "下書きが大きすぎます");
  await client.execute({
    sql: `INSERT INTO drafts (id, user_id, payload_json, sb_candidate_id, updated_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET payload_json = excluded.payload_json, sb_candidate_id = excluded.sb_candidate_id, updated_at = excluded.updated_at
          WHERE drafts.user_id = excluded.user_id`,
    args: [draftId, user.id, json, sbCandidateId, now],
  });
  return { id: draftId, updatedAt: now };
}

export async function deleteDraft(user: CurrentUser, id: string): Promise<void> {
  await getRawClient().execute({ sql: "DELETE FROM drafts WHERE id = ? AND user_id = ?", args: [id, user.id] });
}

// --- products & pickers ---------------------------------------------------------

export async function searchProducts(q: string): Promise<{ id: string; name: string; clientName: string; categoryId: string; categoryName: string; target: string; priceRange: string | null; usp: string | null; offer: string | null }[]> {
  const res = await getRawClient().execute({
    sql: `SELECT p.*, c.name cname FROM products p JOIN categories c ON c.id = p.category_id
          WHERE p.deleted_at IS NULL AND (p.name LIKE ? OR p.client_name LIKE ?) ORDER BY p.updated_at DESC LIMIT 30`,
    args: [`%${q}%`, `%${q}%`],
  });
  return res.rows.map((r) => ({
    id: String(r.id), name: String(r.name), clientName: String(r.client_name), categoryId: String(r.category_id), categoryName: String(r.cname),
    target: [r.target_gender, r.target_age, r.target_pain].filter(Boolean).join("・"), priceRange: r.price_range ? String(r.price_range) : null, usp: r.usp ? String(r.usp) : null, offer: r.offer ? String(r.offer) : null,
  }));
}

/** "同じクライアントで同名の商材があれば確認" (S-04 step 1) */
export async function findSameProduct(name: string, clientName: string): Promise<string | null> {
  const r = (await getRawClient().execute({ sql: "SELECT id FROM products WHERE deleted_at IS NULL AND name = ? AND client_name = ?", args: [name, clientName] })).rows[0];
  return r ? String(r.id) : null;
}

export async function findArticleByUrl(url: string): Promise<{ id: string; title: string | null } | null> {
  const r = (await getRawClient().execute({ sql: "SELECT id, title FROM articles WHERE url = ? AND deleted_at IS NULL LIMIT 1", args: [url] })).rows[0];
  return r ? { id: String(r.id), title: r.title ? String(r.title) : null } : null;
}

export async function sbPages(): Promise<{ id: string; name: string; folder: string | null }[]> {
  const res = await getRawClient().execute("SELECT id, name, folder FROM sb_pages ORDER BY name");
  return res.rows.map((r) => ({ id: String(r.id), name: String(r.name ?? r.id), folder: r.folder ? String(r.folder) : null }));
}

export async function sbVersions(pageId: string): Promise<{ id: string; name: string; url: string | null; bodyText: string | null }[]> {
  const res = await getRawClient().execute({ sql: "SELECT id, name, url, body_text FROM sb_versions WHERE page_id = ? ORDER BY name", args: [pageId] });
  return res.rows.map((r) => ({ id: String(r.id), name: String(r.name ?? r.id), url: r.url ? String(r.url) : null, bodyText: r.body_text ? String(r.body_text) : null }));
}

export async function sbCreatives(pageId: string): Promise<{ id: string; name: string }[]> {
  const res = await getRawClient().execute({ sql: "SELECT id, name FROM sb_creatives WHERE page_id = ? ORDER BY name", args: [pageId] });
  return res.rows.map((r) => ({ id: String(r.id), name: String(r.name ?? r.id) }));
}
