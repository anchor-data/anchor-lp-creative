// 操作権限 (spec ch.3). Enforced on the API side; the UI only uses this to hide entry points.
import type { Role } from "./constants";

export type Action =
  | "view"
  | "generate"
  | "collection"
  | "register"
  | "edit_own"
  | "edit_any"
  | "judge_override"
  | "review_candidates"
  | "delete_own"
  | "delete_any"
  | "admin";

const MATRIX: Record<Action, readonly Role[]> = {
  view: ["viewer", "editor", "admin"],
  generate: ["viewer", "editor", "admin"],
  collection: ["viewer", "editor", "admin"],
  register: ["editor", "admin"],
  edit_own: ["editor", "admin"],
  edit_any: ["editor", "admin"],
  judge_override: ["editor", "admin"],
  review_candidates: ["editor", "admin"],
  delete_own: ["editor", "admin"],
  delete_any: ["admin"],
  admin: ["admin"],
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[action].includes(role);
}

/** Deleting: editors may delete only what they registered; admins anything. */
export function canDelete(role: Role, userId: string, createdBy: string): boolean {
  return can(role, "delete_any") || (can(role, "delete_own") && userId === createdBy);
}

/** Playbook approval: the category owner, or an admin (also covers unowned categories). */
export function canApprovePlaybook(role: Role, userId: string, ownerUserId: string | null): boolean {
  return role === "admin" || (ownerUserId !== null && ownerUserId === userId);
}

/** A role change that would leave zero admins is rejected (422). */
export function wouldRemoveLastAdmin(currentAdmins: number, targetIsAdmin: boolean, nextRole: Role, nextActive: boolean): boolean {
  const losesAdmin = targetIsAdmin && (nextRole !== "admin" || !nextActive);
  return losesAdmin && currentAdmins <= 1;
}
