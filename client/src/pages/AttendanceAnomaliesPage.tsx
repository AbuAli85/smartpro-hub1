import { useState } from "react";
import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  Layers,
  LogOut,
  RefreshCw,
  RotateCcw,
  Wrench,
} from "lucide-react";
import { fmtDate } from "@/lib/dateUtils";

type AnomalyType = NonNullable<
  RouterOutputs["attendance"]["getSessionAnomalies"]["anomalies"]
>[number];
type DedupResult = RouterOutputs["attendance"]["deduplicateAttendanceRecords"];

const ANOMALY_META: Record<string, { label: string; description: string; icon: React.ReactNode }> = {
  MULTIPLE_OPEN_SESSIONS: {
    label: "Multiple open sessions",
    description: "Employee has 2+ open punches on the same shift — only the newest should be kept.",
    icon: <Copy className="h-4 w-4 text-red-600" />,
  },
  MULTIPLE_SESSIONS: {
    label: "Multiple sessions on same shift",
    description: "Multiple attendance rows exist for the same shift day — verify the extra rows are expected.",
    icon: <Layers className="h-4 w-4 text-amber-600" />,
  },
  RUNAWAY_SESSION: {
    label: "Runaway session (>16 hours)",
    description: "Employee has been clocked in for over 16 hours — likely a missed checkout.",
    icon: <Clock className="h-4 w-4 text-red-600" />,
  },
  EARLY_CHECKIN_RECHECKIN: {
    label: "Re-check-in after early exit",
    description: "Employee checked out early then checked back in for the same shift.",
    icon: <RotateCcw className="h-4 w-4 text-amber-600" />,
  },
};

function AnomalyCard({
  anomaly,
  onForceCheckout,
  isForcing,
}: {
  anomaly: AnomalyType;
  onForceCheckout: (recordId: number, reason: string) => void;
  isForcing: boolean;
}) {
  const meta = ANOMALY_META[anomaly.type];
  const isCritical = anomaly.severity === "critical";
  const [forceReason, setForceReason] = useState("");
  const [forceTarget, setForceTarget] = useState<number | null>(null);

  return (
    <Card
      className={cn(
        "border",
        isCritical ? "border-red-200 dark:border-red-800" : "border-amber-200 dark:border-amber-800",
      )}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "mt-0.5 p-1.5 rounded-md",
              isCritical ? "bg-red-100 dark:bg-red-950" : "bg-amber-100 dark:bg-amber-950",
            )}
          >
            {meta?.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{meta?.label ?? anomaly.type}</span>
              <Badge variant={isCritical ? "destructive" : "outline"} className="text-[10px] px-1.5">
                {isCritical ? "Critical" : "Warning"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{meta?.description}</p>
            <p className="text-xs text-foreground mt-1.5 font-mono bg-muted/50 rounded px-2 py-1">
              {anomaly.detail}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2 text-[11px] text-muted-foreground">
              <span>Employee #{anomaly.employeeId}</span>
              {anomaly.scheduleId && <span>· Schedule #{anomaly.scheduleId}</span>}
              <span>· Records: {anomaly.recordIds.map((id) => `#${id}`).join(", ")}</span>
            </div>

            {(anomaly.type === "MULTIPLE_OPEN_SESSIONS" || anomaly.type === "RUNAWAY_SESSION") && (
              <div className="mt-3 space-y-2">
                {forceTarget == null ? (
                  <div className="flex flex-wrap gap-1.5">
                    {anomaly.recordIds.map((id) => (
                      <Button
                        key={id}
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] gap-1 text-red-700 border-red-200 hover:bg-red-50"
                        onClick={() => setForceTarget(id)}
                      >
                        <LogOut className="h-3 w-3" />
                        Force checkout #{id}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Reason for force-closing record #{forceTarget} (required, min 10 chars):
                    </p>
                    <Textarea
                      value={forceReason}
                      onChange={(e) => setForceReason(e.target.value)}
                      placeholder="e.g. Employee forgot to check out — confirmed with manager"
                      className="text-xs h-16 resize-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs gap-1"
                        disabled={forceReason.trim().length < 10 || isForcing}
                        onClick={() => {
                          onForceCheckout(forceTarget, forceReason.trim());
                          setForceTarget(null);
                          setForceReason("");
                        }}
                      >
                        <LogOut className="h-3 w-3" />
                        Confirm force checkout
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => {
                          setForceTarget(null);
                          setForceReason("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DedupDialog({
  open,
  onClose,
  preview,
  onRunDryRun,
  onRunFix,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  preview: DedupResult | null;
  onRunDryRun: () => void;
  onRunFix: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Deduplicate open sessions
          </DialogTitle>
          <DialogDescription>
            Finds employees with 2+ open punches on the same shift. Keeps the newest open row and
            applies a synthetic checkout (1 min before the next check-in) to all earlier duplicates.
          </DialogDescription>
        </DialogHeader>

        {!preview && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Run a dry-run first to preview what will be changed without modifying any records.
            </p>
            <Button
              onClick={onRunDryRun}
              disabled={isPending}
              variant="outline"
              className="w-full gap-1.5"
            >
              {isPending ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              Preview (dry run)
            </Button>
          </div>
        )}

        {preview && (
          <div className="space-y-3 py-2">
            {preview.affectedGroups === 0 ? (
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm">
                <CheckCircle2 className="h-4 w-4" />
                No duplicate open sessions found — nothing to fix.
              </div>
            ) : (
              <>
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm">
                  Found <strong>{preview.affectedGroups}</strong> group(s) with duplicates. Would patch{" "}
                  <strong>{preview.patchedRows}</strong> row(s).
                  {preview.dryRun && " (preview only — no changes made yet)"}
                </div>
                {preview.groups.slice(0, 5).map((g, i) => (
                  <div key={i} className="text-xs text-muted-foreground font-mono bg-muted/40 rounded px-2 py-1">
                    Emp #{g.employeeId} · Sched #{g.scheduleId} · {g.openCount} open → keep #
                    {g.keptRecordId}, patch #{g.patchedIds.join(", #")}
                  </div>
                ))}
                {preview.groups.length > 5 && (
                  <p className="text-xs text-muted-foreground">
                    ...and {preview.groups.length - 5} more groups.
                  </p>
                )}
                {preview.dryRun && (
                  <Button
                    onClick={onRunFix}
                    disabled={isPending}
                    variant="destructive"
                    className="w-full gap-1.5"
                  >
                    {isPending ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wrench className="h-3.5 w-3.5" />
                    )}
                    Apply fix ({preview.patchedRows} rows)
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AttendanceAnomaliesPage() {
  const { activeCompanyId } = useActiveCompany();

  const today = new Date().toISOString().split("T")[0]!;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().split("T")[0]!;
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [dedupOpen, setDedupOpen] = useState(false);
  const [dedupPreview, setDedupPreview] = useState<DedupResult | null>(null);

  const anomalyQuery = trpc.attendance.getSessionAnomalies.useQuery(
    {
      companyId: activeCompanyId ?? undefined,
      dateFrom,
      dateTo,
      limit: 200,
    },
    { enabled: activeCompanyId != null },
  );

  const dedupMutation = trpc.attendance.deduplicateAttendanceRecords.useMutation({
    onSuccess: (data) => {
      setDedupPreview(data);
      if (!data.dryRun) {
        toast.success(`Fixed ${data.patchedRows} duplicate row(s) across ${data.affectedGroups} group(s).`);
        void anomalyQuery.refetch();
        setDedupOpen(false);
        setDedupPreview(null);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const forceCheckoutMutation = trpc.attendance.forceCheckout.useMutation({
    onSuccess: () => {
      toast.success("Session closed.");
      void anomalyQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const critical = anomalyQuery.data?.anomalies.filter((a) => a.severity === "critical") ?? [];
  const warnings = anomalyQuery.data?.anomalies.filter((a) => a.severity === "warning") ?? [];

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <AlertOctagon className="h-5 w-5 text-[var(--smartpro-orange)]" />
            Attendance Anomaly Report
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Detect and resolve duplicate punches, runaway sessions, and re-check-ins.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDedupOpen(true)}
          disabled={activeCompanyId == null}
          className="gap-1.5 shrink-0"
        >
          <Wrench className="h-3.5 w-3.5" />
          Dedup open sessions
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Label className="shrink-0 text-muted-foreground">From</Label>
          <Input
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-36 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Label className="shrink-0 text-muted-foreground">To</Label>
          <Input
            type="date"
            value={dateTo}
            min={dateFrom}
            max={today}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-36 h-8 text-sm"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => anomalyQuery.refetch()}
          disabled={anomalyQuery.isFetching}
          className="gap-1.5"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", anomalyQuery.isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {anomalyQuery.data && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 flex flex-wrap items-center gap-4 text-sm",
            anomalyQuery.data.total === 0
              ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20"
              : critical.length > 0
                ? "border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-950/20"
                : "border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20",
          )}
        >
          {anomalyQuery.data.total === 0 ? (
            <span className="text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              No anomalies found in this window — data looks clean.
            </span>
          ) : (
            <>
              {critical.length > 0 && (
                <span className="text-red-700 dark:text-red-400 font-semibold">🔴 Critical: {critical.length}</span>
              )}
              {warnings.length > 0 && (
                <span className="text-amber-700 dark:text-amber-400 font-semibold">🟡 Warning: {warnings.length}</span>
              )}
              <span className="text-muted-foreground">Total: {anomalyQuery.data.total}</span>
            </>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {fmtDate(anomalyQuery.data.windowFrom)} → {fmtDate(anomalyQuery.data.windowTo)}
          </span>
        </div>
      )}

      {anomalyQuery.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {!anomalyQuery.isLoading && anomalyQuery.data?.total === 0 && (
        <p className="text-sm text-center text-muted-foreground py-8">
          All attendance records in the selected window are clean.
        </p>
      )}

      <div className="space-y-3">
        {anomalyQuery.data?.anomalies.map((anomaly, i) => (
          <AnomalyCard
            key={`${anomaly.type}-${anomaly.employeeId}-${anomaly.recordIds.join("-")}-${i}`}
            anomaly={anomaly}
            onForceCheckout={(recordId, reason) =>
              forceCheckoutMutation.mutate({
                companyId: activeCompanyId ?? undefined,
                attendanceRecordId: recordId,
                reason,
              })
            }
            isForcing={forceCheckoutMutation.isPending}
          />
        ))}
      </div>

      <DedupDialog
        open={dedupOpen}
        onClose={() => {
          setDedupOpen(false);
          setDedupPreview(null);
        }}
        preview={dedupPreview}
        onRunDryRun={() =>
          dedupMutation.mutate({ companyId: activeCompanyId ?? undefined, dryRun: true })
        }
        onRunFix={() =>
          dedupMutation.mutate({ companyId: activeCompanyId ?? undefined, dryRun: false })
        }
        isPending={dedupMutation.isPending}
      />
    </div>
  );
}
