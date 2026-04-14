/**
 * Deterministic upsert/reconcile for `attendance_operational_issues` from live board + pending requests.
 * Called from scheduling.getTodayBoard so queue/board/review share the same issue rows.
 */
import { and, eq, ne } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  attendanceCorrections,
  attendanceOperationalIssues,
  employees,
  manualCheckinRequests,
} from "../drizzle/schema";
import { operationalIssueKey } from "@shared/attendanceOperationalIssueKeys";
import { muscatCalendarYmdFromUtcInstant } from "@shared/attendanceMuscatTime";
import type { AdminBoardRowStatus } from "@shared/attendanceBoardStatus";

type Db = MySql2Database<any>;

export async function syncAttendanceOperationalIssuesFromSnapshot(
  db: Db,
  params: {
    companyId: number;
    businessDateYmd: string;
    boardRows: Array<{ scheduleId: number; status: AdminBoardRowStatus; employeeId: number | null }>;
  },
): Promise<void> {
  const { companyId, businessDateYmd, boardRows } = params;
  const now = new Date();

  const absentScheduleIds = new Set(
    boardRows.filter((r) => r.status === "absent").map((r) => r.scheduleId),
  );

  const pendingCorrections = await db
    .select({
      id: attendanceCorrections.id,
      employeeId: attendanceCorrections.employeeId,
      requestedDate: attendanceCorrections.requestedDate,
    })
    .from(attendanceCorrections)
    .where(
      and(eq(attendanceCorrections.companyId, companyId), eq(attendanceCorrections.status, "pending")),
    )
    .limit(500);

  const pendingManual = await db
    .select({
      id: manualCheckinRequests.id,
      employeeUserId: manualCheckinRequests.employeeUserId,
      requestedBusinessDate: manualCheckinRequests.requestedBusinessDate,
      requestedAt: manualCheckinRequests.requestedAt,
    })
    .from(manualCheckinRequests)
    .where(
      and(eq(manualCheckinRequests.companyId, companyId), eq(manualCheckinRequests.status, "pending")),
    )
    .limit(500);

  for (const scheduleId of absentScheduleIds) {
    const row = boardRows.find((r) => r.scheduleId === scheduleId && r.status === "absent");
    const employeeId = row?.employeeId ?? null;
    const issueKey = operationalIssueKey({
      kind: "missed_shift",
      scheduleId,
      businessDateYmd,
    });
    const [existing] = await db
      .select()
      .from(attendanceOperationalIssues)
      .where(
        and(eq(attendanceOperationalIssues.companyId, companyId), eq(attendanceOperationalIssues.issueKey, issueKey)),
      )
      .limit(1);
    if (existing?.status === "resolved") continue;
    if (!existing) {
      await db.insert(attendanceOperationalIssues).values({
        companyId,
        businessDateYmd,
        issueKind: "missed_shift",
        issueKey,
        scheduleId,
        employeeId,
        status: "open",
      });
    } else if (existing.employeeId !== employeeId && employeeId != null) {
      await db
        .update(attendanceOperationalIssues)
        .set({ employeeId, updatedAt: now })
        .where(eq(attendanceOperationalIssues.id, existing.id));
    }
  }

  const staleMissed = await db
    .select()
    .from(attendanceOperationalIssues)
    .where(
      and(
        eq(attendanceOperationalIssues.companyId, companyId),
        eq(attendanceOperationalIssues.businessDateYmd, businessDateYmd),
        eq(attendanceOperationalIssues.issueKind, "missed_shift"),
        ne(attendanceOperationalIssues.status, "resolved"),
      ),
    )
    .limit(500);

  for (const iss of staleMissed) {
    if (iss.scheduleId != null && !absentScheduleIds.has(iss.scheduleId)) {
      await db
        .update(attendanceOperationalIssues)
        .set({
          status: "resolved",
          reviewedAt: now,
          resolutionNote: "Shift no longer marked absent on the live board.",
          updatedAt: now,
        })
        .where(eq(attendanceOperationalIssues.id, iss.id));
    }
  }

  for (const c of pendingCorrections) {
    const issueKey = operationalIssueKey({ kind: "correction_pending", correctionId: c.id });
    const businessDate = c.requestedDate;
    const [existing] = await db
      .select()
      .from(attendanceOperationalIssues)
      .where(
        and(eq(attendanceOperationalIssues.companyId, companyId), eq(attendanceOperationalIssues.issueKey, issueKey)),
      )
      .limit(1);
    if (existing?.status === "resolved") continue;
    if (!existing) {
      await db.insert(attendanceOperationalIssues).values({
        companyId,
        businessDateYmd: businessDate,
        issueKind: "correction_pending",
        issueKey,
        correctionId: c.id,
        employeeId: c.employeeId,
        status: "open",
      });
    }
  }

  for (const m of pendingManual) {
    const issueKey = operationalIssueKey({ kind: "manual_pending", manualCheckinRequestId: m.id });
    const businessDate =
      m.requestedBusinessDate ?? muscatCalendarYmdFromUtcInstant(m.requestedAt);
    const [emp] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.companyId, companyId), eq(employees.userId, m.employeeUserId)))
      .limit(1);
    const employeeId = emp?.id ?? null;
    const [existing] = await db
      .select()
      .from(attendanceOperationalIssues)
      .where(
        and(eq(attendanceOperationalIssues.companyId, companyId), eq(attendanceOperationalIssues.issueKey, issueKey)),
      )
      .limit(1);
    if (existing?.status === "resolved") continue;
    if (!existing) {
      await db.insert(attendanceOperationalIssues).values({
        companyId,
        businessDateYmd: businessDate,
        issueKind: "manual_pending",
        issueKey,
        manualCheckinRequestId: m.id,
        employeeId,
        status: "open",
      });
    }
  }
}

/**
 * Resolve the operational issue row for a correction after approve/reject (domain workflow completed).
 */
export async function resolveOperationalIssueForCorrectionTx(
  tx: Db,
  params: {
    companyId: number;
    correctionId: number;
    requestedDateYmd: string;
    resolvedByUserId: number;
    resolutionNote: string;
  },
): Promise<void> {
  const issueKey = operationalIssueKey({ kind: "correction_pending", correctionId: params.correctionId });
  const now = new Date();
  const [existing] = await tx
    .select()
    .from(attendanceOperationalIssues)
    .where(
      and(eq(attendanceOperationalIssues.companyId, params.companyId), eq(attendanceOperationalIssues.issueKey, issueKey)),
    )
    .limit(1);
  if (existing) {
    await tx
      .update(attendanceOperationalIssues)
      .set({
        status: "resolved",
        reviewedByUserId: params.resolvedByUserId,
        reviewedAt: now,
        resolutionNote: params.resolutionNote,
        updatedAt: now,
      })
      .where(eq(attendanceOperationalIssues.id, existing.id));
  } else {
    const [c] = await tx
      .select({ employeeId: attendanceCorrections.employeeId })
      .from(attendanceCorrections)
      .where(
        and(
          eq(attendanceCorrections.id, params.correctionId),
          eq(attendanceCorrections.companyId, params.companyId),
        ),
      )
      .limit(1);
    await tx.insert(attendanceOperationalIssues).values({
      companyId: params.companyId,
      businessDateYmd: params.requestedDateYmd,
      issueKind: "correction_pending",
      issueKey,
      correctionId: params.correctionId,
      employeeId: c?.employeeId ?? null,
      status: "resolved",
      reviewedByUserId: params.resolvedByUserId,
      reviewedAt: now,
      resolutionNote: params.resolutionNote,
    });
  }
}

/**
 * Resolve the operational issue row for a manual check-in request after approve/reject.
 */
export async function resolveOperationalIssueForManualTx(
  tx: Db,
  params: {
    companyId: number;
    requestId: number;
    requestedBusinessDateYmd: string;
    employeeUserId: number;
    resolvedByUserId: number;
    resolutionNote: string;
  },
): Promise<void> {
  const issueKey = operationalIssueKey({ kind: "manual_pending", manualCheckinRequestId: params.requestId });
  const now = new Date();
  const [existing] = await tx
    .select()
    .from(attendanceOperationalIssues)
    .where(
      and(eq(attendanceOperationalIssues.companyId, params.companyId), eq(attendanceOperationalIssues.issueKey, issueKey)),
    )
    .limit(1);
  const [emp] = await tx
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.companyId, params.companyId), eq(employees.userId, params.employeeUserId)))
    .limit(1);
  const employeeId = emp?.id ?? null;
  if (existing) {
    await tx
      .update(attendanceOperationalIssues)
      .set({
        status: "resolved",
        reviewedByUserId: params.resolvedByUserId,
        reviewedAt: now,
        resolutionNote: params.resolutionNote,
        updatedAt: now,
      })
      .where(eq(attendanceOperationalIssues.id, existing.id));
  } else {
    await tx.insert(attendanceOperationalIssues).values({
      companyId: params.companyId,
      businessDateYmd: params.requestedBusinessDateYmd,
      issueKind: "manual_pending",
      issueKey,
      manualCheckinRequestId: params.requestId,
      employeeId,
      status: "resolved",
      reviewedByUserId: params.resolvedByUserId,
      reviewedAt: now,
      resolutionNote: params.resolutionNote,
    });
  }
}

/**
 * Ensure an `open` operational row exists for each overdue checkout so triage/assign targets a stable row.
 * Does not reopen resolved issues (HR may have triaged while payroll still shows overdue until next poll).
 */
export async function ensureOverdueCheckoutOperationalIssuesOpen(
  db: Db,
  params: {
    companyId: number;
    businessDateYmd: string;
    items: Array<{ attendanceRecordId: number; employeeId: number | null }>;
  },
): Promise<void> {
  const now = new Date();
  for (const it of params.items) {
    const issueKey = operationalIssueKey({ kind: "overdue_checkout", attendanceRecordId: it.attendanceRecordId });
    const [existing] = await db
      .select()
      .from(attendanceOperationalIssues)
      .where(
        and(
          eq(attendanceOperationalIssues.companyId, params.companyId),
          eq(attendanceOperationalIssues.issueKey, issueKey),
        ),
      )
      .limit(1);
    if (existing) continue;
    await db.insert(attendanceOperationalIssues).values({
      companyId: params.companyId,
      businessDateYmd: params.businessDateYmd,
      issueKind: "overdue_checkout",
      issueKey,
      attendanceRecordId: it.attendanceRecordId,
      employeeId: it.employeeId,
      status: "open",
      updatedAt: now,
    });
  }
}
