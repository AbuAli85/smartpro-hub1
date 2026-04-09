import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { seesPlatformOperatorNav } from "@shared/clientNav";
import type { RouterOutputs } from "@/lib/trpc";

export type ActionItem = {
  id: string;
  title: string;
  severity: "high" | "medium" | "low";
  href: string;
  source: "payroll" | "workforce" | "contracts" | "hr";
  owner?: string | null;
  dueAt?: string | null;
};

type RoleQueueItem = RouterOutputs["operations"]["getRoleActionQueue"][number];
type OwnerPulse = NonNullable<RouterOutputs["operations"]["getOwnerBusinessPulse"]>;
type DecisionRow = OwnerPulse["controlTower"]["decisionsQueue"]["items"][number];

const SEVERITY_ORDER: Record<ActionItem["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function mapRoleSeverity(s: RoleQueueItem["severity"]): ActionItem["severity"] {
  if (s === "critical" || s === "high") return "high";
  if (s === "medium") return "medium";
  return "low";
}

function mapDecisionSeverity(s: "critical" | "high" | "medium"): ActionItem["severity"] {
  if (s === "critical" || s === "high") return "high";
  return "medium";
}

function sourceFromRoleType(type: RoleQueueItem["type"]): ActionItem["source"] {
  switch (type) {
    case "payroll_blocker":
      return "payroll";
    case "permit_expiry":
    case "government_case_overdue":
      return "workforce";
    default:
      return "hr";
  }
}

/** Prefer deep links that match destination module filters (query params ignored if unsupported). */
function enhanceRoleQueueHref(item: RoleQueueItem): string {
  const base = item.href;
  if (base.includes("?")) return base;
  switch (item.type) {
    case "payroll_blocker":
      return `${base}?queue=attention`;
    case "permit_expiry":
      return base.startsWith("/workforce/permits")
        ? base.includes("status=")
          ? base
          : `${base}?status=expiring_soon`
        : "/workforce/permits?status=expiring_soon";
    default:
      return base;
  }
}

function decisionKeyToSource(key: string): ActionItem["source"] {
  if (key === "contracts") return "contracts";
  if (key.startsWith("payroll")) return "payroll";
  if (key === "quotations") return "contracts";
  return "hr";
}

function enhanceDecisionHref(key: string, href: string): string {
  if (href.includes("?")) return href;
  switch (key) {
    case "contracts":
      return `${href}?status=pending_signature`;
    case "leave":
      return `${href}?status=pending`;
    case "employee_requests":
      return `${href}?status=pending`;
    case "payroll_draft":
    case "payroll_payment":
      return `${href}?queue=attention`;
    default:
      return href;
  }
}

function decisionItemToAction(d: DecisionRow): ActionItem {
  return {
    id: `decision-${d.key}`,
    title: d.count > 1 ? `${d.label} (${d.count})` : d.label,
    severity: mapDecisionSeverity(d.severity),
    href: enhanceDecisionHref(d.key, d.href),
    source: decisionKeyToSource(d.key),
  };
}

export type UseActionQueueOptions = {
  /** When false, skips tRPC (e.g. Storybook). */
  enabled?: boolean;
};

/**
 * Aggregates cross-module attention items from `operations.getRoleActionQueue` (payroll, workforce,
 * HR, documents) and pads with executive decision-queue rollups from `getOwnerBusinessPulse` when needed.
 * Server-side RBAC already filters queue rows by membership.
 */
export function useActionQueue(options: UseActionQueueOptions = {}) {
  const enabled = options.enabled !== false;
  const { user } = useAuth();
  const { activeCompanyId, activeCompany } = useActiveCompany();
  const platformOp = seesPlatformOperatorNav(user);

  const roleView = useMemo((): "ceo" | "admin" | "hr" | "finance" | "compliance" => {
    const role = activeCompany?.role;
    if (role === "finance_admin") return "finance";
    if (role === "hr_admin") return "hr";
    if (role === "reviewer" || role === "external_auditor") return "compliance";
    return "admin";
  }, [activeCompany?.role]);

  const scopeEnabled = enabled && activeCompanyId != null && !platformOp;

  const { data: roleQueue = [], isLoading: loadingQueue } = trpc.operations.getRoleActionQueue.useQuery(
    { companyId: activeCompanyId ?? 0, roleView },
    {
      enabled: scopeEnabled,
      staleTime: 60_000,
    },
  );

  const { data: pulse, isLoading: loadingPulse } = trpc.operations.getOwnerBusinessPulse.useQuery(
    { companyId: activeCompanyId ?? undefined },
    {
      enabled: scopeEnabled,
      staleTime: 60_000,
    },
  );

  const items = useMemo((): ActionItem[] => {
    const fromRole: ActionItem[] = roleQueue.map((item) => ({
      id: item.id,
      title: item.title,
      severity: mapRoleSeverity(item.severity),
      href: enhanceRoleQueueHref(item),
      source: sourceFromRoleType(item.type),
      owner: item.ownerUserId,
      dueAt: item.dueAt,
    }));

    const sortBySeverity = (rows: ActionItem[]) =>
      [...rows].sort((a, b) => {
        const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (s !== 0) return s;
        return a.title.localeCompare(b.title);
      });

    let out = sortBySeverity(fromRole).slice(0, 10);
    const decisions = pulse?.controlTower?.decisionsQueue?.items;
    if (out.length < 10 && decisions?.length) {
      const pad = sortBySeverity(decisions.map((d) => decisionItemToAction(d)));
      const ids = new Set(out.map((o) => o.id));
      for (const row of pad) {
        if (out.length >= 10) break;
        if (!ids.has(row.id)) {
          ids.add(row.id);
          out.push(row);
        }
      }
      out = sortBySeverity(out).slice(0, 10);
    }

    return out;
  }, [roleQueue, pulse?.controlTower?.decisionsQueue?.items]);

  const isLoading = scopeEnabled && (loadingQueue || loadingPulse);

  return {
    items,
    isLoading,
    isEmpty: !isLoading && items.length === 0,
    /** Raw role queue length before merge (for diagnostics). */
    rawRoleCount: roleQueue.length,
  };
}
