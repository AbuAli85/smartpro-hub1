import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { fmtDateTimeShort } from "@/lib/dateUtils";
import { useActionQueue } from "@/hooks/useActionQueue";
import { useSmartRoleHomeRedirect } from "@/hooks/useSmartRoleHomeRedirect";
import { buildRiskStripCards } from "@/features/controlTower/riskStripModel";
import { buildPriorityItems } from "@/features/controlTower/priorityEngine";
import { priorityActionIdsFromItems, queueItemsAfterPriorities } from "@/features/controlTower/controlTowerLayout";
import {
  ActionQueueSection,
  ControlTowerViewModeSelector,
  ExecutiveCommitmentsSection,
  ExecutiveDecisionSection,
  ExecutiveHeader,
  ExecutiveReviewSection,
  KpiSnapshotSection,
  OperatingBriefSection,
  PresentationSummaryStrip,
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
import { useMyCapabilities } from "@/hooks/useMyCapabilities";
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
  getControlTowerPresentationConfig,
  presentationOneLine,
  type ControlTowerViewMode,
} from "@/features/controlTower/presentationMode";
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
  const [viewMode, setViewMode] = useState<ControlTowerViewMode>("operate");
  const [briefVariant, setBriefVariant] = useState<OperatingBriefVariant>(DEFAULT_BRIEF_VARIANT);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const { user } = useAuth();
  const { activeCompanyId, activeCompany } = useActiveCompany();
  useSmartRoleHomeRedirect();

  const platformOp = seesPlatformOperatorNav(user);
  const scopeEnabled = activeCompanyId != null && !platformOp;
  const { caps: myCaps, loading: capsLoading } = useMyCapabilities();

  // ── Authority check ─────────────────────────────────────────────────────────
  // canViewPlatformControlTower is always false from deriveCapabilities for tenant users;
  // the platform gate is handled by canAccessGlobalAdminProcedures() via platformOp.
  const canViewCompanyTower = !capsLoading && myCaps.canViewCompanyControlTower;
  const hasControlTowerAccess = platformOp || canViewCompanyTower;

  // Scope label for dept/team managers who see a narrowed dashboard
  const scopeType = ((): "company" | "department" | "team" | "self" => {
    if (!capsLoading && myCaps.canManageControlTowerItems) return "company";
    if (!capsLoading && myCaps.canViewCompanyControlTower && !myCaps.canManageControlTowerItems) {
      // Conservative label — exact scope comes from server myAccess query
      return "department";
    }
    return "self";
  })();

  const scopeLabel =
    scopeType === "department" ? "Department Control Tower"
    : scopeType === "team" ? "Team Control Tower"
    : "Control Tower";

  // Read-only: reviewer and external_auditor can see but not mutate.
  const isReadOnly =
    !capsLoading &&
    myCaps.canViewCompanyControlTower &&
    !myCaps.canManageControlTowerItems &&
    !myCaps.canResolveControlTowerItems &&
    !myCaps.canAssignControlTowerItems;

  // canViewEmployeeList is true for company_admin, hr_admin, and finance_admin — the same
  // roles that previously had engagementOpsRole access.
  // capsLoading guard prevents the engagement KPI section from flashing before capabilities resolve.
  const engagementOpsRole = !capsLoading && myCaps.canViewEmployeeList;

  const utils = trpc.useUtils();
  const { data: engagementQueueKpi } = trpc.engagements.getOpsSummary.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: scopeEnabled && engagementOpsRole, staleTime: 60_000 },
  );

  // ── Server-authoritative signal summary + ranked queue ──────────────────────
  const ctEnabled = (platformOp || canViewCompanyTower) && activeCompanyId != null;
  const { data: ctSummary, isLoading: ctSummaryLoading } =
    trpc.controlTower.summary.useQuery(
      { companyId: activeCompanyId ?? undefined },
      { enabled: ctEnabled, staleTime: 60_000 },
    );
  const { data: ctItems, isLoading: ctItemsLoading } =
    trpc.controlTower.items.useQuery(
      {
        companyId: activeCompanyId ?? undefined,
        domain: selectedDomain ?? undefined,
        limit: 15,
      },
      { enabled: ctEnabled, staleTime: 60_000 },
    );
  const acknowledgeItem = trpc.controlTower.acknowledgeItem.useMutation({
    onSuccess: () => void utils.controlTower.items.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const engagementRollupsRefresh = trpc.engagements.refreshRollups.useMutation({
    onSuccess: (r) => {
      toast.success(`Refreshed ${r.synced} engagement roll-up(s).`);
      void utils.engagements.getOpsSummary.invalidate({ companyId: activeCompanyId ?? undefined });
    },
    onError: (e) => toast.error(e.message),
  });

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

  const presentation = useMemo(() => getControlTowerPresentationConfig(viewMode), [viewMode]);

  const emphasizeDecisionsBlock = presentation.emphasizeDecisions || briefVariantConfig.emphasis.decisions;
  const emphasizeCommitmentsBlock =
    presentation.emphasizeCommitments ||
    presentation.emphasizeReview ||
    briefVariantConfig.emphasis.commitments ||
    briefVariantConfig.emphasis.review;

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

  // ── Access guard ────────────────────────────────────────────────────────────
  // Show during caps load to avoid flash; once loaded, gate hard.
  if (!capsLoading && !hasControlTowerAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <Card className="max-w-md w-full border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Control Tower not available</CardTitle>
            <CardDescription>
              Your current role does not include Control Tower access. If you believe this is an
              error, contact your company administrator.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Company selector: user has access capability but no active company selected.
  if (!platformOp && !capsLoading && canViewCompanyTower && activeCompanyId == null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-base">Select a company</CardTitle>
            <CardDescription>
              Control Tower requires an active company workspace. Use the company switcher in the
              sidebar to select a company and load signals.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ExecutiveHeader
        subtitle={
          isReadOnly
            ? `${scopeLabel} — Read-only view`
            : scopeLabel !== "Control Tower"
              ? scopeLabel
              : "Monitor blockers, priorities, and operational health in one place."
        }
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

        {isReadOnly && !platformOp && (
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardHeader className="py-3">
              <CardTitle className="text-sm text-yellow-600 dark:text-yellow-400">Read-only access</CardTitle>
              <CardDescription className="text-xs">
                Your role ({activeCompany?.role ?? "reviewer"}) has read-only access to Control Tower. Signals are visible but actions are disabled.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* ── Server-authoritative signal queue ─────────────────────────────── */}
        {ctEnabled && (ctSummaryLoading || ctItemsLoading || ctSummary != null) && (
          <Card className="border-border/80">
            <CardHeader className="py-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm">Open signals</CardTitle>
                {ctSummary != null && (
                  <div className="flex flex-wrap gap-2 text-xs tabular-nums">
                    {ctSummary.bySeverity.critical > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold">
                        {ctSummary.bySeverity.critical} critical
                      </span>
                    )}
                    {ctSummary.bySeverity.high > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 font-semibold">
                        {ctSummary.bySeverity.high} high
                      </span>
                    )}
                    {ctSummary.bySeverity.medium > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 font-semibold">
                        {ctSummary.bySeverity.medium} medium
                      </span>
                    )}
                    {ctSummary.totalOpen === 0 && (
                      <span className="text-muted-foreground">All clear</span>
                    )}
                  </div>
                )}
              </div>
              {ctSummary != null && ctSummary.visibleDomains.length > 1 && (
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedDomain(null)}
                    className={cn(
                      "px-2.5 py-0.5 rounded-full border transition-colors",
                      selectedDomain == null
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border text-muted-foreground hover:border-primary/50",
                    )}
                  >
                    All ({ctSummary.totalOpen})
                  </button>
                  {ctSummary.visibleDomains.map((d) =>
                    (ctSummary.byDomain[d] ?? 0) > 0 ? (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setSelectedDomain(d === selectedDomain ? null : d)}
                        className={cn(
                          "px-2.5 py-0.5 rounded-full border capitalize transition-colors",
                          selectedDomain === d
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border text-muted-foreground hover:border-primary/50",
                        )}
                      >
                        {d} ({ctSummary.byDomain[d]})
                      </button>
                    ) : null,
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {(ctSummaryLoading || ctItemsLoading) && (
                <p className="text-xs text-muted-foreground py-2">Loading signals…</p>
              )}
              {!ctItemsLoading && ctItems?.items.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No open signals for this domain.</p>
              )}
              {ctItems?.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg border bg-muted/20 px-3 py-2.5"
                >
                  <span
                    className={cn(
                      "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                      item.severity === "critical" && "bg-destructive",
                      item.severity === "high" && "bg-orange-500",
                      item.severity === "medium" && "bg-yellow-500",
                      item.severity === "low" && "bg-muted-foreground",
                    )}
                  />
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-xs font-medium leading-snug">{item.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">{item.description}</p>
                  </div>
                  {!isReadOnly && item.allowedActions.includes("acknowledge") && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-xs h-7 px-2"
                      disabled={acknowledgeItem.isPending}
                      onClick={() =>
                        acknowledgeItem.mutate({
                          companyId: activeCompanyId ?? undefined,
                          itemId: item.id,
                        })
                      }
                    >
                      Ack
                    </Button>
                  )}
                </div>
              ))}
              {ctItems != null && ctItems.total > 15 && (
                <p className="text-[11px] text-muted-foreground text-right pt-1">
                  Showing 15 of {ctItems.total} signals
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {scopeEnabled && engagementOpsRole && engagementQueueKpi?.counts && (
          <Card className="border-border/80">
            <CardHeader className="py-3 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-sm">Engagement operations</CardTitle>
                  <CardDescription className="text-xs">
                    KPIs use persisted engagement health and top-action roll-ups (same filters as{" "}
                    <Link href="/engagements/ops" className="text-primary underline font-medium">
                      Engagement ops
                    </Link>
                    ). Click a tile to open the matching ops bucket.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  disabled={engagementRollupsRefresh.isPending}
                  onClick={() =>
                    engagementRollupsRefresh.mutate({ companyId: activeCompanyId ?? undefined })
                  }
                >
                  {engagementRollupsRefresh.isPending ? "Refreshing…" : "Refresh rollups"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Last roll-up write:{" "}
                {engagementQueueKpi.latestDerivedStateSyncedAt
                  ? fmtDateTimeShort(engagementQueueKpi.latestDerivedStateSyncedAt)
                  : "—"}
              </p>
            </CardHeader>
            <CardContent className="pt-0 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {(
                [
                  { label: "Overdue", n: engagementQueueKpi.counts.overdue ?? 0, bucket: "overdue" },
                  { label: "At risk", n: engagementQueueKpi.counts.at_risk ?? 0, bucket: "at_risk" },
                  {
                    label: "Awaiting client",
                    n: engagementQueueKpi.counts.awaiting_client ?? 0,
                    bucket: "awaiting_client",
                  },
                  {
                    label: "Awaiting team",
                    n: engagementQueueKpi.counts.awaiting_team ?? 0,
                    bucket: "awaiting_team",
                  },
                  { label: "Unassigned", n: engagementQueueKpi.counts.no_owner ?? 0, bucket: "no_owner" },
                  { label: "Open", n: engagementQueueKpi.counts.open ?? 0, bucket: "open" },
                ] as const
              ).map((c) => (
                <Link
                  key={c.label}
                  href={`/engagements/ops?bucket=${c.bucket}`}
                  className="rounded-lg border bg-muted/30 px-3 py-2 text-center hover:bg-muted/55 hover:border-primary/30 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{c.label}</p>
                  <p className="text-lg font-bold tabular-nums">{c.n}</p>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {queueScopeActive && !actionsLoading && (operatingBrief != null || executiveCommitments.length > 0) ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ControlTowerViewModeSelector value={viewMode} onChange={setViewMode} />
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
          <OperatingBriefSection
            brief={operatingBrief}
            emphasized={presentation.emphasizeBrief}
            variant={briefVariant}
            viewMode={viewMode}
          />
        ) : null}

        {viewMode === "present" && operatingBrief != null ? (
          <PresentationSummaryStrip
            variantLabel={briefVariantConfig.label}
            situationLine={presentationOneLine(operatingBrief.situationSummary)}
            outcomeLine={outcomeSummaryLine ?? operatingBrief.outcomeSummary ?? null}
            trendLine={trendSummaryLine ?? operatingBrief.trendSummary ?? null}
            interventionCount={executiveDecisionPrompts.length}
          />
        ) : null}

        <div
          className={cn(
            "space-y-10",
            presentation.dimNonBriefChrome && operatingBrief != null && "opacity-[0.88] transition-opacity",
          )}
        >
          <div
            className={cn(
              emphasizeDecisionsBlock ? "rounded-lg ring-1 ring-foreground/10 p-2 -mx-1" : "opacity-[0.94]",
            )}
          >
            <ExecutiveDecisionSection
              prompts={executiveDecisionPrompts}
              presentation={viewMode === "present"}
            />
          </div>

          {executiveCommitments.length > 0 ? (
            <div
              className={cn(
                "space-y-10",
                emphasizeCommitmentsBlock
                  ? "rounded-lg ring-1 ring-foreground/10 p-2 -mx-1"
                  : briefVariant === "weekly" && "opacity-[0.95]",
                reviewMode && "rounded-lg border border-amber-500/20 bg-muted/20 p-4 -mx-1 shadow-sm",
              )}
            >
              <ExecutiveCommitmentsSection
                commitments={executiveCommitments}
                presentation={viewMode === "present"}
              />
              <ExecutiveReviewSection items={executiveReviewItems} presentation={viewMode === "present"} />
            </div>
          ) : null}

          {presentation.showPrioritiesSection ? (
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
          ) : null}

          {presentation.showRiskStrip ? (
            <RiskStrip
              cards={riskCards}
              domainNarrativeLine={riskStripDomainHint}
              compact={presentation.riskStripCompact}
            />
          ) : null}

          {presentation.showQueue ? (
            <div className={cn(reviewMode && "opacity-[0.78] transition-opacity")}>
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
          ) : null}

          {presentation.showKpis ? (
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
          ) : null}

          {presentation.showFooter ? (
            <SupportContextFooter
              queueScopeActive={queueScopeActive}
              queueStatus={queueStatus}
              roleLabel={roleLabel}
              freshnessLabel={queueScopeActive && !actionsLoading ? queueUpdatedLabel : null}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
