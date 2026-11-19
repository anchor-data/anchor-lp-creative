import { describe, expect, it } from "vitest";
import { can, canApprovePlaybook, canDelete, wouldRemoveLastAdmin } from "./permissions";

describe("permissions (spec ch.3)", () => {
  it("viewers can browse and generate but not register", () => {
    expect(can("viewer", "view")).toBe(true);
    expect(can("viewer", "generate")).toBe(true);
    expect(can("viewer", "register")).toBe(false);
    expect(can("viewer", "judge_override")).toBe(false);
  });

  it("editors register, override, review; admin-only settings stay closed", () => {
    expect(can("editor", "register")).toBe(true);
    expect(can("editor", "review_candidates")).toBe(true);
    expect(can("editor", "admin")).toBe(false);
  });

  it("editors delete only their own cases", () => {
    expect(canDelete("editor", "u1", "u1")).toBe(true);
    expect(canDelete("editor", "u1", "u2")).toBe(false);
    expect(canDelete("admin", "u1", "u2")).toBe(true);
    expect(canDelete("viewer", "u1", "u1")).toBe(false);
  });

  it("playbooks are approved by the category owner or an admin", () => {
    expect(canApprovePlaybook("editor", "u1", "u1")).toBe(true);
    expect(canApprovePlaybook("editor", "u1", null)).toBe(false);
    expect(canApprovePlaybook("admin", "u9", null)).toBe(true);
  });

  it("blocks removing the last admin", () => {
    expect(wouldRemoveLastAdmin(1, true, "editor", true)).toBe(true);
    expect(wouldRemoveLastAdmin(1, true, "admin", false)).toBe(true);
    expect(wouldRemoveLastAdmin(2, true, "editor", true)).toBe(false);
    expect(wouldRemoveLastAdmin(1, false, "viewer", true)).toBe(false);
  });
});
