/**
 * client/src/features/controlTower/ctActionCopy.ts
 *
 * Canonical label, tooltip, and confirmation copy for each ControlTowerAction.
 * Server drives which actions are available; client uses this for rendering only.
 */

import type { ControlTowerAction } from "@shared/controlTowerTypes";

export interface CtActionCopy {
  label: string;
  tooltip: string;
  /** Short verb for aria-labels and confirmation dialogs. */
  verb: string;
}

export const CT_ACTION_COPY: Record<ControlTowerAction, CtActionCopy> = {
  acknowledge: {
    label: "Acknowledge",
    tooltip: "I have seen this — mark it as acknowledged.",
    verb: "Acknowledge",
  },
  assign: {
    label: "Assign",
    tooltip: "Assign this item to a team member to action.",
    verb: "Assign",
  },
  resolve: {
    label: "Resolve",
    tooltip: "The underlying issue is fixed — mark it as resolved.",
    verb: "Resolve",
  },
  dismiss: {
    label: "Dismiss",
    tooltip: "Hide with a reason. May reappear in 7 days if the source issue persists.",
    verb: "Dismiss",
  },
  view_detail: {
    label: "View detail",
    tooltip: "Open the full detail view for this item.",
    verb: "View",
  },
  open_related: {
    label: "Open related",
    tooltip: "Go to the source module to fix the underlying issue.",
    verb: "Open",
  },
};
