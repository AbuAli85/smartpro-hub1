/**
 * shared/controlTowerTypes.ts
 *
 * Canonical Control Tower shapes shared between server and client.
 *
 * Design rules:
 *  - ControlTowerItem is the atomic unit of the decision queue.
 *  - domain maps to the signal capability required to see the item.
 *  - allowedActions is server-computed; client must drive buttons from it.
 *  - Sensitive domain items (finance, hr) must never appear for roles without
 *    the matching canViewControlTower*Signals capability.
 */

/** The business domain an item belongs to. Controls which role can see it. */
export type ControlTowerDomain =
  | "hr"
  | "payroll"
  | "finance"
  | "compliance"
  | "operations"
  | "contracts"
  | "documents"
  | "crm"
  | "client"
  | "audit";

export type ControlTowerSeverity = "critical" | "high" | "medium" | "low";

export type ControlTowerStatus =
  | "open"
  | "acknowledged"
  | "in_progress"
  | "resolved"
  | "dismissed";

/** Source that generated the item. */
export type ControlTowerSource = "system" | "manual" | "ai" | "integration";

/** Actions that the server confirms the current caller may perform. */
export type ControlTowerAction =
  | "acknowledge"
  | "assign"
  | "resolve"
  | "dismiss"
  | "view_detail"
  | "open_related";

/** Canonical shape for a single Control Tower decision/signal item. */
export interface ControlTowerItem {
  id: string;
  companyId: number;
  domain: ControlTowerDomain;
  severity: ControlTowerSeverity;
  status: ControlTowerStatus;
  title: string;
  description: string;
  /** User ID responsible for actioning this item (may be unassigned). */
  ownerUserId: number | null;
  /** Scoped to a department when non-null. */
  departmentId: number | null;
  /** Scoped to a specific employee when non-null. */
  employeeId: number | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  dueAt: Date | null;
  createdAt: Date;
  source: ControlTowerSource;
  /** Server-computed list of actions the current caller may perform on this item. */
  allowedActions: ControlTowerAction[];
}

/**
 * Summary counts returned by the Control Tower bundle endpoint.
 * Broken down by domain so the client can render domain tabs.
 */
export interface ControlTowerSummary {
  totalOpen: number;
  bySeverity: Record<ControlTowerSeverity, number>;
  byDomain: Partial<Record<ControlTowerDomain, number>>;
  /** Which domains this caller is permitted to see. */
  visibleDomains: ControlTowerDomain[];
}

/** Input to list/filter Control Tower items. */
export interface ControlTowerListInput {
  companyId?: number;
  domain?: ControlTowerDomain;
  severity?: ControlTowerSeverity;
  status?: ControlTowerStatus;
  departmentId?: number;
  employeeId?: number;
  limit?: number;
  offset?: number;
}
