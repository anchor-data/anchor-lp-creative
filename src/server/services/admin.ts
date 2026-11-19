import "server-only";
import type { InStatement, InValue } from "@libsql/client";
import { ulid } from "ulid";
import { z } from "zod";
import { getRawClient } from "../db/client";
import { ApiError, notFound } from "../http";
import type { CurrentUser } from "../auth";
import { METRIC_KEYS, type JudgeRule } from "@/lib/domain/judge";
import { DEFAULT_REC_WEIGHTS, type RecWeights } from "@/lib/domain/recommend";
import { wouldRemoveLastAdmin } from "@/lib/domain/permissions";
import { loadCriteria, previewCriteriaChange, recomputeJudgments, type CategoryCriteria } from "./judging";

const now = (): string => new Date().toISOString();
const auditStmt = (userId: string, action: string, targetType: string, targetId: string | null, before: unknown, after: unknown): InStatement => ({
  sql: "INSERT INTO audit_logs (id, at, user_id, action, target_type, target_id, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  args: [ulid(), now(), userId, action, targetType, targetId, before === undefined ? null : JSON.stringify(before), after === undefined ? null : JSON.stringify(after)],
});

// --- A-01 categories --------------------------------------------------------------

export interface AdminCategory {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  isActive: boolean;
  ownerUserId: string | null;
  ownerName: string | null;
  caseCount: number;
}

export async function listCategoriesAdmin(): Promise<AdminCategory[]> {
  const res = await getRawClient().execute(`
    SELECT c.*, u.name owner_name,
      (SELECT COUNT(*) FROM combinations cb JOIN products p ON p.id = cb.product_id WHERE p.category_id = c.id AND cb.deleted_at IS NULL) n
    FROM categories c LEFT JOIN users u ON u.id = c.owner_user_id ORDER BY c.sort_order, c.name`);
  return res.rows.map((r) => ({
    id: String(r.id), parentId: r.parent_id ? String(r.parent_id) : null, name: String(r.name), sortOrder: Number(r.sort_order),
    isActive: Number(r.is_active) === 1, ownerUserId: r.owner_user_id ? String(r.owner_user_id) : null, ownerName: r.owner_name ? String(r.owner_name) : null, caseCount: Number(r.n),
  }));
}

export const categoryCreateSchema = z.object({ name: z.string().trim().min(1, "名称を入力してください").max(50), parentId: z.string().nullable().default(null) });
export const categoryPatchSchema = z.object({ name: z.string().trim().min(1).max(50).optional(), sortOrder: z.number().int().optional(), isActive: z.boolean().optional(), ownerUserId: z.string().nullable().optional() });

export async function createCategory(user: CurrentUser, input: z.infer<typeof categoryCreateSchema>): Promise<string> {
  const client = getRawClient();
  const id = ulid();
  const t = now();
  const statements: InStatement[] = [
    { sql: "INSERT INTO categories (id, parent_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories WHERE parent_id IS ?), ?, ?)", args: [id, input.parentId, input.name, input.parentId, t, t] },
    auditStmt(user.id, "create", "category", id, undefined, input),
  ];
  // New sub-categories start from the default criteria (spec ch.12: set criteria together).
  if (input.parentId) {
    const def = (await client.execute("SELECT value_json FROM settings WHERE key = 'default_judge_rules'")).rows[0];
    const rules = def ? (JSON.parse(String(def.value_json)) as { rules: JudgeRule[] }).rules : [];
    for (const r of rules) {
      statements.push({ sql: "INSERT INTO judge_rules (category_id, metric, enabled, direction, hit_value, fair_value, early_value, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", args: [id, r.metric, r.enabled ? 1 : 0, r.direction, r.hit, r.fair, r.early, user.id, t] });
    }
    statements.push({ sql: "INSERT INTO judge_settings (category_id, updated_by, updated_at) VALUES (?, ?, ?)", args: [id, user.id, t] });
  }
  try {
    await client.batch(statements, "write");
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError("DUPLICATE", "同じ名前のカテゴリがあります");
    throw err;
  }
  return id;
}

export async function patchCategory(user: CurrentUser, id: string, patch: z.infer<typeof categoryPatchSchema>): Promise<void> {
  const client = getRawClient();
  const row = (await client.execute({ sql: "SELECT * FROM categories WHERE id = ?", args: [id] })).rows[0];
  if (!row) throw notFound("カテゴリ");
  const sets: string[] = [];
  const args: InValue[] = [];
  if (patch.name !== undefined) { sets.push("name = ?"); args.push(patch.name); }
  if (patch.sortOrder !== undefined) { sets.push("sort_order = ?"); args.push(patch.sortOrder); }
  if (patch.isActive !== undefined) { sets.push("is_active = ?"); args.push(patch.isActive ? 1 : 0); }
  if (patch.ownerUserId !== undefined) {
    if (patch.ownerUserId) {
      const u = (await client.execute({ sql: "SELECT role FROM users WHERE id = ? AND is_active = 1", args: [patch.ownerUserId] })).rows[0];
      if (!u || u.role === "viewer") throw new ApiError("UNPROCESSABLE", "カテゴリ担当は登録者以上から選んでください");
    }
    sets.push("owner_user_id = ?");
    args.push(patch.ownerUserId);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  args.push(now());
  await client.batch([{ sql: `UPDATE categories SET ${sets.join(", ")} WHERE id = ?`, args: [...args, id] }, auditStmt(user.id, "setting_change", "category", id, row, patch)], "write");
}

// --- A-01 judge rules -------------------------------------------------------------

const ruleSchema = z.object({
  metric: z.enum(METRIC_KEYS as unknown as ["spend", "cpa", "mcvr", "cv", "fsver", "oar"]),
  enabled: z.boolean(),
  direction: z.enum(["gte", "lte"]),
  hit: z.number().nullable(),
  fair: z.number().nullable(),
  early: z.number().nullable(),
});
export const criteriaSchema = z.object({
  rules: z.array(ruleSchema).length(6),
  settings: z.object({
    windowType: z.enum(["cumulative", "last_n_days"]),
    windowDays: z.number().int().min(1).max(365).nullable(),
    minDays: z.number().int().min(0).max(365),
    minSpend: z.number().int().min(0),
    earlyDays: z.number().int().min(0).max(365),
  }).refine((s) => s.windowType !== "last_n_days" || s.windowDays, { message: "直近N日の日数を入力してください", path: ["windowDays"] }),
});

export async function getCriteria(categoryId: string): Promise<CategoryCriteria> {
  return loadCriteria(categoryId);
}

export async function previewCriteria(categoryId: string, input: z.infer<typeof criteriaSchema>) {
  return previewCriteriaChange(categoryId, { ...input, updatedAt: now() });
}

/** Saves criteria then re-judges only that category (spec ch.8 「基準の変更」). */
export async function saveCriteria(user: CurrentUser, categoryId: string, input: z.infer<typeof criteriaSchema>): Promise<{ total: number; changed: number }> {
  const before = await loadCriteria(categoryId);
  const t = now();
  const statements: InStatement[] = input.rules.map((r) => ({
    sql: `INSERT INTO judge_rules (category_id, metric, enabled, direction, hit_value, fair_value, early_value, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (category_id, metric) DO UPDATE SET enabled = excluded.enabled, direction = excluded.direction, hit_value = excluded.hit_value,
          fair_value = excluded.fair_value, early_value = excluded.early_value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    args: [categoryId, r.metric, r.enabled ? 1 : 0, r.direction, r.hit, r.fair, r.early, user.id, t],
  }));
  statements.push({
    sql: `INSERT INTO judge_settings (category_id, window_type, window_days, min_days, min_spend, early_days, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (category_id) DO UPDATE SET window_type = excluded.window_type, window_days = excluded.window_days, min_days = excluded.min_days,
          min_spend = excluded.min_spend, early_days = excluded.early_days, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    args: [categoryId, input.settings.windowType, input.settings.windowDays, input.settings.minDays, input.settings.minSpend, input.settings.earlyDays, user.id, t],
  });
  statements.push(auditStmt(user.id, "setting_change", "judge_rules", categoryId, before, input));
  await getRawClient().batch(statements, "write");
  return recomputeJudgments({ categoryId, userId: user.id });
}

// --- A-02 tags --------------------------------------------------------------------

export async function listTags(): Promise<{ types: { id: string; code: string; name: string; required: boolean }[]; tags: { id: string; typeId: string; name: string; isActive: boolean; usage: number }[] }> {
  const client = getRawClient();
  const [types, tags] = await Promise.all([
    client.execute("SELECT * FROM tag_types ORDER BY sort_order"),
    client.execute("SELECT t.*, (SELECT COUNT(*) FROM creative_tags WHERE tag_id = t.id) + (SELECT COUNT(*) FROM article_tags WHERE tag_id = t.id) usage FROM tags t WHERE t.merged_into_id IS NULL ORDER BY t.sort_order, t.name"),
  ]);
  return {
    types: types.rows.map((r) => ({ id: String(r.id), code: String(r.code), name: String(r.name), required: Number(r.required) === 1 })),
    tags: tags.rows.map((r) => ({ id: String(r.id), typeId: String(r.tag_type_id), name: String(r.name), isActive: Number(r.is_active) === 1, usage: Number(r.usage) })),
  };
}

export const tagCreateSchema = z.object({ typeId: z.string().min(1), name: z.string().trim().min(1, "タグ名を入力してください").max(50) });
export const tagPatchSchema = z.object({ name: z.string().trim().min(1).max(50).optional(), isActive: z.boolean().optional() });

export async function createTag(user: CurrentUser, input: z.infer<typeof tagCreateSchema>): Promise<string> {
  const id = ulid();
  try {
    await getRawClient().batch([
      { sql: "INSERT INTO tags (id, tag_type_id, name, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tags WHERE tag_type_id = ?))", args: [id, input.typeId, input.name, input.typeId] },
      auditStmt(user.id, "setting_change", "tag", id, undefined, input),
    ], "write");
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError("DUPLICATE", "同じ名前のタグがあります");
    throw err;
  }
  return id;
}

export async function patchTag(user: CurrentUser, id: string, patch: z.infer<typeof tagPatchSchema>): Promise<void> {
  const client = getRawClient();
  const row = (await client.execute({ sql: "SELECT * FROM tags WHERE id = ?", args: [id] })).rows[0];
  if (!row) throw notFound("タグ");
  const sets: string[] = [];
  const args: InValue[] = [];
  if (patch.name !== undefined) { sets.push("name = ?"); args.push(patch.name); }
  if (patch.isActive !== undefined) { sets.push("is_active = ?"); args.push(patch.isActive ? 1 : 0); }
  if (sets.length === 0) return;
  await client.batch([{ sql: `UPDATE tags SET ${sets.join(", ")} WHERE id = ?`, args: [...args, id] }, auditStmt(user.id, "setting_change", "tag", id, row, patch)], "write");
}

/** Merging moves every tagged case to the target tag (spec A-02). */
export async function mergeTag(user: CurrentUser, id: string, intoId: string): Promise<void> {
  if (id === intoId) throw new ApiError("VALIDATION_ERROR", "同じタグには統合できません");
  const client = getRawClient();
  const rows = await client.execute({ sql: "SELECT id, tag_type_id FROM tags WHERE id IN (?, ?)", args: [id, intoId] });
  if (rows.rows.length !== 2) throw notFound("タグ");
  if (rows.rows[0].tag_type_id !== rows.rows[1].tag_type_id) throw new ApiError("UNPROCESSABLE", "種類が違うタグは統合できません");
  await client.batch([
    { sql: "INSERT OR IGNORE INTO creative_tags (creative_id, tag_id, source) SELECT creative_id, ?, source FROM creative_tags WHERE tag_id = ?", args: [intoId, id] },
    { sql: "DELETE FROM creative_tags WHERE tag_id = ?", args: [id] },
    { sql: "INSERT OR IGNORE INTO article_tags (article_id, tag_id, source) SELECT article_id, ?, source FROM article_tags WHERE tag_id = ?", args: [intoId, id] },
    { sql: "DELETE FROM article_tags WHERE tag_id = ?", args: [id] },
    { sql: "UPDATE tags SET merged_into_id = ?, is_active = 0 WHERE id = ?", args: [intoId, id] },
    auditStmt(user.id, "setting_change", "tag_merge", id, undefined, { into: intoId }),
  ], "write");
}

// --- A-05 users -------------------------------------------------------------------

export async function listUsers(): Promise<{ id: string; email: string; name: string; role: string; isActive: boolean; lastSeenAt: string | null }[]> {
  const res = await getRawClient().execute("SELECT * FROM users ORDER BY is_active DESC, role, email");
  return res.rows.map((r) => ({ id: String(r.id), email: String(r.email), name: String(r.name), role: String(r.role), isActive: Number(r.is_active) === 1, lastSeenAt: r.last_seen_at ? String(r.last_seen_at) : null }));
}

export const userPatchSchema = z.object({ role: z.enum(["viewer", "editor", "admin"]).optional(), isActive: z.boolean().optional(), name: z.string().trim().min(1).max(50).optional() });

export async function patchUser(user: CurrentUser, id: string, patch: z.infer<typeof userPatchSchema>): Promise<void> {
  const client = getRawClient();
  const row = (await client.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [id] })).rows[0];
  if (!row) throw notFound("ユーザー");
  const admins = Number((await client.execute("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND is_active = 1")).rows[0].n);
  const nextRole = (patch.role ?? row.role) as "viewer" | "editor" | "admin";
  const nextActive = patch.isActive ?? Number(row.is_active) === 1;
  if (wouldRemoveLastAdmin(admins, row.role === "admin" && Number(row.is_active) === 1, nextRole, nextActive)) {
    throw new ApiError("UNPROCESSABLE", "管理者が0人になる変更はできません");
  }
  const sets: string[] = ["updated_at = ?"];
  const args: InValue[] = [now()];
  if (patch.role) { sets.push("role = ?"); args.push(patch.role); }
  if (patch.isActive !== undefined) { sets.push("is_active = ?"); args.push(patch.isActive ? 1 : 0); }
  if (patch.name) { sets.push("name = ?"); args.push(patch.name); }
  await client.batch([{ sql: `UPDATE users SET ${sets.join(", ")} WHERE id = ?`, args: [...args, id] }, auditStmt(user.id, "setting_change", "user", id, { role: row.role, isActive: row.is_active }, patch)], "write");
}

// --- A-06 integrations & jobs -----------------------------------------------------

export async function integrationStatus(): Promise<{
  sb: { configured: boolean; keyExpiresOn: string | null; daysLeft: number | null; usageToday: number; lastHealth: { status: string; at: string; error: string | null } | null };
  dpro: { configured: boolean; usageToday: number };
}> {
  const client = getRawClient();
  const today = now().slice(0, 10);
  const [expiry, sbUsage, dproUsage, health] = await Promise.all([
    client.execute("SELECT value_json FROM settings WHERE key = 'sb_key_expiry'"),
    client.execute({ sql: "SELECT SUM(count) n FROM api_usage WHERE provider = 'squadbeyond' AND date = ?", args: [today] }),
    client.execute({ sql: "SELECT SUM(count) n FROM api_usage WHERE provider = 'dpro' AND date = ?", args: [today] }),
    client.execute("SELECT status, started_at, error FROM job_runs WHERE job = 'J-01' ORDER BY started_at DESC LIMIT 1"),
  ]);
  const expiresOn = expiry.rows[0] ? (JSON.parse(String(expiry.rows[0].value_json)) as { expiresOn?: string }).expiresOn ?? null : null;
  const { getEnv } = await import("../env");
  const env = getEnv();
  return {
    sb: {
      configured: Boolean(env.SQUAD_BEYOND_API_KEY && env.SQUAD_BEYOND_BASE_URL),
      keyExpiresOn: expiresOn,
      daysLeft: expiresOn ? Math.ceil((Date.parse(expiresOn) - Date.now()) / 86_400_000) : null,
      usageToday: Number(sbUsage.rows[0]?.n ?? 0),
      lastHealth: health.rows[0] ? { status: String(health.rows[0].status), at: String(health.rows[0].started_at), error: health.rows[0].error ? String(health.rows[0].error) : null } : null,
    },
    dpro: { configured: false, usageToday: Number(dproUsage.rows[0]?.n ?? 0) },
  };
}

export async function setKeyExpiry(user: CurrentUser, provider: "squadbeyond" | "dpro", expiresOn: string): Promise<void> {
  const key = provider === "squadbeyond" ? "sb_key_expiry" : "dpro_key_expiry";
  await getRawClient().batch([
    { sql: "INSERT INTO settings (key, value_json, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at", args: [key, JSON.stringify({ expiresOn }), user.id, now()] },
    auditStmt(user.id, "setting_change", "settings", key, undefined, { expiresOn }),
  ], "write");
}

export async function listJobRuns(limit = 100): Promise<{ id: string; job: string; targetDate: string | null; status: string; items: number | null; error: string | null; startedAt: string; finishedAt: string | null }[]> {
  const res = await getRawClient().execute({ sql: "SELECT * FROM job_runs ORDER BY started_at DESC LIMIT ?", args: [limit] });
  return res.rows.map((r) => ({ id: String(r.id), job: String(r.job), targetDate: r.target_date ? String(r.target_date) : null, status: String(r.status), items: r.items === null ? null : Number(r.items), error: r.error ? String(r.error) : null, startedAt: String(r.started_at), finishedAt: r.finished_at ? String(r.finished_at) : null }));
}

// --- A-07 recommendation weights --------------------------------------------------

export const weightsSchema = z.object({ sim: z.number().min(0).max(5), judge: z.number().min(0).max(5), recency: z.number().min(0).max(5), origin: z.number().min(0).max(5), cat: z.number().min(0).max(5) });

export async function getWeights(): Promise<RecWeights> {
  const r = (await getRawClient().execute("SELECT value_json FROM settings WHERE key = 'rec_weights'")).rows[0];
  return r ? { ...DEFAULT_REC_WEIGHTS, ...JSON.parse(String(r.value_json)) } : DEFAULT_REC_WEIGHTS;
}

export async function saveWeights(user: CurrentUser, w: RecWeights): Promise<void> {
  const before = await getWeights();
  await getRawClient().batch([
    { sql: "INSERT INTO settings (key, value_json, updated_by, updated_at) VALUES ('rec_weights', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at", args: [JSON.stringify(w), user.id, now()] },
    auditStmt(user.id, "setting_change", "settings", "rec_weights", before, w),
  ], "write");
}

// --- A-08 audit logs --------------------------------------------------------------

export const auditQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  userId: z.string().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(200),
});

export async function listAuditLogs(q: z.infer<typeof auditQuerySchema>): Promise<{ id: string; at: string; user: string; action: string; targetType: string; targetId: string | null; before: string | null; after: string | null }[]> {
  const clauses: string[] = [];
  const args: InValue[] = [];
  if (q.from) { clauses.push("a.at >= ?"); args.push(`${q.from}T00:00:00`); }
  if (q.to) { clauses.push("a.at <= ?"); args.push(`${q.to}T23:59:59`); }
  if (q.userId) { clauses.push("a.user_id = ?"); args.push(q.userId); }
  if (q.action) { clauses.push("a.action = ?"); args.push(q.action); }
  if (q.targetType) { clauses.push("a.target_type = ?"); args.push(q.targetType); }
  const res = await getRawClient().execute({
    sql: `SELECT a.*, COALESCE(u.name, a.user_id) uname FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
          ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY a.at DESC LIMIT ?`,
    args: [...args, q.limit],
  });
  return res.rows.map((r) => ({ id: String(r.id), at: String(r.at), user: String(r.uname ?? "—"), action: String(r.action), targetType: String(r.target_type), targetId: r.target_id ? String(r.target_id) : null, before: r.before_json ? String(r.before_json) : null, after: r.after_json ? String(r.after_json) : null }));
}

export function toCsv(rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    // Neutralise spreadsheet formula injection
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
