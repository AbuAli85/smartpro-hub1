import type { ActionKind, ActionQueueItem, ActionSeverity, ActionSource } from "./actionQueueTypes";
import type { ActionSeverityInput } from "./actionSeverity";
import { getActionSeverity } from "./actionSeverity";

/** Serializable role-queue row (from `operations.getRoleActionQueue`) */
export type RawRoleQueueRow = {
  id: string;
  type: "payroll_blocker" | "permit_expiry" | "government_case_overdue" | "hr_approval" | "task" | "document_issue";
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  href: string;
  status: "open" | "pending" | "blocked" | "overdue" | "resolved";
  reason?: string;
  ownerUserId?: string | null;
  dueAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

/** Serializable decision rollup (from `controlTower.decisionsQueue.items`) */
export type RawDecisionRow = {
  key: string;
  label: string;
  count: number;
  href: string;
  severity: "critical" | "high" | "medium";
};

const SEVERITY_RANK: Record<ActionSeverity, number> = { high: 0, medium: 1, low: 2 };

function mapServerSeverity(s: RawRoleQueueRow["severity"]): ActionSeverityInput["serverSeverity"] {
  return s;
}

function sourceForKind(kind: ActionKind, roleType: RawRoleQueueRow["type"]): ActionSource {
  switch (kind) {
    case "payroll_blocker":
      return "payroll";
    case "permit_expired":
    case "permit_expiring":
    case "government_case_overdue":
      return "workforce";
    case "contract_signature_pending":
      return "contracts";
    case "compliance_failure":
      return "compliance";
    default:
      if (roleType === "document_issue") return "hr";
      return "hr";
  }
}

function inferKind(row: RawRoleQueueRow): { kind: ActionKind; lifecycle?: ActionSeverityInput["lifecycle"] } {
  switch (row.type) {
    case "payroll_blocker":
      return { kind: "payroll_blocker" };
    case "permit_expiry": {
      const expired = row.status === "overdue" || /expired/i.test(row.title) || row.href.includes("expired");
      return expired
        ? { kind: "permit_expired", lifecycle: "expired" }
        : { kind: "permit_expiring", lifecycle: "due_soon" };
    }
    case "government_case_overdue":
      return { kind: "government_case_overdue", lifecycle: "overdue" };
    case "hr_approval":
      return /leave/i.test(row.title)
        ? { kind: "leave_approval_pending", lifecycle: "pending" }
        : { kind: "generic_attention", lifecycle: "pending" };
    case "task":
      return { kind: "task_overdue", lifecycle: row.status === "overdue" ? "overdue" : "pending" };
    case "document_issue":
      return /expired/i.test(row.title)
        ? { kind: "document_expiry", lifecycle: "expired" }
        : { kind: "document_expiry", lifecycle: "due_soon" };
    default:
      return { kind: "generic_attention", lifecycle: "info" };
  }
}

function inferBlocking(row: RawRoleQueueRow, kind: ActionKind): boolean {
  if (kind === "permit_expired" || kind === "government_case_overdue") return true;
  if (kind === "payroll_blocker") return row.status === "blocked" || row.status === "overdue";
  if (kind === "task_overdue") return row.status === "overdue" || row.status === "blocked";
  if (kind === "document_expiry" && /expired/i.test(row.title)) return true;
  return false;
}

function enhanceRoleHref(row: RawRoleQueueRow, kind: ActionKind): string {
  const base = row.href;
  if (base.includes("?")) return base;
  if (kind === "payroll_blocker") return `${base}?queue=attention`;
  if (kind === "permit_expiring") {
    return base.startsWith("/workforce/permits") ? `${base}?status=expiring_soon` : "/workforce/permits?status=expiring_soon";
  }
  if (kind === "permit_expired") {
    return base.startsWith("/workforce/permits") ? `${base}?status=expired` : "/workforce/permits?status=expired";
  }
  return base;
}

function defaultCta(kind: ActionKind, plural: boolean): string {
  switch (kind) {
    case "payroll_blocker":
      return "Review payroll";
    case "permit_expired":
      return plural ? "Review permits" : "Review permit";
    case "permit_expiring":
      return plural ? "Review renewals" : "Review renewal";
    case "government_case_overdue":
      return plural ? "Review cases" : "Review case";
    case "contract_signature_pending":
      return plural ? "Review signatures" : "Review contract";
    case "leave_approval_pending":
      return plural ? "Review requests" : "Review request";
    case "document_expiry":
      return "Review documents";
    case "task_overdue":
      return "Open tasks";
    case "compliance_failure":
      return "Review compliance";
    case "attendance_exception":
      return "Review attendance";
    default:
      return "Open";
  }
}

export function mapRoleRowToItem(row: RawRoleQueueRow): ActionQueueItem {
  const { kind, lifecycle } = inferKind(row);
  const blocking = inferBlocking(row, kind);
  const severity = getActionSeverity({
    kind,
    blocking,
    lifecycle,
    serverSeverity: mapServerSeverity(row.severity),
  });
  const href = enhanceRoleHref(row, kind);
  const groupKey =
    kind === "permit_expired"
      ? "group:permit_expired"
      : kind === "permit_expiring"
        ? "group:permit_expiring"
        : kind === "government_case_overdue"
          ? "group:gov_overdue"
          : kind === "leave_approval_pending"
            ? "group:leave_pending"
            : null;

  return {
    id: row.id,
    kind,
    title: row.title,
    reason: row.reason,
    severity,
    blocking,
    source: sourceForKind(kind, row.type),
    href,
    ctaLabel: defaultCta(kind, false),
    ownerUserId: row.ownerUserId ?? null,
    ownerLabel: row.ownerUserId ? `User ${row.ownerUserId}` : null,
    dueAt: row.dueAt ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    count: 1,
    groupKey,
  };
}

function decisionKeyToKind(key: string): ActionKind {
  switch (key) {
    case "leave":
      return "leave_approval_pending";
    case "contracts":
      return "contract_signature_pending";
    case "payroll_draft":
    case "payroll_payment":
      return "payroll_blocker";
    case "expense":
      return "generic_attention";
    case "quotations":
      return "generic_attention";
    case "employee_requests":
      return "generic_attention";
    default:
      return "generic_attention";
  }
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

function decisionSource(key: string): ActionSource {
  if (key === "contracts") return "contracts";
  if (key.startsWith("payroll")) return "payroll";
  return "operations";
}

export function mapDecisionRowToItem(d: RawDecisionRow): ActionQueueItem {
  const kind = decisionKeyToKind(d.key);
  const blocking = kind === "payroll_blocker";
  const severity = getActionSeverity({
    kind,
    blocking,
    serverSeverity: d.severity === "critical" ? "critical" : d.severity,
    lifecycle: "pending",
  });
  return {
    id: `decision-${d.key}`,
    kind,
    title: d.count > 1 ? `${d.label} (${d.count})` : d.label,
    severity,
    blocking,
    source: decisionSource(d.key),
    href: enhanceDecisionHref(d.key, d.href),
    ctaLabel: defaultCta(kind, d.count > 1),
    ownerUserId: null,
    ownerLabel: null,
    dueAt: null,
    count: d.count,
    groupKey: `decision:${d.key}`,
  };
}

/** Remove exact duplicate ids */
export function dedupeActionQueueItems(items: ActionQueueItem[]): ActionQueueItem[] {
  const seen = new Set<string>();
  const out: ActionQueueItem[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

function mergeGroup(key: string, rows: ActionQueueItem[]): ActionQueueItem {
  const base = rows[0];
  const count = rows.reduce((s, r) => s + (r.count ?? 1), 0);

  if (key === "group:permit_expired") {
    const severity = getActionSeverity({ kind: "permit_expired", blocking: true, lifecycle: "expired" });
    return {
      ...base,
      id: "group-permit-expired",
      title: `${count} expired work permit${count === 1 ? "" : "s"}`,
      count,
      severity,
      blocking: true,
      href: "/workforce/permits?status=expired",
      ctaLabel: defaultCta("permit_expired", true),
      groupKey: key,
    };
  }
  if (key === "group:permit_expiring") {
    const severity = getActionSeverity({ kind: "permit_expiring", lifecycle: "due_soon" });
    return {
      ...base,
      id: "group-permit-expiring",
      title: `${count} permit${count === 1 ? "" : "s"} expiring soon`,
      count,
      severity,
      blocking: false,
      href: "/workforce/permits?status=expiring_soon",
      ctaLabel: defaultCta("permit_expiring", true),
      groupKey: key,
    };
  }
  if (key === "group:gov_overdue") {
    return {
      ...base,
      id: "group-gov-overdue",
      title: `${count} overdue government case${count === 1 ? "" : "s"}`,
      count,
      severity: getActionSeverity({ kind: "government_case_overdue", blocking: true }),
      blocking: true,
      href: "/workforce/cases",
      ctaLabel: defaultCta("government_case_overdue", true),
      groupKey: key,
    };
  }
  if (key === "group:leave_pending") {
    return {
      ...base,
      id: "group-leave-pending",
      title: `${count} leave request${count === 1 ? "" : "s"} pending approval`,
      count,
      severity: getActionSeverity({ kind: "leave_approval_pending", lifecycle: "pending" }),
      blocking: false,
      href: "/hr/leave?status=pending",
      ctaLabel: defaultCta("leave_approval_pending", true),
      groupKey: key,
    };
  }
  return base;
}

/**
 * Group homogeneous rows (same groupKey) into a single aggregate row.
 */
export function groupActionQueueItems(items: ActionQueueItem[]): ActionQueueItem[] {
  const buckets = new Map<string, ActionQueueItem[]>();
  const passthrough: ActionQueueItem[] = [];

  for (const it of items) {
    const gk = it.groupKey;
    if (!gk || !gk.startsWith("group:")) {
      passthrough.push(it);
      continue;
    }
    if (!buckets.has(gk)) buckets.set(gk, []);
    buckets.get(gk)!.push(it);
  }

  const grouped: ActionQueueItem[] = [];
  for (const [key, rows] of Array.from(buckets.entries())) {
    if (rows.length <= 1) grouped.push(rows[0]);
    else grouped.push(mergeGroup(key, rows));
  }

  return [...passthrough, ...grouped];
}

export function sortActionQueueItems(items: ActionQueueItem[]): ActionQueueItem[] {
  return [...items].sort((a, b) => {
    if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
    const sv = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sv !== 0) return sv;
    const ta = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    const ca = a.count ?? 1;
    const cb = b.count ?? 1;
    if (ca !== cb) return cb - ca;
    const t = a.title.localeCompare(b.title);
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });
}

function decisionOverlapsRoleQueue(d: RawDecisionRow, roleItems: ActionQueueItem[]): boolean {
  const k = d.key;
  if (k === "leave" && roleItems.some((i) => i.kind === "leave_approval_pending")) return true;
  if (k === "contracts" && roleItems.some((i) => i.kind === "contract_signature_pending")) return true;
  if ((k === "payroll_draft" || k === "payroll_payment") && roleItems.some((i) => i.kind === "payroll_blocker"))
    return true;
  if (k === "employee_requests" && roleItems.some((i) => i.title.toLowerCase().includes("request"))) return true;
  return false;
}

export function buildActionQueueFromSources(input: {
  roleRows: RawRoleQueueRow[];
  decisionRows: RawDecisionRow[] | undefined;
  /** Max rows to keep while padding decision rollups (before role prioritization / final cap) */
  maxCandidates?: number;
}): ActionQueueItem[] {
  const max = input.maxCandidates ?? 48;
  let fromRole = input.roleRows.map(mapRoleRowToItem);
  fromRole = dedupeActionQueueItems(fromRole);
  fromRole = groupActionQueueItems(fromRole);
  fromRole = dedupeActionQueueItems(fromRole);
  fromRole = sortActionQueueItems(fromRole);

  let merged = [...fromRole];
  const decisions = input.decisionRows ?? [];
  for (const d of decisions) {
    if (merged.length >= max) break;
    if (decisionOverlapsRoleQueue(d, merged)) continue;
    merged.push(mapDecisionRowToItem(d));
  }
  merged = dedupeActionQueueItems(merged);
  merged = sortActionQueueItems(merged);
  return merged;
}
