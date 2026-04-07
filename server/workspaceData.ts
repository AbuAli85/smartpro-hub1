import { and, count, desc, eq, inArray } from "drizzle-orm";
import {
  departments,
  employeeAccountability,
  employeeRequests,
  employeeTasks,
  employees,
  leaveRequests,
  performanceInterventions,
  type User,
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
import { canAccessGlobalAdminProcedures } from "@shared/rbac";

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
  /** Open or escalated — closed rows are not returned */
  status: "open" | "escalated";
  followUpAt: string | null;
  note: string | null;
  managerLabel: string;
};

/** Exported for tests — strongest follow-ups first (escalated, overdue date, earliest date). */
export function sortInterventionsForDisplay(rows: MyWorkspaceIntervention[]): MyWorkspaceIntervention[] {
  const today = new Date().toISOString().slice(0, 10);
  return [...rows].sort((a, b) => {
    const tier = (s: string) => (s === "escalated" ? 0 : 1);
    if (tier(a.status) !== tier(b.status)) return tier(a.status) - tier(b.status);
    const aOver = a.followUpAt != null && a.followUpAt < today;
    const bOver = b.followUpAt != null && b.followUpAt < today;
    if (aOver !== bOver) return aOver ? -1 : 1;
    if (a.followUpAt && b.followUpAt) return a.followUpAt.localeCompare(b.followUpAt);
    if (a.followUpAt) return -1;
    if (b.followUpAt) return 1;
    return b.id - a.id;
  });
}

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
  /** True when the user is a company operator (admin/HR/finance) or platform admin — personal roster row is missing */
  isAdminUnlinked: boolean;
};

function isWorkspaceOperatorContext(
  companyMemberRole: string | null | undefined,
  user: Pick<User, "role" | "platformRole"> | null | undefined
): boolean {
  if (
    companyMemberRole === "company_admin" ||
    companyMemberRole === "hr_admin" ||
    companyMemberRole === "finance_admin"
  ) {
    return true;
  }
  if (!user) return false;
  if (user.platformRole === "company_admin") return true;
  return canAccessGlobalAdminProcedures(user);
}

function noEmployeePayload(
  companyMemberRole: string | null | undefined,
  user: Pick<User, "role" | "platformRole"> | null | undefined
): Extract<MyWorkspacePayload, { mode: "no_employee" }> {
  if (isWorkspaceOperatorContext(companyMemberRole, user)) {
    return {
      mode: "no_employee",
      message:
        "You are not linked to an employee record in this company's roster. The team summary below still works. In People, add yourself or link your user to an employee profile to see your personal performance and tasks here.",
      isAdminUnlinked: true,
    };
  }
  return {
    mode: "no_employee",
    message:
      "Your user is not linked to an employee profile in this company. Ask HR to connect your account.",
    isAdminUnlinked: false,
  };
}

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
    if (out.length >= 4) break;
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
      status: performanceInterventions.status,
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
    .limit(12);

  const mapped: MyWorkspaceIntervention[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status === "escalated" ? "escalated" : "open",
    followUpAt: r.followUpAt ? r.followUpAt.toISOString().slice(0, 10) : null,
    note: r.note,
    managerLabel: r.managerName ?? "Manager",
  }));

  return sortInterventionsForDisplay(mapped).slice(0, 4);
}

export async function loadMyWorkspace(
  db: PerformanceDb,
  companyId: number,
  userId: number,
  year: number,
  month: number,
  rosterCtx?: {
    companyMemberRole?: string | null;
    user?: Pick<User, "role" | "platformRole"> | null;
  }
): Promise<MyWorkspacePayload> {
  const [emp] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.userId, userId)))
    .limit(1);

  if (!emp) {
    return noEmployeePayload(rosterCtx?.companyMemberRole, rosterCtx?.user ?? null);
  }

  const bundle = await getSinglePersonPerformanceBundle(db, companyId, emp.id, year, month);
  if (!bundle) {
    return {
      mode: "no_employee",
      message: "Employee record could not be loaded.",
      isAdminUnlinked: isWorkspaceOperatorContext(rosterCtx?.companyMemberRole, rosterCtx?.user ?? null),
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

  const blockedLines: string[] = [];
  const reasonLines: string[] = [];
  for (const r of signal.keyReasons) {
    reasonLines.push(r);
  }
  for (const t of taskRows) {
    if (t.status === "blocked" && t.blockedReason) {
      blockedLines.push(`Blocked — ${t.title.slice(0, 70)}${t.title.length > 70 ? "…" : ""}`);
    }
  }
  const issues = dedupeIssueLines([...blockedLines, ...reasonLines]);

  const interventions = await loadInterventionsForReview(db, companyId, emp.id);

  let reviewSummary = "No manager follow-up right now.";
  if (interventions.length > 0) {
    const next = signal.interventionFollowUpAt;
    reviewSummary = next ? `Follow-up due ${next}. Details below.` : "Open follow-up — details below.";
  }
  if (signal.reviewState === "under_review") {
    reviewSummary = "Under review — your manager is looking at your self-review.";
  } else if (signal.reviewState === "recovery_active" && interventions.length === 0) {
    reviewSummary = "Recovery active — align with your manager on next steps above.";
  } else if (signal.reviewState === "escalated") {
    reviewSummary = "Needs attention now — contact your manager today.";
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
  /** Active follow-up rows (any manager) */
  openFollowUpCount: number;
  /** Earliest scheduled follow-up (YYYY-MM-DD), if any */
  nextFollowUpAt: string | null;
  followUpOverdue: boolean;
  /** Latest open intervention created by the viewing manager — close without extra navigation */
  myInterventionId: number | null;
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

type InterventionAgg = {
  count: number;
  earliestFollowUp: string | null;
  hasEscalated: boolean;
  followUpOverdue: boolean;
  myLatestOpenId: number | null;
};

function buildInterventionAggByEmployee(
  intRows: (typeof performanceInterventions.$inferSelect)[],
  managerUserId: number,
  todayStr: string
): Map<number, InterventionAgg> {
  const m = new Map<number, InterventionAgg>();
  for (const ir of intRows) {
    let agg = m.get(ir.employeeId);
    if (!agg) {
      agg = {
        count: 0,
        earliestFollowUp: null,
        hasEscalated: false,
        followUpOverdue: false,
        myLatestOpenId: null,
      };
      m.set(ir.employeeId, agg);
    }
    agg.count += 1;
    if (ir.status === "escalated" || ir.kind === "escalate") agg.hasEscalated = true;
    const fu = ir.followUpAt ? ir.followUpAt.toISOString().slice(0, 10) : null;
    if (fu) {
      if (!agg.earliestFollowUp || fu < agg.earliestFollowUp) agg.earliestFollowUp = fu;
    }
    if (ir.managerUserId === managerUserId) {
      if (agg.myLatestOpenId == null || ir.id > agg.myLatestOpenId) {
        agg.myLatestOpenId = ir.id;
      }
    }
  }
  for (const agg of Array.from(m.values())) {
    if (agg.earliestFollowUp && agg.earliestFollowUp < todayStr) agg.followUpOverdue = true;
  }
  return m;
}

export async function loadTeamWorkspace(
  db: PerformanceDb,
  companyId: number,
  year: number,
  month: number,
  managerUserId: number
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
  const todayStr = new Date().toISOString().slice(0, 10);
  const intAgg = buildInterventionAggByEmployee(intRows, managerUserId, todayStr);

  const attentionRows: TeamAttentionRow[] = rows
    .filter((r) => r.assessment.status !== "on_track")
    .map((r) => {
      const why =
        r.assessment.reasons[0] ??
        (r.assessment.status === "watch" ? "Performance needs a light touch this week." : "Needs attention.");
      const act =
        r.assessment.recommendedManagerActions[0] ?? "Check in and remove blockers.";
      const ia = intAgg.get(r.employeeId);
      const ic = ia?.count ?? 0;
      let attentionScore =
        severityN(r.assessment.status) * 1000 - r.compositeScore + ic * 25 + (r.trend === "declining" ? 15 : 0);
      if (ia?.followUpOverdue) attentionScore += 220;
      if (ia?.hasEscalated) attentionScore += 160;
      if (ic > 0 && !ia?.earliestFollowUp) attentionScore += 35;
      return {
        employeeId: r.employeeId,
        name: r.name,
        status: r.assessment.status,
        primaryWhy: why,
        suggestedAction: act,
        attentionScore,
        openFollowUpCount: ic,
        nextFollowUpAt: ia?.earliestFollowUp ?? null,
        followUpOverdue: ia?.followUpOverdue ?? false,
        myInterventionId: ia?.myLatestOpenId ?? null,
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
