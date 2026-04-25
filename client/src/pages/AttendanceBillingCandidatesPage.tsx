import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type CandidateStatus = "draft" | "review_ready" | "cancelled";

type BillingLine = {
  itemId: number;
  employeeId: number;
  attendanceDate: string;
  attendanceSessionId: number | null;
  attendanceRecordId: number | null;
  employeeDisplayName: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  durationMinutes: number | null;
  sessionStatus: string | null;
  siteId: number | null;
  snapshotMissing?: boolean;
  snapshotWarning?: string;
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CandidateStatus }) {
  const cfg: Record<CandidateStatus, { cls: string; icon: React.ReactNode; label: string }> = {
    draft: {
      cls: "bg-gray-100 text-gray-700 border-gray-200",
      icon: <FileText className="w-3 h-3" />,
      label: "Draft",
    },
    review_ready: {
      cls: "bg-blue-50 text-blue-700 border-blue-200",
      icon: <Clock className="w-3 h-3" />,
      label: "Review ready",
    },
    cancelled: {
      cls: "bg-red-50 text-red-400 border-red-200",
      icon: <XCircle className="w-3 h-3" />,
      label: "Cancelled",
    },
  };
  const { cls, icon, label } = cfg[status] ?? cfg.draft;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
        cls,
      )}
    >
      {icon}
      {label}
    </span>
  );
}

// ─── Candidate detail sheet ───────────────────────────────────────────────────

function CandidateDetailSheet({
  candidateId,
  open,
  onClose,
}: {
  candidateId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();

  const { data: candidate, isLoading } = trpc.attendanceBilling.getAttendanceBillingCandidate.useQuery(
    { candidateId: candidateId! },
    { enabled: open && candidateId != null },
  );

  const markReady = trpc.attendanceBilling.markAttendanceBillingCandidateReviewReady.useMutation({
    onSuccess: () => {
      toast.success("Candidate marked as review ready");
      utils.attendanceBilling.listAttendanceBillingCandidates.invalidate();
      utils.attendanceBilling.getAttendanceBillingCandidate.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const cancel = trpc.attendanceBilling.cancelAttendanceBillingCandidate.useMutation({
    onSuccess: () => {
      toast.success("Candidate cancelled");
      utils.attendanceBilling.listAttendanceBillingCandidates.invalidate();
      utils.attendanceBilling.getAttendanceBillingCandidate.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  function formatTime(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  const lines: BillingLine[] = (candidate?.billingLinesJson as BillingLine[] | undefined) ?? [];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Billing Candidate #{candidateId}</SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {candidate && (
          <div className="mt-4 space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Status</span>
                <div className="mt-1">
                  <StatusBadge status={candidate.status as CandidateStatus} />
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Period</span>
                <div className="mt-1 font-medium">
                  {candidate.periodStart} → {candidate.periodEnd}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Approved items</span>
                <div className="mt-1 font-medium">{candidate.approvedItemCount}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Total hours</span>
                <div className="mt-1 font-medium">
                  {candidate.totalHours != null ? `${candidate.totalHours}h` : "—"}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Source</span>
                <div className="mt-1 font-medium capitalize">{candidate.source.replace(/_/g, " ")}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Batch ID</span>
                <div className="mt-1 font-medium">{candidate.batchId}</div>
              </div>
            </div>

            {/* Snapshot warning */}
            {candidate.hasSnapshotWarning && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  {candidate.snapshotMissingCount} billing line
                  {candidate.snapshotMissingCount !== 1 ? "s" : ""} are missing attendance
                  snapshots. Finance review required before issuance.
                </span>
              </div>
            )}

            {/* Billing lines */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Billing lines ({lines.length})</h3>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No billing lines.</p>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Check-in</TableHead>
                        <TableHead>Check-out</TableHead>
                        <TableHead className="text-right">Minutes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => (
                        <TableRow
                          key={line.itemId}
                          className={line.snapshotMissing ? "bg-amber-50" : undefined}
                        >
                          <TableCell className="font-medium">
                            {line.employeeDisplayName ?? `#${line.employeeId}`}
                            {line.snapshotMissing && (
                              <span className="ml-1 text-amber-600 text-xs">(no snapshot)</span>
                            )}
                          </TableCell>
                          <TableCell>{line.attendanceDate}</TableCell>
                          <TableCell>{formatTime(line.checkInAt)}</TableCell>
                          <TableCell>{formatTime(line.checkOutAt)}</TableCell>
                          <TableCell className="text-right">
                            {line.durationMinutes ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Actions */}
            {candidate.status !== "cancelled" && (
              <div className="flex gap-2 pt-2">
                {candidate.status === "draft" && (
                  <Button
                    size="sm"
                    onClick={() =>
                      markReady.mutate({ candidateId: candidate.id })
                    }
                    disabled={markReady.isPending}
                  >
                    {markReady.isPending ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                    )}
                    Mark review ready
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => cancel.mutate({ candidateId: candidate.id })}
                  disabled={cancel.isPending}
                >
                  {cancel.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4 mr-1" />
                  )}
                  Cancel candidate
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AttendanceBillingCandidatesPage() {
  const { activeCompanyId } = useActiveCompany();
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: candidates, isLoading, refetch } =
    trpc.attendanceBilling.listAttendanceBillingCandidates.useQuery(
      {
        status: statusFilter === "all" ? undefined : statusFilter,
      },
      { enabled: activeCompanyId != null },
    );

  const rows = candidates ?? [];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Attendance Billing Candidates</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Draft billing artifacts from approved client attendance batches. Finance/admin review
            only — no invoices are created here.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={cn("w-4 h-4 mr-1", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as CandidateStatus | "all")}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="review_ready">Review ready</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Candidate cards */}
      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No billing candidates found.</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((c) => (
            <Card
              key={c.id}
              className="cursor-pointer hover:shadow-sm transition-shadow"
              onClick={() => setSelectedId(c.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">Batch #{c.batchId}</span>
                      <StatusBadge status={c.status as CandidateStatus} />
                      {(c.snapshotMissingCount ?? 0) > 0 && (
                        <Badge
                          variant="outline"
                          className="text-amber-700 border-amber-300 bg-amber-50 text-xs"
                        >
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          {c.snapshotMissingCount} missing snapshot
                          {c.snapshotMissingCount !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Period: {c.periodStart} → {c.periodEnd}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-sm font-semibold">
                      {c.approvedItemCount} item{c.approvedItemCount !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.totalDurationMinutes != null
                        ? `${Math.round((c.totalDurationMinutes / 60) * 10) / 10}h`
                        : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail sheet */}
      <CandidateDetailSheet
        candidateId={selectedId}
        open={selectedId != null}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
