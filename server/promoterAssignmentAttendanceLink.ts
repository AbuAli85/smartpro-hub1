/**
 * Links attendance_records / attendance_sessions to promoter_assignments after insert.
 * @see shared/attendanceAssignmentResolution.ts
 */

import { and, eq, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { attendanceRecords, attendanceSessions, promoterAssignments } from "../drizzle/schema";
import {
  resolvePromoterAssignmentForAttendance,
  type AssignmentCandidateForAttendance,
} from "../shared/attendanceAssignmentResolution";
import { classifyAttendanceMismatch } from "../shared/promoterAssignmentMismatchSignals";
import { createAuditLog } from "./repositories/audit.repository";

export type DbTx = MySql2Database<Record<string, never>>;

/** Soft warning for API responses — does not block check-in. */
export type PromoterLinkageHint = { code: string; message: string } | null;

export async function loadAssignmentCandidatesForAttendance(
  db: DbTx,
  params: { employeeId: number; firstPartyCompanyId: number },
): Promise<AssignmentCandidateForAttendance[]> {
  const rows = await db
    .select({
      id: promoterAssignments.id,
      assignmentStatus: promoterAssignments.assignmentStatus,
      startDate: promoterAssignments.startDate,
      endDate: promoterAssignments.endDate,
      clientSiteId: promoterAssignments.clientSiteId,
    })
    .from(promoterAssignments)
    .where(
      and(
        eq(promoterAssignments.promoterEmployeeId, params.employeeId),
        eq(promoterAssignments.firstPartyCompanyId, params.firstPartyCompanyId),
        inArray(promoterAssignments.assignmentStatus, ["active", "suspended"]),
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    assignmentStatus: r.assignmentStatus as AssignmentCandidateForAttendance["assignmentStatus"],
    startDate: r.startDate,
    endDate: r.endDate,
    clientSiteId: r.clientSiteId,
  }));
}

export async function linkAttendanceRecordToPromoterAssignment(
  tx: DbTx,
  opts: {
    attendanceRecordId: number;
    employeeId: number;
    companyId: number;
    siteId: number | null;
    businessDateYmd: string;
    actorUserId: number;
  },
): Promise<PromoterLinkageHint> {
  const candidates = await loadAssignmentCandidatesForAttendance(tx, {
    employeeId: opts.employeeId,
    firstPartyCompanyId: opts.companyId,
  });

  const resolution = resolvePromoterAssignmentForAttendance(candidates, {
    businessDateYmd: opts.businessDateYmd,
    attendanceSiteId: opts.siteId,
  });

  if (resolution.kind === "resolved") {
    await tx
      .update(attendanceRecords)
      .set({ promoterAssignmentId: resolution.promoterAssignmentId })
      .where(eq(attendanceRecords.id, opts.attendanceRecordId));

    await tx
      .update(attendanceSessions)
      .set({ promoterAssignmentId: resolution.promoterAssignmentId })
      .where(eq(attendanceSessions.sourceRecordId, opts.attendanceRecordId));

    await createAuditLog({
      userId: opts.actorUserId,
      companyId: opts.companyId,
      action: "attendance_assignment_resolved",
      entityType: "promoter_assignment_execution",
      entityId: opts.attendanceRecordId,
      newValues: {
        attendanceRecordId: opts.attendanceRecordId,
        promoterAssignmentId: resolution.promoterAssignmentId,
        businessDateYmd: opts.businessDateYmd,
        siteId: opts.siteId,
      },
    });
    return null;
  }

  await createAuditLog({
    userId: opts.actorUserId,
    companyId: opts.companyId,
    action: "attendance_assignment_resolution_failed",
    entityType: "promoter_assignment_execution",
    entityId: opts.attendanceRecordId,
    newValues: {
      attendanceRecordId: opts.attendanceRecordId,
      resolution,
      employeeId: opts.employeeId,
      businessDateYmd: opts.businessDateYmd,
      siteId: opts.siteId,
    },
  });

  const { signal, reason } = classifyAttendanceMismatch({
    businessDateYmd: opts.businessDateYmd,
    attendanceSiteId: opts.siteId,
    resolution,
    linkedAssignment: null,
  });
  if (signal === "none") return null;
  return { code: signal, message: reason };
}
