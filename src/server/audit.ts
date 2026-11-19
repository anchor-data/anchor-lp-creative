import "server-only";
import { ulid } from "ulid";
import { auditLogs } from "./db/schema";
import type { Db } from "./db/client";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "approve"
  | "reject"
  | "export"
  | "judge_override"
  | "judge_change"
  | "setting_change";

export interface AuditEntry {
  userId: string; // 'system' for jobs
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Builds the audit row; pass to the same db.batch() as the change (spec ch.10). */
export function auditInsert(db: Db, entry: AuditEntry) {
  return db.insert(auditLogs).values({
    id: ulid(),
    at: new Date().toISOString(),
    userId: entry.userId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    beforeJson: entry.before === undefined ? null : JSON.stringify(entry.before),
    afterJson: entry.after === undefined ? null : JSON.stringify(entry.after),
  });
}
