/**
 * Unified employee-facing request rows (Phase 2) — presentation only.
 * Aggregates leave, shift requests, attendance corrections, and expenses without schema merge.
 */

export type EmployeeRequestStatus =
  | "draft"
  | "submitted"
  | "pending"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";

export type EmployeeRequestKind =
  | "leave"
  | "shift_change"
  | "shift_swap"
  | "attendance_correction"
  | "expense"
  | "hr_request"
  | "document_submission"
  | "other";

export type UnifiedEmployeeRequest = {
  id: string;
  kind: EmployeeRequestKind;
  title: string;
  submittedAt?: string;
  effectiveDate?: string;
  status: EmployeeRequestStatus;
  statusLabel: string;
  summary?: string;
  detailTab: "leave" | "requests" | "attendance" | "expenses";
};

export type UnifiedRequestHomeSummary = {
  pendingCount: number;
  latestLine: string | null;
  topPendingTitle: string | null;
};

function mapLeaveStatus(raw: string): EmployeeRequestStatus {
  const s = raw.toLowerCase();
  if (s === "pending") return "pending";
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  if (s === "cancelled") return "cancelled";
  return "pending";
}

function mapExpenseStatus(raw: string): EmployeeRequestStatus {
  const s = raw.toLowerCase();
  if (s === "pending") return "pending";
  if (s === "approved" || s === "paid") return "approved";
  if (s === "rejected") return "rejected";
  return "pending";
}

function mapCorrectionStatus(raw: string): EmployeeRequestStatus {
  const s = raw.toLowerCase();
  if (s === "pending") return "pending";
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  return "pending";
}

function mapShiftRequestStatus(raw: string): EmployeeRequestStatus {
  const s = raw.toLowerCase();
  if (s === "pending") return "pending";
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  if (s === "cancelled") return "cancelled";
  return "pending";
}

const STATUS_LABEL: Record<EmployeeRequestStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
  cancelled: "Cancelled",
};

function iso(d: string | Date | null | undefined): string | undefined {
  if (!d) return undefined;
  try {
    return new Date(d).toISOString();
  } catch {
    return undefined;
  }
}

export function buildUnifiedEmployeeRequests(input: {
  leave: { id: number; leaveType?: string | null; status: string; startDate: string | Date; endDate?: string | Date | null; reason?: string | null; createdAt?: string | Date | null }[];
  shiftRequests: { id: number; request?: { type?: string | null; status?: string | null; startDate?: string | Date | null; endDate?: string | Date | null; reason?: string | null } | null }[];
  corrections: { id: number; status?: string | null; requestedDate?: string | Date | null; reason?: string | null; createdAt?: string | Date | null }[];
  expenses: { id: number; expenseStatus?: string | null; expenseDate?: string | Date | null; description?: string | null; amount?: string | number | null; createdAt?: string | Date | null }[];
}): UnifiedEmployeeRequest[] {
  const rows: UnifiedEmployeeRequest[] = [];

  for (const l of input.leave ?? []) {
    const st = mapLeaveStatus(l.status);
    rows.push({
      id: `leave-${l.id}`,
      kind: "leave",
      title: `${(l.leaveType ?? "leave").replace(/_/g, " ")} leave`,
      submittedAt: iso(l.createdAt ?? l.startDate),
      effectiveDate: iso(l.startDate),
      status: st,
      statusLabel: STATUS_LABEL[st],
      summary: l.reason ?? undefined,
      detailTab: "leave",
    });
  }

  for (const r of input.shiftRequests ?? []) {
    const req = r.request;
    if (!req) continue;
    const st = mapShiftRequestStatus(String(req.status ?? "pending"));
    const typ = (req.type ?? "hr_request").toString();
    const kind: EmployeeRequestKind =
      typ === "day_swap" ? "shift_swap" : typ.includes("shift") || typ === "time_off" ? "shift_change" : "hr_request";
    rows.push({
      id: `shift-${r.id}`,
      kind,
      title: typ.replace(/_/g, " "),
      submittedAt: iso((req as { createdAt?: string | Date }).createdAt ?? req.startDate),
      effectiveDate: iso(req.startDate ?? null),
      status: st,
      statusLabel: STATUS_LABEL[st],
      summary: req.reason ?? undefined,
      detailTab: "requests",
    });
  }

  for (const c of input.corrections ?? []) {
    const st = mapCorrectionStatus(String(c.status ?? "pending"));
    rows.push({
      id: `corr-${c.id}`,
      kind: "attendance_correction",
      title: "Attendance correction",
      submittedAt: iso(c.createdAt ?? null),
      effectiveDate: iso(c.requestedDate ?? null),
      status: st,
      statusLabel: STATUS_LABEL[st],
      summary: c.reason ?? undefined,
      detailTab: "attendance",
    });
  }

  for (const e of input.expenses ?? []) {
    const st = mapExpenseStatus(String(e.expenseStatus ?? "pending"));
    rows.push({
      id: `exp-${e.id}`,
      kind: "expense",
      title: "Expense claim",
      submittedAt: iso(e.createdAt ?? e.expenseDate),
      effectiveDate: iso(e.expenseDate ?? null),
      status: st,
      statusLabel: STATUS_LABEL[st],
      summary: e.description ?? (e.amount != null ? String(e.amount) : undefined),
      detailTab: "expenses",
    });
  }

  rows.sort((a, b) => {
    const ta = new Date(a.submittedAt ?? 0).getTime();
    const tb = new Date(b.submittedAt ?? 0).getTime();
    return tb - ta;
  });
  return rows;
}

export function summarizeRequestsForHome(rows: UnifiedEmployeeRequest[]): UnifiedRequestHomeSummary {
  const pending = rows.filter((r) => r.status === "pending" || r.status === "submitted" || r.status === "draft");
  const latest = rows[0];
  let latestLine: string | null = null;
  if (latest) {
    latestLine = `${latest.title} · ${latest.statusLabel}`;
  }
  const top = pending[0];
  return {
    pendingCount: pending.length,
    latestLine,
    topPendingTitle: top ? `${top.title} (${top.statusLabel})` : null,
  };
}

/** Approved leave covers calendar day `d` (local midnight boundaries). */
export function isOnApprovedLeaveToday(
  leave: { status: string; startDate: string | Date; endDate: string | Date }[],
  d: Date = new Date(),
): boolean {
  const t0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const t1 = t0 + 86400000;
  return (leave ?? []).some((l) => {
    if (l.status !== "approved") return false;
    const s = new Date(l.startDate).getTime();
    const e = new Date(l.endDate).getTime() + 86400000; // inclusive end date
    return s < t1 && e > t0;
  });
}
