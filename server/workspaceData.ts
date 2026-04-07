import { and, count, eq, inArray } from "drizzle-orm";
import {
  departments,
  employeeAccountability,
  employeeRequests,
  employeeTasks,
  employees,
  leaveRequests,
} from "../drizzle/schema";
import { buildEffectiveAccountability } from "./accountabilityEngine";
import { getSinglePersonPerformanceBundle, type PerformanceDb } from "./personPerformanceScorecard";
import { listTeamScorecardSummaries } from "./personPerformanceScorecard";
import { buildUniversalPerformanceSignal, type UniversalPerformanceSignal } from "./universalPerformanceSignal";

export type MyWorkspaceTask = {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
};

export type MyWorkspacePayload = {
  mode: "ok";
  employeeId: number;
  name: string;
  department: string | null;
  position: string | null;
  /** My Focus — short lines only */
  focusLines: string[];
  signal: UniversalPerformanceSignal;
  /** My Work — top open tasks */
  work: MyWorkspaceTask[];
  /** My Issues — short bullets (overlap with signal reasons; task-shaped where useful) */
  issues: string[];
  /** My Review — one-liner + state */
  review: { state: string; summary: string };
  year: number;
  month: number;
} | {
  mode: "no_employee";
  message: string;
};

function priorityOrder(p: string): number {
  const m: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  return m[p] ?? 4;
}

export async function loadMyWorkspace(
  db: PerformanceDb,
  companyId: number,
  userId: number,
  year: number,
  month: number
): Promise<MyWorkspacePayload> {
  const [emp] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.userId, userId)))
    .limit(1);

  if (!emp) {
    return {
      mode: "no_employee",
      message: "Your user is not linked to an employee profile in this company. Ask HR to connect your account.",
    };
  }

  const bundle = await getSinglePersonPerformanceBundle(db, companyId, emp.id, year, month);
  if (!bundle) {
    return {
      mode: "no_employee",
      message: "Employee record could not be loaded.",
    };
  }

  const [acc] = await db
    .select()
    .from(employeeAccountability)
    .where(
      and(eq(employeeAccountability.companyId, companyId), eq(employeeAccountability.employeeId, emp.id))
    )
    .limit(1);

  let deptName: string | null = null;
  if (acc?.departmentId != null) {
    const [d] = await db
      .select({ name: departments.name })
      .from(departments)
      .where(and(eq(departments.companyId, companyId), eq(departments.id, acc.departmentId)))
      .limit(1);
    deptName = d?.name ?? null;
  }

  const eff = buildEffectiveAccountability(emp, acc ?? null, { departmentName: deptName });
  const focusLines = (eff.responsibilities ?? []).slice(0, 5);
  if (focusLines.length === 0 && emp.position) {
    focusLines.push(emp.position);
  }

  const signal = buildUniversalPerformanceSignal(
    bundle.assessment,
    bundle.compositeScore,
    bundle.trend,
    bundle.signals.lastSelfReviewStatus
  );

  const openTaskStatuses = ["pending", "in_progress", "blocked"] as const;
  const taskRows = await db
    .select()
    .from(employeeTasks)
    .where(
      and(
        eq(employeeTasks.companyId, companyId),
        eq(employeeTasks.assignedToEmployeeId, emp.id),
        inArray(employeeTasks.status, [...openTaskStatuses])
      )
    )
    .limit(40);

  const sorted = [...taskRows].sort((a, b) => {
    const pa = priorityOrder(a.priority);
    const pb = priorityOrder(b.priority);
    if (pa !== pb) return pa - pb;
    const da = a.dueDate ?? "";
    const db = b.dueDate ?? "";
    return da.localeCompare(db);
  });

  const work: MyWorkspaceTask[] = sorted.slice(0, 5).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate ? (typeof t.dueDate === "string" ? t.dueDate : t.dueDate.toISOString().slice(0, 10)) : null,
  }));

  const issues: string[] = [];
  for (const r of signal.keyReasons.slice(0, 3)) {
    issues.push(r);
  }
  for (const t of taskRows) {
    if (t.status === "blocked" && t.blockedReason && issues.length < 5) {
      issues.push(`Blocked: ${t.title.slice(0, 80)}${t.title.length > 80 ? "…" : ""}`);
    }
  }

  let reviewSummary = "No review action needed right now.";
  if (signal.reviewState === "under_review") {
    reviewSummary = "Your self-review is waiting for manager input.";
  } else if (signal.reviewState === "recovery_active") {
    reviewSummary = "Performance is being watched — align with your manager on next steps.";
  } else if (signal.reviewState === "escalated") {
    reviewSummary = "Critical attention — connect with your manager immediately.";
  }

  return {
    mode: "ok",
    employeeId: emp.id,
    name: `${emp.firstName} ${emp.lastName}`.trim(),
    department: emp.department ?? null,
    position: emp.position ?? null,
    focusLines,
    signal,
    work,
    issues: issues.slice(0, 5),
    review: { state: signal.reviewState, summary: reviewSummary },
    year,
    month,
  };
}

export type TeamWorkspacePayload = {
  year: number;
  month: number;
  teamHealth: {
    onTrack: number;
    watch: number;
    atRisk: number;
    critical: number;
  };
  /** Short bullets — who needs attention */
  risks: { employeeId: number; name: string; status: string }[];
  /** Priorities — names of people to focus on first */
  priorities: { employeeId: number; name: string; status: string }[];
  /** Decisions — counts only */
  decisions: {
    pendingEmployeeRequests: number;
    pendingLeaveRequests: number;
  };
  /** One-line progress narrative */
  progressSummary: string;
};

export async function loadTeamWorkspace(
  db: PerformanceDb,
  companyId: number,
  year: number,
  month: number
): Promise<TeamWorkspacePayload> {
  const rows = await listTeamScorecardSummaries(db, companyId, {}, year, month);

  let onTrack = 0;
  let watch = 0;
  let atRisk = 0;
  let critical = 0;
  for (const r of rows) {
    const s = r.assessment.status;
    if (s === "on_track") onTrack += 1;
    else if (s === "watch") watch += 1;
    else if (s === "at_risk") atRisk += 1;
    else if (s === "critical") critical += 1;
  }

  const risks = rows
    .filter((r) => r.assessment.status !== "on_track")
    .slice(0, 5)
    .map((r) => ({
      employeeId: r.employeeId,
      name: r.name,
      status: r.assessment.status,
    }));

  const priorities = [...rows]
    .sort((a, b) => {
      const sev = (x: typeof a) =>
        x.assessment.status === "critical"
          ? 4
          : x.assessment.status === "at_risk"
            ? 3
            : x.assessment.status === "watch"
              ? 2
              : 1;
      return sev(b) - sev(a);
    })
    .slice(0, 5)
    .map((r) => ({
      employeeId: r.employeeId,
      name: r.name,
      status: r.assessment.status,
    }));

  const [reqRow] = await db
    .select({ c: count() })
    .from(employeeRequests)
    .where(and(eq(employeeRequests.companyId, companyId), eq(employeeRequests.status, "pending")));

  const [leaveRow] = await db
    .select({ c: count() })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.companyId, companyId), eq(leaveRequests.status, "pending")));

  const pendingEmployeeRequests = Number(reqRow?.c ?? 0);
  const pendingLeaveRequests = Number(leaveRow?.c ?? 0);

  const n = rows.length || 1;
  const atRiskShare = (atRisk + critical) / n;
  let progressSummary = "Team output is steady.";
  if (atRiskShare > 0.35) {
    progressSummary = "Several people need attention — focus on priorities this week.";
  } else if (atRiskShare > 0.15) {
    progressSummary = "A few hotspots — review risks and clear blockers.";
  } else if (onTrack / n > 0.75) {
    progressSummary = "Most of the team is on track.";
  }

  return {
    year,
    month,
    teamHealth: { onTrack, watch, atRisk, critical },
    risks,
    priorities,
    decisions: { pendingEmployeeRequests, pendingLeaveRequests },
    progressSummary,
  };
}
