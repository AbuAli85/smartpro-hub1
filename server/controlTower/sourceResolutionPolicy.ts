/**
 * server/controlTower/sourceResolutionPolicy.ts
 *
 * Source-confirmed resolution policy for Control Tower items.
 *
 * All current CT signals are system-generated: the signal builder fires when a
 * real DB condition is true.  Allowing a manual "resolve" while the source
 * condition is still active would silently suppress a live issue.
 *
 * Policy:
 *  - requiresSourceResolution(itemKey)
 *      Returns true for every non-scoped, system-generated signal.
 *      Scoped (:scoped:) signals are exempt — they are re-emergence-guarded
 *      instead (overlayStateOnItems will re-open them on the next refresh if
 *      the underlying condition is still active after the grace window).
 *
 *  - checkSourceStillActive(db, companyId, itemKey, now)
 *      Runs a single targeted DB query per signal type.
 *      Returns true  → source condition is still live; resolve must be blocked.
 *      Returns false → source condition has cleared; resolve is safe.
 *      Returns false for unknown key shapes (defensive — don't block unexpectedly).
 */

import { and, count, eq, gte, inArray, isNull, isNotNull, lt, lte, or } from "drizzle-orm";
import {
  caseSlaTracking,
  clientServiceInvoices,
  companyDocuments,
  companyOmanizationSnapshots,
  contracts,
  employeeDocuments,
  employeeRequests,
  employeeTasks,
  engagements,
  governmentServiceCases,
  leaveRequests,
  payrollRuns,
  renewalWorkflowRuns,
  workPermits,
} from "../../drizzle/schema";
import type { getDb } from "../db";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

// ─── Policy gate ──────────────────────────────────────────────────────────────

/**
 * Returns true when the item requires a live source-condition check before
 * allowing manual resolve.
 *
 * Scoped signals (`:scoped:` in the key) are excluded: their re-emergence
 * logic in overlayStateOnItems handles stale suppression without requiring
 * the scope list at resolve time.
 */
export function requiresSourceResolution(itemKey: string): boolean {
  if (itemKey.includes(":scoped")) return false;
  const domain = itemKey.split(":")[0] ?? "";
  return ["payroll", "hr", "compliance", "operations", "finance", "documents", "contracts"].includes(domain);
}

// ─── Source-active checks ─────────────────────────────────────────────────────

/**
 * Returns true if the source DB condition that produced `itemKey` is still
 * active right now.  Each branch runs at most one COUNT query.
 */
export async function checkSourceStillActive(
  db: DbClient,
  companyId: number,
  itemKey: string,
  now: Date = new Date(),
): Promise<boolean> {
  const parts = itemKey.split(":");
  const domain = parts[0] ?? "";

  switch (domain) {
    case "payroll":  return checkPayrollActive(db, companyId, parts, now);
    case "hr":       return checkHrActive(db, companyId, parts);
    case "compliance": return checkComplianceActive(db, companyId, parts, now);
    case "operations": return checkOperationsActive(db, companyId, parts, now);
    case "finance":  return checkFinanceActive(db, companyId, parts, now);
    case "documents": return checkDocumentsActive(db, companyId, parts, now);
    case "contracts": return checkContractsActive(db, companyId, parts, now);
    default:         return false; // unknown — don't block
  }
}

// ─── Payroll ─────────────────────────────────────────────────────────────────

async function checkPayrollActive(
  db: DbClient,
  companyId: number,
  parts: string[],
  _now: Date,
): Promise<boolean> {
  // payroll:{cid}:{year}:{month}:draft
  // payroll:{cid}:{year}:{month}:not_started
  // payroll:{cid}:approved_unpaid
  const signal = parts[4] ?? parts[2] ?? "";

  if (signal === "draft") {
    const year = parseInt(parts[2] ?? "", 10);
    const month = parseInt(parts[3] ?? "", 10);
    if (!year || !month) return false;
    const [row] = await db
      .select({ cnt: count() })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.companyId, companyId),
        eq(payrollRuns.status, "draft"),
        eq(payrollRuns.previewOnly, false),
        eq(payrollRuns.periodYear, year),
        eq(payrollRuns.periodMonth, month),
      ));
    return Number(row?.cnt ?? 0) > 0;
  }

  if (signal === "approved_unpaid" || parts[2] === "approved_unpaid") {
    const [row] = await db
      .select({ cnt: count() })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.companyId, companyId),
        eq(payrollRuns.status, "approved"),
        eq(payrollRuns.previewOnly, false),
      ));
    return Number(row?.cnt ?? 0) > 0;
  }

  if (signal === "not_started") {
    const year = parseInt(parts[2] ?? "", 10);
    const month = parseInt(parts[3] ?? "", 10);
    if (!year || !month) return false;
    const [row] = await db
      .select({ cnt: count() })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.companyId, companyId),
        eq(payrollRuns.previewOnly, false),
        eq(payrollRuns.periodYear, year),
        eq(payrollRuns.periodMonth, month),
      ));
    // Source is "active" (no run started) when count is still 0
    return Number(row?.cnt ?? 0) === 0;
  }

  return false;
}

// ─── HR ──────────────────────────────────────────────────────────────────────

async function checkHrActive(
  db: DbClient,
  companyId: number,
  parts: string[],
): Promise<boolean> {
  // hr:{cid}:leave:pending
  // hr:{cid}:employee_requests:pending
  const type = parts[2] ?? "";

  if (type === "leave") {
    const [row] = await db
      .select({ cnt: count() })
      .from(leaveRequests)
      .where(and(
        eq(leaveRequests.companyId, companyId),
        eq(leaveRequests.status, "pending"),
      ));
    return Number(row?.cnt ?? 0) > 0;
  }

  if (type === "employee_requests") {
    const [row] = await db
      .select({ cnt: count() })
      .from(employeeRequests)
      .where(and(
        eq(employeeRequests.companyId, companyId),
        eq(employeeRequests.status, "pending"),
      ));
    return Number(row?.cnt ?? 0) > 0;
  }

  return false;
}

// ─── Compliance ───────────────────────────────────────────────────────────────

async function checkComplianceActive(
  db: DbClient,
  companyId: number,
  parts: string[],
  now: Date,
): Promise<boolean> {
  // compliance:{cid}:omanization:{year}:{month}:non_compliant|warning
  // compliance:{cid}:renewals:failed
  // compliance:{cid}:work_permits:expiring_7d
  const type = parts[2] ?? "";

  if (type === "omanization") {
    const year = parseInt(parts[3] ?? "", 10);
    const month = parseInt(parts[4] ?? "", 10);
    const requiredStatus = parts[5] ?? "";
    if (!year || !month || !requiredStatus) return false;
    const [row] = await db
      .select({ complianceStatus: companyOmanizationSnapshots.complianceStatus })
      .from(companyOmanizationSnapshots)
      .where(and(
        eq(companyOmanizationSnapshots.companyId, companyId),
        eq(companyOmanizationSnapshots.snapshotYear, year),
        eq(companyOmanizationSnapshots.snapshotMonth, month),
      ))
      .limit(1);
    return row?.complianceStatus === requiredStatus;
  }

  if (type === "renewals") {
    const [row] = await db
      .select({ cnt: count() })
      .from(renewalWorkflowRuns)
      .where(and(
        eq(renewalWorkflowRuns.companyId, companyId),
        eq(renewalWorkflowRuns.status, "failed"),
      ));
    return Number(row?.cnt ?? 0) > 0;
  }

  if (type === "work_permits") {
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({ cnt: count() })
      .from(workPermits)
      .where(and(
        eq(workPermits.companyId, companyId),
        gte(workPermits.expiryDate, now),
        lte(workPermits.expiryDate, in7),
      ));
    return Number(row?.cnt ?? 0) > 0;
  }

  return false;
}

// ─── Operations ───────────────────────────────────────────────────────────────

async function checkOperationsActive(
  db: DbClient,
  companyId: number,
  parts: string[],
  now: Date,
): Promise<boolean> {
  // operations:{cid}:sla:breach
  // operations:{cid}:engagements:blocked|at_risk
  // operations:{cid}:tasks:overdue|blocked
  const type = parts[2] ?? "";
  const sub  = parts[3] ?? "";

  if (type === "sla") {
    const [row] = await db
      .select({ cnt: count() })
      .from(caseSlaTracking)
      .innerJoin(governmentServiceCases, eq(caseSlaTracking.caseId, governmentServiceCases.id))
      .where(and(
        eq(governmentServiceCases.companyId, companyId),
        isNotNull(caseSlaTracking.dueAt),
        lt(caseSlaTracking.dueAt, now),
        isNull(caseSlaTracking.resolvedAt),
      ));
    return Number(row?.cnt ?? 0) > 0;
  }

  if (type === "engagements" && sub === "blocked") {
    const [row] = await db
      .select({ cnt: count() })
      .from(engagements)
      .where(and(
        eq(engagements.companyId, companyId),
        eq(engagements.health, "blocked"),
        or(
          eq(engagements.status, "active"),
          eq(engagements.status, "waiting_client"),
          eq(engagements.status, "waiting_platform"),
        ),
      ));
    return Number(row?.cnt ?? 0) > 0;
  }

  if (type === "engagements" && sub === "at_risk") {
    const [row] = await db
      .select({ cnt: count() })
      .from(engagements)
      .where(and(
        eq(engagements.companyId, companyId),
        eq(engagements.health, "at_risk"),
        or(
          eq(engagements.status, "active"),
          eq(engagements.status, "waiting_client"),
          eq(engagements.status, "waiting_platform"),
        ),
      ));
    return Number(row?.cnt ?? 0) > 0;
  }

  if (type === "tasks" && sub === "overdue") {
    const [row] = await db
      .select({ cnt: count() })
      .from(employeeTasks)
      .where(and(
        eq(employeeTasks.companyId, companyId),
        inArray(employeeTasks.status, ["pending", "in_progress"]),
        lt(employeeTasks.dueDate, now),
        isNotNull(employeeTasks.dueDate),
      ));
    return Number(row?.cnt ?? 0) > 0;
  }

  if (type === "tasks" && sub === "blocked") {
    const [row] = await db
      .select({ cnt: count() })
      .from(employeeTasks)
      .where(and(
        eq(employeeTasks.companyId, companyId),
        eq(employeeTasks.status, "blocked"),
      ));
    return Number(row?.cnt ?? 0) > 0;
  }

  return false;
}

// ─── Finance ──────────────────────────────────────────────────────────────────

async function checkFinanceActive(
  db: DbClient,
  companyId: number,
  parts: string[],
  _now: Date,
): Promise<boolean> {
  // finance:{cid}:invoices:overdue
  // finance:{cid}:payroll:approved_unpaid
  const type = parts[2] ?? "";

  if (type === "invoices") {
    const [row] = await db
      .select({ cnt: count() })
      .from(clientServiceInvoices)
      .where(and(
        eq(clientServiceInvoices.companyId, companyId),
        eq(clientServiceInvoices.status, "overdue"),
      ));
    return Number(row?.cnt ?? 0) > 0;
  }

  if (type === "payroll") {
    const [row] = await db
      .select({ cnt: count() })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.companyId, companyId),
        eq(payrollRuns.status, "approved"),
        eq(payrollRuns.previewOnly, false),
      ));
    return Number(row?.cnt ?? 0) > 0;
  }

  return false;
}

// ─── Documents ────────────────────────────────────────────────────────────────

async function checkDocumentsActive(
  db: DbClient,
  companyId: number,
  parts: string[],
  now: Date,
): Promise<boolean> {
  // documents:{cid}:employee:expiring_7d
  // documents:{cid}:company:expiring_30d
  const type = parts[2] ?? "";

  if (type === "employee") {
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({ cnt: count() })
      .from(employeeDocuments)
      .where(and(
        eq(employeeDocuments.companyId, companyId),
        isNotNull(employeeDocuments.expiresAt),
        gte(employeeDocuments.expiresAt, now),
        lte(employeeDocuments.expiresAt, in7),
      ));
    return Number(row?.cnt ?? 0) > 0;
  }

  if (type === "company") {
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({ cnt: count() })
      .from(companyDocuments)
      .where(and(
        eq(companyDocuments.companyId, companyId),
        eq(companyDocuments.isDeleted, false),
        isNotNull(companyDocuments.expiryDate),
        gte(companyDocuments.expiryDate, now),
        lte(companyDocuments.expiryDate, in30),
      ));
    return Number(row?.cnt ?? 0) > 0;
  }

  return false;
}

// ─── Contracts ────────────────────────────────────────────────────────────────

async function checkContractsActive(
  db: DbClient,
  companyId: number,
  parts: string[],
  now: Date,
): Promise<boolean> {
  // contracts:{cid}:pending_signature
  // contracts:{cid}:expiring_30d
  const type = parts[2] ?? "";

  if (type === "pending_signature") {
    const [row] = await db
      .select({ cnt: count() })
      .from(contracts)
      .where(and(
        eq(contracts.companyId, companyId),
        eq(contracts.status, "pending_signature"),
      ));
    return Number(row?.cnt ?? 0) > 0;
  }

  if (type === "expiring_30d") {
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({ cnt: count() })
      .from(contracts)
      .where(and(
        eq(contracts.companyId, companyId),
        inArray(contracts.status, ["signed", "active"]),
        isNotNull(contracts.endDate),
        gte(contracts.endDate, now),
        lte(contracts.endDate, in30),
      ));
    return Number(row?.cnt ?? 0) > 0;
  }

  return false;
}
