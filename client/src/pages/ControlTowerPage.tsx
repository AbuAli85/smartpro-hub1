import { useMemo } from "react";
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

  return (
    <div className="min-h-screen bg-background">
      <ExecutiveHeader
        subtitle="Monitor blockers, priorities, and operational health in one place."
        companyName={activeCompany?.name ?? null}
        freshnessLabel={queueUpdatedLabel ?? null}
        escalationSummaryLine={escalationSummaryLine}
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
        />

        <RiskStrip cards={riskCards} />

        <ActionQueueSection
          queueScopeActive={queueScopeActive}
          actionsLoading={actionsLoading}
          queueStatus={queueStatus}
          queueUpdatedLabel={queueUpdatedLabel}
          queueForList={queueForList}
          actionItemsLength={actionItems.length}
        />

        <KpiSnapshotSection
          scopeEnabled={scopeEnabled}
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
