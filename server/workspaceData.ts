import { and, count, desc, eq, inArray } from "drizzle-orm";
import {
  departments,
  employeeAccountability,
  employeeRequests,
  employeeTasks,
  employees,
  leaveRequests,
  performanceInterventions,
  users,
} from "../drizzle/schema";
import { buildEffectiveAccountability } from "./accountabilityEngine";
import { getSinglePersonPerformanceBundle, type PerformanceDb } from "./personPerformanceScorecard";
import { listTeamScorecardSummaries } from "./personPerformanceScorecard";
import {
  buildUniversalPerformanceSignal,
  type InterventionSignalContext,
  type UniversalPerformanceSignal,
} from "./universalPerformanceSignal";

export type MyWorkspaceTask = {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  urgency: "overdue" | "blocked" | "due_soon" | "none";
};

export type MyWorkspaceIntervention = {
  id: number;
  kind: string;
  followUpAt: string | null;
  note: string | null;
  managerLabel: string;
};

export type MyWorkspacePayload = {
  mode: "ok";
  employeeId: number;
  name: string;
  department: string | null;
  position: string | null;
  focusLines: string[];
  signal: UniversalPerformanceSignal;
  work: MyWorkspaceTask[];
  issues: string[];
  review: {
    state: string;
    summary: string;
    interventions: MyWorkspaceIntervention[];
  };
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

function taskDueYmd(d: string | Date | null | undefined): string | null {
  if (d == null) return null;
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** Higher = do this task first */
export function taskWorkspaceScore(t: typeof employeeTasks.$inferSelect, todayStr: string): number {
  let s = 0;
  if (t.status === "blocked") s += 85;
  const due = taskDueYmd(t.dueDate as string | Date | null | undefined);
  if (due && due < todayStr) s += 120;
  else if (due && due === todayStr) s += 40;
  else if (due) {
    const d0 = new Date(`${due}T12:00:00`);
    const t0 = new Date(`${todayStr}T12:00:00`);
    const diff = (d0.getTime() - t0.getTime()) / 86400000;
    if (diff > 0 && diff <= 3) s += 25;
  }
  s += (4 - priorityOrder(t.priority)) * 8;
  if (t.status === "in_progress") s += 5;
  return s;
}

function dedupeIssueLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    const x = raw.trim();
    if (!x || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
    if (out.length >= 5) break;
  }
  return out;
}

async function loadInterventionContext(
  db: PerformanceDb,
  companyId: number,
  employeeId: number
): Promise<InterventionSignalContext> {
  const rows = await db
    .select()
    .from(performanceInterventions)
    .where(
      and(
        eq(performanceInterventions.companyId, companyId),
        eq(performanceInterventions.employeeId, employeeId),
        inArray(performanceInterventions.status, ["open", "escalated"])
      )
    );
  const activeCount = rows.length;
  const hasEscalated = rows.some((r) => r.status === "escalated" || r.kind === "escalate");
  const dates = rows
    .map((r) => r.followUpAt)
    .filter((d): d is Date => d != null)
    .map((d) => d.getTime());
  const next =
    dates.length > 0
      ? new Date(Math.min(...dates)).toISOString().slice(0, 10)
      : null;
  return { activeCount, hasEscalated, nextFollowUpAt: next };
}

async function loadInterventionsForReview(
  db: PerformanceDb,
  companyId: number,
  employeeId: number
): Promise<MyWorkspaceIntervention[]> {
  const rows = await db
    .select({
      id: performanceInterventions.id,
      kind: performanceInterventions.kind,
      followUpAt: performanceInterventions.followUpAt,
      note: performanceInterventions.note,
      managerName: users.name,
    })
    .from(performanceInterventions)
    .leftJoin(users, eq(performanceInterventions.managerUserId, users.id))
    .where(
      and(
        eq(performanceInterventions.companyId, companyId),
        eq(performanceInterventions.employeeId, employeeId),
        inArray(performanceInterventions.status, ["open", "escalated"])
      )
    )
    .orderBy(desc(performanceInterventions.createdAt))
    .limit(4);

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    followUpAt: r.followUpAt ? r.followUpAt.toISOString().slice(0, 10) : null,
    note: r.note,
    managerLabel: r.managerName ?? "Manager",
  }));
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
  const focusLines: string[] = [];
  if (deptName || emp.department) {
    focusLines.push(`Where you work: ${deptName ?? emp.department ?? "—"}`);
  }
  const resp = (eff.responsibilities ?? []).filter((x) => x.trim().length > 0);
  for (const line of resp.slice(0, 4)) {
    if (!line.startsWith("Role:")) focusLines.push(line);
    else focusLines.push(line.replace(/^Role:\s*/i, "Your role: "));
  }
  if (focusLines.length === 0 && emp.position) {
    focusLines.push(`Your role: ${emp.position}`);
  }

  const invCtx = await loadInterventionContext(db, companyId, emp.id);
  const signal = buildUniversalPerformanceSignal(
    bundle.assessment,
    bundle.compositeScore,
    bundle.trend,
    bundle.signals.lastSelfReviewStatus,
    invCtx
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
    .limit(50);

  const todayStr = new Date().toISOString().slice(0, 10);
  const sorted = [...taskRows].sort((a, b) => taskWorkspaceScore(b, todayStr) - taskWorkspaceScore(a, todayStr));

  const work: MyWorkspaceTask[] = sorted.slice(0, 5).map((t) => {
    const due = taskDueYmd(t.dueDate as string | Date | null | undefined);
    let urgency: MyWorkspaceTask["urgency"] = "none";
    if (t.status === "blocked") urgency = "blocked";
    else if (due && due < todayStr) urgency = "overdue";
    else if (due) {
      const d0 = new Date(`${due}T12:00:00`);
      const t0 = new Date(`${todayStr}T12:00:00`);
      const diff = (d0.getTime() - t0.getTime()) / 86400000;
      if (diff >= 0 && diff <= 3) urgency = "due_soon";
    }
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: due,
      urgency,
    };
  });

  const issueCandidates: string[] = [];
  for (const r of signal.keyReasons) {
    issueCandidates.push(r);
  }
  for (const t of taskRows) {
    if (t.status === "blocked" && t.blockedReason) {
      issueCandidates.push(`Blocked — ${t.title.slice(0, 70)}${t.title.length > 70 ? "…" : ""}`);
    }
  }
  const issues = dedupeIssueLines(issueCandidates);

  const interventions = await loadInterventionsForReview(db, companyId, emp.id);

  let reviewSummary = "No active follow-up from your manager right now.";
  if (interventions.length > 0) {
    const next = signal.interventionFollowUpAt;
    reviewSummary = next
      ? `Manager follow-up scheduled (${next}). See details below.`
      : "Your manager has an open follow-up with you — see below.";
  }
  if (signal.reviewState === "under_review") {
    reviewSummary = "Your self-review is waiting for manager input.";
  } else if (signal.reviewState === "recovery_active" && interventions.length === 0) {
    reviewSummary = "Performance needs attention — sync with your manager on the next steps above.";
  } else if (signal.reviewState === "escalated") {
    reviewSummary = "This needs immediate attention — reach your manager today.";
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
    issues,
    review: { state: signal.reviewState, summary: reviewSummary, interventions },
    year,
    month,
  };
}

export type TeamAttentionRow = {
  employeeId: number;
  name: string;
  status: string;
  primaryWhy: string;
  suggestedAction: string;
  attentionScore: number;
};

export type TeamWorkspacePayload = {
  year: number;
  month: number;
  teamHealth: {
    onTrack: number;
    watch: number;
    atRisk: number;
    critical: number;
  };
  /** Single ranked list — who + why + what to do */
  attention: TeamAttentionRow[];
  decisions: {
    pendingEmployeeRequests: number;
    pendingLeaveRequests: number;
  };
  progressSummary: string;
};

function severityN(status: string): number {
  if (status === "critical") return 4;
  if (status === "at_risk") return 3;
  if (status === "watch") return 2;
  return 1;
}

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

  const intRows = await db
    .select()
    .from(performanceInterventions)
    .where(
      and(
        eq(performanceInterventions.companyId, companyId),
        inArray(performanceInterventions.status, ["open", "escalated"])
      )
    );
  const intCountByEmp = new Map<number, number>();
  for (const ir of intRows) {
    intCountByEmp.set(ir.employeeId, (intCountByEmp.get(ir.employeeId) ?? 0) + 1);
  }

  const attentionRows: TeamAttentionRow[] = rows
    .filter((r) => r.assessment.status !== "on_track")
    .map((r) => {
      const why =
        r.assessment.reasons[0] ??
        (r.assessment.status === "watch" ? "Performance needs a light touch this week." : "Needs attention.");
      const act =
        r.assessment.recommendedManagerActions[0] ?? "Check in and remove blockers.";
      const ic = intCountByEmp.get(r.employeeId) ?? 0;
      const attentionScore =
        severityN(r.assessment.status) * 1000 - r.compositeScore + ic * 25 + (r.trend === "declining" ? 15 : 0);
      return {
        employeeId: r.employeeId,
        name: r.name,
        status: r.assessment.status,
        primaryWhy: why,
        suggestedAction: act,
        attentionScore,
      };
    });

  attentionRows.sort((a, b) => b.attentionScore - a.attentionScore);

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
  let progressSummary = "Team output looks steady.";
  if (atRiskShare > 0.35) {
    progressSummary = "Several people need support — start with the list below.";
  } else if (atRiskShare > 0.15) {
    progressSummary = "A few people need a check-in — use the actions suggested.";
  } else if (onTrack / n > 0.75) {
    progressSummary = "Most of the team is on track.";
  }

  return {
    year,
    month,
    teamHealth: { onTrack, watch, atRisk, critical },
    attention: attentionRows.slice(0, 5),
    decisions: { pendingEmployeeRequests, pendingLeaveRequests },
    progressSummary,
  };
}
