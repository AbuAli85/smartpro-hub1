import { and, avg, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  employees,
  trainingRecords,
  employeeSelfReviews,
  kpiTargets,
  kpiAchievements,
} from "../drizzle/schema";
import type { getDb } from "./db";

/** Matches `getDb()` after null check (same instance type as other routers). */
export type HrPerformanceDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Combined dashboard aggregates (compact, server-authoritative). */
export type PerformanceOverviewPayload = {
  companyId: number;
  employees: { total: number; active: number };
  training: {
    totalRecords: number;
    assigned: number;
    inProgress: number;
    completed: number;
    overdue: number;
    averageScoreCompleted: number | null;
  };
  selfReviews: {
    draft: number;
    submitted: number;
    reviewed: number;
    acknowledged: number;
    pendingManagerReview: number;
    averageManagerRating: number | null;
    averageSelfRating: number | null;
  };
  targets: {
    periodYear: number;
    periodMonth: number;
    targetRowsThisPeriod: number;
    averageAchievementPctThisPeriod: number | null;
  };
};

export async function fetchPerformanceOverview(
  db: HrPerformanceDb,
  companyId: number,
  period: { year: number; month: number }
): Promise<PerformanceOverviewPayload> {
  const [{ totalEmp }] = await db
    .select({ totalEmp: count() })
    .from(employees)
    .where(eq(employees.companyId, companyId));

  const [{ activeEmp }] = await db
    .select({ activeEmp: count() })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.status, "active")));

  const trainingStatusRows = await db
    .select({
      status: trainingRecords.trainingStatus,
      c: count(),
    })
    .from(trainingRecords)
    .where(eq(trainingRecords.companyId, companyId))
    .groupBy(trainingRecords.trainingStatus);

  const trainingByStatus: Record<string, number> = {};
  for (const r of trainingStatusRows) {
    trainingByStatus[r.status] = Number(r.c);
  }

  const [{ totalTraining }] = await db
    .select({ totalTraining: count() })
    .from(trainingRecords)
    .where(eq(trainingRecords.companyId, companyId));

  const [avgScoreRow] = await db
    .select({ v: avg(trainingRecords.score) })
    .from(trainingRecords)
    .where(
      and(
        eq(trainingRecords.companyId, companyId),
        eq(trainingRecords.trainingStatus, "completed"),
        isNotNull(trainingRecords.score)
      )
    );

  const selfStatusRows = await db
    .select({
      status: employeeSelfReviews.reviewStatus,
      c: count(),
    })
    .from(employeeSelfReviews)
    .where(eq(employeeSelfReviews.companyId, companyId))
    .groupBy(employeeSelfReviews.reviewStatus);

  const selfByStatus: Record<string, number> = {};
  for (const r of selfStatusRows) {
    selfByStatus[r.status] = Number(r.c);
  }

  const [avgMgrRow] = await db
    .select({ v: avg(employeeSelfReviews.managerRating) })
    .from(employeeSelfReviews)
    .where(and(eq(employeeSelfReviews.companyId, companyId), isNotNull(employeeSelfReviews.managerRating)));

  const [avgSelfRow] = await db
    .select({ v: avg(employeeSelfReviews.selfRating) })
    .from(employeeSelfReviews)
    .where(and(eq(employeeSelfReviews.companyId, companyId), isNotNull(employeeSelfReviews.selfRating)));

  const [{ targetRows }] = await db
    .select({ targetRows: count() })
    .from(kpiTargets)
    .where(
      and(
        eq(kpiTargets.companyId, companyId),
        eq(kpiTargets.periodYear, period.year),
        eq(kpiTargets.periodMonth, period.month)
      )
    );

  const [avgAchRow] = await db
    .select({ v: avg(kpiAchievements.achievementPct) })
    .from(kpiAchievements)
    .where(
      and(
        eq(kpiAchievements.companyId, companyId),
        eq(kpiAchievements.periodYear, period.year),
        eq(kpiAchievements.periodMonth, period.month)
      )
    );

  return {
    companyId,
    employees: {
      total: Number(totalEmp),
      active: Number(activeEmp),
    },
    training: {
      totalRecords: Number(totalTraining),
      assigned: trainingByStatus.assigned ?? 0,
      inProgress: trainingByStatus.in_progress ?? 0,
      completed: trainingByStatus.completed ?? 0,
      overdue: trainingByStatus.overdue ?? 0,
      averageScoreCompleted: avgScoreRow?.v != null ? round1(num(avgScoreRow.v)) : null,
    },
    selfReviews: {
      draft: selfByStatus.draft ?? 0,
      submitted: selfByStatus.submitted ?? 0,
      reviewed: selfByStatus.reviewed ?? 0,
      acknowledged: selfByStatus.acknowledged ?? 0,
      pendingManagerReview: selfByStatus.submitted ?? 0,
      averageManagerRating: avgMgrRow?.v != null ? round1(num(avgMgrRow.v)) : null,
      averageSelfRating: avgSelfRow?.v != null ? round1(num(avgSelfRow.v)) : null,
    },
    targets: {
      periodYear: period.year,
      periodMonth: period.month,
      targetRowsThisPeriod: Number(targetRows),
      averageAchievementPctThisPeriod: avgAchRow?.v != null ? round1(num(avgAchRow.v)) : null,
    },
  };
}

export type TrainingOverviewPayload = {
  companyId: number;
  totalRecords: number;
  byStatus: {
    assigned: number;
    inProgress: number;
    completed: number;
    overdue: number;
  };
  completionRate: number;
  averageScore: number | null;
  byDepartment: Array<{
    department: string;
    total: number;
    completed: number;
    completionRate: number;
  }>;
};

export async function fetchTrainingOverview(
  db: HrPerformanceDb,
  companyId: number
): Promise<TrainingOverviewPayload> {
  const trainingStatusRows = await db
    .select({
      status: trainingRecords.trainingStatus,
      c: count(),
    })
    .from(trainingRecords)
    .where(eq(trainingRecords.companyId, companyId))
    .groupBy(trainingRecords.trainingStatus);

  const byStatus: Record<string, number> = {};
  for (const r of trainingStatusRows) {
    byStatus[r.status] = Number(r.c);
  }

  const assigned = byStatus.assigned ?? 0;
  const inProgress = byStatus.in_progress ?? 0;
  const completed = byStatus.completed ?? 0;
  const overdue = byStatus.overdue ?? 0;
  const totalRecords = assigned + inProgress + completed + overdue;

  const [avgScoreRow] = await db
    .select({ v: avg(trainingRecords.score) })
    .from(trainingRecords)
    .where(
      and(
        eq(trainingRecords.companyId, companyId),
        eq(trainingRecords.trainingStatus, "completed"),
        isNotNull(trainingRecords.score)
      )
    );

  const denom = completed + overdue + inProgress + assigned;
  const completionRate = denom > 0 ? round1((completed / denom) * 100) : 0;

  const deptAgg = await db
    .select({
      dept: sql<string>`COALESCE(${employees.department}, 'Unassigned')`,
      status: trainingRecords.trainingStatus,
      c: count(),
    })
    .from(trainingRecords)
    .innerJoin(employees, eq(employees.id, trainingRecords.employeeUserId))
    .where(and(eq(trainingRecords.companyId, companyId), eq(employees.companyId, companyId)))
    .groupBy(sql`COALESCE(${employees.department}, 'Unassigned')`, trainingRecords.trainingStatus);

  const deptMap = new Map<string, { total: number; completed: number }>();
  for (const row of deptAgg) {
    const d = row.dept ?? "Unassigned";
    const cur = deptMap.get(d) ?? { total: 0, completed: 0 };
    cur.total += Number(row.c);
    if (row.status === "completed") cur.completed += Number(row.c);
    deptMap.set(d, cur);
  }

  const byDepartment = Array.from(deptMap.entries())
    .map(([department, v]) => ({
      department,
      total: v.total,
      completed: v.completed,
      completionRate: v.total > 0 ? round1((v.completed / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    companyId,
    totalRecords,
    byStatus: { assigned, inProgress, completed, overdue },
    completionRate,
    averageScore: avgScoreRow?.v != null ? round1(num(avgScoreRow.v)) : null,
    byDepartment,
  };
}

export type SelfReviewOverviewPayload = {
  companyId: number;
  byStatus: {
    draft: number;
    submitted: number;
    reviewed: number;
    acknowledged: number;
  };
  reviewBacklog: number;
  managerResponseRate: number;
  averageManagerRating: number | null;
  averageSelfRating: number | null;
};

export async function fetchSelfReviewOverview(
  db: HrPerformanceDb,
  companyId: number
): Promise<SelfReviewOverviewPayload> {
  const statusRows = await db
    .select({
      status: employeeSelfReviews.reviewStatus,
      c: count(),
    })
    .from(employeeSelfReviews)
    .where(eq(employeeSelfReviews.companyId, companyId))
    .groupBy(employeeSelfReviews.reviewStatus);

  const by: Record<string, number> = {};
  for (const r of statusRows) {
    by[r.status] = Number(r.c);
  }

  const draft = by.draft ?? 0;
  const submitted = by.submitted ?? 0;
  const reviewed = by.reviewed ?? 0;
  const acknowledged = by.acknowledged ?? 0;

  const nonDraft = submitted + reviewed + acknowledged;
  const managerResponseRate =
    nonDraft > 0 ? round1(((reviewed + acknowledged) / nonDraft) * 100) : 0;

  const [avgMgrRow] = await db
    .select({ v: avg(employeeSelfReviews.managerRating) })
    .from(employeeSelfReviews)
    .where(and(eq(employeeSelfReviews.companyId, companyId), isNotNull(employeeSelfReviews.managerRating)));

  const [avgSelfRow] = await db
    .select({ v: avg(employeeSelfReviews.selfRating) })
    .from(employeeSelfReviews)
    .where(and(eq(employeeSelfReviews.companyId, companyId), isNotNull(employeeSelfReviews.selfRating)));

  return {
    companyId,
    byStatus: { draft, submitted, reviewed, acknowledged },
    reviewBacklog: submitted,
    managerResponseRate,
    averageManagerRating: avgMgrRow?.v != null ? round1(num(avgMgrRow.v)) : null,
    averageSelfRating: avgSelfRow?.v != null ? round1(num(avgSelfRow.v)) : null,
  };
}

export type PerformanceLeaderboardSummaryPayload = {
  companyId: number;
  topPerformers: Array<{
    employeeId: number;
    employeeName: string;
    department: string;
    completedTrainings: number;
    averageTrainingScore: number | null;
  }>;
  recentTrainingCompletions: Array<{
    trainingId: number;
    title: string;
    completedAt: string | null;
    employeeName: string;
    department: string;
    score: number | null;
  }>;
  topDepartmentsByTrainingHealth: Array<{
    department: string;
    totalAssignments: number;
    completed: number;
    healthScore: number;
  }>;
};

export async function fetchPerformanceLeaderboardSummary(
  db: HrPerformanceDb,
  companyId: number
): Promise<PerformanceLeaderboardSummaryPayload> {
  const completedByEmp = await db
    .select({
      employeeUserId: trainingRecords.employeeUserId,
      completedTrainings: sql<number>`SUM(CASE WHEN ${trainingRecords.trainingStatus} = 'completed' THEN 1 ELSE 0 END)`,
      avgScore: sql<number | null>`AVG(CASE WHEN ${trainingRecords.trainingStatus} = 'completed' AND ${trainingRecords.score} IS NOT NULL THEN ${trainingRecords.score} END)`,
    })
    .from(trainingRecords)
    .where(eq(trainingRecords.companyId, companyId))
    .groupBy(trainingRecords.employeeUserId)
    .having(sql`SUM(CASE WHEN ${trainingRecords.trainingStatus} = 'completed' THEN 1 ELSE 0 END) > 0`)
    .orderBy(
      desc(
        sql`SUM(CASE WHEN ${trainingRecords.trainingStatus} = 'completed' THEN 1 ELSE 0 END)`
      )
    )
    .limit(5);

  const topIds = completedByEmp.map((r) => r.employeeUserId);
  const empRows =
    topIds.length === 0
      ? []
      : await db
          .select()
          .from(employees)
          .where(and(eq(employees.companyId, companyId), inArray(employees.id, topIds)));

  const empById = new Map(empRows.map((e) => [e.id, e]));
  const topPerformers = completedByEmp.map((row) => {
    const e = empById.get(row.employeeUserId);
    const name = e ? `${e.firstName} ${e.lastName}`.trim() : "Unknown";
    return {
      employeeId: row.employeeUserId,
      employeeName: name,
      department: e?.department ?? "",
      completedTrainings: Number(row.completedTrainings),
      averageTrainingScore:
        row.avgScore != null && !Number.isNaN(Number(row.avgScore))
          ? round1(num(row.avgScore))
          : null,
    };
  });

  const recentRows = await db
    .select({
      training: trainingRecords,
      empFirst: employees.firstName,
      empLast: employees.lastName,
      empDept: employees.department,
    })
    .from(trainingRecords)
    .innerJoin(employees, eq(employees.id, trainingRecords.employeeUserId))
    .where(
      and(
        eq(trainingRecords.companyId, companyId),
        eq(employees.companyId, companyId),
        eq(trainingRecords.trainingStatus, "completed")
      )
    )
    .orderBy(desc(trainingRecords.completedAt))
    .limit(5);

  const recentTrainingCompletions = recentRows.map((r) => ({
    trainingId: r.training.id,
    title: r.training.title,
    completedAt: r.training.completedAt ? r.training.completedAt.toISOString() : null,
    employeeName:
      r.empFirst && r.empLast ? `${r.empFirst} ${r.empLast}`.trim() : r.empFirst ?? "Unknown",
    department: r.empDept ?? "",
    score: r.training.score ?? null,
  }));

  const deptHealth = await db
    .select({
      dept: sql<string>`COALESCE(${employees.department}, 'Unassigned')`,
      totalAssignments: count(),
      completed: sql<number>`SUM(CASE WHEN ${trainingRecords.trainingStatus} = 'completed' THEN 1 ELSE 0 END)`,
    })
    .from(trainingRecords)
    .innerJoin(employees, eq(employees.id, trainingRecords.employeeUserId))
    .where(and(eq(trainingRecords.companyId, companyId), eq(employees.companyId, companyId)))
    .groupBy(sql`COALESCE(${employees.department}, 'Unassigned')`);

  const topDepartmentsByTrainingHealth = deptHealth
    .map((row) => {
      const total = Number(row.totalAssignments);
      const done = Number(row.completed);
      const healthScore = total > 0 ? round1((done / total) * 100) : 0;
      return {
        department: row.dept ?? "Unassigned",
        totalAssignments: total,
        completed: done,
        healthScore,
      };
    })
    .sort((a, b) => b.healthScore - a.healthScore || b.completed - a.completed)
    .slice(0, 5);

  return {
    companyId,
    topPerformers,
    recentTrainingCompletions,
    topDepartmentsByTrainingHealth,
  };
}

/**
 * Single snapshot for `/hr/performance` (one round-trip, consistent timing).
 *
 * Semantics (stable contract):
 * - **Active employee**: `employees.status === "active"` for the company.
 * - **KPI period** (`targetRowsThisPeriod`, `averageAchievementPctThisPeriod`): `kpi_targets` / `kpi_achievements`
 *   for the requested `year`/`month` (defaults: current calendar month when omitted on the procedure).
 * - **Training avg score**: mean of `training_records.score` where status is `completed` and score is not null.
 * - **Department health**: `completed / total` training rows for that department (join on `employees.id`).
 * - **Manager response rate** (self-review): `(reviewed + acknowledged) / (submitted + reviewed + acknowledged)`;
 *   acknowledged counts as responded.
 */
export type HrPerformanceDashboardPayload = {
  overview: PerformanceOverviewPayload;
  training: TrainingOverviewPayload;
  selfReviews: SelfReviewOverviewPayload;
  leaderboard: PerformanceLeaderboardSummaryPayload;
};

export async function fetchHrPerformanceDashboard(
  db: HrPerformanceDb,
  companyId: number,
  period: { year: number; month: number }
): Promise<HrPerformanceDashboardPayload> {
  const [overview, training, selfReviews, leaderboard] = await Promise.all([
    fetchPerformanceOverview(db, companyId, period),
    fetchTrainingOverview(db, companyId),
    fetchSelfReviewOverview(db, companyId),
    fetchPerformanceLeaderboardSummary(db, companyId),
  ]);
  return { overview, training, selfReviews, leaderboard };
}
