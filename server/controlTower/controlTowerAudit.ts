/**
 * server/controlTower/controlTowerAudit.ts
 *
 * Audit logging for Control Tower lifecycle mutations.
 *
 * Uses the shared audit_logs table (existing pattern).  All CT entries use
 * entityType = "control_tower_item" and action = "control_tower.<action>".
 *
 * oldValues / newValues carry:
 *   { itemKey, domain, status, reason? }
 *
 * so the audit trail is self-contained without needing to join signal tables.
 */

import { auditLogs } from "../../drizzle/schema";
import type { getDb } from "../db";
import type { ControlTowerStatus } from "@shared/controlTowerTypes";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type CtAuditAction =
  | "acknowledge"
  | "mark_in_progress"
  | "assign"
  | "resolve"
  | "dismiss"
  | "reopen";

export interface CtAuditEntry {
  companyId: number;
  itemKey: string;
  domain: string;
  action: CtAuditAction;
  actorUserId: number;
  previousStatus: ControlTowerStatus | null;
  nextStatus: ControlTowerStatus;
  /** Required for dismiss; optional for others. */
  reason?: string;
  /** Provided for assign action. */
  assignedToUserId?: number;
}

export async function logCtMutation(
  db: DbClient,
  entry: CtAuditEntry,
): Promise<void> {
  await db.insert(auditLogs).values({
    userId: entry.actorUserId,
    companyId: entry.companyId,
    action: `control_tower.${entry.action}`,
    entityType: "control_tower_item",
    entityId: null,
    oldValues: {
      itemKey: entry.itemKey,
      domain: entry.domain,
      status: entry.previousStatus,
    },
    newValues: {
      itemKey: entry.itemKey,
      domain: entry.domain,
      status: entry.nextStatus,
      reason: entry.reason ?? null,
      assignedToUserId: entry.assignedToUserId ?? null,
    },
  });
}
