/**
 * Attendance reconciliation / payroll preflight — compares clock rows, payroll sessions,
 * and legacy HR `attendance` within a Muscat-inclusive date range.
 */
import { and, eq, gte, lt, lte, or } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { attendance, attendanceRecords, attendanceSessions } from "../drizzle/schema";
import { muscatCalendarYmdFromUtcInstant, muscatWallDateTimeToUtc } from "@shared/attendanceMuscatTime";

/** Max clock rows scanned per run (safety). */
export const RECONCILIATION_MAX_RECORDS = 8000;

export type MismatchSeverity = "blocking" | "warning";

export type MismatchType =
  | "RECORD_CLOSED_MISSING_SESSION"
  | "RECORD_OPEN_MISSING_SESSION"
  | "SESSION_ORPHAN_SOURCE_RECORD"
  | "SESSION_WITHOUT_SOURCE_WARNING"
  | "SESSION_BUSINESS_DATE_DRIFT"
  | "SESSION_TIME_DRIFT"
  | "SESSION_OPEN_STATE_MISMATCH"
  | "MULTIPLE_SESSIONS_FOR_RECORD"
  | "LEGACY_ROW_MISMATCH"
  | "LEGACY_PRESENT_WITHOUT_RECORD";

export interface AttendanceMismatch {
  type: MismatchType;
  severity: MismatchSeverity;
  companyId: number;
  employeeId: number | null;
  businessDate?: string;
  summary: string;
  details: Record<string, unknown>;
  attendanceRecordId?: number | null;
  attendanceSessionId?: number | null;
  legacyAttendanceId?: number | null;
}

export interface AttendanceReconciliationReport {
  companyId: number;
  fromYmd: string;
  toYmd: string;
  windowStartUtc: string;
  windowEndExclusiveUtc: string;
  /** Max rows loaded from `attendance_records` for this run (safety cap). */
  recordsLoadCap: number;
  /**
   * When true, `totals.records` hit the cap — reconciliation may omit later clock rows in the same window;
   * do not treat `preflight.safe` as guaranteed for the full calendar period without widening the scan or paging.
   */
  recordsScanMayBeIncomplete: boolean;
  totals: { records: number; sessions: number; legacyRows: number };
  mismatches: AttendanceMismatch[];
  mismatchCountsByType: Record<string, number>;
  blockingCount: number;
  warningCount: number;
  affectedEmployeeIds: number[];
}

export type PayrollPreflightDecision = "safe" | "warnings" | "block";

export interface PayrollPreflightResult {
  decision: PayrollPreflightDecision;
  blockingCount: number;
  warningCount: number;
  reasons: string[];
}

const TIME_DRIFT_MS = 2000;

/** Inclusive Muscat `fromYmd` … `toYmd` → half-open UTC `[start, end)` for `check_in` / `check_in_at` filters. */
export function muscatInclusiveYmdRangeToUtcHalfOpen(fromYmd: string, toYmd: string): { startUtc: Date; endExclusiveUtc: Date } {
  const startUtc = muscatWallDateTimeToUtc(fromYmd, "00:00:00");
  const [y, mo, d] = toYmd.split("-").map((x) => parseInt(x, 10));
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  const nextYmd = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  const endExclusiveUtc = muscatWallDateTimeToUtc(nextYmd, "00:00:00");
  return { startUtc, endExclusiveUtc };
}

/**
 * Compare one clock row to its session rows (same `source_record_id`).
 * Exported for unit tests.
 */
export function compareRecordToSessions(
  record: typeof attendanceRecords.$inferSelect,
  sessionList: (typeof attendanceSessions.$inferSelect)[],
): AttendanceMismatch[] {
  const out: AttendanceMismatch[] = [];
  const companyId = record.companyId;
  const expectedBd = muscatCalendarYmdFromUtcInstant(new Date(record.checkIn));
  const recordOpen = record.checkOut == null;

  if (sessionList.length === 0) {
    if (!recordOpen) {
      out.push({
        type: "RECORD_CLOSED_MISSING_SESSION",
        severity: "blocking",
        companyId,
        employeeId: record.employeeId,
        businessDate: expectedBd,
        summary: "Closed clock row has no matching payroll session (source_record_id)",
        details: { recordId: record.id },
        attendanceRecordId: record.id,
      });
    } else {
      out.push({
        type: "RECORD_OPEN_MISSING_SESSION",
        severity: "warning",
        companyId,
        employeeId: record.employeeId,
        businessDate: expectedBd,
        summary: "Open clock row has no matching payroll session row",
        details: { recordId: record.id },
        attendanceRecordId: record.id,
      });
    }
    return out;
  }

  if (sessionList.length > 1) {
    out.push({
      type: "MULTIPLE_SESSIONS_FOR_RECORD",
      severity: "blocking",
      companyId,
      employeeId: record.employeeId,
      businessDate: expectedBd,
      summary: `${sessionList.length} session rows share the same source_record_id`,
      details: { recordId: record.id, sessionIds: sessionList.map((s) => s.id) },
      attendanceRecordId: record.id,
      attendanceSessionId: sessionList[0]?.id ?? null,
    });
  }

  const s = sessionList[0]!;
  if (s.businessDate !== expectedBd) {
    out.push({
      type: "SESSION_BUSINESS_DATE_DRIFT",
      severity: "blocking",
      companyId,
      employeeId: record.employeeId,
      businessDate: expectedBd,
      summary: "Session business_date does not match Muscat calendar date of record check-in",
      details: {
        recordId: record.id,
        sessionId: s.id,
        expectedBusinessDate: expectedBd,
        sessionBusinessDate: s.businessDate,
      },
      attendanceRecordId: record.id,
      attendanceSessionId: s.id,
    });
  }

  if (Math.abs(new Date(s.checkInAt).getTime() - new Date(record.checkIn).getTime()) > TIME_DRIFT_MS) {
    out.push({
      type: "SESSION_TIME_DRIFT",
      severity: "blocking",
      companyId,
      employeeId: record.employeeId,
      businessDate: expectedBd,
      summary: "Session check_in_at differs materially from attendance_records.check_in",
      details: {
        recordId: record.id,
        sessionId: s.id,
        recordCheckIn: new Date(record.checkIn).toISOString(),
        sessionCheckInAt: new Date(s.checkInAt).toISOString(),
      },
      attendanceRecordId: record.id,
      attendanceSessionId: s.id,
    });
  }

  if (record.checkOut != null && s.checkOutAt != null) {
    if (Math.abs(new Date(s.checkOutAt).getTime() - new Date(record.checkOut).getTime()) > TIME_DRIFT_MS) {
      out.push({
        type: "SESSION_TIME_DRIFT",
        severity: "blocking",
        companyId,
        employeeId: record.employeeId,
        businessDate: expectedBd,
        summary: "Session check_out_at differs materially from attendance_records.check_out",
        details: {
          recordId: record.id,
          sessionId: s.id,
          recordCheckOut: new Date(record.checkOut).toISOString(),
          sessionCheckOutAt: new Date(s.checkOutAt).toISOString(),
        },
        attendanceRecordId: record.id,
        attendanceSessionId: s.id,
      });
    }
  }

  const sessionOpen = s.status === "open";
  if (recordOpen !== sessionOpen) {
    out.push({
      type: "SESSION_OPEN_STATE_MISMATCH",
      severity: "blocking",
      companyId,
      employeeId: record.employeeId,
      businessDate: expectedBd,
      summary: "Open/closed state differs between attendance_records and attendance_sessions",
      details: {
        recordId: record.id,
        sessionId: s.id,
        recordOpen,
        sessionStatus: s.status,
      },
      attendanceRecordId: record.id,
      attendanceSessionId: s.id,
    });
  }

  return out;
}

function countByType(mismatches: AttendanceMismatch[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const x of mismatches) {
    m[x.type] = (m[x.type] ?? 0) + 1;
  }
  return m;
}

function affectedEmployees(mismatches: AttendanceMismatch[]): number[] {
  const s = new Set<number>();
  for (const x of mismatches) {
    if (x.employeeId != null) s.add(x.employeeId);
  }
  return [...s].sort((a, b) => a - b);
}

/**
 * Payroll / billing gate from reconciliation mismatches.
 * - Any **blocking** → `block`
 * - Else any **warning** → `warnings`
 * - Else → `safe`
 */
export function evaluatePayrollPreflight(mismatches: AttendanceMismatch[]): PayrollPreflightResult {
  const blocking = mismatches.filter((m) => m.severity === "blocking");
  const warnings = mismatches.filter((m) => m.severity === "warning");
  const reasons: string[] = [];
  if (blocking.length) {
    const byType = countByType(blocking);
    reasons.push(`Blocking: ${blocking.length} (${Object.entries(byType).map(([k, v]) => `${k}:${v}`).join(", ")})`);
  }
  if (warnings.length) {
    const byType = countByType(warnings);
    reasons.push(`Warnings: ${warnings.length} (${Object.entries(byType).map(([k, v]) => `${k}:${v}`).join(", ")})`);
  }
  if (blocking.length > 0) {
    return { decision: "block", blockingCount: blocking.length, warningCount: warnings.length, reasons };
  }
  if (warnings.length > 0) {
    return { decision: "warnings", blockingCount: 0, warningCount: warnings.length, reasons };
  }
  return { decision: "safe", blockingCount: 0, warningCount: 0, reasons: [] };
}

export type PayrollAttendanceGateResult =
  | { allow: true }
  | { allow: false; kind: "blocking"; message: string }
  | { allow: false; kind: "warnings_need_ack"; message: string };

/**
 * Pure gate used by monthly payroll: hard-stop on blocking drift; warnings require explicit acknowledgment.
 */
export function evaluatePayrollAttendanceGate(
  preflight: PayrollPreflightResult,
  acknowledgeAttendanceReconciliationWarnings: boolean,
  report?: Pick<
    AttendanceReconciliationReport,
    "recordsScanMayBeIncomplete" | "blockingCount" | "warningCount" | "recordsLoadCap"
  >,
): PayrollAttendanceGateResult {
  /** Payroll cannot proceed unless the full-period clock scan completed (no row cap truncation). */
  if (report?.recordsScanMayBeIncomplete === true) {
    const cap = report.recordsLoadCap ?? RECONCILIATION_MAX_RECORDS;
    return {
      allow: false,
      kind: "blocking",
      message:
        `Payroll is blocked because attendance reconciliation did not scan the full period: clock rows hit the safety cap (${cap} rows). ` +
        `Widen the reconciliation implementation, raise the cap with paging, or shorten the period — partial scans cannot be acknowledged away. ` +
        `Preflight: ${preflight.reasons.join("; ") || "none"}.`,
    };
  }
  if (preflight.decision === "block") {
    return {
      allow: false,
      kind: "blocking",
      message: `Attendance reconciliation has blocking mismatches (${report?.blockingCount ?? preflight.blockingCount}). Resolve drift before payroll. Reasons: ${preflight.reasons.join("; ")}`,
    };
  }
  if (preflight.decision === "warnings" && !acknowledgeAttendanceReconciliationWarnings) {
    return {
      allow: false,
      kind: "warnings_need_ack",
      message: `Attendance reconciliation reported warnings (${report?.warningCount ?? preflight.warningCount}). Re-run payroll with acknowledgeAttendanceReconciliationWarnings: true after HR review. Reasons: ${preflight.reasons.join("; ")}`,
    };
  }
  return { allow: true };
}

/** Persisted on `payroll_runs.attendance_preflight_snapshot` after a successful execute. */
export function buildPayrollStoredPreflightSnapshot(
  report: AttendanceReconciliationReport,
  preflight: PayrollPreflightResult,
  opts: { actorUserId: number; warningsAcknowledged: boolean },
): string {
  const obj = {
    v: 1 as const,
    evaluatedAt: new Date().toISOString(),
    actorUserId: opts.actorUserId,
    warningsAcknowledged: opts.warningsAcknowledged,
    fromYmd: report.fromYmd,
    toYmd: report.toYmd,
    preflight,
    totals: report.totals,
    mismatchCountsByType: report.mismatchCountsByType,
    blockingCount: report.blockingCount,
    warningCount: report.warningCount,
    recordsLoadCap: report.recordsLoadCap,
    recordsScanMayBeIncomplete: report.recordsScanMayBeIncomplete,
    affectedEmployeeIdsPreview: report.affectedEmployeeIds.slice(0, 80),
    mismatchPreview: report.mismatches.slice(0, 40).map((m) => ({
      type: m.type,
      severity: m.severity,
      employeeId: m.employeeId,
      businessDate: m.businessDate,
      summary: m.summary,
    })),
  };
  return JSON.stringify(obj);
}

export async function runAttendanceReconciliation(
  db: MySql2Database<any>,
  params: { companyId: number; fromYmd: string; toYmd: string },
): Promise<AttendanceReconciliationReport> {
  const { companyId, fromYmd, toYmd } = params;
  const { startUtc, endExclusiveUtc } = muscatInclusiveYmdRangeToUtcHalfOpen(fromYmd, toYmd);

  const records = await db
    .select()
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.companyId, companyId),
        gte(attendanceRecords.checkIn, startUtc),
        lt(attendanceRecords.checkIn, endExclusiveUtc),
      ),
    )
    .orderBy(attendanceRecords.checkIn)
    .limit(RECONCILIATION_MAX_RECORDS);

  const sessions = await db
    .select()
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.companyId, companyId),
        or(
          and(gte(attendanceSessions.businessDate, fromYmd), lte(attendanceSessions.businessDate, toYmd)),
          and(gte(attendanceSessions.checkInAt, startUtc), lt(attendanceSessions.checkInAt, endExclusiveUtc)),
        ),
      ),
    );

  const legacyRows = await db
    .select()
    .from(attendance)
    .where(
      and(eq(attendance.companyId, companyId), gte(attendance.date, startUtc), lt(attendance.date, endExclusiveUtc)),
    );

  const sessionsByRecordId = new Map<number, (typeof attendanceSessions.$inferSelect)[]>();
  for (const s of sessions) {
    if (s.sourceRecordId == null) continue;
    const id = s.sourceRecordId;
    const arr = sessionsByRecordId.get(id) ?? [];
    arr.push(s);
    sessionsByRecordId.set(id, arr);
  }

  const mismatches: AttendanceMismatch[] = [];

  for (const r of records) {
    const list = sessionsByRecordId.get(r.id) ?? [];
    mismatches.push(...compareRecordToSessions(r, list));
  }

  const recordIds = new Set(records.map((r) => r.id));
  for (const s of sessions) {
    if (s.sourceRecordId == null) {
      mismatches.push({
        type: "SESSION_WITHOUT_SOURCE_WARNING",
        severity: "warning",
        companyId,
        employeeId: s.employeeId,
        businessDate: s.businessDate,
        summary: "Session row has no source_record_id link to attendance_records",
        details: { sessionId: s.id },
        attendanceSessionId: s.id,
      });
      continue;
    }
    if (!recordIds.has(s.sourceRecordId)) {
      mismatches.push({
        type: "SESSION_ORPHAN_SOURCE_RECORD",
        severity: "blocking",
        companyId,
        employeeId: s.employeeId,
        businessDate: s.businessDate,
        summary: "Session references missing attendance_records row",
        details: { sessionId: s.id, sourceRecordId: s.sourceRecordId },
        attendanceSessionId: s.id,
        attendanceRecordId: s.sourceRecordId,
      });
    }
  }

  const recordsByEmpDay = new Map<string, typeof attendanceRecords.$inferSelect[]>();
  for (const r of records) {
    const day = muscatCalendarYmdFromUtcInstant(new Date(r.checkIn));
    const k = `${r.employeeId}|${day}`;
    const arr = recordsByEmpDay.get(k) ?? [];
    arr.push(r);
    recordsByEmpDay.set(k, arr);
  }

  for (const leg of legacyRows) {
    const day = muscatCalendarYmdFromUtcInstant(new Date(leg.date));
    const k = `${leg.employeeId}|${day}`;
    const dayRecords = recordsByEmpDay.get(k) ?? [];
    const hasClock = dayRecords.length > 0;
    const status = leg.status as string;

    if (status === "absent" && hasClock) {
      const anyClosed = dayRecords.some((r) => r.checkOut != null);
      if (anyClosed) {
        mismatches.push({
          type: "LEGACY_ROW_MISMATCH",
          severity: "blocking",
          companyId,
          employeeId: leg.employeeId,
          businessDate: day,
          summary: "Legacy HR row is absent but a closed clock row exists the same Muscat day",
          details: { legacyId: leg.id, recordIds: dayRecords.map((r) => r.id) },
          legacyAttendanceId: leg.id,
        });
      }
    } else if (status !== "absent" && !hasClock) {
      mismatches.push({
        type: "LEGACY_PRESENT_WITHOUT_RECORD",
        severity: "blocking",
        companyId,
        employeeId: leg.employeeId,
        businessDate: day,
        summary: `Legacy HR row is ${status} but no clock row exists the same Muscat day`,
        details: { legacyId: leg.id, status },
        legacyAttendanceId: leg.id,
      });
    }
  }

  const blockingCount = mismatches.filter((m) => m.severity === "blocking").length;
  const warningCount = mismatches.filter((m) => m.severity === "warning").length;
  const recordsScanMayBeIncomplete = records.length >= RECONCILIATION_MAX_RECORDS;

  return {
    companyId,
    fromYmd,
    toYmd,
    windowStartUtc: startUtc.toISOString(),
    windowEndExclusiveUtc: endExclusiveUtc.toISOString(),
    recordsLoadCap: RECONCILIATION_MAX_RECORDS,
    recordsScanMayBeIncomplete,
    totals: { records: records.length, sessions: sessions.length, legacyRows: legacyRows.length },
    mismatches,
    mismatchCountsByType: countByType(mismatches),
    blockingCount,
    warningCount,
    affectedEmployeeIds: affectedEmployees(mismatches),
  };
}
