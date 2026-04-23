import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  attendanceRecords,
  attendanceSessions,
  attendanceSites,
  companies,
  employees,
  payrollLineItems,
  payrollRuns,
  salaryLoans,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  executeMonthlyPayroll,
  PAYROLL_EXECUTE_INJECT_FAILURE_AFTER_LINE_INSERT,
} from "./payrollExecuteMonthly";
import {
  muscatCalendarWeekdaySun0ForYmd,
  muscatDaysInCalendarMonth,
  muscatWallDateTimeToUtc,
} from "@shared/attendanceMuscatTime";

const RUN = process.env.PAYROLL_ROLLBACK_INTEGRATION_TEST === "1" && Boolean(process.env.DATABASE_URL);

function firstMuscatWeekdayYmds(year: number, month: number, take: number): string[] {
  const last = muscatDaysInCalendarMonth(year, month);
  const out: string[] = [];
  for (let d = 1; d <= last && out.length < take; d++) {
    const ymd = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const wd = muscatCalendarWeekdaySun0ForYmd(ymd);
    if (wd >= 1 && wd <= 5) out.push(ymd);
  }
  return out;
}

type SeedIds = {
  companyId: number;
  userIds: number[];
  employeeIds: number[];
  siteId: number;
  loanId?: number;
};

async function seedTenantForRollbackTest(params: {
  employeeCount: 1 | 2;
  withLoan: boolean;
}): Promise<SeedIds> {
  const db = await getDb();
  if (!db) throw new Error("getDb() returned null");

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

  const coRes = await db.insert(companies).values({
    name: `Payroll rollback IT ${suffix}`,
    slug: `prb-${suffix}`,
    status: "active",
  });
  const companyId = Number(coRes[0].insertId);

  const userIds: number[] = [];
  for (let i = 0; i < params.employeeCount; i++) {
    const openId = `prb${suffix}${i}`.slice(0, 64);
    const uRes = await db.insert(users).values({
      openId,
      email: `prb-${suffix}-${i}@example.invalid`,
      name: `User ${i}`,
      loginMethod: "manus",
      role: "user",
      platformRole: "company_member",
    });
    userIds.push(Number(uRes[0].insertId));
  }

  const siteRes = await db.insert(attendanceSites).values({
    companyId,
    name: "IT Site",
    qrToken: `qrt-${suffix}`.slice(0, 64),
    createdByUserId: userIds[0]!,
  });
  const siteId = Number(siteRes[0].insertId);

  const employeeIds: number[] = [];
  for (let i = 0; i < params.employeeCount; i++) {
    const eRes = await db.insert(employees).values({
      companyId,
      userId: userIds[i]!,
      firstName: "Emp",
      lastName: `${i}`,
      status: "active",
      hireDate: null,
      salary: "1000.00",
      nationality: "IN",
    });
    employeeIds.push(Number(eRes[0].insertId));
  }

  const year = 2026;
  const month = 3;
  const daysPerEmp = 11;
  const ymds = firstMuscatWeekdayYmds(year, month, daysPerEmp);

  for (const empId of employeeIds) {
    for (const ymd of ymds) {
      const checkIn = muscatWallDateTimeToUtc(ymd, "08:00:00");
      const checkOut = muscatWallDateTimeToUtc(ymd, "17:00:00");
      const recRes = await db.insert(attendanceRecords).values({
        companyId,
        employeeId: empId,
        siteId,
        checkIn,
        checkOut,
        method: "admin",
      });
      const recordId = Number(recRes[0].insertId);

      await db.insert(attendanceSessions).values({
        companyId,
        employeeId: empId,
        siteId,
        businessDate: ymd,
        status: "closed",
        checkInAt: checkIn,
        checkOutAt: checkOut,
        sourceRecordId: recordId,
        method: "admin",
      });
    }
  }

  let loanId: number | undefined;
  if (params.withLoan && employeeIds[0] != null) {
    const lRes = await db.insert(salaryLoans).values({
      employeeId: employeeIds[0]!,
      companyId,
      loanAmount: "500.000",
      monthlyDeduction: "50.000",
      balanceRemaining: "500.000",
      status: "active",
      startMonth: month,
      startYear: year,
      reason: "integration test loan",
    });
    loanId = Number(lRes[0].insertId);
  }

  return { companyId, userIds, employeeIds, siteId, loanId };
}

async function cleanupTenant(ids: SeedIds) {
  const db = await getDb();
  if (!db) return;
  const { companyId, userIds } = ids;
  await db.delete(payrollLineItems).where(eq(payrollLineItems.companyId, companyId));
  await db.delete(payrollRuns).where(eq(payrollRuns.companyId, companyId));
  await db.delete(attendanceSessions).where(eq(attendanceSessions.companyId, companyId));
  await db.delete(attendanceRecords).where(eq(attendanceRecords.companyId, companyId));
  await db.delete(salaryLoans).where(eq(salaryLoans.companyId, companyId));
  await db.delete(employees).where(eq(employees.companyId, companyId));
  await db.delete(attendanceSites).where(eq(attendanceSites.companyId, companyId));
  await db.delete(companies).where(eq(companies.id, companyId));
  for (const uid of userIds) {
    await db.delete(users).where(eq(users.id, uid));
  }
}

describe.skipIf(!RUN)("executeMonthlyPayroll MySQL rollback (integration)", () => {
  const prevInject = process.env.PAYROLL_EXECUTE_INJECT_FAILURE_AFTER;

  beforeAll(() => {
    process.env.PAYROLL_EXECUTE_INJECT_FAILURE_AFTER = PAYROLL_EXECUTE_INJECT_FAILURE_AFTER_LINE_INSERT;
  });

  afterAll(() => {
    process.env.PAYROLL_EXECUTE_INJECT_FAILURE_AFTER = prevInject;
  });

  it("rolls back entirely after first payroll_line_items insert (two employees)", async () => {
    const db = await getDb();
    expect(db).toBeTruthy();
    const ids = await seedTenantForRollbackTest({ employeeCount: 2, withLoan: false });
    try {
      const year = 2026;
      const month = 3;
      const linesBefore = await db!.select().from(payrollLineItems).where(eq(payrollLineItems.companyId, ids.companyId));

      await expect(
        executeMonthlyPayroll(db!, {
          companyId: ids.companyId,
          year,
          month,
          actorUserId: ids.userIds[0]!,
        }),
      ).rejects.toThrow(/integration: injected failure after first payroll line insert/i);

      const runsAfter = await db!.select().from(payrollRuns).where(eq(payrollRuns.companyId, ids.companyId));
      const linesAfter = await db!.select().from(payrollLineItems).where(eq(payrollLineItems.companyId, ids.companyId));

      expect(linesAfter.length).toBe(linesBefore.length);
      const runForPeriod = runsAfter.filter((r) => r.periodYear === year && r.periodMonth === month);
      expect(runForPeriod.length).toBe(0);
    } finally {
      await cleanupTenant(ids);
    }
  });

  it("does not mutate salary_loan balance when failure occurs after first line insert", async () => {
    const db = await getDb();
    expect(db).toBeTruthy();
    const ids = await seedTenantForRollbackTest({ employeeCount: 1, withLoan: true });
    try {
      expect(ids.loanId).toBeDefined();
      const [before] = await db!
        .select({ balanceRemaining: salaryLoans.balanceRemaining })
        .from(salaryLoans)
        .where(eq(salaryLoans.id, ids.loanId!))
        .limit(1);

      await expect(
        executeMonthlyPayroll(db!, {
          companyId: ids.companyId,
          year: 2026,
          month: 3,
          actorUserId: ids.userIds[0]!,
        }),
      ).rejects.toThrow(/integration: injected failure/i);

      const [after] = await db!
        .select({ balanceRemaining: salaryLoans.balanceRemaining })
        .from(salaryLoans)
        .where(eq(salaryLoans.id, ids.loanId!))
        .limit(1);
      expect(after!.balanceRemaining).toBe(before!.balanceRemaining);
    } finally {
      await cleanupTenant(ids);
    }
  });
});
