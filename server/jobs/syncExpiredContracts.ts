/**
 * Daily background job: sync expired contracts.
 *
 * WHAT IT DOES
 * ────────────
 * Finds every contract where `status = 'active' AND expiry_date < CURDATE()`
 * and transitions it to `'expired'`, writing one audit event per contract.
 *
 * RELATIONSHIP WITH LAZY-EXPIRE
 * ─────────────────────────────
 * The system has two expiry mechanisms that complement each other:
 *
 *   1. Lazy-expire (real-time, per-contract):
 *      `lazyExpireContract` fires inside `getById` every time a contract is
 *      fetched.  It keeps the status accurate for contracts that are actively
 *      being viewed, but leaves unviewed contracts stale.
 *
 *   2. effectiveContractStatus (KPI fallback):
 *      The KPI aggregation layer calls `effectiveContractStatus()` on every
 *      row so dashboard numbers are always accurate even when the DB is stale.
 *
 *   3. This job (authoritative end-of-day reconciliation):
 *      Ensures the *database itself* reflects reality regardless of whether
 *      individual contracts were fetched that day.  After the job runs, the
 *      DB status and the effective status should match.
 *
 * IDEMPOTENCY
 * ───────────
 * Safe to run multiple times per day:
 *   - The SELECT only returns `status='active'` rows; already-expired
 *     contracts are invisible to it.
 *   - The no-op guard in `transitionContractStatus` prevents duplicate writes
 *     and duplicate audit events if a contract is concurrently expired by
 *     lazy-expire or a second job run.
 *
 * ENVIRONMENT GATE
 * ────────────────
 * Set `DISABLE_CONTRACT_EXPIRE_JOB=1` to prevent the job from running
 * (useful in local dev or when using an external scheduler).
 */

import { getDb } from "../db";
import {
  expireOverdueContracts,
} from "../modules/contractManagement/contractManagement.repository";

export type SyncExpiredContractsResult = {
  found:   number;
  expired: number;
  skipped: number;
  errors:  number;
};

/**
 * Entry point called by the server startup scheduler.
 *
 * Returns a stats object; callers should log it if `expired > 0` or
 * `errors > 0`.  A result where `found === 0` is silent-success.
 */
export async function runSyncExpiredContracts(): Promise<SyncExpiredContractsResult> {
  const db = await getDb();
  if (!db) {
    console.warn("[expire-job] Database unavailable — skipping run.");
    return { found: 0, expired: 0, skipped: 0, errors: 0 };
  }

  return expireOverdueContracts(db);
}
