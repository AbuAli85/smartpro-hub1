import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, CheckCircle2, ClipboardList, Users } from "lucide-react";

export type KpiSnapshotSectionProps = {
  scopeEnabled: boolean;
  /** Optional queue size delta vs last local snapshot */
  queueTrendHint?: string | null;
  statsLoading: boolean;
  employees: number | null | undefined;
  employeesTrust: string;
  pulseLoading: boolean;
  pendingApprovals: number;
  pendingTrust: string;
  revenueMtd: number | null;
  revenueTrust: string;
  scoreLoading: boolean;
  complianceScore: number | null | undefined;
  complianceGrade: string | null | undefined;
  complianceTrust: string;
};

export function KpiSnapshotSection({
  scopeEnabled,
  queueTrendHint,
  statsLoading,
  employees,
  employeesTrust,
  pulseLoading,
  pendingApprovals,
  pendingTrust,
  revenueMtd,
  revenueTrust,
  scoreLoading,
  complianceScore,
  complianceGrade,
  complianceTrust,
}: KpiSnapshotSectionProps) {
  return (
    <section aria-label="Key metrics" className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">Supporting snapshot</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Operational context — secondary to blockers and the queue.
        </p>
        {scopeEnabled && queueTrendHint ? (
          <p className="text-[10px] text-muted-foreground/90 mt-1 tabular-nums">{queueTrendHint}</p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-sm border-muted/80 bg-muted/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-semibold uppercase">
              <Users className="w-3.5 h-3.5" /> Active employees
            </div>
            <p className="text-xl sm:text-2xl font-bold mt-1 tabular-nums text-foreground/90">
              {statsLoading ? "—" : employees ?? "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{employeesTrust}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-muted/80 bg-muted/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-semibold uppercase">
              <ClipboardList className="w-3.5 h-3.5" /> Pending approvals
            </div>
            <p className="text-xl sm:text-2xl font-bold mt-1 tabular-nums text-foreground/90">
              {pulseLoading && scopeEnabled ? "—" : pendingApprovals}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{pendingTrust}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-muted/80 bg-muted/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-semibold uppercase">
              <Activity className="w-3.5 h-3.5" /> Revenue (MTD)
            </div>
            <p className="text-xl sm:text-2xl font-bold mt-1 tabular-nums text-foreground/90">
              {revenueMtd == null ? "—" : `OMR ${Number(revenueMtd).toLocaleString("en-OM", { minimumFractionDigits: 3 })}`}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{revenueTrust}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-muted/80 bg-muted/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-semibold uppercase">
              <CheckCircle2 className="w-3.5 h-3.5" /> Compliance score
            </div>
            <p className="text-xl sm:text-2xl font-bold mt-1 tabular-nums text-foreground/90">
              {scoreLoading ? "—" : complianceScore != null ? `${complianceScore}` : "—"}
            </p>
            {complianceGrade ? <p className="text-xs text-muted-foreground">Grade {complianceGrade}</p> : null}
            <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{complianceTrust}</p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
