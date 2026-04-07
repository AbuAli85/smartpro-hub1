import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  attendance,
  departments,
  employeeAccountability,
  employeeRequests,
  employeeSelfReviews,
  employeeTasks,
  employees,
  kpiAchievements,
} from "../drizzle/schema";
import { buildEffectiveAccountability } from "./accountabilityEngine";
import {
  computeCompositeScore,
  detectUnderperformance,
  type ScorecardSignals,
  type UnderperformanceAssessment,
} from "./underperformanceDetection";
import { kpiIdentityKeys } from "./personPerformanceAccess";

export type PerformanceDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type PersonPerformanceBundle = {
  employee: typeof employees.$inferSelect;
  accountability: ReturnType<typeof buildEffectiveAccountability>;
  signals: ScorecardSignals;
  compositeScore: number;
  assessment: UnderperformanceAssessment;
  trend: "improving" | "flat" | "declining";
  /** Risk label aligned with assessment for UI */
  riskLevel: "low" | "medium" | "high" | "critical";
};

export type TeamScorecardRow = {
  employeeId: number;
  name: string;
  department: string | null;
  position: string | null;
  compositeScore: number;
  assessment: UnderperformanceAssessment;
  trend: "improving" | "flat" | "declining";
};

function riskFromAssessment(a: UnderperformanceAssessment): "low" | "medium" | "high" | "critical" {
  if (a.status === "critical") return "critical";
  if (a.status === "at_risk") return "high";
  if (a.status === "watch") return "medium";
  return "low";
}

function trendFromTasks(last7: number, prev7: number): "improving" | "flat" | "declining" {
  if (last7 > prev7 + 1) return "improving";
  if (last7 < prev7 - 1) return "declining";
  return "flat";
}

function parseDateBoundary(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function taskDueYmd(d: string | Date | null | undefined): string | null {
  if (d == null) return null;
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function aggregateTaskSignals(
  rows: (typeof employeeTasks.$inferSelect)[],
  employeeId: number,
  todayStr: string,
  startLast7: Date,
  startPrev7: Date
) {
  const mine = rows.filter((t) => t.assignedToEmployeeId === employeeId);
  const terminal = new Set(["completed", "cancelled"]);
  let overdueTaskCount = 0;
  let openTaskCount = 0;
  let blockedTaskCount = 0;
  let tasksCompletedLast7d = 0;
  let tasksCompletedPrev7d = 0;

  for (const t of mine) {
    if (t.status === "blocked") blockedTaskCount += 1;
    if (!terminal.has(t.status)) {
      openTaskCount += 1;
      const due = taskDueYmd(t.dueDate as string | Date | null | undefined);
      if (due && due <= todayStr) overdueTaskCount += 1;
    }
    if (t.status === "completed" && t.completedAt) {
      const ca = new Date(t.completedAt);
      if (ca >= startLast7) tasksCompletedLast7d += 1;
      else if (ca >= startPrev7 && ca < startLast7) tasksCompletedPrev7d += 1;
    }
  }

  return {
    overdueTaskCount,
    openTaskCount,
    blockedTaskCount,
    tasksCompletedLast7d,
    tasksCompletedPrev7d,
  };
}

async function loadDepartmentNames(
  db: PerformanceDb,
  companyId: number,
  ids: (number | null)[]
): Promise<Map<number, string>> {
  const unique = Array.from(new Set(ids.filter((x): x is number => x != null)));
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(and(eq(departments.companyId, companyId), inArray(departments.id, unique)));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * Build person-level scorecard + underperformance assessment (batch-friendly).
 */
export async function getPersonPerformanceBundles(
  db: PerformanceDb,
  companyId: number,
  employeeIds: number[],
  year: number,
  month: number
): Promise<Map<number, PersonPerformanceBundle>> {
  const out = new Map<number, PersonPerformanceBundle>();
  if (employeeIds.length === 0) return out;

  const now = new Date();
  const todayStr = parseDateBoundary(now);
  const startLast7 = new Date(now);
  startLast7.setDate(startLast7.getDate() - 7);
  const startPrev7 = new Date(now);
  startPrev7.setDate(startPrev7.getDate() - 14);

  const empRows = await db
    .select()
    .from(employees)
    .where(and(eq(employees.companyId, companyId), inArray(employees.id, employeeIds)));

  const accRows = await db
    .select()
    .from(employeeAccountability)
    .where(
      and(eq(employeeAccountability.companyId, companyId), inArray(employeeAccountability.employeeId, employeeIds))
    );

  const accByEmp = new Map(accRows.map((a) => [a.employeeId, a]));
  const deptNames = await loadDepartmentNames(
    db,
    companyId,
    accRows.map((a) => a.departmentId)
  );

  const taskRows = await db
    .select()
    .from(employeeTasks)
    .where(and(eq(employeeTasks.companyId, companyId), inArray(employeeTasks.assignedToEmployeeId, employeeIds)));

  const kpiKeys = empRows.flatMap((e) => kpiIdentityKeys(e));
  const kpiUserIds = Array.from(new Set(kpiKeys));

  const kpiRows =
    kpiUserIds.length > 0
      ? await db
          .select()
          .from(kpiAchievements)
          .where(
            and(
              eq(kpiAchievements.companyId, companyId),
              eq(kpiAchievements.periodYear, year),
              eq(kpiAchievements.periodMonth, month),
              inArray(kpiAchievements.employeeUserId, kpiUserIds)
            )
          )
      : [];

  const attRows = await db
    .select()
    .from(attendance)
    .where(
      and(
        eq(attendance.companyId, companyId),
        inArray(attendance.employeeId, employeeIds),
        gte(attendance.date, sql`DATE_SUB(CURDATE(), INTERVAL 14 DAY)`)
      )
    );

  const reqRows = await db
    .select()
    .from(employeeRequests)
    .where(
      and(
        eq(employeeRequests.companyId, companyId),
        inArray(employeeRequests.employeeId, employeeIds),
        eq(employeeRequests.status, "pending")
      )
    );

  const reviewRows = await db
    .select()
    .from(employeeSelfReviews)
    .where(and(eq(employeeSelfReviews.companyId, companyId), inArray(employeeSelfReviews.employeeUserId, employeeIds)))
    .orderBy(desc(employeeSelfReviews.updatedAt));

  const latestReviewByEmp = new Map<number, (typeof employeeSelfReviews.$inferSelect)>();
  for (const r of reviewRows) {
    if (!latestReviewByEmp.has(r.employeeUserId)) latestReviewByEmp.set(r.employeeUserId, r);
  }

  const pendingReqByEmp = new Map<number, number>();
  for (const r of reqRows) {
    pendingReqByEmp.set(r.employeeId, (pendingReqByEmp.get(r.employeeId) ?? 0) + 1);
  }

  const attByEmp = new Map<number, { late: number; absent: number }>();
  for (const a of attRows) {
    const cur = attByEmp.get(a.employeeId) ?? { late: 0, absent: 0 };
    if (a.status === "late") cur.late += 1;
    if (a.status === "absent") cur.absent += 1;
    attByEmp.set(a.employeeId, cur);
  }

  const kpiByKey = new Map<string, typeof kpiAchievements.$inferSelect[]>();
  for (const k of kpiRows) {
    const key = `${k.employeeUserId}`;
    const arr = kpiByKey.get(key) ?? [];
    arr.push(k);
    kpiByKey.set(key, arr);
  }

  for (const emp of empRows) {
    const keys = kpiIdentityKeys(emp);
    let sum = 0;
    let n = 0;
    let weak = 0;
    const seenMetrics = new Set<string>();
    for (const uid of keys) {
      const list = kpiByKey.get(String(uid)) ?? [];
      for (const row of list) {
        if (seenMetrics.has(row.metricName)) continue;
        seenMetrics.add(row.metricName);
        const pct = parseFloat(row.achievementPct ?? "0");
        sum += pct;
        n += 1;
        if (pct < 50) weak += 1;
      }
    }
    const kpiAvgPct = n > 0 ? sum / n : null;

    const ts = aggregateTaskSignals(taskRows, emp.id, todayStr, startLast7, startPrev7);
    const att = attByEmp.get(emp.id) ?? { late: 0, absent: 0 };
    const rev = latestReviewByEmp.get(emp.id);

    const signals: ScorecardSignals = {
      ...ts,
      kpiAvgPct,
      kpiWeakMetricCount: weak,
      attendanceLateCount: att.late,
      attendanceAbsentCount: att.absent,
      pendingEmployeeRequests: pendingReqByEmp.get(emp.id) ?? 0,
      lastSelfReviewStatus: rev?.reviewStatus ?? null,
    };

    const assessment = detectUnderperformance(signals);
    const compositeScore = computeCompositeScore(signals);
    const trend = trendFromTasks(ts.tasksCompletedLast7d, ts.tasksCompletedPrev7d);

    const overlay = accByEmp.get(emp.id) ?? null;
    const deptName =
      overlay?.departmentId != null ? deptNames.get(overlay.departmentId) ?? null : null;
    const accountability = buildEffectiveAccountability(emp, overlay, { departmentName: deptName });

    out.set(emp.id, {
      employee: emp,
      accountability,
      signals,
      compositeScore,
      assessment,
      trend,
      riskLevel: riskFromAssessment(assessment),
    });
  }

  return out;
}

export async function getSinglePersonPerformanceBundle(
  db: PerformanceDb,
  companyId: number,
  employeeId: number,
  year: number,
  month: number
): Promise<PersonPerformanceBundle | null> {
  const map = await getPersonPerformanceBundles(db, companyId, [employeeId], year, month);
  return map.get(employeeId) ?? null;
}

export async function listTeamScorecardSummaries(
  db: PerformanceDb,
  companyId: number,
  opts: { department?: string | null; limit?: number },
  year: number,
  month: number
): Promise<TeamScorecardRow[]> {
  const lim = Math.min(opts.limit ?? 120, 200);
  const parts = [eq(employees.companyId, companyId), eq(employees.status, "active")];
  if (opts.department) parts.push(eq(employees.department, opts.department));
  const base = await db
    .select()
    .from(employees)
    .where(and(...parts))
    .limit(lim);

  const ids = base.map((e) => e.id);
  const bundles = await getPersonPerformanceBundles(db, companyId, ids, year, month);

  return base.map((e) => {
    const b = bundles.get(e.id);
    const assessment =
      b?.assessment ??
      ({
        status: "on_track",
        severity: 1,
        reasons: [],
        recommendedManagerActions: [],
      } as UnderperformanceAssessment);
    return {
      employeeId: e.id,
      name: `${e.firstName} ${e.lastName}`.trim(),
      department: e.department ?? null,
      position: e.position ?? null,
      compositeScore: b?.compositeScore ?? 0,
      assessment,
      trend: b?.trend ?? "flat",
    };
  });
}
