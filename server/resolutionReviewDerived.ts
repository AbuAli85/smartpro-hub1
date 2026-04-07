/**
 * Honest, deterministic review / closure hints for leadership and export.
 * Does not claim "resolved" without data — uses explicit buckets and basis strings.
 */

export type ResolutionWorkflowScope = "crm_contact" | "workspace_billing";

export type ResolutionReviewBucket =
  | "stalled_follow_up"
  | "in_follow_up"
  | "needs_assignment"
  | "needs_tagged_task"
  | "monitor_no_tag";

type W = {
  hasOpenEmployeeTask: boolean;
  isTaskDueOverdue: boolean;
  accountabilityGap: string;
};

export type ResolutionReviewMeta = {
  workflowScope: ResolutionWorkflowScope;
  reviewBucket: ResolutionReviewBucket;
  /** Why this bucket was chosen — stable for export. */
  reviewBasis: string;
};

export function deriveResolutionReviewMeta(input: {
  rowKind: "ranked" | "renewal" | "collections";
  w: W;
  /** CRM tier string; null for billing. */
  tier: string | null;
  /** Days until contract end for CRM; null if unknown. */
  daysUntilEnd: number | null;
}): ResolutionReviewMeta {
  const { w, rowKind, tier, daysUntilEnd } = input;

  if (rowKind === "collections") {
    if (w.hasOpenEmployeeTask && w.isTaskDueOverdue) {
      return {
        workflowScope: "workspace_billing",
        reviewBucket: "stalled_follow_up",
        reviewBasis:
          "Workspace billing: open tagged HR task exists but its due date is past — escalate collections follow-up.",
      };
    }
    if (w.hasOpenEmployeeTask) {
      return {
        workflowScope: "workspace_billing",
        reviewBucket: "in_follow_up",
        reviewBasis: "Workspace billing: open tagged HR task linked to this billing cycle (not past due).",
      };
    }
    return {
      workflowScope: "workspace_billing",
      reviewBucket: "needs_tagged_task",
      reviewBasis:
        "Workspace billing: no open tagged task — include [RESOLUTION:billing:cycle:<id>] in HR task title or description.",
    };
  }

  // CRM contact
  if (w.hasOpenEmployeeTask && w.isTaskDueOverdue) {
    return {
      workflowScope: "crm_contact",
      reviewBucket: "stalled_follow_up",
      reviewBasis: "CRM: tagged follow-up task exists but is past due.",
    };
  }
  if (w.hasOpenEmployeeTask) {
    return {
      workflowScope: "crm_contact",
      reviewBucket: "in_follow_up",
      reviewBasis: "CRM: open tagged HR task linked to this contact (not past due).",
    };
  }
  if (w.accountabilityGap !== "none") {
    return {
      workflowScope: "crm_contact",
      reviewBucket: "needs_assignment",
      reviewBasis: `CRM: accountability gap (${w.accountabilityGap.replace(/_/g, " ")}) — assign owner and/or create tagged task.`,
    };
  }
  if (tier === "watch" && (daysUntilEnd == null || daysUntilEnd > 21)) {
    return {
      workflowScope: "crm_contact",
      reviewBucket: "monitor_no_tag",
      reviewBasis:
        "CRM: no accountability gap under current rules (watch tier, longer horizon). Verify in CRM if a tagged task is still useful for traceability — not marked resolved.",
    };
  }
  return {
    workflowScope: "crm_contact",
    reviewBucket: "needs_tagged_task",
    reviewBasis:
      "CRM: no open tagged HR task — add [RESOLUTION:crm:contact:<id>] for operational traceability (risk may still be present).",
  };
}
