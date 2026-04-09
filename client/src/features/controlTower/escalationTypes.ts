import type { ActionQueueItemView, PriorityItemView } from "./executionTypes";

export type SlaState = "within_sla" | "nearing_sla" | "breached" | "unknown";

export type EscalationLevel = "normal" | "attention" | "escalated";

/**
 * Semantic escalation / SLA surface — derived client-side only.
 */
export interface EscalationMeta {
  slaState: SlaState;
  escalationLevel: EscalationLevel;
  followThroughRequired: boolean;
  escalationReason?: string | null;
}

export type ActionQueueItemExecutionView = ActionQueueItemView & {
  escalation: EscalationMeta;
};

export type PriorityItemExecutionView = PriorityItemView & {
  escalation: EscalationMeta;
};
