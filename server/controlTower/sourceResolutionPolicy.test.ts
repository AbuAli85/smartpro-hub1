/**
 * server/controlTower/sourceResolutionPolicy.test.ts
 *
 * Unit tests for requiresSourceResolution.
 * checkSourceStillActive requires a real DB and is covered by integration tests.
 */

import { describe, it, expect } from "vitest";
import { requiresSourceResolution } from "./sourceResolutionPolicy";

describe("requiresSourceResolution", () => {
  // ── Non-scoped system signals → require source confirmation ─────────────────

  it("payroll draft (non-scoped) requires source resolution", () => {
    expect(requiresSourceResolution("payroll:1:2026:4:draft")).toBe(true);
  });

  it("payroll approved_unpaid (non-scoped) requires source resolution", () => {
    expect(requiresSourceResolution("payroll:1:approved_unpaid")).toBe(true);
  });

  it("payroll not_started (non-scoped) requires source resolution", () => {
    expect(requiresSourceResolution("payroll:1:2026:4:not_started")).toBe(true);
  });

  it("hr leave pending (non-scoped) requires source resolution", () => {
    expect(requiresSourceResolution("hr:1:leave:pending")).toBe(true);
  });

  it("hr employee_requests pending (non-scoped) requires source resolution", () => {
    expect(requiresSourceResolution("hr:1:employee_requests:pending")).toBe(true);
  });

  it("compliance omanization non_compliant requires source resolution", () => {
    expect(requiresSourceResolution("compliance:1:omanization:2026:4:non_compliant")).toBe(true);
  });

  it("compliance renewals failed requires source resolution", () => {
    expect(requiresSourceResolution("compliance:1:renewals:failed")).toBe(true);
  });

  it("compliance work_permits expiring_7d requires source resolution", () => {
    expect(requiresSourceResolution("compliance:1:work_permits:expiring_7d")).toBe(true);
  });

  it("operations sla breach requires source resolution", () => {
    expect(requiresSourceResolution("operations:1:sla:breach")).toBe(true);
  });

  it("operations engagements blocked requires source resolution", () => {
    expect(requiresSourceResolution("operations:1:engagements:blocked")).toBe(true);
  });

  it("finance invoices overdue requires source resolution", () => {
    expect(requiresSourceResolution("finance:1:invoices:overdue")).toBe(true);
  });

  it("documents company expiring_30d requires source resolution", () => {
    expect(requiresSourceResolution("documents:1:company:expiring_30d")).toBe(true);
  });

  it("contracts pending_signature requires source resolution", () => {
    expect(requiresSourceResolution("contracts:1:pending_signature")).toBe(true);
  });

  it("contracts expiring_30d requires source resolution", () => {
    expect(requiresSourceResolution("contracts:1:expiring_30d")).toBe(true);
  });

  // ── Scoped signals → exempt (re-emergence handles stale suppression) ─────────

  it("hr leave pending SCOPED is exempt from source resolution", () => {
    expect(requiresSourceResolution("hr:1:leave:pending:scoped:3")).toBe(false);
  });

  it("hr employee_requests pending SCOPED is exempt", () => {
    expect(requiresSourceResolution("hr:1:employee_requests:pending:scoped:5")).toBe(false);
  });

  it("operations tasks overdue SCOPED is exempt", () => {
    expect(requiresSourceResolution("operations:1:tasks:overdue:scoped")).toBe(false);
  });

  it("documents employee expiring_7d SCOPED is exempt", () => {
    expect(requiresSourceResolution("documents:1:employee:expiring_7d:scoped")).toBe(false);
  });

  // ── Unknown/manual domains → no source check (don't block unexpectedly) ─────

  it("unknown domain returns false", () => {
    expect(requiresSourceResolution("manual:1:custom:item")).toBe(false);
  });

  it("empty key returns false", () => {
    expect(requiresSourceResolution("")).toBe(false);
  });

  // ── Company ID embeds correctly (different companies are independent) ────────

  it("same signal type for different companies are independent keys", () => {
    const keyA = "payroll:1:2026:4:draft";
    const keyB = "payroll:2:2026:4:draft";
    expect(requiresSourceResolution(keyA)).toBe(true);
    expect(requiresSourceResolution(keyB)).toBe(true);
    expect(keyA).not.toBe(keyB);
  });
});
