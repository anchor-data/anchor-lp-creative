import "server-only";
import { ulid } from "ulid";
import { getRawClient } from "../db/client";
import { ApiError, conflict, forbidden, notFound } from "../http";
import type { CurrentUser } from "../auth";
import { can } from "@/lib/domain/permissions";
import { nextManualJudge, type CombinationEdit, type ManualJudgeState } from "@/lib/domain/combination-edit";
import { recomputeJudgments } from "./judging";
import { refreshSearchIndex } from "./embeddings";

// S-03 「編集」: product name / category, article title, media, delivery period, target CPA and the
// judgment of one combination. The product is shared by every case of that product, so its name and
// category change for all of them (and their judgments are recomputed when the category moves).

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** Metrics keyed by media upstream (Squad beyond rows, DPro ads) cannot move to another media. */
const MEDIA_LOCKED_SOURCES = new Set(["sb", "dpro"]);

export async function editCombination(user: CurrentUser, id: string, input: CombinationEdit): Promise<void> {
  const client = getRawClient();
  const row = (await client.execute({
    sql: `SELECT c.*, p.name pname, p.category_id pcat, a.title atitle FROM combinations c
          JOIN products p ON p.id = c.product_id JOIN articles a ON a.id = c.article_id WHERE c.id = ?`,
    args: [id],
  })).rows[0];
  if (!row || row.deleted_at) throw notFound("組み合わせ");
  if (!(can(user.role, "edit_any") || (can(user.role, "edit_own") && String(row.created_by) === user.id))) throw forbidden();
  if (String(row.updated_at) !== input.updatedAt) throw conflict();
  if (MEDIA_LOCKED_SOURCES.has(String(row.metrics_source)) && input.media !== String(row.media)) {
    throw new ApiError("UNPROCESSABLE", "連携データから実績を取っている事例は媒体を変えられません", [{ field: "media", reason: "locked" }]);
  }
  const market = row.origin === "market";
  if (market && input.judge !== "auto") throw new ApiError("UNPROCESSABLE", "市場事例は当たり判定の対象外です", [{ field: "judge", reason: "market" }]);
  const category = (await client.execute({ sql: "SELECT id FROM categories WHERE id = ?", args: [input.categoryId] })).rows[0];
  if (!category) throw new ApiError("VALIDATION_ERROR", "業種カテゴリが見つかりません", [{ field: "categoryId", reason: "not_found" }]);

  const now = new Date().toISOString();
  const current: ManualJudgeState = { judge: (str(row.judge_manual) as ManualJudgeState["judge"]) ?? null, reason: str(row.judge_manual_reason), by: str(row.judge_manual_by), at: str(row.judge_manual_at) };
  const manual = market ? current : nextManualJudge(current, input.judge, input.judgeReason, user.id, now);
  const productId = String(row.product_id);
  const categoryChanged = String(row.pcat) !== input.categoryId;
  const before = {
    productName: str(row.pname), categoryId: str(row.pcat), articleTitle: str(row.atitle), media: str(row.media),
    startDate: str(row.start_date), endDate: str(row.end_date), targetCpa: row.target_cpa === null ? null : Number(row.target_cpa), judgeManual: current.judge,
  };
  const after = {
    productName: input.productName, categoryId: input.categoryId, articleTitle: input.articleTitle || null, media: input.media,
    startDate: input.startDate, endDate: input.endDate, targetCpa: input.targetCpa, judgeManual: manual.judge,
  };

  const tx = await client.transaction("write");
  try {
    const updated = await tx.execute({
      sql: `UPDATE combinations SET media = ?, start_date = ?, end_date = ?, target_cpa = ?,
              judge_manual = ?, judge_manual_reason = ?, judge_manual_by = ?, judge_manual_at = ?, updated_at = ?
            WHERE id = ? AND updated_at = ?`,
      args: [input.media, input.startDate, input.endDate, input.targetCpa, manual.judge, manual.reason, manual.by, manual.at, now, id, input.updatedAt],
    });
    // Someone saved in between: nothing else may change either.
    if (updated.rowsAffected === 0) throw conflict();
    await tx.execute({ sql: "UPDATE products SET name = ?, category_id = ?, updated_at = ? WHERE id = ?", args: [input.productName, input.categoryId, now, productId] });
    await tx.execute({ sql: "UPDATE articles SET title = ?, updated_at = ? WHERE id = ?", args: [after.articleTitle, now, String(row.article_id)] });
    await tx.execute({
      sql: "INSERT INTO audit_logs (id, at, user_id, action, target_type, target_id, before_json, after_json) VALUES (?, ?, ?, 'update', 'combination', ?, ?, ?)",
      args: [ulid(), now, user.id, id, JSON.stringify(before), JSON.stringify(after)],
    });
    await tx.commit();
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  } finally {
    tx.close();
  }

  const affected = categoryChanged
    ? (await client.execute({ sql: "SELECT id FROM combinations WHERE product_id = ? AND deleted_at IS NULL", args: [productId] })).rows.map((r) => String(r.id))
    : [id];
  if (!market) await recomputeJudgments({ ids: affected, userId: user.id });
  await refreshSearchIndex(affected).catch(() => undefined);
}
