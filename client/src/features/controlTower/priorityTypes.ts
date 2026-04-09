/**
 * Control Tower priority surface — derived from canonical `ActionQueueItem`, not a parallel feed.
 */

import type { ActionKind, ActionSource } from "./actionQueueTypes";

export type PriorityLevel = "critical" | "important" | "watch";

export interface PriorityItem {
  id: string;
  actionId: string;
  title: string;
  summary: string;
  whyThisMatters: string;
  recommendedAction: string;
  priorityLevel: PriorityLevel;
  blocking: boolean;
  href: string;
  ctaLabel: string;
  dueLabel?: string | null;
  ownerLabel?: string | null;
  source: ActionSource;
  kind: ActionKind;
}
