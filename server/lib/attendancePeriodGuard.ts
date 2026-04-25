/**
 * Server-side attendance period lock guard.
 *
 * Every write procedure that mutates attendance data for a specific
 * company + calendar month must call `loadAndAssertPeriodNotLocked`
 * before performing any DB mutation.
 *
 * Usage:
 *   const ymd = muscatCalendarYmdFromUtcInstant(checkInTime);
 *   await loadAndAssertPeriodNotLocked(db, companyId, ymd);
 */

import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { attendancePeriodLocks } from "../../drizzle/schema";
import { muscatCalendarYmdFromUtcInstant } from "@shared/attendanceMuscatTime";
import {
  defaultPeriodLockState,
  validatePeriodIsOpen,
  type PeriodLockState,
} from "@shared/attendancePeriodLock";

type Db = Parameters<typeof loadAndAssertPeriodNotLocked>[0];

/**
 * Load the period lock row for a given company + YYYY-MM-DD date, then assert
 * that the period is open or reopened (not locked or exported).
 *
 * Throws TRPCError CONFLICT if the period is locked or exported.
 */
export async function loadAndAssertPeriodNotLocked(
  db: { select: Function },
  companyId: number,
  dateYmd: string,
): Promise<PeriodLockState> {
  const [year, month] = parsePeriodFromYmd(dateYmd);

  const rows = await (db as any)
    .select()
    .from(attendancePeriodLocks)
    .where(
      and(
        eq(attendancePeriodLocks.companyId, companyId),
        eq(attendancePeriodLocks.year, year),
        eq(attendancePeriodLocks.month, month),
      ),
    )
    .limit(1);

  const state: PeriodLockState = rows[0]
    ? { status: rows[0].status, year, month, companyId }
    : defaultPeriodLockState(companyId, year, month);

  const validation = validatePeriodIsOpen(state);
  if (!validation.ok) {
    throw new TRPCError({
      code: "CONFLICT",
      message: validation.message,
      cause: { reason: validation.reason },
    });
  }

  return state;
}

/**
 * Parse year and month from a YYYY-MM-DD string.
 */
function parsePeriodFromYmd(ymd: string): [number, number] {
  const year = parseInt(ymd.slice(0, 4), 10);
  const month = parseInt(ymd.slice(5, 7), 10);
  return [year, month];
}

/**
 * Convenience wrapper: derive the business date from a UTC Date instant,
 * then assert the period is not locked.
 */
export async function loadAndAssertPeriodNotLockedForInstant(
  db: { select: Function },
  companyId: number,
  utcInstant: Date,
): Promise<PeriodLockState> {
  const ymd = muscatCalendarYmdFromUtcInstant(utcInstant);
  return loadAndAssertPeriodNotLocked(db, companyId, ymd);
}
