import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { seesPlatformOperatorNav } from "@shared/clientNav";
import { useMyCapabilities } from "@/hooks/useMyCapabilities";
import type { RouterOutputs } from "@/lib/trpc";
import type { ActionQueueStatus } from "@/features/controlTower/actionQueueTypes";
import type { ActionQueueItemExecutionView } from "@/features/controlTower/escalationTypes";
import { attachExecutionToQueueItems } from "@/features/controlTower/executionMeta";
import { attachEscalationToQueueItems } from "@/features/controlTower/escalationMeta";
import { buildActionQueueFromSources } from "@/features/controlTower/actionQueuePipeline";
import type { RawDecisionRow, RawRoleQueueRow } from "@/features/controlTower/actionQueuePipeline";
import { prioritizeActionQueueForRole } from "@/features/controlTower/actionQueueRolePrioritize";
import { computeActionQueueStatus } from "@/features/controlTower/actionQueueComputeStatus";

type RoleQueueItem = RouterOutputs["operations"]["getRoleActionQueue"][number];
type OwnerPulse = NonNullable<RouterOutputs["operations"]["getOwnerBusinessPulse"]>;
type DecisionRow = OwnerPulse["controlTower"]["decisionsQueue"]["items"][number];

function toRawRoleRow(item: RoleQueueItem): RawRoleQueueRow {
  const ext = item as RoleQueueItem & { createdAt?: string | null; updatedAt?: string | null };
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    severity: item.severity,
    href: item.href,
    status: item.status,
    reason: item.reason,
    ownerUserId: item.ownerUserId,
    dueAt: item.dueAt,
    createdAt: ext.createdAt ?? null,
    updatedAt: ext.updatedAt ?? null,
  };
}

function toRawDecisionRows(items: DecisionRow[] | undefined): RawDecisionRow[] | undefined {
  if (!items?.length) return undefined;
  return items.map((d) => ({
    key: d.key,
    label: d.label,
    count: d.count,
    href: d.href,
    severity: d.severity,
  }));
}

export type UseActionQueueOptions = {
  enabled?: boolean;
};

export type ActionQueueResult = {
  items: ActionQueueItemExecutionView[];
  status: ActionQueueStatus;
  isLoading: boolean;
  hasHighSeverity: boolean;
  hasBlocking: boolean;
  lastUpdatedLabel?: string;
  /** False for platform operators or when tenant scope is inactive */
  scopeActive: boolean;
  queueError: boolean;
  pulseError: boolean;
};

/** @deprecated Use `ActionQueueItemExecutionView` / `ActionQueueItem` from control tower feature */
export type ActionItem = ActionQueueItemExecutionView;

/**
 * Tenant-scoped decision queue — normalized, grouped, role-prioritised, capped at 10 items.
 */
export function useActionQueue(options: UseActionQueueOptions = {}): ActionQueueResult {
  const hookEnabled = options.enabled !== false;
  const { user } = useAuth();
  const { activeCompanyId, activeCompany } = useActiveCompany();
  const platformOp = seesPlatformOperatorNav(user);

  const { caps: myCaps } = useMyCapabilities();

  // Derive the queue view from capabilities rather than raw role strings.
  // The server also derives roleView from the membership role, so this is
  // a pure UI hint for prioritization — not an authorization decision.
  const roleView = useMemo((): "ceo" | "admin" | "hr" | "finance" | "compliance" => {
    const role = activeCompany?.role;
    // Compliance-only roles (reviewer / external_auditor) — no payroll or HR write access.
    if (role === "reviewer" || role === "external_auditor") return "compliance";
    // Finance-focused: can run/approve payroll but not HR management.
    if (myCaps.canRunPayroll || myCaps.canApprovePayroll) return "finance";
    // HR-focused: can approve attendance / leave but not payroll.
    if (myCaps.canApproveAttendance && !myCaps.canRunPayroll) return "hr";
    return "admin";
  }, [activeCompany?.role, myCaps.canRunPayroll, myCaps.canApprovePayroll, myCaps.canApproveAttendance]);

  const scopeEnabled = hookEnabled && activeCompanyId != null && !platformOp;

  const rq = trpc.operations.getRoleActionQueue.useQuery(
    { companyId: activeCompanyId ?? 0, roleView },
    {
      enabled: scopeEnabled,
      staleTime: 60_000,
    },
  );

  const pulse = trpc.operations.getOwnerBusinessPulse.useQuery(
    { companyId: activeCompanyId ?? undefined },
    {
      enabled: scopeEnabled,
      staleTime: 60_000,
    },
  );

  const items = useMemo((): ActionQueueItemExecutionView[] => {
    if (!scopeEnabled) return [];
    const roleRows = (rq.data ?? []).map(toRawRoleRow);
    const rawDecisions = pulse.data?.controlTower?.decisionsQueue?.items;
    const decisionRows = toRawDecisionRows(rawDecisions);
    let built = buildActionQueueFromSources({
      roleRows,
      decisionRows,
      maxCandidates: 48,
    });
    built = prioritizeActionQueueForRole(built, activeCompany?.role ?? null);
    const sliced = built.slice(0, 10);
    return attachEscalationToQueueItems(attachExecutionToQueueItems(sliced, user));
  }, [scopeEnabled, rq.data, pulse.data, activeCompany?.role, user]);

  const queueError = scopeEnabled && rq.isError;
  const pulseError = scopeEnabled && pulse.isError;
  const isLoading = scopeEnabled && (rq.isLoading || pulse.isLoading);

  const status = useMemo((): ActionQueueStatus => {
    if (!scopeEnabled) return "ready";
    if (isLoading) return "ready";
    return computeActionQueueStatus({
      queueError,
      pulseError,
      items,
    });
  }, [scopeEnabled, isLoading, queueError, pulseError, items]);

  const hasHighSeverity = items.some((i) => i.severity === "high");
  const hasBlocking = items.some((i) => i.blocking);

  const lastUpdatedLabel = useMemo(() => {
    if (!scopeEnabled) return undefined;
    const t = Math.max(rq.dataUpdatedAt ?? 0, pulse.dataUpdatedAt ?? 0);
    if (!t) return undefined;
    return `Updated ${formatDistanceToNow(new Date(t), { addSuffix: true })}`;
  }, [scopeEnabled, rq.dataUpdatedAt, pulse.dataUpdatedAt]);

  return {
    items,
    status,
    isLoading,
    hasHighSeverity,
    hasBlocking,
    lastUpdatedLabel,
    scopeActive: scopeEnabled,
    queueError,
    pulseError,
  };
}
