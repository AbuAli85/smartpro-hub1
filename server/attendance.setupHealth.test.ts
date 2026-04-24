/**
 * Unit tests for resolveEmployeeSetupHealthDetails (getSetupHealth detail lists).
 *
 * The pure function is extracted and exported from attendance.ts so tests can
 * run without any DB mocking.  The tRPC procedure wraps it with DB queries —
 * those are integration-level and not repeated here.
 */

import { describe, it, expect } from "vitest";
import {
  resolveEmployeeSetupHealthDetails,
  type SetupHealthEmployee,
  type SetupHealthScheduleRow,
} from "./routers/attendance";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function emp(
  id: number,
  userId: number | null = null,
  opts: Partial<SetupHealthEmployee> = {},
): SetupHealthEmployee {
  return {
    id,
    userId,
    firstName: `First${id}`,
    lastName: `Last${id}`,
    email: opts.email ?? `emp${id}@example.com`,
    department: opts.department ?? null,
  };
}

function sched(
  id: number,
  employeeUserId: number,
  shiftTemplateId = 10,
  siteId = 20,
  workingDays = "0,1,2,3,4,5,6", // every day
): SetupHealthScheduleRow {
  return { id, employeeUserId, shiftTemplateId, siteId, workingDays };
}

// dow 0 = Sunday; any working-days string that includes the test day
const TEST_DOW = 1; // Monday
const VALID_SHIFTS = new Set([10, 11]);
const ACTIVE_SITES = new Set([20, 21]);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("resolveEmployeeSetupHealthDetails", () => {
  // ── 1. employeesWithoutScheduleToday ───────────────────────────────────────

  it("returns employee in withoutScheduleToday when no schedule matches today DOW", () => {
    const employees = [emp(1)];
    // Schedule covers Saturday (6) only — not TEST_DOW (Monday=1)
    const schedules = [sched(100, 1, 10, 20, "6")];

    const result = resolveEmployeeSetupHealthDetails(
      employees,
      schedules,
      VALID_SHIFTS,
      ACTIVE_SITES,
      TEST_DOW,
    );

    expect(result.employeesWithoutScheduleToday).toHaveLength(1);
    expect(result.employeesWithoutScheduleToday[0]).toMatchObject({
      employeeId: 1,
      suggestedAction: "assign_schedule",
    });
  });

  it("returns employee in withoutScheduleToday when no schedules at all", () => {
    const employees = [emp(2)];

    const result = resolveEmployeeSetupHealthDetails(employees, [], VALID_SHIFTS, ACTIVE_SITES, TEST_DOW);

    expect(result.employeesWithoutScheduleToday).toHaveLength(1);
    expect(result.employeesWithoutScheduleToday[0].employeeId).toBe(2);
  });

  it("does not flag employee that has a matching schedule", () => {
    const employees = [emp(3)];
    const schedules = [sched(101, 3)]; // all days, valid shift + site

    const result = resolveEmployeeSetupHealthDetails(
      employees,
      schedules,
      VALID_SHIFTS,
      ACTIVE_SITES,
      TEST_DOW,
    );

    expect(result.employeesWithoutScheduleToday).toHaveLength(0);
  });

  // ── 2. employeesWithScheduleConflicts ──────────────────────────────────────

  it("returns employee in withScheduleConflicts when two schedules match today DOW", () => {
    const employees = [emp(4)];
    const schedules = [
      sched(102, 4, 10, 20),
      sched(103, 4, 11, 21),
    ];

    const result = resolveEmployeeSetupHealthDetails(
      employees,
      schedules,
      VALID_SHIFTS,
      ACTIVE_SITES,
      TEST_DOW,
    );

    expect(result.employeesWithScheduleConflicts).toHaveLength(1);
    expect(result.employeesWithScheduleConflicts[0]).toMatchObject({
      employeeId: 4,
      scheduleCount: 2,
      suggestedAction: "review_schedules",
    });
    // Should NOT appear in withoutSchedule
    expect(result.employeesWithoutScheduleToday).toHaveLength(0);
  });

  it("counts three conflicting schedules correctly", () => {
    const employees = [emp(5)];
    const schedules = [
      sched(104, 5, 10, 20),
      sched(105, 5, 11, 21),
      sched(106, 5, 10, 20),
    ];

    const result = resolveEmployeeSetupHealthDetails(
      employees,
      schedules,
      VALID_SHIFTS,
      ACTIVE_SITES,
      TEST_DOW,
    );

    expect(result.employeesWithScheduleConflicts[0].scheduleCount).toBe(3);
  });

  // ── 3. employeesWithMissingShift ───────────────────────────────────────────

  it("returns employee in withMissingShift when shift template is not in validShiftIds", () => {
    const employees = [emp(6)];
    const schedules = [sched(107, 6, 99, 20)]; // shiftTemplateId=99 not in VALID_SHIFTS

    const result = resolveEmployeeSetupHealthDetails(
      employees,
      schedules,
      VALID_SHIFTS, // does not contain 99
      ACTIVE_SITES,
      TEST_DOW,
    );

    expect(result.employeesWithMissingShift).toHaveLength(1);
    expect(result.employeesWithMissingShift[0]).toMatchObject({
      employeeId: 6,
      scheduleId: 107,
      suggestedAction: "fix_shift_template",
    });
  });

  // ── 4. employeesWithMissingSite ────────────────────────────────────────────

  it("returns employee in withMissingSite when site is not active", () => {
    const employees = [emp(7)];
    const schedules = [sched(108, 7, 10, 99)]; // siteId=99 not in ACTIVE_SITES

    const result = resolveEmployeeSetupHealthDetails(
      employees,
      schedules,
      VALID_SHIFTS,
      ACTIVE_SITES, // does not contain 99
      TEST_DOW,
    );

    expect(result.employeesWithMissingSite).toHaveLength(1);
    expect(result.employeesWithMissingSite[0]).toMatchObject({
      employeeId: 7,
      scheduleId: 108,
      suggestedAction: "fix_attendance_site",
    });
  });

  it("prioritises missing shift over missing site when both are broken", () => {
    const employees = [emp(8)];
    // Both shift and site are invalid
    const schedules = [sched(109, 8, 99, 99)];

    const result = resolveEmployeeSetupHealthDetails(
      employees,
      schedules,
      VALID_SHIFTS,
      ACTIVE_SITES,
      TEST_DOW,
    );

    // missing_shift is evaluated first
    expect(result.employeesWithMissingShift).toHaveLength(1);
    expect(result.employeesWithMissingSite).toHaveLength(0);
  });

  // ── 5. Detail list cap + hasMoreSetupIssues ────────────────────────────────

  it("caps each list at detailLimit and sets hasMoreSetupIssues=true", () => {
    const detailLimit = 3;
    // Create 5 employees with no schedule
    const employees = [emp(10), emp(11), emp(12), emp(13), emp(14)];

    const result = resolveEmployeeSetupHealthDetails(
      employees,
      [], // no schedules
      VALID_SHIFTS,
      ACTIVE_SITES,
      TEST_DOW,
      detailLimit,
    );

    expect(result.employeesWithoutScheduleToday).toHaveLength(detailLimit);
    expect(result.hasMoreSetupIssues).toBe(true);
    expect(result.detailLimit).toBe(detailLimit);
  });

  it("sets hasMoreSetupIssues=false when counts are within limit", () => {
    const employees = [emp(20), emp(21)];

    const result = resolveEmployeeSetupHealthDetails(
      employees,
      [],
      VALID_SHIFTS,
      ACTIVE_SITES,
      TEST_DOW,
      50,
    );

    expect(result.hasMoreSetupIssues).toBe(false);
  });

  // ── 6. Tenant isolation (dual-lookup) ─────────────────────────────────────

  it("matches schedule via employee.userId (dual-lookup)", () => {
    // employeeUserId in the schedule row = employee.userId (not employee.id)
    const employees = [emp(30, 300)]; // id=30, userId=300
    const schedules = [sched(110, 300)]; // references userId=300

    const result = resolveEmployeeSetupHealthDetails(
      employees,
      schedules,
      VALID_SHIFTS,
      ACTIVE_SITES,
      TEST_DOW,
    );

    // Employee 30 should be found via userId lookup — no missing schedule
    expect(result.employeesWithoutScheduleToday).toHaveLength(0);
  });

  it("does not leak schedules across employees", () => {
    // Employee A's schedule should not satisfy employee B
    const employees = [emp(40), emp(41)];
    const schedules = [sched(111, 40)]; // belongs to emp 40 only

    const result = resolveEmployeeSetupHealthDetails(
      employees,
      schedules,
      VALID_SHIFTS,
      ACTIVE_SITES,
      TEST_DOW,
    );

    // emp 41 has no schedule
    expect(result.employeesWithoutScheduleToday).toHaveLength(1);
    expect(result.employeesWithoutScheduleToday[0].employeeId).toBe(41);
  });

  // ── 7. Portal access ──────────────────────────────────────────────────────

  it("flags employee without userId as missing portal access", () => {
    const employees = [emp(50, null, { email: "emp50@example.com" })];

    const result = resolveEmployeeSetupHealthDetails(employees, [], VALID_SHIFTS, ACTIVE_SITES, TEST_DOW);

    expect(result.employeesWithoutPortalAccess).toHaveLength(1);
    expect(result.employeesWithoutPortalAccess[0].suggestedAction).toBe("invite_to_portal");
  });

  it("suggests add_email when employee has no userId and no email", () => {
    const employees: SetupHealthEmployee[] = [
      { id: 51, userId: null, firstName: "No", lastName: "Email", email: null, department: null },
    ];

    const result = resolveEmployeeSetupHealthDetails(employees, [], VALID_SHIFTS, ACTIVE_SITES, TEST_DOW);

    expect(result.employeesWithoutPortalAccess[0].suggestedAction).toBe("add_email");
  });

  it("does not flag employee with userId as missing portal access", () => {
    const employees = [emp(52, 552)]; // has userId

    const result = resolveEmployeeSetupHealthDetails(employees, [sched(112, 52)], VALID_SHIFTS, ACTIVE_SITES, TEST_DOW);

    expect(result.employeesWithoutPortalAccess).toHaveLength(0);
  });
});
