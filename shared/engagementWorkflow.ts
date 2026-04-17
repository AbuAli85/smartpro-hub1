/**
 * Engagement workflow — shared transition rules (no DB imports).
 * Status values align with `engagement_status` enum in Drizzle.
 */
export type EngagementStatusKey =
  | "draft"
  | "active"
  | "waiting_client"
  | "waiting_platform"
  | "blocked"
  | "completed"
  | "archived";

export type EngagementWorkflowCategory =
  | "renewal"
  | "pro_service"
  | "booking"
  | "contract"
  | "support"
  | "mixed";

export type WorkflowActor = "client" | "tenant_staff" | "platform_staff";

export function mapEngagementTypeToCategory(engagementType: string): EngagementWorkflowCategory {
  switch (engagementType) {
    case "work_permit_renewal":
      return "renewal";
    case "pro_service":
      return "pro_service";
    case "marketplace_booking":
      return "booking";
    case "contract":
      return "contract";
    case "workspace":
      return "support";
    case "government_case":
    case "service_request":
      return "support";
    case "pro_billing_cycle":
    case "client_service_invoice":
    case "staffing_month":
      return "mixed";
    default:
      return "mixed";
  }
}

export type WorkflowTransitionDef = {
  from: EngagementStatusKey;
  to: EngagementStatusKey;
  /** Who may initiate this transition */
  actors: WorkflowActor[];
  /** Machine id for audit / guards */
  id: string;
};

const COMMON: WorkflowTransitionDef[] = [
  { id: "activate", from: "draft", to: "active", actors: ["tenant_staff", "platform_staff"] },
  { id: "park_archived", from: "completed", to: "archived", actors: ["tenant_staff", "platform_staff"] },
  { id: "reopen_active", from: "archived", to: "active", actors: ["tenant_staff", "platform_staff"] },
];

const SUPPORT: WorkflowTransitionDef[] = [
  ...COMMON,
  { id: "await_platform", from: "active", to: "waiting_platform", actors: ["client"] },
  { id: "await_client", from: "waiting_platform", to: "waiting_client", actors: ["tenant_staff", "platform_staff"] },
  { id: "back_active", from: "waiting_client", to: "active", actors: ["client"] },
  { id: "block", from: "active", to: "blocked", actors: ["tenant_staff", "platform_staff"] },
  { id: "unblock", from: "blocked", to: "active", actors: ["tenant_staff", "platform_staff"] },
  { id: "complete", from: "active", to: "completed", actors: ["tenant_staff", "platform_staff"] },
  { id: "complete_from_wait", from: "waiting_client", to: "completed", actors: ["tenant_staff", "platform_staff"] },
];

const PRO: WorkflowTransitionDef[] = [
  ...COMMON,
  { id: "handoff_client", from: "active", to: "waiting_client", actors: ["tenant_staff", "platform_staff"] },
  { id: "client_respond", from: "waiting_client", to: "waiting_platform", actors: ["client"] },
  { id: "resume", from: "waiting_platform", to: "active", actors: ["tenant_staff", "platform_staff"] },
  { id: "block", from: "active", to: "blocked", actors: ["tenant_staff", "platform_staff"] },
  { id: "unblock", from: "blocked", to: "active", actors: ["tenant_staff", "platform_staff"] },
  { id: "complete", from: "active", to: "completed", actors: ["tenant_staff", "platform_staff"] },
  { id: "complete_wait_client", from: "waiting_client", to: "completed", actors: ["tenant_staff", "platform_staff"] },
];

const BOOKING_CONTRACT: WorkflowTransitionDef[] = [
  ...COMMON,
  { id: "need_client", from: "active", to: "waiting_client", actors: ["tenant_staff", "platform_staff"] },
  { id: "client_done", from: "waiting_client", to: "waiting_platform", actors: ["client"] },
  { id: "fulfil", from: "waiting_platform", to: "active", actors: ["tenant_staff", "platform_staff"] },
  { id: "complete", from: "active", to: "completed", actors: ["tenant_staff", "platform_staff", "client"] },
];

const RENEWAL: WorkflowTransitionDef[] = [
  ...COMMON,
  { id: "triage", from: "active", to: "waiting_platform", actors: ["tenant_staff", "platform_staff"] },
  { id: "need_docs", from: "waiting_platform", to: "waiting_client", actors: ["tenant_staff", "platform_staff"] },
  { id: "docs_received", from: "waiting_client", to: "waiting_platform", actors: ["client"] },
  { id: "complete", from: "waiting_platform", to: "completed", actors: ["tenant_staff", "platform_staff"] },
];

const MIXED: WorkflowTransitionDef[] = [
  ...COMMON,
  { id: "await_platform", from: "active", to: "waiting_platform", actors: ["tenant_staff", "platform_staff", "client"] },
  { id: "await_client", from: "waiting_platform", to: "waiting_client", actors: ["tenant_staff", "platform_staff"] },
  { id: "resume", from: "waiting_client", to: "active", actors: ["client", "tenant_staff", "platform_staff"] },
  { id: "block", from: "active", to: "blocked", actors: ["tenant_staff", "platform_staff"] },
  { id: "unblock", from: "blocked", to: "active", actors: ["tenant_staff", "platform_staff"] },
  { id: "complete", from: "active", to: "completed", actors: ["tenant_staff", "platform_staff"] },
];

export function transitionsForCategory(cat: EngagementWorkflowCategory): WorkflowTransitionDef[] {
  switch (cat) {
    case "support":
      return SUPPORT;
    case "pro_service":
      return PRO;
    case "booking":
    case "contract":
      return BOOKING_CONTRACT;
    case "renewal":
      return RENEWAL;
    default:
      return MIXED;
  }
}

export function resolveWorkflowActor(input: {
  isPlatformStaff: boolean;
  memberRole: string | null | undefined;
}): WorkflowActor {
  if (input.isPlatformStaff) return "platform_staff";
  const r = input.memberRole;
  if (r === "client" || r === "company_member") return "client";
  return "tenant_staff";
}

export function findTransition(
  cat: EngagementWorkflowCategory,
  from: EngagementStatusKey,
  to: EngagementStatusKey,
): WorkflowTransitionDef | null {
  return transitionsForCategory(cat).find((t) => t.from === from && t.to === to) ?? null;
}
