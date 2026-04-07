import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RouterOutputs } from "@/lib/trpc";
import {
  ArrowUpRight,
  Building2,
  ClipboardCheck,
  FileWarning,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { Link } from "wouter";
import { CollectionsExecutionPanel, DecisionExecutionPanel } from "@/components/dashboard/ExecutionLayer";

type Pulse = NonNullable<RouterOutputs["operations"]["getOwnerBusinessPulse"]>;
type ControlTower = NonNullable<Pulse["controlTower"]>;

type Props = {
  tower: ControlTower;
  showHref: (href: string) => boolean;
  execution?: NonNullable<Pulse["execution"]>;
  companyId: number;
  memberRole?: string | null;
  roleExecution?: NonNullable<Pulse["roleExecution"]>;
};

function fmtOmr(n: number) {
  return n.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

const BUCKET_LABEL: Record<string, string> = {
  "0_30": "0–30d",
  "31_60": "31–60d",
  "61_plus": "61d+",
};

function RoleExecutionBanner({ view }: { view: NonNullable<Pulse["roleExecution"]> }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--smartpro-orange)]/35 bg-muted/15 p-3 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{view.label}</p>
      <p className="text-sm font-medium text-foreground">{view.headline}</p>
      <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside">
        {view.focusBullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
        {view.quickMetrics.map((m, i) => {
          const emphasisCls =
            m.emphasis === "critical"
              ? "text-red-800 dark:text-red-200"
              : m.emphasis === "warning"
                ? "text-amber-800 dark:text-amber-200"
                : "text-foreground";
          const content = (
            <>
              {m.label}: <span className={`font-semibold tabular-nums ${emphasisCls}`}>{m.value}</span>
            </>
          );
          return m.href ? (
            <Link key={i} href={m.href} className="text-[10px] text-[var(--smartpro-orange)] hover:underline">
              {content}
            </Link>
          ) : (
            <span key={i} className="text-[10px] text-muted-foreground">
              {content}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function ExecutiveControlTower({ tower, showHref, execution, companyId, memberRole, roleExecution }: Props) {
  const { agedReceivables, decisionsQueue, riskCompliance, clientHealthTop, insightSummary } = tower;
  const canActOnCollections = memberRole === "company_admin" || memberRole === "finance_admin";
  const readOnly = execution?.readOnlyExecution ?? false;
  const severityClass =
    insightSummary.severity === "critical"
      ? "border-red-200 bg-red-50/80 dark:bg-red-950/40"
      : insightSummary.severity === "attention"
        ? "border-amber-200 bg-amber-50/60 dark:bg-amber-950/25"
        : "border-emerald-200/80 bg-emerald-50/40 dark:bg-emerald-950/15";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
          <Building2 size={13} className="text-[var(--smartpro-orange)]" />
          Executive control tower
        </h2>
        <div className="flex flex-wrap gap-1 justify-end">
          {showHref("/crm") && (
            <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
              <Link href="/crm">
                CRM <ArrowUpRight size={11} />
              </Link>
            </Button>
          )}
          {showHref("/client-portal") && (
            <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
              <Link href="/client-portal?tab=invoices">Collections</Link>
            </Button>
          )}
          {showHref("/renewal-workflows") && (
            <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
              <Link href="/renewal-workflows">Renewals</Link>
            </Button>
          )}
        </div>
      </div>

      <div className={`rounded-xl border p-4 ${severityClass}`}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 p-2 rounded-lg bg-background/80 border border-border/60">
            <Sparkles size={16} className="text-[var(--smartpro-orange)]" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-semibold text-foreground leading-snug">{insightSummary.headline}</p>
            <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
              {insightSummary.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {roleExecution && <RoleExecutionBanner view={roleExecution} />}

      {execution && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DecisionExecutionPanel execution={execution} companyId={companyId} readOnly={readOnly} />
          <CollectionsExecutionPanel
            execution={execution}
            companyId={companyId}
            canActOnCollections={canActOnCollections}
            readOnly={readOnly}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet size={14} className="text-red-700" />
              Aged receivables & collections risk
            </CardTitle>
            <p className="text-[10px] text-muted-foreground font-normal">{agedReceivables.basis}</p>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-muted-foreground">Total at risk (OMR)</span>
              <span className="font-black tabular-nums text-lg text-red-800 dark:text-red-200">
                {fmtOmr(agedReceivables.combinedAtRiskOmr)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/60 p-2 space-y-1">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">PRO officer billing</p>
                <p className="text-[10px] text-muted-foreground">{agedReceivables.officerPro.rowCount} row(s)</p>
                <div className="space-y-0.5">
                  {agedReceivables.officerPro.buckets.map((b) => (
                    <div key={b.key} className="flex justify-between gap-1">
                      <span className="text-muted-foreground">{BUCKET_LABEL[b.key] ?? b.key}</span>
                      <span className="tabular-nums font-medium">{fmtOmr(b.omr)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 p-2 space-y-1">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Platform subscription</p>
                <p className="text-[10px] text-muted-foreground">{agedReceivables.platformSubscription.rowCount} row(s)</p>
                <div className="space-y-0.5">
                  {agedReceivables.platformSubscription.buckets.map((b) => (
                    <div key={b.key} className="flex justify-between gap-1">
                      <span className="text-muted-foreground">{BUCKET_LABEL[b.key] ?? b.key}</span>
                      <span className="tabular-nums font-medium">{fmtOmr(b.omr)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {showHref("/client-portal") && (
              <Button variant="outline" size="sm" className="w-full text-xs h-8" asChild>
                <Link href="/client-portal?tab=invoices">Open collections</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardCheck size={14} className="text-blue-700" />
              Decisions & approvals
            </CardTitle>
            <p className="text-[10px] text-muted-foreground font-normal">{decisionsQueue.basis}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {decisionsQueue.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">No pending approvals in tracked queues.</p>
            ) : (
              <ul className="space-y-2">
                {decisionsQueue.items.map((item) => (
                  <li key={item.key}>
                    {showHref(item.href) ? (
                      <Link
                        href={item.href}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2 py-1.5 hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-xs font-medium text-foreground">{item.label}</span>
                        <Badge variant={item.severity === "high" ? "destructive" : "secondary"} className="tabular-nums">
                          {item.count}
                        </Badge>
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border/60 px-2 py-1.5 text-muted-foreground">
                        <span className="text-xs">{item.label}</span>
                        <Badge variant="outline" className="tabular-nums">
                          {item.count}
                        </Badge>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/50">
              Total open items: <span className="font-semibold text-foreground">{decisionsQueue.totalOpenCount}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileWarning size={14} className="text-amber-700" />
              Contract, renewal & compliance
            </CardTitle>
            <p className="text-[10px] text-muted-foreground font-normal">{riskCompliance.basis}</p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">SLA breaches</span>
              <span className={riskCompliance.slaOpenBreaches > 0 ? "font-bold text-red-700" : "font-medium"}>
                {riskCompliance.slaOpenBreaches}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Contracts (sign)</span>
              <span className="font-medium">{riskCompliance.contractsPendingSignature}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Contracts (30d end)</span>
              <span className="font-medium">{riskCompliance.contractsExpiringNext30Days}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Renewal failed</span>
              <span className={riskCompliance.renewalWorkflowsFailed > 0 ? "font-bold text-red-700" : "font-medium"}>
                {riskCompliance.renewalWorkflowsFailed}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Renewal stuck (pending)</span>
              <span className="font-medium">{riskCompliance.renewalWorkflowsStuckPending}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Emp. docs (7d)</span>
              <span className="font-medium">{riskCompliance.employeeDocsExpiring7Days}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Company docs (30d)</span>
              <span className="font-medium">{riskCompliance.companyDocsExpiring30Days}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Permits (7d)</span>
              <span className="font-medium">{riskCompliance.workPermitsExpiring7Days}</span>
            </div>
            <div className="col-span-2 flex flex-wrap gap-1 pt-1">
              {showHref("/contracts") && (
                <Button variant="ghost" size="sm" className="text-[10px] h-7" asChild>
                  <Link href="/contracts">Contracts</Link>
                </Button>
              )}
              {showHref("/compliance") && (
                <Button variant="ghost" size="sm" className="text-[10px] h-7" asChild>
                  <Link href="/compliance">Compliance</Link>
                </Button>
              )}
              {showHref("/hr/employee-requests") && (
                <Button variant="ghost" size="sm" className="text-[10px] h-7" asChild>
                  <Link href="/hr/employee-requests">Requests</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users size={14} className="text-[var(--smartpro-orange)]" />
              Client revenue & health (priority)
            </CardTitle>
            <p className="text-[10px] text-muted-foreground font-normal">
              Top CRM accounts from the leadership review queue (same ranking as Resolution queue).
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {clientHealthTop.length === 0 ? (
              <p className="text-xs text-muted-foreground">No ranked accounts — CRM data is healthy or empty.</p>
            ) : (
              <ul className="space-y-2">
                {clientHealthTop.map((row) => (
                  <li key={row.contactId} className="rounded-lg border border-border/60 p-2 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={row.primaryHref} className="text-xs font-semibold hover:underline">
                        {row.displayName}
                      </Link>
                      {row.companyLabel && (
                        <span className="text-[10px] text-muted-foreground">· {row.companyLabel}</span>
                      )}
                      <Badge variant="outline" className="text-[9px]">
                        {row.tier.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-2">{row.rankReason}</p>
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-[10px] text-muted-foreground">Score {row.priorityScore}</span>
                      <Button variant="secondary" size="sm" className="h-7 text-[10px]" asChild>
                        <Link href={row.primaryHref}>{row.nextActionLabel}</Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {showHref("/crm") && (
              <Button variant="outline" size="sm" className="w-full text-xs h-8 mt-1" asChild>
                <Link href="/crm" className="gap-1">
                  Full CRM <ArrowUpRight size={12} />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
