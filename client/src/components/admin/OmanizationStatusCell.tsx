import React, { useMemo } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/dateUtils";

type ComplianceStatus = "compliant" | "warning" | "non_compliant";

export interface OmanizationSnapshotSummary {
  createdAt: Date | string;
  snapshotMonth: number;
  snapshotYear: number;
  omaniRatio: string | number;
  omaniEmployees: number;
  totalEmployees: number;
  complianceStatus: ComplianceStatus;
}

function parseDate(input: Date | string | null | undefined): Date | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function statusBadge(status: ComplianceStatus | "unknown") {
  if (status === "compliant") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (status === "warning") return "bg-amber-100 text-amber-800 border-amber-200";
  if (status === "non_compliant") return "bg-red-100 text-red-800 border-red-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function statusLabel(status: ComplianceStatus | "unknown") {
  if (status === "compliant") return "Compliant";
  if (status === "warning") return "Warning";
  if (status === "non_compliant") return "Non-compliant";
  return "No snapshot";
}

function formatRate(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0.00%";
  return `${n.toFixed(2)}%`;
}

export function OmanizationStatusCell({
  companyId,
  latestSnapshot,
  onRefreshed,
}: {
  companyId: number;
  latestSnapshot: OmanizationSnapshotSummary | null | undefined;
  onRefreshed: () => void;
}) {
  const captureSnapshot = trpc.companies.captureOmanizationSnapshot.useMutation({
    onSuccess: () => {
      toast.success("Omanization snapshot refreshed");
      onRefreshed();
    },
    onError: (error) => toast.error(error.message || "Failed to refresh Omanization snapshot"),
  });

  const snapshotDate = parseDate(latestSnapshot?.createdAt);
  const isStale = useMemo(() => {
    if (!snapshotDate) return false;
    const ageMs = Date.now() - snapshotDate.getTime();
    return ageMs > 1000 * 60 * 60 * 24 * 30;
  }, [snapshotDate]);

  const status = latestSnapshot?.complianceStatus ?? "unknown";

  return (
    <div className="min-w-[250px] space-y-1.5 py-1" data-testid={`omanization-cell-${companyId}`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className={`text-[10px] ${statusBadge(status)}`}>
          {statusLabel(status)}
        </Badge>
        {isStale && (
          <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-800">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Stale
          </Badge>
        )}
      </div>

      {latestSnapshot ? (
        <>
          <p className="text-xs font-semibold tabular-nums">
            {formatRate(latestSnapshot.omaniRatio)} · {latestSnapshot.omaniEmployees}/{latestSnapshot.totalEmployees}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Snapshot: {fmtDate(snapshotDate ?? latestSnapshot.createdAt)} ({latestSnapshot.snapshotMonth}/{latestSnapshot.snapshotYear})
          </p>
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">No Omanization snapshot recorded yet.</p>
      )}

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-6 px-2 text-[11px]"
        onClick={() => captureSnapshot.mutate({ companyId })}
        disabled={captureSnapshot.isPending}
        aria-label={`Refresh Omanization snapshot for company ${companyId}`}
      >
        {captureSnapshot.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
        Refresh
      </Button>
    </div>
  );
}

export default OmanizationStatusCell;
