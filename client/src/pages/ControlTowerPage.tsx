import { useEffect, useMemo, useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  ExecutiveCommitmentsSection,
  ExecutiveDecisionSection,
  ExecutiveHeader,
  ExecutiveReviewSection,
  KpiSnapshotSection,
  OperatingBriefSection,
  PrioritiesSection,
  RiskStrip,
  SupportContextFooter,
} from "@/features/controlTower/components";
import { buildExecutiveCommitments } from "@/features/controlTower/commitments";
import { buildExecutiveDecisionPrompts } from "@/features/controlTower/decisionPrompts";
import { buildExecutiveReviewItems } from "@/features/controlTower/reviews";
import { buildOperatingBriefWithVariant } from "@/features/controlTower/operatingBrief";
import { getBriefVariantConfig } from "@/features/controlTower/briefVariantConfig";
import { DEFAULT_BRIEF_VARIANT, type OperatingBriefVariant } from "@/features/controlTower/briefVariants";
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
  const [reviewMode, setReviewMode] = useState(false);
  const [briefMode, setBriefMode] = useState(false);
  const [briefVariant, setBriefVariant] = useState<OperatingBriefVariant>(DEFAULT_BRIEF_VARIANT);
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

  const executiveDecisionPrompts = useMemo(() => {
    if (!queueScopeActive || actionsLoading) return [];
    return buildExecutiveDecisionPrompts({
      queueItems: actionItems,
      priorityItems,
      domainSummaries: domainNarrativeSummaries,
      outcomeSummary: outcomeComparable ? outcomeSummary : null,
      trendComparison,
      outcomeComparable,
      domainBaseline: hasDomainAttributionBaseline(previousSnapshot),
    });
  }, [
    queueScopeActive,
    actionsLoading,
    actionItems,
    priorityItems,
    domainNarrativeSummaries,
    outcomeSummary,
    trendComparison,
    outcomeComparable,
    previousSnapshot,
  ]);

  const executiveCommitments = useMemo(() => {
    if (!queueScopeActive || actionsLoading) return [];
    return buildExecutiveCommitments({
      decisionPrompts: executiveDecisionPrompts,
      queueItems: actionItems,
      priorityItems,
      domainSummaries: domainNarrativeSummaries,
      outcomeSummary: outcomeComparable ? outcomeSummary : null,
      trendComparison,
    });
  }, [
    queueScopeActive,
    actionsLoading,
    executiveDecisionPrompts,
    actionItems,
    priorityItems,
    domainNarrativeSummaries,
    outcomeSummary,
    trendComparison,
    outcomeComparable,
  ]);

  const executiveReviewItems = useMemo(() => {
    if (!queueScopeActive || actionsLoading) return [];
    return buildExecutiveReviewItems(executiveCommitments, {
      queueItems: actionItems,
      priorityItems,
      outcomeSummary: outcomeComparable ? outcomeSummary : null,
      trendComparison,
      domainSummaries: domainNarrativeSummaries,
    });
  }, [
    queueScopeActive,
    actionsLoading,
    executiveCommitments,
    actionItems,
    priorityItems,
    outcomeSummary,
    trendComparison,
    outcomeComparable,
    domainNarrativeSummaries,
  ]);

  const briefVariantConfig = useMemo(() => getBriefVariantConfig(briefVariant), [briefVariant]);

  const operatingBrief = useMemo(() => {
    if (!queueScopeActive || actionsLoading) return null;
    return buildOperatingBriefWithVariant(
      {
        priorityItems,
        domainNarrativeSummaries: domainNarrativeSummaries,
        executiveDecisionPrompts,
        executiveCommitments,
        executiveReviewItems,
        outcomeSummaryLine,
        trendSummaryLine,
      },
      briefVariant,
    );
  }, [
    queueScopeActive,
    actionsLoading,
    briefVariant,
    priorityItems,
    domainNarrativeSummaries,
    executiveDecisionPrompts,
    executiveCommitments,
    executiveReviewItems,
    outcomeSummaryLine,
    trendSummaryLine,
  ]);

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
        leadershipInterventionCount={executiveDecisionPrompts.length}
        operatingCheckpointsCount={executiveCommitments.length}
        reviewCheckInCount={executiveReviewItems.length}
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

        {queueScopeActive && !actionsLoading && (operatingBrief != null || executiveCommitments.length > 0) ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {operatingBrief != null ? (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="sr-only">Brief audience</span>
                <select
                  value={briefVariant}
                  onChange={(e) => setBriefVariant(e.target.value as OperatingBriefVariant)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground max-w-[140px]"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="leadership">Leadership</option>
                  <option value="board">Board</option>
                </select>
              </label>
            ) : null}
            {operatingBrief != null ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setBriefMode((v) => !v)}
                aria-pressed={briefMode}
              >
                {briefMode ? "Exit brief mode" : "Brief mode"}
              </Button>
            ) : null}
            {executiveCommitments.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setReviewMode((v) => !v)}
                aria-pressed={reviewMode}
              >
                {reviewMode ? "Exit review mode" : "Review mode"}
              </Button>
            ) : null}
          </div>
        ) : null}

        {operatingBrief != null ? (
          <OperatingBriefSection brief={operatingBrief} emphasized={briefMode} variant={briefVariant} />
        ) : null}

        <div
          className={cn(
            "space-y-10",
            briefMode && operatingBrief != null && "opacity-[0.88] transition-opacity",
          )}
        >
          <div
            className={cn(
              briefVariantConfig.emphasis.decisions
                ? "rounded-lg ring-1 ring-foreground/10 p-2 -mx-1"
                : "opacity-[0.94]",
            )}
          >
            <ExecutiveDecisionSection prompts={executiveDecisionPrompts} />
          </div>

          {executiveCommitments.length > 0 ? (
            <div
              className={cn(
                "space-y-10",
                briefVariantConfig.emphasis.commitments || briefVariantConfig.emphasis.review
                  ? "rounded-lg ring-1 ring-foreground/10 p-2 -mx-1"
                  : briefVariant === "weekly" && "opacity-[0.95]",
                reviewMode && "rounded-lg border border-amber-500/20 bg-muted/20 p-4 -mx-1 shadow-sm",
              )}
            >
              <ExecutiveCommitmentsSection commitments={executiveCommitments} />
              <ExecutiveReviewSection items={executiveReviewItems} />
            </div>
          ) : null}

          <div
            className={cn(
              briefVariantConfig.emphasis.priorities ? "rounded-lg ring-1 ring-foreground/10 p-2 -mx-1" : "opacity-[0.9]",
            )}
          >
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
          </div>

          <RiskStrip cards={riskCards} domainNarrativeLine={riskStripDomainHint} />

          <div
            className={cn(
              reviewMode && "opacity-[0.78] transition-opacity",
              briefMode && "hidden",
            )}
          >
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
          </div>

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
    </div>
  );
}
