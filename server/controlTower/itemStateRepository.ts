/**
 * server/controlTower/itemStateRepository.ts
 *
 * Thin data-access layer for control_tower_item_states.
 *
 * All queries are company-scoped.  Every public function requires companyId so
 * cross-company leakage is impossible at the call site.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import {
  controlTowerItemStates,
  type ControlTowerItemState,
  type InsertControlTowerItemState,
} from "../../drizzle/schema";
import type { getDb } from "../db";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type { ControlTowerItemState };

// ─── Reads ────────────────────────────────────────────────────────────────────

/** Load all item states for a company in one query. */
export async function getItemStatesByCompany(
  db: DbClient,
  companyId: number,
): Promise<ControlTowerItemState[]> {
  return db
    .select()
    .from(controlTowerItemStates)
    .where(eq(controlTowerItemStates.companyId, companyId));
}

/** Load a subset of item states by key list. */
export async function getItemStatesByKeys(
  db: DbClient,
  companyId: number,
  itemKeys: string[],
): Promise<ControlTowerItemState[]> {
  if (itemKeys.length === 0) return [];
  return db
    .select()
    .from(controlTowerItemStates)
    .where(
      and(
        eq(controlTowerItemStates.companyId, companyId),
        inArray(controlTowerItemStates.itemKey, itemKeys),
      ),
    );
}

/** Load one state by key, or return null. */
export async function getItemStateByKey(
  db: DbClient,
  companyId: number,
  itemKey: string,
): Promise<ControlTowerItemState | null> {
  const rows = await db
    .select()
    .from(controlTowerItemStates)
    .where(
      and(
        eq(controlTowerItemStates.companyId, companyId),
        eq(controlTowerItemStates.itemKey, itemKey),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// ─── Writes ───────────────────────────────────────────────────────────────────

/**
 * Insert-or-update a state record.
 *
 * On conflict on (company_id, item_key) the state columns are overwritten.
 * Read-only fields (createdAt) are never updated.
 */
export async function upsertItemState(
  db: DbClient,
  data: InsertControlTowerItemState,
): Promise<void> {
  await db
    .insert(controlTowerItemStates)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        status: data.status,
        ownerUserId: data.ownerUserId ?? null,
        acknowledgedBy: data.acknowledgedBy ?? null,
        acknowledgedAt: data.acknowledgedAt ?? null,
        resolvedBy: data.resolvedBy ?? null,
        resolvedAt: data.resolvedAt ?? null,
        dismissedBy: data.dismissedBy ?? null,
        dismissedAt: data.dismissedAt ?? null,
        dismissalReason: data.dismissalReason ?? null,
        lastSeenAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      },
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Index an array of states by itemKey for O(1) overlay lookups. */
export function buildStateMap(
  states: ControlTowerItemState[],
): Map<string, ControlTowerItemState> {
  return new Map(states.map((s) => [s.itemKey, s]));
}
