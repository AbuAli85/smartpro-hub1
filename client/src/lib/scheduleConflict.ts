/**
 * Pure helpers for client-side schedule assignment conflict detection.
 *
 * Extracted from EmployeeSchedulesPage so they can be unit-tested without
 * mounting React components.
 */

/**
 * Returns true when two date ranges overlap (inclusive on both ends).
 * A null endDate means the range is open-ended (extends to infinity).
 */
export function datesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  if (!aStart || !bStart) return false;
  const aEndDate = aEnd ?? "9999-12-31";
  const bEndDate = bEnd ?? "9999-12-31";
  return aStart <= bEndDate && bStart <= aEndDate;
}

/**
 * Minimum shape required for overlap detection.
 * Both ScheduleGroupEntry variants (group and legacy) satisfy this.
 */
export interface SchedulePeriod {
  employeeUserId: number;
  startDate: string;
  endDate: string | null;
}

/**
 * Finds the first active schedule in `existing` that overlaps the candidate
 * date range for the same employee, ignoring any entry the caller marks as
 * excluded (used when editing so the entry doesn't conflict with itself).
 *
 * Returns the conflicting entry or null.
 */
export function findOverlappingSchedule<T extends SchedulePeriod>(
  existing: T[],
  candidateEmployeeId: number,
  candidateStart: string,
  candidateEnd: string | null,
  isExcluded: (entry: T) => boolean,
): T | null {
  if (!candidateEmployeeId || !candidateStart) return null;

  for (const entry of existing) {
    if (entry.employeeUserId !== candidateEmployeeId) continue;
    if (isExcluded(entry)) continue;
    if (datesOverlap(candidateStart, candidateEnd, entry.startDate, entry.endDate)) {
      return entry;
    }
  }
  return null;
}
