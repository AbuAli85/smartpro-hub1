import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
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
import { useTranslation } from "react-i18next";

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

function OwnerWorkspaceSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)} aria-label={title}>
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
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
          const linkTone =
            m.emphasis === "critical" || m.emphasis === "warning"
              ? "text-[10px] text-[var(--smartpro-orange)] hover:underline"
              : "text-[10px] text-muted-foreground hover:text-foreground hover:underline";
          return m.href ? (
            <Link key={i} href={m.href} className={linkTone}>
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
  const { t } = useTranslation("executive");
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
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
          <Building2 size={13} className="text-[var(--smartpro-orange)]" />
          {t("ownerWorkspace")}
        </h2>
        <div className="flex flex-wrap gap-1 justify-end">
          {showHref("/workspace") && (
            <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
              <Link href="/workspace">{t("teamWorkspace")}</Link>
            </Button>
          )}
          {showHref("/crm") && (
            <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
              <Link href="/crm">
                {t("crm")} <ArrowUpRight size={11} />
              </Link>
            </Button>
          )}
          {showHref("/client-portal") && (
            <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
              <Link href="/client-portal?tab=invoices">{t("collections")}</Link>
            </Button>
          )}
          {showHref("/renewal-workflows") && (
            <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
              <Link href="/renewal-workflows">{t("renewals")}</Link>
            </Button>
          )}
        </div>
      </div>

      <OwnerWorkspaceSection title={t("businessHealth")}>
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
      </OwnerWorkspaceSection>

      <OwnerWorkspaceSection title={t("weakAreas")}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-border/80">
            <CardHeader className="pb-2">
              <CardTitle
                className="text-sm flex items-center gap-2"
                title={riskCompliance.basis}
              >
                <FileWarning size={14} className="text-amber-700" />
                {t("contractsRenewalsCompliance")}
              </CardTitle>
              <p className="text-[10px] text-muted-foreground font-normal">
                {t("contractsRenewalsDesc")}
              </p>
            </CardHeader>
            <CardContent className="space-y-2 text-[11px]">
              {(() => {
                const rows: { labelKey: string; value: number; hot?: boolean }[] = [
                  { labelKey: "slaBreachesGov", value: riskCompliance.slaOpenBreaches, hot: true },
                  { labelKey: "contractsWaitingSignature", value: riskCompliance.contractsPendingSignature },
                  { labelKey: "contractsEndingIn30", value: riskCompliance.contractsExpiringNext30Days },
                  { labelKey: "renewalRunsFailed", value: riskCompliance.renewalWorkflowsFailed, hot: true },
                  { labelKey: "renewalRunsStuck", value: riskCompliance.renewalWorkflowsStuckPending },
                  { labelKey: "employeeDocsExpiring", value: riskCompliance.employeeDocsExpiring7Days },
                  { labelKey: "companyDocsExpiring", value: riskCompliance.companyDocsExpiring30Days },
                  { labelKey: "workPermitsExpiring", value: riskCompliance.workPermitsExpiring7Days },
                ];
                const open = rows.filter((r) => r.value > 0);
                if (open.length === 0) {
                  return (
                    <p className="text-xs text-muted-foreground py-1">
                      {t("nothingOpenGood")}
                    </p>
                  );
                }
                return (
                  <ul className="space-y-1.5">
                    {open.map((r) => (
                      <li key={r.labelKey} className="flex justify-between gap-3">
                        <span className="text-muted-foreground min-w-0">{t(r.labelKey)}</span>
                        <span
                          className={
                            r.hot && r.value > 0
                              ? "font-semibold text-red-700 dark:text-red-300 tabular-nums shrink-0"
                              : "font-medium tabular-nums text-foreground shrink-0"
                          }
                        >
                          {r.value}
                        </span>
                      </li>
                    ))}
                  </ul>
                );
              })()}
              <div className="flex flex-wrap gap-1 pt-1 border-t border-border/40">
                {showHref("/contracts") && (
                  <Button variant="ghost" size="sm" className="text-[10px] h-7" asChild>
                    <Link href="/contracts">{t("contractsRenewalsCompliance").split(",")[0]}</Link>
                  </Button>
                )}
                {showHref("/compliance") && (
                  <Button variant="ghost" size="sm" className="text-[10px] h-7" asChild>
                    <Link href="/compliance">{t("compliance", { ns: "nav", defaultValue: "Compliance" })}</Link>
                  </Button>
                )}
                {showHref("/hr/employee-requests") && (
                  <Button variant="ghost" size="sm" className="text-[10px] h-7" asChild>
                    <Link href="/hr/employee-requests">{t("requests", { ns: "common", defaultValue: "Requests" })}</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users size={14} className="text-[var(--smartpro-orange)]" />
                {t("accountsNeedingAttention")}
              </CardTitle>
              <p className="text-[10px] text-muted-foreground font-normal leading-snug">
                {t("accountsNeedingAttentionDesc")}
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {clientHealthTop.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("noAccountsNeedAction")}</p>
              ) : (
                <ul className="space-y-3">
                  {clientHealthTop.map((row) => (
                    <li key={row.contactId} className="rounded-lg border border-border/60 p-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <Link
                          href={row.primaryHref}
                          className="text-sm font-semibold leading-snug hover:underline text-primary min-w-0"
                        >
                          {row.displayName}
                        </Link>
                        <Badge
                          variant={
                            row.healthSignal === "critical"
                              ? "destructive"
                              : row.healthSignal === "warning"
                                ? "secondary"
                                : "outline"
                          }
                          className="text-[10px] shrink-0"
                        >
                          {row.healthSignal}
                        </Badge>
                      </div>
                      {row.companyLabel && (
                        <p className="text-xs text-muted-foreground">{row.companyLabel}</p>
                      )}
                      <p className="text-xs text-foreground leading-relaxed">{row.rankReason}</p>
                      <Button variant="default" size="sm" className="h-8 text-xs w-full" asChild>
                        <Link href={row.primaryHref}>{row.nextActionLabel}</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-col gap-1.5 pt-1">
                {showHref("/crm") && (
                  <Button variant="outline" size="sm" className="w-full text-xs h-8" asChild>
                    <Link href="/crm" className="gap-1">
                      {t("openCRM")} <ArrowUpRight size={12} />
                    </Link>
                  </Button>
                )}
                {showHref("/workspace") && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    <Link href="/workspace" className="text-[var(--smartpro-orange)] hover:underline font-medium">
                      {t("teamWorkspace")}
                    </Link>{" "}
                    — {t("teamWorkspaceDesc", { defaultValue: "people, follow-ups, and performance" })}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </OwnerWorkspaceSection>

      <OwnerWorkspaceSection title={t("cashAndRisk")}>
        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2" title={agedReceivables.basis}>
              <Wallet
                size={14}
                className={agedReceivables.combinedAtRiskOmr > 0 ? "text-red-700" : "text-muted-foreground"}
              />
              {t("cashAtRisk")}
            </CardTitle>
            <p className="text-[10px] text-muted-foreground font-normal">
              {t("cashAtRiskDesc")}
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-muted-foreground">{t("totalAtRisk")}</span>
              <span
                className={cn(
                  "font-black tabular-nums text-lg",
                  agedReceivables.combinedAtRiskOmr > 0
                    ? "text-red-800 dark:text-red-200"
                    : "text-foreground",
                )}
              >
                {fmtOmr(agedReceivables.combinedAtRiskOmr)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/60 p-2 space-y-1">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("proOfficerBilling")}</p>
                <p className="text-[10px] text-muted-foreground">{agedReceivables.officerPro.rowCount} {t("rows")}</p>
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
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("platformSubscription")}</p>
                <p className="text-[10px] text-muted-foreground">{agedReceivables.platformSubscription.rowCount} {t("rows")}</p>
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
                <Link href="/client-portal?tab=invoices">{t("openCollections")}</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </OwnerWorkspaceSection>

      <OwnerWorkspaceSection title={t("decisionsNeeded")}>
        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2" title={decisionsQueue.basis}>
              <ClipboardCheck size={14} className="text-blue-700" />
              {t("approvalsWaiting")}
            </CardTitle>
            <p className="text-[10px] text-muted-foreground font-normal">
              {t("approvalsWaitingDesc")}
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {decisionsQueue.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noPendingApprovals")}</p>
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
              {t("totalOpenItems")}: <span className="font-semibold text-foreground">{decisionsQueue.totalOpenCount}</span>
            </p>
          </CardContent>
        </Card>
      </OwnerWorkspaceSection>

      {execution && (
        <OwnerWorkspaceSection title={t("actionPlan")}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DecisionExecutionPanel execution={execution} companyId={companyId} readOnly={readOnly} />
            <CollectionsExecutionPanel
              execution={execution}
              companyId={companyId}
              canActOnCollections={canActOnCollections}
              readOnly={readOnly}
            />
          </div>
        </OwnerWorkspaceSection>
      )}
    </div>
  );
}
