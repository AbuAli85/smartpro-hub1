/**
 * Phase 2.5 — attendance vs assignment mismatch visibility (tenant-scoped).
 */

import { and, count, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { attendanceRecords, attendanceSites, companies, employees, promoterAssignments } from "../drizzle/schema";
import type { AttendanceAssignmentResolution } from "../shared/attendanceAssignmentResolution";
import { resolvePromoterAssignmentForAttendance } from "../shared/attendanceAssignmentResolution";
import {
  classifyAttendanceMismatch,
  type MismatchSignal,
  mismatchSignalLabel,
} from "../shared/promoterAssignmentMismatchSignals";
import {
  loadAssignmentCandidatesForAttendance,
  type DbTx,
} from "./promoterAssignmentAttendanceLink";
import type { MySql2Database } from "drizzle-orm/mysql2";

export type DbLike = MySql2Database<Record<string, never>>;

function attVisibility(activeCompanyId: number, employerEmployeeIds: number[]) {
  return or(
    eq(attendanceRecords.companyId, activeCompanyId),
    employerEmployeeIds.length ? inArray(attendanceRecords.employeeId, employerEmployeeIds) : sql`0=1`,
  );
}

const resolutionCache = new Map<string, AttendanceAssignmentResolution>();

function cacheKey(employeeId: number, companyId: number, dateYmd: string, siteId: number | null) {
  return `${employeeId}|${companyId}|${dateYmd}|${siteId ?? "null"}`;
}

export type MismatchDetailRow = {
  attendanceRecordId: number;
  checkIn: Date;
  businessDateYmd: string;
  employeeId: number;
  employeeName: string;
  clientCompanyId: number;
  brandName: string | null;
  siteId: number | null;
  siteName: string | null;
  promoterAssignmentId: string | null;
  mismatchSignal: MismatchSignal;
  reason: string;
};

export async function getMismatchDetailRows(
  db: DbLike,
  params: {
    activeCompanyId: number;
    isPlatformAdmin: boolean;
    dateFromYmd: string;
    dateToYmd: string;
    category?: MismatchSignal | "all";
    brandId?: number;
    siteId?: number;
    employeeId?: number;
    linkedOnly?: boolean;
    limit?: number;
  },
): Promise<MismatchDetailRow[]> {
  const empRows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.companyId, params.activeCompanyId));
  const employerEmployeeIds = empRows.map((e) => e.id);

  const attVis = attVisibility(params.activeCompanyId, employerEmployeeIds);
  const fp = alias(companies, "mm_brand");
  const siteAl = alias(attendanceSites, "mm_site");

  const fromD = params.dateFromYmd.slice(0, 10);
  const toD = params.dateToYmd.slice(0, 10);

  const dateClause = and(
    gte(sql`DATE(${attendanceRecords.checkIn})`, fromD),
    lte(sql`DATE(${attendanceRecords.checkIn})`, toD),
  );

  const extra: ReturnType<typeof and>[] = [dateClause, attVis];
  if (params.brandId != null) {
    extra.push(eq(attendanceRecords.companyId, params.brandId));
  }
  if (params.siteId != null) {
    extra.push(eq(attendanceRecords.siteId, params.siteId));
  }
  if (params.employeeId != null) {
    extra.push(eq(attendanceRecords.employeeId, params.employeeId));
  }
  if (params.linkedOnly === true) {
    extra.push(sql`${attendanceRecords.promoterAssignmentId} IS NOT NULL`);
  } else if (params.linkedOnly === false) {
    extra.push(isNull(attendanceRecords.promoterAssignmentId));
  }

  const rows = await db
    .select({
      arId: attendanceRecords.id,
      checkIn: attendanceRecords.checkIn,
      employeeId: attendanceRecords.employeeId,
      companyId: attendanceRecords.companyId,
      siteId: attendanceRecords.siteId,
      paId: attendanceRecords.promoterAssignmentId,
      empFirst: employees.firstName,
      empLast: employees.lastName,
      brandName: fp.name,
      siteName: siteAl.name,
    })
    .from(attendanceRecords)
    .leftJoin(employees, eq(employees.id, attendanceRecords.employeeId))
    .leftJoin(fp, eq(fp.id, attendanceRecords.companyId))
    .leftJoin(siteAl, eq(siteAl.id, attendanceRecords.siteId))
    .where(and(...extra))
    .orderBy(desc(attendanceRecords.checkIn))
    .limit(params.limit ?? 500);

  const paIds = [...new Set(rows.map((r) => r.paId).filter(Boolean))] as string[];
  const paRows =
    paIds.length > 0
      ? await db
          .select()
          .from(promoterAssignments)
          .where(inArray(promoterAssignments.id, paIds))
      : [];
  const paMap = new Map(paRows.map((p) => [p.id, p]));

  resolutionCache.clear();

  const out: MismatchDetailRow[] = [];

  for (const r of rows) {
    const checkInVal = r.checkIn as Date | string;
    const dateYmd =
      typeof checkInVal === "string"
        ? checkInVal.slice(0, 10)
        : checkInVal.toISOString().slice(0, 10);

    let resolution: AttendanceAssignmentResolution | null = null;
    let linked = r.paId ? paMap.get(r.paId) ?? null : null;

    if (!linked) {
      const ck = cacheKey(r.employeeId, r.companyId, dateYmd, r.siteId);
      if (!resolutionCache.has(ck)) {
        const candidates = await loadAssignmentCandidatesForAttendance(db as DbTx, {
          employeeId: r.employeeId,
          firstPartyCompanyId: r.companyId,
        });
        resolutionCache.set(
          ck,
          resolvePromoterAssignmentForAttendance(candidates, {
            businessDateYmd: dateYmd,
            attendanceSiteId: r.siteId,
          }),
        );
      }
      resolution = resolutionCache.get(ck)!;
    }

    const linkedLite = linked
      ? {
          id: linked.id,
          assignmentStatus: linked.assignmentStatus as (typeof linked)["assignmentStatus"],
          startDate: linked.startDate,
          endDate: linked.endDate,
          clientSiteId: linked.clientSiteId,
        }
      : null;

    const { signal, reason } = classifyAttendanceMismatch({
      businessDateYmd: dateYmd,
      attendanceSiteId: r.siteId,
      resolution: linkedLite ? null : resolution,
      linkedAssignment: linkedLite,
    });

    if (params.category && params.category !== "all" && signal !== params.category) {
      continue;
    }

    out.push({
      attendanceRecordId: r.arId,
      checkIn: r.checkIn instanceof Date ? r.checkIn : new Date(r.checkIn),
      businessDateYmd: dateYmd,
      employeeId: r.employeeId,
      employeeName: `${r.empFirst ?? ""} ${r.empLast ?? ""}`.trim() || `Employee #${r.employeeId}`,
      clientCompanyId: r.companyId,
      brandName: r.brandName,
      siteId: r.siteId,
      siteName: r.siteName,
      promoterAssignmentId: r.paId,
      mismatchSignal: signal,
      reason,
    });
  }

  return out;
}

export async function getMismatchSummary(
  db: DbLike,
  params: {
    activeCompanyId: number;
    isPlatformAdmin: boolean;
    dateFromYmd: string;
    dateToYmd: string;
  },
) {
  const empRows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.companyId, params.activeCompanyId));
  const employerEmployeeIds = empRows.map((e) => e.id);
  const attVis = attVisibility(params.activeCompanyId, employerEmployeeIds);
  const fromD = params.dateFromYmd.slice(0, 10);
  const toD = params.dateToYmd.slice(0, 10);
  const dateClause = and(
    gte(sql`DATE(${attendanceRecords.checkIn})`, fromD),
    lte(sql`DATE(${attendanceRecords.checkIn})`, toD),
  );

  const [{ totalAttendanceInRange }] = await db
    .select({ totalAttendanceInRange: count() })
    .from(attendanceRecords)
    .where(and(dateClause, attVis));

  const rows = await getMismatchDetailRows(db, {
    ...params,
    limit: 2000,
  });

  const bySignal = new Map<string, number>();
  let linked = 0;
  let unlinked = 0;
  const brandCounts = new Map<number, { name: string | null; n: number }>();
  const siteCounts = new Map<number, { name: string | null; n: number }>();
  const employeeIssueCounts = new Map<number, { name: string; n: number }>();

  for (const r of rows) {
    bySignal.set(r.mismatchSignal, (bySignal.get(r.mismatchSignal) ?? 0) + 1);
    if (r.promoterAssignmentId) linked++;
    else unlinked++;
    const bc = brandCounts.get(r.clientCompanyId) ?? { name: r.brandName, n: 0 };
    bc.n++;
    brandCounts.set(r.clientCompanyId, bc);
    if (r.siteId != null) {
      const sc = siteCounts.get(r.siteId) ?? { name: r.siteName, n: 0 };
      sc.n++;
      siteCounts.set(r.siteId, sc);
    }
    if (r.mismatchSignal !== "none") {
      const ec = employeeIssueCounts.get(r.employeeId) ?? { name: r.employeeName, n: 0 };
      ec.n++;
      employeeIssueCounts.set(r.employeeId, ec);
    }
  }

  const topBrands = [...brandCounts.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 8)
    .map(([id, v]) => ({ brandId: id, brandName: v.name ?? `Company #${id}`, count: v.n }));

  const topSites = [...siteCounts.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 8)
    .map(([id, v]) => ({ siteId: id, siteName: v.name ?? `Site #${id}`, count: v.n }));

  const issuesCount = rows.filter((r) => r.mismatchSignal !== "none").length;

  const topEmployees = [...employeeIssueCounts.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 8)
    .map(([id, v]) => ({ employeeId: id, employeeName: v.name, count: v.n }));

  const ambiguousResolutionCases = bySignal.get("multiple_operational_assignments") ?? 0;

  return {
    totalAttendanceInRange: Number(totalAttendanceInRange ?? 0),
    classifiedRowsSample: rows.length,
    totalRows: rows.length,
    linkedAttendance: linked,
    unlinkedAttendance: unlinked,
    issuesCount,
    ambiguousResolutionCases,
    bySignal: Object.fromEntries(bySignal) as Partial<Record<MismatchSignal, number>>,
    topBrands,
    topSites,
    topEmployees,
    signalLabels: Object.fromEntries(
      (Object.keys(bySignal) as MismatchSignal[]).map((k) => [k, mismatchSignalLabel(k)]),
    ),
  };
}
