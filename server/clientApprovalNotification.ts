/**
 * Client Approval Notification Foundation (UX-5A).
 *
 * Provides:
 *   buildClientApprovalNotificationPayload — pure, testable payload builder
 *   buildReminderText                      — generates copy-able reminder text for HR
 *   notifyHrOnBatchSubmitted               — in-app notification to submitter (confirmation)
 *   notifyHrOnBatchApproved                — in-app notification to submitting HR user
 *   notifyHrOnBatchRejected                — in-app notification to submitting HR user with reason
 *
 * All send operations are best-effort (never throw). The main action completes
 * whether or not notification creation succeeds.
 *
 * Remaining gaps (not implemented in UX-5A):
 *   - Email to client contact (email adapter exists; client contact routing not modelled)
 *   - WhatsApp to client contact (template approval required from Meta)
 *   - Reminder scheduler / cron for stale submitted batches
 *   - Client contact management (clientCompanyId → contact email lookup)
 *   - Notification preferences (opt-in / opt-out per user)
 */

import { createNotification } from "./repositories/notifications.repository";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClientApprovalEventType =
  | "batch_submitted"
  | "batch_approved"
  | "batch_rejected";

export type ClientApprovalNotificationPayload = {
  eventType: ClientApprovalEventType;
  batchId: number;
  companyId: number;
  periodStart: string;
  periodEnd: string;
  /** Derived from siteId join — null when batch covers all sites. */
  siteName: string | null;
  /** Only set for "batch_submitted" events when token generation succeeded. */
  approvalUrl: string | null;
  /** Only set for "batch_rejected" events. */
  rejectionReason: string | null;
};

// ── Payload builder (pure, testable) ─────────────────────────────────────────

/**
 * Build a notification payload for a client approval lifecycle event.
 * Never includes employee-level personal details.
 */
export function buildClientApprovalNotificationPayload(
  batch: {
    id: number;
    companyId: number;
    periodStart: string;
    periodEnd: string;
    rejectionReason?: string | null;
  },
  eventType: ClientApprovalEventType,
  opts?: {
    siteName?: string | null;
    approvalUrl?: string | null;
  },
): ClientApprovalNotificationPayload {
  return {
    eventType,
    batchId: batch.id,
    companyId: batch.companyId,
    periodStart: batch.periodStart,
    periodEnd: batch.periodEnd,
    siteName: opts?.siteName ?? null,
    approvalUrl: opts?.approvalUrl ?? null,
    rejectionReason:
      eventType === "batch_rejected" ? (batch.rejectionReason ?? null) : null,
  };
}

// ── Reminder text builder (pure, testable) ────────────────────────────────────

/**
 * Generate a copy-able reminder message HR can paste into WhatsApp / email
 * when sending a manual reminder to the client contact.
 *
 * Contains: batch reference, period, optional site, approval URL.
 * Contains NO employee names or personal data.
 */
export function buildReminderText(params: {
  batchId: number;
  periodStart: string;
  periodEnd: string;
  siteName: string | null;
  approvalUrl: string;
}): string {
  const lines: string[] = [
    "Attendance Approval Required",
    "",
    `Batch: #${params.batchId}`,
    `Period: ${params.periodStart} – ${params.periodEnd}`,
  ];
  if (params.siteName) {
    lines.push(`Site: ${params.siteName}`);
  }
  lines.push(
    "",
    "Please review and approve the attendance records at the link below:",
    params.approvalUrl,
    "",
    "This link is valid for 14 days. Please do not share it with unauthorized parties.",
    "",
    "— SmartPRO HR Team",
  );
  return lines.join("\n");
}

// ── Notification type labels (used in tests and in-app display) ───────────────

export const CLIENT_APPROVAL_NOTIFICATION_TYPES = {
  submitted: "client_approval_submitted",
  approved:  "client_approval_approved",
  rejected:  "client_approval_rejected",
} as const;

// ── In-app notification helpers ───────────────────────────────────────────────

function periodLabel(start: string, end: string) {
  return `${start} – ${end}`;
}

function siteLabel(siteName: string | null | undefined) {
  return siteName ? ` (${siteName})` : "";
}

/**
 * Notify the submitting HR user that the batch was submitted for client review.
 * This is a confirmation / audit trail notification.
 */
export async function notifyHrOnBatchSubmitted(params: {
  submitterUserId: number;
  companyId: number;
  batchId: number;
  periodStart: string;
  periodEnd: string;
  siteName?: string | null;
}): Promise<void> {
  try {
    await createNotification(
      {
        userId: params.submitterUserId,
        companyId: params.companyId,
        type: CLIENT_APPROVAL_NOTIFICATION_TYPES.submitted,
        title: `Approval batch #${params.batchId} submitted`,
        message:
          `Batch #${params.batchId} for period ` +
          periodLabel(params.periodStart, params.periodEnd) +
          siteLabel(params.siteName) +
          " has been submitted for client review.",
        link: "/hr/client-approvals",
        isRead: false,
      },
      { actorUserId: params.submitterUserId },
    );
  } catch {
    // Best-effort — never fail the main action
  }
}

/**
 * Notify the HR user who submitted the batch that the client has approved it.
 * Called from the public token-based approval procedure (no authenticated user).
 */
export async function notifyHrOnBatchApproved(params: {
  hrUserId: number;
  companyId: number;
  batchId: number;
  periodStart: string;
  periodEnd: string;
  siteName?: string | null;
}): Promise<void> {
  try {
    await createNotification(
      {
        userId: params.hrUserId,
        companyId: params.companyId,
        type: CLIENT_APPROVAL_NOTIFICATION_TYPES.approved,
        title: `Client approved batch #${params.batchId}`,
        message:
          `The client approved attendance batch #${params.batchId} for period ` +
          periodLabel(params.periodStart, params.periodEnd) +
          siteLabel(params.siteName) +
          ".",
        link: "/hr/client-approvals",
        isRead: false,
      },
      { actorUserId: null },
    );
  } catch {
    // Best-effort
  }
}

/**
 * Notify the HR user who submitted the batch that the client has rejected it.
 * Includes a truncated reason summary — never includes employee-level data.
 */
export async function notifyHrOnBatchRejected(params: {
  hrUserId: number;
  companyId: number;
  batchId: number;
  periodStart: string;
  periodEnd: string;
  siteName?: string | null;
  rejectionReason: string;
}): Promise<void> {
  try {
    const reasonSummary =
      params.rejectionReason.length > 120
        ? params.rejectionReason.slice(0, 120) + "…"
        : params.rejectionReason;

    await createNotification(
      {
        userId: params.hrUserId,
        companyId: params.companyId,
        type: CLIENT_APPROVAL_NOTIFICATION_TYPES.rejected,
        title: `Client rejected batch #${params.batchId}`,
        message:
          `Batch #${params.batchId} for period ` +
          periodLabel(params.periodStart, params.periodEnd) +
          siteLabel(params.siteName) +
          ` was rejected: ${reasonSummary}`,
        link: "/hr/client-approvals",
        isRead: false,
      },
      { actorUserId: null },
    );
  } catch {
    // Best-effort
  }
}
