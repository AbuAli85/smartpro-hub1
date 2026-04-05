/**
 * Server-authored work-status strip for My Portal (read-only).
 * Not a legal/compliance certification — documents, permit signal, and assigned tasks only.
 */

export type WorkStatusOverall = "on_track" | "needs_attention" | "urgent";

export type PermitStripStatus = "valid" | "expiring_soon" | "expired" | "missing" | "not_applicable";

export type DocumentsStripStatus = "valid" | "expiring_soon" | "expired" | "missing";

export type PrimaryActionType = "open_tasks" | "open_documents" | "contact_hr" | "none";

export type EmployeeWorkStatusSummary = {
  overallStatus: WorkStatusOverall;
  permit: {
    status: PermitStripStatus;
    expiryDate: string | null;
    label: string;
  };
  documents: {
    status: DocumentsStripStatus;
    expiringCount: number;
    expiredCount: number;
    label: string;
  };
  tasks: {
    openCount: number;
    overdueCount: number;
    nextDueAt: string | null;
    label: string;
  };
  primaryAction: {
    type: PrimaryActionType;
    label: string;
    /** My Portal tab to open when type is open_tasks / open_documents */
    tab?: "tasks" | "documents";
  };
  secondaryAction?: {
    type: "contact_hr";
    label: string;
  };
};

const EXPIRING_SOON_DAYS = 30;
const DOC_WARNING_DAYS = 90;

function isOmaniNationality(n: string | null | undefined): boolean {
  const x = (n ?? "").trim().toLowerCase();
  return x === "omani" || x === "om" || x === "oman";
}

function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function parseDate(d: Date | string | null | undefined): Date | null {
  if (d == null) return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t;
}

export type PermitInput = {
  permitStatus: string;
  expiryDate: Date | string | null;
} | null;

export type DocumentInput = {
  expiresAt: Date | string | null;
}[];

export type TaskInput = {
  status: string;
  dueDate: Date | string | null;
}[];

/**
 * Pure builder — used by employeePortal router and unit tests.
 */
export function buildEmployeeWorkStatusSummary(params: {
  nationality: string | null | undefined;
  permit: PermitInput;
  documents: DocumentInput;
  tasks: TaskInput;
  /** For tests — defaults to system time in production */
  referenceDate?: Date;
}): EmployeeWorkStatusSummary {
  const now = params.referenceDate ?? new Date();
  const today = startOfUtcDay(now);
  const soonEnd = today + EXPIRING_SOON_DAYS * 86400000;

  // ── Permit ─────────────────────────────────────────────────────────────
  let permitStatus: PermitStripStatus = "missing";
  let permitExpiry: string | null = null;
  let permitLabel = "No work permit on file — ask HR if you expect one.";

  if (isOmaniNationality(params.nationality)) {
    permitStatus = "not_applicable";
    permitLabel = "Work permit not applicable (Omani national).";
  } else if (params.permit) {
    const exp = parseDate(params.permit.expiryDate);
    permitExpiry = exp ? exp.toISOString() : null;
    const st = params.permit.permitStatus;

    if (st === "expired" || st === "cancelled" || st === "transferred") {
      permitStatus = st === "expired" ? "expired" : "missing";
      permitLabel =
        st === "expired"
          ? "Work permit expired — contact HR immediately."
          : "No active work permit on file — contact HR.";
    } else if (exp) {
      const expDay = startOfUtcDay(exp);
      if (expDay < today) {
        permitStatus = "expired";
        permitLabel = "Work permit expired — contact HR immediately.";
      } else if (expDay <= soonEnd || st === "expiring_soon" || st === "in_grace") {
        permitStatus = "expiring_soon";
        const days = Math.ceil((expDay - today) / 86400000);
        permitLabel = `Work permit expiring in ${days} day${days === 1 ? "" : "s"} — contact HR.`;
      } else {
        permitStatus = "valid";
        permitLabel = "Work permit is valid.";
      }
    } else if (st === "active" || st === "pending_update" || st === "unknown") {
      permitStatus = st === "active" ? "valid" : "missing";
      permitLabel =
        st === "active" ? "Work permit active (no expiry date on file)." : "Work permit status unclear — ask HR.";
    } else {
      permitStatus = "missing";
      permitLabel = "No active work permit on file.";
    }
  }

  // ── Documents ──────────────────────────────────────────────────────────
  let expiredCount = 0;
  let expiringCount = 0;
  for (const d of params.documents) {
    const exp = parseDate(d.expiresAt);
    if (!exp) continue;
    const expDay = startOfUtcDay(exp);
    if (expDay < today) expiredCount++;
    else if (expDay <= today + DOC_WARNING_DAYS * 86400000) expiringCount++;
  }

  let docStatus: DocumentsStripStatus = "valid";
  let docLabel = "Employment documents look current.";
  if (params.documents.length === 0) {
    docStatus = "missing";
    docLabel = "No documents on file — HR may upload records for you.";
  } else if (expiredCount > 0) {
    docStatus = "expired";
    docLabel =
      expiredCount === 1
        ? "1 document expired — renew with HR."
        : `${expiredCount} documents expired — renew with HR.`;
  } else if (expiringCount > 0) {
    docStatus = "expiring_soon";
    docLabel =
      expiringCount === 1
        ? "1 document expiring within 90 days."
        : `${expiringCount} documents expiring within 90 days.`;
  }

  // ── Tasks ─────────────────────────────────────────────────────────────
  const openTasks = params.tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const openCount = openTasks.length;
  let overdueCount = 0;
  let nextDueAt: string | null = null;
  for (const t of openTasks) {
    const due = parseDate(t.dueDate);
    if (!due) continue;
    const dueDay = startOfUtcDay(due);
    if (dueDay < today) overdueCount++;
    else {
      if (!nextDueAt || due < new Date(nextDueAt)) nextDueAt = due.toISOString();
    }
  }

  const taskLabel =
    openCount === 0
      ? "No open tasks from HR."
      : overdueCount > 0
        ? `${openCount} open task${openCount === 1 ? "" : "s"} (${overdueCount} overdue).`
        : `${openCount} open task${openCount === 1 ? "" : "s"}.`;

  // ── Overall + CTAs ───────────────────────────────────────────────────
  const permitUrgent = permitStatus === "expired";
  const permitWarn = permitStatus === "expiring_soon";
  const docUrgent = docStatus === "expired";
  const docWarn = docStatus === "expiring_soon";

  let overallStatus: WorkStatusOverall = "on_track";
  if (permitUrgent || docUrgent || overdueCount > 0) {
    overallStatus = "urgent";
  } else if (permitWarn || docWarn || openCount > 0 || docStatus === "missing" || permitStatus === "missing") {
    overallStatus = "needs_attention";
  }

  let primaryType: PrimaryActionType = "none";
  let primaryLabel = "You are up to date.";
  let primaryTab: "tasks" | "documents" | undefined;

  if (docUrgent) {
    primaryType = "open_documents";
    primaryLabel = "Open documents";
    primaryTab = "documents";
  } else if (overdueCount > 0) {
    primaryType = "open_tasks";
    primaryLabel = "Open tasks";
    primaryTab = "tasks";
  } else if (permitUrgent) {
    primaryType = "contact_hr";
    primaryLabel = "Contact HR";
  } else if (docWarn || docStatus === "missing") {
    primaryType = "open_documents";
    primaryLabel = "Open documents";
    primaryTab = "documents";
  } else if (permitWarn) {
    primaryType = "contact_hr";
    primaryLabel = "Contact HR";
  } else if (openCount > 0) {
    primaryType = "open_tasks";
    primaryLabel = "Open tasks";
    primaryTab = "tasks";
  }

  const secondaryAction =
    primaryType !== "contact_hr" &&
    (primaryType === "open_tasks" || primaryType === "open_documents") &&
    (permitUrgent || permitWarn || docUrgent || docWarn)
      ? { type: "contact_hr" as const, label: "Contact HR" }
      : undefined;

  return {
    overallStatus,
    permit: { status: permitStatus, expiryDate: permitExpiry, label: permitLabel },
    documents: { status: docStatus, expiringCount, expiredCount, label: docLabel },
    tasks: { openCount, overdueCount, nextDueAt, label: taskLabel },
    primaryAction: { type: primaryType, label: primaryLabel, tab: primaryTab },
    secondaryAction,
  };
}
