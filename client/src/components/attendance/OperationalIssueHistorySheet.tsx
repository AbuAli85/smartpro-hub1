import { trpc } from "@/lib/trpc";
import { fmtDateTimeShort } from "@/lib/dateUtils";
import { formatOperationalIssueHistoryAuditActionLabel } from "@shared/attendanceOperationalAuditPresentation";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

export function OperationalIssueHistorySheet({
  open,
  onOpenChange,
  companyId,
  issueKey,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: number | null;
  issueKey: string | null;
}) {
  const { data, isLoading, error } = trpc.attendance.getOperationalIssueHistory.useQuery(
    { companyId: companyId ?? undefined, issueKey: issueKey ?? "" },
    { enabled: open && companyId != null && (issueKey?.length ?? 0) > 0 },
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>Operational issue</SheetTitle>
          <SheetDescription>
            Current triage state and related attendance audit entries for this item.
          </SheetDescription>
        </SheetHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6">Loading…</p>
        ) : error ? (
          <p className="text-sm text-destructive py-6">{error.message}</p>
        ) : data ? (
          <div className="flex flex-col gap-4 flex-1 min-h-0 mt-2">
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Status</span>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {data.summary.status}
                </Badge>
                <span className="text-[11px] text-muted-foreground">{data.summary.issueKind.replace(/_/g, " ")}</span>
              </div>
              <div className="text-[11px] text-muted-foreground space-y-0.5">
                {data.summary.assignedToName ? (
                  <div>
                    Assigned to <span className="text-foreground">{data.summary.assignedToName}</span>
                  </div>
                ) : (
                  <div>Unassigned</div>
                )}
                {data.summary.acknowledgedByName ? (
                  <div>
                    Acknowledged by {data.summary.acknowledgedByName}
                    {data.summary.acknowledgedAt
                      ? ` · ${fmtDateTimeShort(new Date(data.summary.acknowledgedAt))}`
                      : ""}
                  </div>
                ) : null}
                {data.summary.reviewedByName ? (
                  <div>
                    {data.summary.status === "resolved" ? "Resolved" : "Reviewed"} by {data.summary.reviewedByName}
                    {data.summary.reviewedAt
                      ? ` · ${fmtDateTimeShort(new Date(data.summary.reviewedAt))}`
                      : ""}
                  </div>
                ) : null}
                {data.summary.resolutionNote ? (
                  <div className="text-foreground pt-1 border-t border-border/60 mt-1">
                    <span className="text-muted-foreground">Note: </span>
                    {data.summary.resolutionNote}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Audit timeline</p>
              <ScrollArea className="h-[min(55vh,420px)] pr-3">
                <ul className="space-y-2 text-sm">
                  {data.timeline.length === 0 ? (
                    <li className="text-muted-foreground text-xs">No audit entries linked yet.</li>
                  ) : (
                    data.timeline.map((e) => (
                      <li key={e.id} className="rounded-md border px-2 py-1.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                          <span className="font-medium">{fmtDateTimeShort(new Date(e.createdAt))}</span>
                          <Badge variant="secondary" className="text-[10px] h-5 font-normal">
                            {formatOperationalIssueHistoryAuditActionLabel(e.actionType)}
                          </Badge>
                          {e.source ? (
                            <span className="text-muted-foreground capitalize">{e.source.replace(/_/g, " ")}</span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {e.actorName ?? `User #${e.actorUserId}`}
                        </div>
                        {e.reason ? (
                          <p className="text-[11px] text-foreground/90 mt-1 whitespace-pre-wrap">{e.reason}</p>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>
              </ScrollArea>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
