import React from "react";
import type { ActionQueueStatus } from "../actionQueueTypes";

export type SupportContextFooterProps = {
  queueScopeActive: boolean;
  queueStatus: ActionQueueStatus;
  roleLabel?: string | null;
  freshnessLabel?: string | null;
};

function queueConfidenceLabel(status: ActionQueueStatus): string {
  switch (status) {
    case "error":
      return "Queue confidence: low";
    case "partial":
      return "Queue confidence: partial";
    case "all_clear":
      return "Queue: clear";
    case "no_urgent_blockers":
      return "Queue: no urgent blockers";
    default:
      return "Queue: ready";
  }
}

export function SupportContextFooter({ queueScopeActive, queueStatus, roleLabel, freshnessLabel }: SupportContextFooterProps) {
  return (
    <footer className="border-t border-dashed pt-6 mt-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground/90 justify-center sm:justify-start">
        <span>Operational snapshot</span>
        {queueScopeActive ? <span>{queueConfidenceLabel(queueStatus)}</span> : <span>Queue: no tenant scope</span>}
        {freshnessLabel ? <span>{freshnessLabel}</span> : null}
        {roleLabel ? <span>Viewing as {roleLabel}</span> : null}
      </div>
    </footer>
  );
}
