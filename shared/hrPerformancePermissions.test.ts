import { describe, expect, it } from "vitest";
import {
  HR_PERF,
  HR_TARGETS,
  effectiveHrPerformancePermissions,
  memberHasHrPerformancePermission,
} from "./hrPerformancePermissions";

describe("memberHasHrPerformancePermission", () => {
  it("grants company_admin everything", () => {
    expect(memberHasHrPerformancePermission({ role: "company_admin", permissions: [] }, HR_PERF.TRAINING_MANAGE)).toBe(
      true
    );
  });

  it("grants hr_admin training.manage via role defaults", () => {
    expect(memberHasHrPerformancePermission({ role: "hr_admin", permissions: [] }, HR_PERF.TRAINING_MANAGE)).toBe(true);
  });

  it("grants hr_admin hr.targets.manage and finance_admin hr.targets.read only", () => {
    expect(memberHasHrPerformancePermission({ role: "hr_admin", permissions: [] }, HR_TARGETS.MANAGE)).toBe(true);
    expect(memberHasHrPerformancePermission({ role: "finance_admin", permissions: [] }, HR_TARGETS.READ)).toBe(true);
    expect(memberHasHrPerformancePermission({ role: "finance_admin", permissions: [] }, HR_TARGETS.MANAGE)).toBe(false);
  });

  it("grants reviewer self_review.review via role defaults", () => {
    expect(memberHasHrPerformancePermission({ role: "reviewer", permissions: [] }, HR_PERF.SELF_REVIEW)).toBe(true);
  });

  it("denies company_member without JSON grants", () => {
    expect(memberHasHrPerformancePermission({ role: "company_member", permissions: [] }, HR_PERF.TRAINING_MANAGE)).toBe(
      false
    );
  });

  it("grants company_member explicit JSON permission", () => {
    expect(
      memberHasHrPerformancePermission(
        { role: "company_member", permissions: [HR_PERF.TRAINING_MANAGE] },
        HR_PERF.TRAINING_MANAGE
      )
    ).toBe(true);
  });

  it("merges role defaults with JSON", () => {
    const eff = effectiveHrPerformancePermissions({
      role: "reviewer",
      permissions: [HR_PERF.TRAINING_MANAGE],
    });
    expect(eff.has(HR_PERF.SELF_REVIEW)).toBe(true);
    expect(eff.has(HR_PERF.TRAINING_MANAGE)).toBe(true);
  });

  it("respects * in JSON", () => {
    expect(memberHasHrPerformancePermission({ role: "company_member", permissions: ["*"] }, HR_PERF.MANAGE)).toBe(true);
  });
});
