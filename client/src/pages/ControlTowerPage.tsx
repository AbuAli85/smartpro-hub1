import { useEffect, useMemo } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { trpc } from "@/lib/trpc";
import { useActionQueue } from "@/hooks/useActionQueue";
import { useSmartRoleHomeRedirect } from "@/hooks/useSmartRoleHomeRedirect";
import { buildRiskStripCards } from "@/features/controlTower/riskStripModel";
import { buildPriorityItems } from "@/features/controlTower/priorityEngine";
import { priorityActionIdsFromItems, queueItemsAfterPriorities } from "@/features/controlTower/controlTowerLayout";
import {
  ActionQueueSection,
  ExecutiveHeader,
  KpiSnapshotSection,
  PrioritiesSection,
  RiskStrip,
  SupportContextFooter,
} from "@/features/controlTower/components";
import { seesPlatformOperatorNav } from "@shared/clientNav";
import { formatEscalationSummaryLine, summarizeEscalationFromItems } from "@/features/controlTower/escalationMeta";
import { buildSnapshotFromItems } from "@/features/controlTower/snapshot";
import { getPreviousSnapshot, saveSnapshot } from "@/features/controlTower/snapshotStore";
import {
  buildPrioritiesTrendHints,
  buildQueueTotalTrendHint,
  buildTrendSummaryLine,
} from "@/features/controlTower/trend";
import type { TrendComparison } from "@/features/controlTower/trendTypes";
import {
  buildOutcomeSummary,
  buildOutcomeSummaryLine,
  buildPrioritiesSectionOutcomeHint,
  buildQueueSectionOutcomeHint,
  hasOutcomeBaseline,
} from "@/features/controlTower/outcomes";
import {
  buildDomainNarrativeSummaries,
  buildExecutiveNarrativeLines,
  buildPrioritiesDomainHint,
  buildQueueDomainHint,
  buildRiskStripDomainHint,
  hasDomainAttributionBaseline,
} from "@/features/controlTower/domainNarrative";

export default function ControlTowerPage() {
  const { user } = useAuth();
  const { activeCompanyId, activeCompany } = useActiveCompany();
  useSmartRoleHomeRedirect();

  const platformOp = seesPlatformOperatorNav(user);
  const scopeEnabled = activeCompanyId != null && !platformOp;

  const {
    items: actionItems,
    isLoading: actionsLoading,
    status: queueStatus,
    lastUpdatedLabel: queueUpdatedLabel,
    scopeActive: queueScopeActive,
  } = useActionQueue();

  const priorityItems = useMemo(
    () => buildPriorityItems(actionItems, activeCompany?.role ?? null),
    [actionItems, activeCompany?.role],
  );

  const priorityIds = useMemo(() => priorityActionIdsFromItems(priorityItems), [priorityItems]);

  const queueForList = useMemo(
    () => queueItemsAfterPriorities(actionItems, priorityIds),
    [actionItems, priorityIds],
  );

  const hasStrongPriorities = priorityItems.some((p) => p.priorityLevel === "critical" || p.priorityLevel === "important");

  const { data: pulse, isLoading: pulseLoading } = trpc.operations.getOwnerBusinessPulse.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: scopeEnabled, staleTime: 60_000 },
  );

  const { data: myStats, isLoading: statsLoading } = trpc.companies.myStats.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null, staleTime: 60_000 },
  );

  const now = new Date();
  const { data: wps, isLoading: wpsLoading } = trpc.compliance.getWpsStatus.useQuery(
    { companyId: activeCompanyId ?? undefined, month: now.getMonth() + 1, year: now.getFullYear() },
    { enabled: scopeEnabled, staleTime: 60_000 },
  );

  const { data: complianceScore, isLoading: scoreLoading } = trpc.compliance.getComplianceScore.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: scopeEnabled, staleTime: 120_000 },
  );

  const { data: dailySnap, isLoading: dailyLoading } = trpc.operations.getDailySnapshot.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: scopeEnabled, staleTime: 60_000 },
  );

  const wpsBlocked = wps != null && wps.status !== "paid" && wps.status !== "not_generated";

  const permitCheck = complianceScore?.checks?.find((c) => c.id === "work_permit_validity");
  const expiredPermits = Number((permitCheck?.meta as { count?: number } | undefined)?.count ?? 0);

  const expiring7 =
    pulse?.controlTower?.riskCompliance.workPermitsExpiring7Days ?? dailySnap?.expiringDocs7Days ?? 0;

  const complianceFailures = complianceScore?.checks?.filter((c) => c.status === "fail").length ?? 0;
  const complianceWarnings = complianceScore?.checks?.filter((c) => c.status === "warn").length ?? 0;

  const pendingApprovals =
    pulse?.controlTower?.decisionsQueue.totalOpenCount ??
    (dailySnap
      ? (dailySnap.pendingLeaveRequests ?? 0) + (dailySnap.pendingContracts ?? 0) + (dailySnap.pendingPayrollApprovals ?? 0)
      : 0);

  const revenueMtd =
    pulse?.revenue?.combinedPaid?.monthToDateOmr ?? dailySnap?.revenueMtdOmr ?? null;

  const loadingStrip = scopeEnabled && (wpsLoading || scoreLoading || dailyLoading || pulseLoading);

  const riskCards = buildRiskStripCards({
    loading: loadingStrip,
    expiredPermits,
    wpsBlocked,
    complianceFailCount: complianceFailures,
    permitsExpiring7d: expiring7,
    slaBreaches: typeof dailySnap?.slaBreaches === "number" ? dailySnap.slaBreaches : 0,
    complianceWarnCount: complianceWarnings,
  });

  const employeesTrust = statsLoading
    ? "Loading…"
    : myStats != null
      ? "HR · companies.myStats"
      : "Unavailable";

  const pendingTrust =
    scopeEnabled && pulse
      ? "Operations · pulse decisions queue"
      : dailySnap && scopeEnabled
        ? "Operations · daily snapshot"
        : scopeEnabled
          ? "—"
          : "N/A";

  const revenueTrust =
    revenueMtd == null && !pulseLoading && scopeEnabled
      ? "Cash MTD unavailable for this scope"
      : pulse?.revenue
        ? "Finance · executive revenue (paid)"
        : dailySnap
          ? "Finance · daily snapshot (paid)"
          : "—";

  const complianceTrust = scoreLoading
    ? "Loading…"
    : complianceScore
      ? "Compliance · weighted checks"
      : "Unavailable";

  const roleLabel = activeCompany?.role ? activeCompany.role.replace(/_/g, " ") : null;

  const escalationSummaryLine = useMemo(() => {
    if (!queueScopeActive || actionsLoading || actionItems.length === 0) return null;
    return formatEscalationSummaryLine(summarizeEscalationFromItems(actionItems));
  }, [queueScopeActive, actionsLoading, actionItems]);

  const previousSnapshot = useMemo(() => {
    if (typeof window === "undefined" || !queueScopeActive) return null;
    return getPreviousSnapshot(activeCompanyId, user?.id ?? null);
  }, [queueScopeActive, activeCompanyId, user?.id]);

  const currentSnapshot = useMemo(
    () => buildSnapshotFromItems(actionItems, { prioritiesCount: priorityItems.length }),
    [actionItems, priorityItems.length],
  );

  const trendComparison = useMemo(
    (): TrendComparison => ({ current: currentSnapshot, previous: previousSnapshot }),
    [currentSnapshot, previousSnapshot],
  );

  const trendSummaryLine = useMemo(() => {
    if (!queueScopeActive || actionsLoading) return null;
    return buildTrendSummaryLine(trendComparison);
  }, [queueScopeActive, actionsLoading, trendComparison]);

  const prioritiesTrendHintsLine = useMemo(() => {
    if (!queueScopeActive || actionsLoading) return null;
    return buildPrioritiesTrendHints(trendComparison);
  }, [queueScopeActive, actionsLoading, trendComparison]);

  const queueTrendHint = useMemo(() => {
    if (!queueScopeActive || actionsLoading) return null;
    return buildQueueTotalTrendHint(trendComparison);
  }, [queueScopeActive, actionsLoading, trendComparison]);

  const outcomeComparable = useMemo(
    () => queueScopeActive && hasOutcomeBaseline(previousSnapshot),
    [queueScopeActive, previousSnapshot],
  );

  const outcomeSummary = useMemo(
    () => buildOutcomeSummary(currentSnapshot, previousSnapshot),
    [currentSnapshot, previousSnapshot],
  );

  const outcomeSummaryLine = useMemo(() => {
    if (!queueScopeActive || actionsLoading || !outcomeComparable) return null;
    return buildOutcomeSummaryLine(outcomeSummary);
  }, [queueScopeActive, actionsLoading, outcomeComparable, outcomeSummary]);

  const prioritiesOutcomeHint = useMemo(() => {
    if (!queueScopeActive || actionsLoading || !outcomeComparable) return null;
    return buildPrioritiesSectionOutcomeHint(
      outcomeSummary,
      outcomeComparable,
      previousSnapshot?.prioritiesCount ?? null,
      priorityItems.length,
    );
  }, [
    queueScopeActive,
    actionsLoading,
    outcomeComparable,
    outcomeSummary,
    previousSnapshot?.prioritiesCount,
    priorityItems.length,
  ]);

  const queueOutcomeHint = useMemo(() => {
    if (!queueScopeActive || actionsLoading || !outcomeComparable) return null;
    return buildQueueSectionOutcomeHint(outcomeSummary, outcomeComparable);
  }, [queueScopeActive, actionsLoading, outcomeComparable, outcomeSummary]);

  const domainNarrativeSummaries = useMemo(
    () => buildDomainNarrativeSummaries(actionItems, currentSnapshot, previousSnapshot),
    [actionItems, currentSnapshot, previousSnapshot],
  );

  const executiveNarrativeLines = useMemo(() => {
    if (!queueScopeActive || actionsLoading) return [];
    return buildExecutiveNarrativeLines(domainNarrativeSummaries, outcomeSummary, trendComparison, {
      outcomeComparable,
      domainBaseline: hasDomainAttributionBaseline(previousSnapshot),
    });
  }, [
    queueScopeActive,
    actionsLoading,
    domainNarrativeSummaries,
    outcomeSummary,
    trendComparison,
    outcomeComparable,
    previousSnapshot,
  ]);

  const prioritiesDomainHint = useMemo(() => {
    if (!queueScopeActive || actionsLoading || actionItems.length === 0) return null;
    return buildPrioritiesDomainHint(domainNarrativeSummaries);
  }, [queueScopeActive, actionsLoading, actionItems.length, domainNarrativeSummaries]);

  const queueDomainHint = useMemo(() => {
    if (!queueScopeActive || actionsLoading || actionItems.length === 0) return null;
    return buildQueueDomainHint(domainNarrativeSummaries);
  }, [queueScopeActive, actionsLoading, actionItems.length, domainNarrativeSummaries]);

  const riskStripDomainHint = useMemo(() => {
    if (!queueScopeActive || actionsLoading || actionItems.length === 0) return null;
    return buildRiskStripDomainHint(domainNarrativeSummaries);
  }, [queueScopeActive, actionsLoading, actionItems.length, domainNarrativeSummaries]);

  useEffect(() => {
    if (!queueScopeActive || actionsLoading) return;
    saveSnapshot(currentSnapshot, activeCompanyId, user?.id ?? null);
  }, [queueScopeActive, actionsLoading, currentSnapshot, activeCompanyId, user?.id]);

  return (
    <div className="min-h-screen bg-background">
      <ExecutiveHeader
        subtitle="Monitor blockers, priorities, and operational health in one place."
        companyName={activeCompany?.name ?? null}
        freshnessLabel={queueUpdatedLabel ?? null}
        escalationSummaryLine={escalationSummaryLine}
        trendSummaryLine={trendSummaryLine}
        outcomeSummaryLine={outcomeSummaryLine}
        executiveNarrativeLines={executiveNarrativeLines}
        queueStatus={queueStatus}
        queueScopeActive={queueScopeActive}
        actionsLoading={actionsLoading}
      />

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">
        {platformOp && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Platform scope</CardTitle>
              <CardDescription>
                Open a tenant workspace from the company switcher to load tenant-specific signals. Platform tools stay in the sidebar.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <PrioritiesSection
          queueScopeActive={queueScopeActive}
          actionsLoading={actionsLoading}
          queueStatus={queueStatus}
          priorityItems={priorityItems}
          hasStrongPriorities={hasStrongPriorities}
          actionItemsLength={actionItems.length}
          trendHintsLine={prioritiesTrendHintsLine}
          outcomeHintLine={prioritiesOutcomeHint}
          domainHintLine={prioritiesDomainHint}
        />

        <RiskStrip cards={riskCards} domainNarrativeLine={riskStripDomainHint} />

        <ActionQueueSection
          queueScopeActive={queueScopeActive}
          actionsLoading={actionsLoading}
          queueStatus={queueStatus}
          queueUpdatedLabel={queueUpdatedLabel}
          queueForList={queueForList}
          actionItemsLength={actionItems.length}
          outcomeHintLine={queueOutcomeHint}
          domainHintLine={queueDomainHint}
        />

        <KpiSnapshotSection
          scopeEnabled={scopeEnabled}
          queueTrendHint={queueTrendHint}
          statsLoading={statsLoading}
          employees={myStats?.employees}
          employeesTrust={employeesTrust}
          pulseLoading={pulseLoading}
          pendingApprovals={pendingApprovals}
          pendingTrust={pendingTrust}
          revenueMtd={revenueMtd}
          revenueTrust={revenueTrust}
          scoreLoading={scoreLoading}
          complianceScore={complianceScore?.score}
          complianceGrade={complianceScore?.grade ?? null}
          complianceTrust={complianceTrust}
        />

        <SupportContextFooter
          queueScopeActive={queueScopeActive}
          queueStatus={queueStatus}
          roleLabel={roleLabel}
          freshnessLabel={queueScopeActive && !actionsLoading ? queueUpdatedLabel : null}
        />
      </div>
    </div>
  );
}
