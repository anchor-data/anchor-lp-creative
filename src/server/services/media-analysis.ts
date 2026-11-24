import "server-only";
import { ulid } from "ulid";
import type { InStatement } from "@libsql/client";
import { getRawClient } from "../db/client";
import { ApiError, notFound } from "../http";
import type { CurrentUser } from "../auth";
import { getSquadBeyondClient } from "../integrations/squad-beyond";
import { ensureVersionContent } from "../sb-sync";
import { decomposeArticle } from "./ai";
import { captureArticle } from "./files";
import { refreshSearchIndex } from "./embeddings";
import { ARTICLE_BLOCK_TYPES } from "@/lib/domain/constants";
import { parseLpPreview, type LpPreview } from "@/lib/domain/lp-preview";
import type { VideoAnalysis } from "@/lib/domain/video-analysis";

// Saving analyses on already-registered creatives and articles (detail page).

function audit(user: CurrentUser, targetType: string, targetId: string, after: unknown, now: string): InStatement {
  return {
    sql: "INSERT INTO audit_logs (id, at, user_id, action, target_type, target_id, after_json) VALUES (?, ?, ?, 'update', ?, ?, ?)",
    args: [ulid(), now, user.id, targetType, targetId, JSON.stringify(after)],
  };
}

function logWarn(msg: string) {
  return (err: unknown): void => {
    console.error(JSON.stringify({ level: "warn", msg, error: err instanceof Error ? err.message : String(err) }));
  };
}

async function reindex(column: "creative_id" | "article_id", id: string): Promise<void> {
  const res = await getRawClient().execute({ sql: `SELECT id FROM combinations WHERE ${column} = ? AND deleted_at IS NULL`, args: [id] });
  const ids = res.rows.map((r) => String(r.id));
  if (ids.length) await refreshSearchIndex(ids).catch(logWarn("reindex after analysis"));
}

export interface SaveCreativeAnalysisInput {
  analysis: VideoAnalysis;
  applyScript: boolean;
  thumbnailKey?: string;
  width?: number;
  height?: number;
}

/** Stores the analysis; optional script replacement, and size/length/thumbnail only where they were unknown. */
export async function saveCreativeAnalysis(user: CurrentUser, creativeId: string, input: SaveCreativeAnalysisInput): Promise<void> {
  const client = getRawClient();
  const row = (await client.execute({ sql: "SELECT id, kind FROM creatives WHERE id = ? AND deleted_at IS NULL", args: [creativeId] })).rows[0];
  if (!row) throw notFound("クリエイティブ");
  if (row.kind !== "video") throw new ApiError("VALIDATION_ERROR", "動画のクリエイティブだけ解析できます");
  if (input.thumbnailKey && !/^screenshot\/\d{4}-\d{2}\/[0-9A-Z]{26}\.jpg$/.test(input.thumbnailKey)) throw new ApiError("VALIDATION_ERROR", "サムネイルが正しくありません");
  const now = new Date().toISOString();
  const a = input.analysis;
  const script = a.scenes.map((s) => ({ from: s.from, to: s.to, visual: s.visual, telop: s.telop, narration: s.narration }));
  await client.batch([
    {
      sql: `UPDATE creatives SET analysis_json = ?,
              script_json = CASE WHEN ? THEN ? ELSE script_json END,
              duration_sec = COALESCE(duration_sec, ?), width = COALESCE(width, ?), height = COALESCE(height, ?),
              thumbnail_r2_key = COALESCE(thumbnail_r2_key, ?), updated_at = ?
            WHERE id = ?`,
      args: [JSON.stringify(a), input.applyScript ? 1 : 0, JSON.stringify(script), a.durationSec, input.width ?? null, input.height ?? null, input.thumbnailKey ?? null, now, creativeId],
    },
    audit(user, "creative", creativeId, { analysis: { analyzedAt: a.analyzedAt, scenes: a.scenes.length, transcriptSource: a.transcriptSource }, applyScript: input.applyScript }, now),
  ], "write");
  await reindex("creative_id", creativeId);
}

export interface ArticleAnalysisResult {
  blocks: { type: string; heading: string; summary: string }[];
  preview: LpPreview | null;
}

/** Text + preview from Squad beyond (linked Version) or the LP URL, reusing what is stored. */
async function articleSource(row: Record<string, unknown>): Promise<{ text: string | null; preview: LpPreview | null }> {
  const storedText = row.body_text ? String(row.body_text) : null;
  const storedPreview = parseLpPreview(row.preview_json);
  if (storedText && storedPreview) return { text: storedText, preview: storedPreview };
  if (row.sb_version_id) {
    const content = await ensureVersionContent(getSquadBeyondClient(), String(row.sb_version_id)).catch(logWarn("sb version content"));
    if (content) return { text: storedText ?? content.text, preview: storedPreview ?? content.preview };
  }
  try {
    const captured = await captureArticle(String(row.url));
    return { text: storedText ?? captured.bodyText, preview: storedPreview ?? captured.preview };
  } catch (err) {
    if (storedText) return { text: storedText, preview: storedPreview };
    throw err;
  }
}

/** LP analysis: makes sure body text and preview exist, then decomposes the body into blocks. */
export async function analyzeArticle(user: CurrentUser, articleId: string): Promise<ArticleAnalysisResult> {
  const client = getRawClient();
  const row = (await client.execute({ sql: "SELECT id, url, body_text, preview_json, sb_version_id FROM articles WHERE id = ? AND deleted_at IS NULL", args: [articleId] })).rows[0];
  if (!row) throw notFound("記事LP");
  const { text, preview } = await articleSource(row);
  if (!text?.trim()) throw new ApiError("UNPROCESSABLE", "記事LPの本文を取得できませんでした。登録時に本文を貼り付けてください");
  const blocks = await decomposeArticle(text, ARTICLE_BLOCK_TYPES);
  const now = new Date().toISOString();
  await client.batch([
    {
      sql: "UPDATE articles SET blocks_json = ?, body_text = COALESCE(body_text, ?), preview_json = COALESCE(?, preview_json), captured_at = COALESCE(captured_at, ?), updated_at = ? WHERE id = ?",
      args: [JSON.stringify(blocks), text, preview ? JSON.stringify(preview) : null, now, now, articleId],
    },
    audit(user, "article", articleId, { blocks: blocks.length, preview: Boolean(preview) }, now),
  ], "write");
  await reindex("article_id", articleId);
  return { blocks, preview };
}
