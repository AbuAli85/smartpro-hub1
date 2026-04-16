/**
 * Phase 2: assignment-centered execution, payroll staging, billing staging.
 * Reads promoter_assignments + attendance + employees; assignment row is truth.
 */

import { and, count, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import {
  attendanceRecords,
  attendanceSessions,
  companies,
  employees,
  promoterAssignments,
} from "../drizzle/schema";
import { getAssignmentTemporalState } from "../shared/promoterAssignmentTemporal";
import {
  countOverlapCalendarDays,
  getAssignmentBillableWindow,
  getAssignmentPayableWindow,
} from "../shared/promoterAssignmentPeriodHelpers";
import {
  computeBillableUnits,
  resolvePromoterAssignmentCommercial,
} from "../shared/promoterAssignmentCommercialResolution";
import type { MySql2Database } from "drizzle-orm/mysql2";

export type DbLike = MySql2Database<Record<string, never>>;

function visibilityOr(activeId: number) {
  return or(
    eq(promoterAssignments.companyId, activeId),
    eq(promoterAssignments.secondPartyCompanyId, activeId),
  );
}

export async function getPromoterExecutionSummary(
  db: DbLike,
  params: { activeCompanyId: number; isPlatformAdmin: boolean },
) {
  const vis = params.isPlatformAdmin ? undefined : visibilityOr(params.activeCompanyId);
  const baseScope = vis ? vis : sql`1=1`;

  const today = new Date().toISOString().slice(0, 10);

  const opWhere = and(
    baseScope,
    eq(promoterAssignments.assignmentStatus, "active"),
    lte(promoterAssignments.startDate, sql`CURDATE()`),
    or(isNull(promoterAssignments.endDate), gte(promoterAssignments.endDate, sql`CURDATE()`)),
  );

  const [{ operationalToday }] = await db
    .select({ operationalToday: count() })
    .from(promoterAssignments)
    .where(opWhere);

  const empRows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.companyId, params.activeCompanyId));
  const employerEmployeeIds = empRows.map((e) => e.id);

  const attVisible = or(
    eq(attendanceRecords.companyId, params.activeCompanyId),
    employerEmployeeIds.length
      ? inArray(attendanceRecords.employeeId, employerEmployeeIds)
      : sql`0=1`,
  );

  const dayClause = sql`DATE(${attendanceRecords.checkIn}) = CURDATE()`;

  const [{ resolvedToday }] = await db
    .select({ resolvedToday: count() })
    .from(attendanceRecords)
    .where(and(attVisible, dayClause, isNotNull(attendanceRecords.promoterAssignmentId)));

  const [{ unresolvedToday }] = await db
    .select({ unresolvedToday: count() })
    .from(attendanceRecords)
    .where(and(attVisible, dayClause, isNull(attendanceRecords.promoterAssignmentId)));

  const suspendedAttempted = 0;

  const [futureRow] = await db
    .select({ c: count() })
    .from(attendanceRecords)
    .innerJoin(
      promoterAssignments,
      and(
        eq(promoterAssignments.promoterEmployeeId, attendanceRecords.employeeId),
        eq(promoterAssignments.firstPartyCompanyId, attendanceRecords.companyId),
        eq(promoterAssignments.assignmentStatus, "active"),
        gt(promoterAssignments.startDate, sql`CURDATE()`),
      ),
    )
    .where(and(attVisible, dayClause));

  return {
    referenceDate: today,
    operationalAssignmentsToday: Number(operationalToday),
    attendanceResolvedToday: Number(resolvedToday),
    attendanceUnresolvedToday: Number(unresolvedToday),
    suspendedAttemptedAttendance: suspendedAttempted,
    futureAssignmentAttendanceAttempts: Number(futureRow?.c ?? 0),
  };
}

export type StagingRowBase = {
  assignmentId: string;
  employeeId: number;
  employeeName: string;
  firstPartyCompanyId: number;
  brandName: string;
  clientSiteId: number | null;
  siteName: string | null;
  assignmentStatus: string;
  temporalState: string;
  overlapStart: string | null;
  overlapEnd: string | null;
  overlapDays: number;
  attendanceDaysInPeriod: number;
  attendanceHoursInPeriod: number;
};

export async function getPayrollStagingRows(
  db: DbLike,
  params: {
    activeCompanyId: number;
    isPlatformAdmin: boolean;
    periodStartYmd: string;
    periodEndYmd: string;
  },
): Promise<
  (StagingRowBase & {
    payableOverlapDays: number;
    readiness: "ready" | "blocked";
    blockers: string[];
    payrollNote: string | null;
  })[]
> {
  const vis = params.isPlatformAdmin ? undefined : visibilityOr(params.activeCompanyId);
  const fp = alias(companies, "pa_pay_fp");

  const rows = await db
    .select({
      id: promoterAssignments.id,
      assignmentStatus: promoterAssignments.assignmentStatus,
      startDate: promoterAssignments.startDate,
      endDate: promoterAssignments.endDate,
      clientSiteId: promoterAssignments.clientSiteId,
      promoterEmployeeId: promoterAssignments.promoterEmployeeId,
      firstPartyCompanyId: promoterAssignments.firstPartyCompanyId,
      brandName: fp.name,
      billingModel: promoterAssignments.billingModel,
      billingRate: promoterAssignments.billingRate,
      currencyCode: promoterAssignments.currencyCode,
      rateSource: promoterAssignments.rateSource,
      empFirst: employees.firstName,
      empLast: employees.lastName,
      salary: employees.salary,
    })
    .from(promoterAssignments)
    .leftJoin(fp, eq(fp.id, promoterAssignments.firstPartyCompanyId))
    .leftJoin(employees, eq(employees.id, promoterAssignments.promoterEmployeeId))
    .where(vis ? vis : sql`1=1`);

  const out: Awaited<ReturnType<typeof getPayrollStagingRows>> = [];

  for (const r of rows) {
    const a = {
      assignmentStatus: r.assignmentStatus as "active" | "suspended" | "draft" | "completed" | "terminated",
      startDate: r.startDate,
      endDate: r.endDate,
    };
    const overlap = getAssignmentPayableWindow(params.periodStartYmd, params.periodEndYmd, a);
    const temporalState = getAssignmentTemporalState(
      {
        assignmentStatus: r.assignmentStatus as "active",
        startDate: r.startDate,
        endDate: r.endDate,
      },
      params.periodEndYmd,
    );

    const blockers: string[] = [];
    if (!overlap) blockers.push("no_effective_overlap_in_period");
    if (r.assignmentStatus === "suspended") blockers.push("suspended_assignment");
    if (r.assignmentStatus === "draft") blockers.push("draft_assignment");

    const comm = resolvePromoterAssignmentCommercial(
      {
        assignmentStatus: r.assignmentStatus as "active",
        billingModel: r.billingModel,
        billingRate: r.billingRate != null ? String(r.billingRate) : null,
        currencyCode: r.currencyCode,
        rateSource: r.rateSource,
        employeeSalary: r.salary != null ? String(r.salary) : null,
      },
      { intent: "payroll" },
    );
    blockers.push(...comm.blockers);

    let attendanceDaysInPeriod = 0;
    let attendanceHoursInPeriod = 0;
    if (overlap) {
      const [sessAgg] = await db
        .select({
          days: sql<number>`COUNT(DISTINCT ${attendanceSessions.businessDate})`,
          secs: sql<number>`COALESCE(SUM(TIMESTAMPDIFF(SECOND, ${attendanceSessions.checkInAt}, ${attendanceSessions.checkOutAt})), 0)`,
        })
        .from(attendanceSessions)
        .where(
          and(
            eq(attendanceSessions.employeeId, r.promoterEmployeeId),
            eq(attendanceSessions.companyId, r.firstPartyCompanyId),
            gte(attendanceSessions.businessDate, overlap.overlapStart),
            lte(attendanceSessions.businessDate, overlap.overlapEnd),
            eq(attendanceSessions.promoterAssignmentId, r.id),
          ),
        );
      attendanceDaysInPeriod = Number(sessAgg?.days ?? 0);
      attendanceHoursInPeriod = Number(sessAgg?.secs ?? 0) / 3600;
    }

    const overlapDays = overlap ? countOverlapCalendarDays(overlap) : 0;
    const readiness = blockers.length === 0 ? "ready" : "blocked";

    out.push({
      assignmentId: r.id,
      employeeId: r.promoterEmployeeId,
      employeeName: `${r.empFirst ?? ""} ${r.empLast ?? ""}`.trim() || `Employee #${r.promoterEmployeeId}`,
      firstPartyCompanyId: r.firstPartyCompanyId,
      brandName: r.brandName ?? `Company #${r.firstPartyCompanyId}`,
      clientSiteId: r.clientSiteId,
      siteName: null,
      assignmentStatus: r.assignmentStatus,
      temporalState: temporalState,
      overlapStart: overlap?.overlapStart ?? null,
      overlapEnd: overlap?.overlapEnd ?? null,
      overlapDays,
      attendanceDaysInPeriod,
      attendanceHoursInPeriod,
      payableOverlapDays: overlapDays,
      readiness,
      blockers: [...new Set(blockers)],
      payrollNote: comm.payrollBasisNote,
    });
  }

  return out;
}

export async function getBillingStagingRows(
  db: DbLike,
  params: {
    activeCompanyId: number;
    isPlatformAdmin: boolean;
    periodStartYmd: string;
    periodEndYmd: string;
  },
): Promise<
  (StagingRowBase & {
    billingModel: string | null;
    billingRate: string | null;
    currencyCode: string;
    billableUnits: number | null;
    billableAmount: number | null;
    readiness: "ready" | "blocked";
    blockers: string[];
  })[]
> {
  const vis = params.isPlatformAdmin ? undefined : visibilityOr(params.activeCompanyId);
  const fp = alias(companies, "pa_bill_fp");

  const rows = await db
    .select({
      id: promoterAssignments.id,
      assignmentStatus: promoterAssignments.assignmentStatus,
      startDate: promoterAssignments.startDate,
      endDate: promoterAssignments.endDate,
      clientSiteId: promoterAssignments.clientSiteId,
      promoterEmployeeId: promoterAssignments.promoterEmployeeId,
      firstPartyCompanyId: promoterAssignments.firstPartyCompanyId,
      brandName: fp.name,
      billingModel: promoterAssignments.billingModel,
      billingRate: promoterAssignments.billingRate,
      currencyCode: promoterAssignments.currencyCode,
      rateSource: promoterAssignments.rateSource,
      empFirst: employees.firstName,
      empLast: employees.lastName,
      salary: employees.salary,
    })
    .from(promoterAssignments)
    .leftJoin(fp, eq(fp.id, promoterAssignments.firstPartyCompanyId))
    .leftJoin(employees, eq(employees.id, promoterAssignments.promoterEmployeeId))
    .where(vis ? vis : sql`1=1`);

  const out: Awaited<ReturnType<typeof getBillingStagingRows>> = [];

  for (const r of rows) {
    const a = {
      assignmentStatus: r.assignmentStatus as "active" | "suspended" | "draft" | "completed" | "terminated",
      startDate: r.startDate,
      endDate: r.endDate,
    };
    const overlap = getAssignmentBillableWindow(params.periodStartYmd, params.periodEndYmd, a);
    const overlapDays = overlap ? countOverlapCalendarDays(overlap) : 0;

    let attendanceHours: number | null = null;
    if (overlap) {
      const [sessAgg] = await db
        .select({
          secs: sql<number>`COALESCE(SUM(TIMESTAMPDIFF(SECOND, ${attendanceSessions.checkInAt}, ${attendanceSessions.checkOutAt})), 0)`,
        })
        .from(attendanceSessions)
        .where(
          and(
            eq(attendanceSessions.employeeId, r.promoterEmployeeId),
            eq(attendanceSessions.companyId, r.firstPartyCompanyId),
            gte(attendanceSessions.businessDate, overlap.overlapStart),
            lte(attendanceSessions.businessDate, overlap.overlapEnd),
            eq(attendanceSessions.promoterAssignmentId, r.id),
          ),
        );
      attendanceHours = Number(sessAgg?.secs ?? 0) / 3600;
    }

    const comm = resolvePromoterAssignmentCommercial({
      assignmentStatus: r.assignmentStatus as "active",
      billingModel: r.billingModel,
      billingRate: r.billingRate != null ? String(r.billingRate) : null,
      currencyCode: r.currencyCode,
      rateSource: r.rateSource,
      employeeSalary: r.salary != null ? String(r.salary) : null,
    });

    const blockers = [...comm.blockers].filter((b) => b !== "payroll_basis_not_configured");
    if (!overlap) blockers.push("no_billable_overlap");
    if (r.assignmentStatus === "draft") blockers.push("draft_assignment");

    const units = computeBillableUnits({
      billingModel: r.billingModel,
      overlapDays,
      attendanceHours: r.billingModel === "per_hour" ? attendanceHours : null,
    });
    if (units.units == null) blockers.push("billable_units_unresolved");

    const rateNum = comm.billingRate != null ? Number(comm.billingRate) : NaN;
    const billableAmount =
      units.units != null && Number.isFinite(rateNum) ? Math.round(units.units * rateNum * 1000) / 1000 : null;
    if (billableAmount == null) blockers.push("billable_amount_unresolved");

    const readiness = blockers.length === 0 ? "ready" : "blocked";

    const temporalState = getAssignmentTemporalState(
      {
        assignmentStatus: r.assignmentStatus as "active",
        startDate: r.startDate,
        endDate: r.endDate,
      },
      params.periodEndYmd,
    );

    out.push({
      assignmentId: r.id,
      employeeId: r.promoterEmployeeId,
      employeeName: `${r.empFirst ?? ""} ${r.empLast ?? ""}`.trim() || `Employee #${r.promoterEmployeeId}`,
      firstPartyCompanyId: r.firstPartyCompanyId,
      brandName: r.brandName ?? `Company #${r.firstPartyCompanyId}`,
      clientSiteId: r.clientSiteId,
      siteName: null,
      assignmentStatus: r.assignmentStatus,
      temporalState,
      overlapStart: overlap?.overlapStart ?? null,
      overlapEnd: overlap?.overlapEnd ?? null,
      overlapDays,
      attendanceDaysInPeriod: 0,
      attendanceHoursInPeriod: attendanceHours ?? 0,
      billingModel: r.billingModel,
      billingRate: comm.billingRate,
      currencyCode: comm.currencyCode,
      billableUnits: units.units,
      billableAmount,
      readiness,
      blockers: [...new Set(blockers)],
    });
  }

  return out;
}

export function summarizeStaging<T extends { readiness: "ready" | "blocked"; blockers: string[] }>(
  rows: T[],
  amountField?: keyof T,
) {
  let ready = 0;
  let blocked = 0;
  const blockerCounts = new Map<string, number>();
  let totalAmount = 0;
  for (const r of rows) {
    if (r.readiness === "ready") ready++;
    else blocked++;
    for (const b of r.blockers) {
      blockerCounts.set(b, (blockerCounts.get(b) ?? 0) + 1);
    }
    if (amountField && typeof r[amountField] === "number") {
      totalAmount += r[amountField] as number;
    }
  }
  const topBlockers = [...blockerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([reason, count]) => ({ reason, count }));
  return { totalRows: rows.length, ready, blocked, topBlockers, totalBillableAmount: totalAmount };
}
