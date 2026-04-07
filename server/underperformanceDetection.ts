export type PerformanceStatus = "on_track" | "watch" | "at_risk" | "critical";

export type UnderperformanceAssessment = {
  status: PerformanceStatus;
  /** 1 = on track … 4 = critical */
  severity: 1 | 2 | 3 | 4;
  reasons: string[];
  recommendedManagerActions: string[];
};

/** Inputs derived from server-side aggregation (tasks, KPI, attendance, requests, reviews). */
export type ScorecardSignals = {
  overdueTaskCount: number;
  openTaskCount: number;
  blockedTaskCount: number;
  tasksCompletedLast7d: number;
  tasksCompletedPrev7d: number;
  /** Null when no KPI achievements for the period */
  kpiAvgPct: number | null;
  /** Count of KPI metrics under 50% attainment */
  kpiWeakMetricCount: number;
  attendanceLateCount: number;
  attendanceAbsentCount: number;
  pendingEmployeeRequests: number;
  lastSelfReviewStatus: string | null;
};

function pushUnique(arr: string[], msg: string) {
  if (!arr.includes(msg)) arr.push(msg);
}

/**
 * Rule-based underperformance detection — grounded thresholds, explicit reasons, manager actions.
 */
export function detectUnderperformance(s: ScorecardSignals): UnderperformanceAssessment {
  const reasons: string[] = [];
  const actions: string[] = [];
  /** 1 = on track … 4 = critical */
  let severity = 1;

  const bump = (next: number) => {
    if (next > severity) severity = next;
  };

  if (s.overdueTaskCount >= 5) {
    bump(4);
    pushUnique(reasons, `${s.overdueTaskCount} tasks are past due (sustained backlog).`);
    pushUnique(actions, "Schedule a recovery plan with weekly check-ins until overdue count is near zero.");
    pushUnique(actions, "Re-prioritise or reassign work if capacity is the constraint.");
  } else if (s.overdueTaskCount >= 3) {
    bump(3);
    pushUnique(reasons, `${s.overdueTaskCount} tasks are overdue.`);
    pushUnique(actions, "Review task list with the employee and remove blockers.");
  } else if (s.overdueTaskCount >= 1) {
    bump(2);
    pushUnique(reasons, `${s.overdueTaskCount} task(s) overdue.`);
    pushUnique(actions, "Confirm dates and dependencies on open tasks.");
  }

  if (s.blockedTaskCount >= 2) {
    bump(2);
    pushUnique(reasons, `${s.blockedTaskCount} tasks are blocked.`);
    pushUnique(actions, "Resolve blocked items with the employee and dependent teams.");
  }

  if (s.kpiAvgPct != null) {
    if (s.kpiAvgPct < 35) {
      bump(3);
      pushUnique(reasons, `KPI attainment is weak (average ~${Math.round(s.kpiAvgPct)}%).`);
      pushUnique(actions, "Set short weekly targets and review pipeline inputs (leads, activity logs).");
    } else if (s.kpiAvgPct < 55) {
      bump(2);
      pushUnique(reasons, `KPI attainment is below expectations (average ~${Math.round(s.kpiAvgPct)}%).`);
      pushUnique(actions, "Agree corrective targets for the next two weeks.");
    }
  }

  if (s.kpiWeakMetricCount >= 2) {
    bump(2);
    pushUnique(reasons, `${s.kpiWeakMetricCount} KPI metric(s) are under 50% attainment.`);
    pushUnique(actions, "Drill into each weak metric with the employee and document a recovery plan.");
  }

  const att = s.attendanceLateCount + s.attendanceAbsentCount;
  if (att >= 5) {
    bump(3);
    pushUnique(reasons, `Attendance signal is weak (${s.attendanceLateCount} late, ${s.attendanceAbsentCount} absent in the recent window).`);
    pushUnique(actions, "Address attendance and reliability; align on expected working hours.");
  } else if (att >= 3) {
    bump(2);
    pushUnique(reasons, `Multiple attendance exceptions (${att}) in the recent window.`);
    pushUnique(actions, "Discuss punctuality and any barriers (schedule, transport, workload).");
  }

  if (s.pendingEmployeeRequests >= 6) {
    bump(2);
    pushUnique(reasons, `${s.pendingEmployeeRequests} employee requests still pending.`);
    pushUnique(actions, "Clear or delegate pending requests to reduce administrative drag.");
  }

  if (s.lastSelfReviewStatus === "submitted") {
    bump(2);
    pushUnique(reasons, "Self-review submitted — manager review is still pending.");
    pushUnique(actions, "Complete the manager review to close the loop.");
  }

  const prev = s.tasksCompletedPrev7d;
  const last = s.tasksCompletedLast7d;
  if (prev >= 3 && last < Math.max(1, Math.floor(prev * 0.4))) {
    bump(2);
    pushUnique(reasons, "Task completion volume dropped versus the prior week.");
    pushUnique(actions, "Check for blockers, scope creep, or competing priorities.");
  }

  const status: PerformanceStatus =
    severity >= 4 ? "critical" : severity === 3 ? "at_risk" : severity === 2 ? "watch" : "on_track";

  if (status === "on_track" && reasons.length === 0) {
    return { status: "on_track", severity: 1, reasons: [], recommendedManagerActions: [] };
  }

  if (actions.length === 0 && status !== "on_track") {
    pushUnique(actions, "Document a short 1:1 note and agree next check-in date.");
  }

  const sev = Math.min(4, Math.max(1, severity)) as 1 | 2 | 3 | 4;
  return { status, severity: sev, reasons, recommendedManagerActions: actions };
}

/** Simple 0–100 composite for dashboards (heuristic, not compensation-grade). */
export function computeCompositeScore(s: ScorecardSignals): number {
  let score = 100;
  score -= Math.min(25, s.overdueTaskCount * 5);
  score -= Math.min(15, s.blockedTaskCount * 4);
  if (s.kpiAvgPct != null) {
    score -= Math.min(30, Math.max(0, 100 - s.kpiAvgPct) * 0.25);
  }
  score -= Math.min(20, (s.attendanceLateCount + s.attendanceAbsentCount) * 3);
  score -= Math.min(10, s.pendingEmployeeRequests);
  return Math.max(0, Math.min(100, Math.round(score)));
}
