import { Badge } from "@/components/ui/badge";
import { fmtDateTimeShort } from "@/lib/dateUtils";
import { OperationalIssueHistoryTrigger } from "@/components/attendance/OperationalIssueHistoryTrigger";

export type OperationalIssueSummaryLike = {
  issueKey: string;
  status: string;
  assignedToName?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: Date | string | null;
  resolutionNote?: string | null;
} | null;

function fmtWhen(d: Date | string | null | undefined): string {
  if (d == null) return "";
  try {
    return fmtDateTimeShort(typeof d === "string" ? new Date(d) : d);
  } catch {
    return "";
  }
}

export function OperationalIssueMetaStrip({
  operationalIssue,
  pendingHint,
  onOpenHistory,
}: {
  operationalIssue: OperationalIssueSummaryLike;
  /** When the domain row is still pending but sync has not created an issue row yet. */
  pendingHint?: boolean;
  onOpenHistory: () => void;
}) {
  if (operationalIssue == null) {
    if (!pendingHint) return null;
    return (
      <div className="mt-2 rounded-md border border-dashed border-muted-foreground/25 px-2 py-1.5 text-[11px] text-muted-foreground">
        Operational triage will attach after the next live board sync.
      </div>
    );
  }

  const oi = operationalIssue;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
      <span className="text-muted-foreground shrink-0">Ops</span>
      <Badge variant="outline" className="text-[10px] h-5 capitalize py-0 border-violet-200 bg-violet-50 text-violet-900">
        {oi.status}
      </Badge>
      {oi.assignedToName ? (
        <span className="text-muted-foreground">
          Assignee <span className="text-foreground font-medium">{oi.assignedToName}</span>
        </span>
      ) : null}
      {oi.reviewedByName ? (
        <span className="text-muted-foreground">
          {oi.status === "resolved" ? "Resolved" : "Reviewed"} by{" "}
          <span className="text-foreground font-medium">{oi.reviewedByName}</span>
          {oi.reviewedAt ? <span className="text-muted-foreground"> · {fmtWhen(oi.reviewedAt)}</span> : null}
        </span>
      ) : null}
      {oi.resolutionNote ? (
        <span
          className="text-muted-foreground line-clamp-1 max-w-[min(100%,32rem)]"
          title={oi.resolutionNote}
        >
          {oi.resolutionNote}
        </span>
      ) : null}
      <OperationalIssueHistoryTrigger onClick={onOpenHistory} className="ml-auto" />
    </div>
  );
}
