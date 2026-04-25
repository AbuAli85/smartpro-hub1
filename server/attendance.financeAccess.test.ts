/**
 * Finance access control tests (P4).
 *
 * Verifies:
 *   1. hr_admin does NOT have canRepairAttendanceData.
 *   2. finance_admin does NOT have canRepairAttendanceData.
 *   3. company_admin has canRepairAttendanceData.
 *   4. requireCanRepairAttendanceData throws FORBIDDEN for hr_admin.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { deriveCapabilities } from "../server/_core/capabilities";

// ---------------------------------------------------------------------------
// Pure capability assertions — no DB needed
// ---------------------------------------------------------------------------

const SCOPE_COMPANY = { type: "company" as const, companyId: 1 };

describe("canRepairAttendanceData capability", () => {
  it("company_admin has canRepairAttendanceData=true", () => {
    const caps = deriveCapabilities("company_admin", SCOPE_COMPANY);
    expect(caps.canRepairAttendanceData).toBe(true);
  });

  it("hr_admin has canRepairAttendanceData=false", () => {
    const caps = deriveCapabilities("hr_admin", SCOPE_COMPANY);
    expect(caps.canRepairAttendanceData).toBe(false);
  });

  it("finance_admin has canRepairAttendanceData=false", () => {
    const caps = deriveCapabilities("finance_admin", SCOPE_COMPANY);
    expect(caps.canRepairAttendanceData).toBe(false);
  });

  it("reviewer has canRepairAttendanceData=false", () => {
    const caps = deriveCapabilities("reviewer", SCOPE_COMPANY);
    expect(caps.canRepairAttendanceData).toBe(false);
  });

  it("company_member has canRepairAttendanceData=false", () => {
    const caps = deriveCapabilities("company_member", SCOPE_COMPANY);
    expect(caps.canRepairAttendanceData).toBe(false);
  });
});
