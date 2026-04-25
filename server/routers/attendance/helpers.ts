/**
 * Shared helpers for the attendance router sub-modules.
 *
 * Keep this file focused on attendance-domain auth guards and stateless
 * utility functions.  Business-logic helpers that are only used by a single
 * sub-module should live in that sub-module instead.
 */
import { TRPCError } from "@trpc/server";
import { requireDb } from "../../db.client";
import { getUserCompanyById } from "../../repositories/companies.repository";
import { requireActiveCompanyId } from "../../_core/tenant";
import { deriveCapabilities } from "../../_core/capabilities";
import { requireHrOrAdmin, requireAnyOperatorRole } from "../../_core/policy";
import type { User } from "../../../drizzle/schema";

export { requireDb };

/** HR/company admin for the active or explicitly selected company. */
export async function requireAdminOrHR(user: User, companyId?: number | null) {
  const cid = await requireActiveCompanyId(user.id, companyId, user);
  const row = await getUserCompanyById(user.id, cid);
  const role = row?.member?.role;
  if (!role) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
  if (role !== "company_admin" && role !== "hr_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "HR Admin or Company Admin required" });
  }
  return { company: { id: cid }, companyId: cid, role, member: { role } };
}

// ─── Granular attendance capability guards (Phase 7) ─────────────────────────
//
// Pattern: requireHrOrAdmin (from policy.ts) gates the role, then
// deriveCapabilities with a synthetic company scope verifies the named
// capability.  Routing through policy.ts ensures the same getUserCompanyById
// call path as other guards, keeping test mocks compatible.
//
// Scope is synthetic (always "company") because all new attendance capabilities
// are scope-invariant — company_admin and hr_admin always get them regardless
// of dept/team visibility.

function attendanceForbidden(capability: string): TRPCError {
  return new TRPCError({
    code: "FORBIDDEN",
    message: `This action requires the ${capability} capability (HR Admin or Company Admin).`,
  });
}

/** Guard for manually creating attendance records on behalf of employees. */
export async function requireCanRecordManualAttendance(user: User, companyId?: number | null) {
  const m = await requireHrOrAdmin(user, companyId);
  const caps = deriveCapabilities(m.role, { type: "company", companyId: m.companyId });
  if (!caps.canRecordManualAttendance) throw attendanceForbidden("canRecordManualAttendance");
  return { ...m, caps };
}

/** Guard for approving or rejecting attendance correction requests. */
export async function requireCanApproveAttendanceCorrections(user: User, companyId?: number | null) {
  const m = await requireHrOrAdmin(user, companyId);
  const caps = deriveCapabilities(m.role, { type: "company", companyId: m.companyId });
  if (!caps.canApproveAttendanceCorrections) throw attendanceForbidden("canApproveAttendanceCorrections");
  return { ...m, caps };
}

/** Guard for approving or rejecting manual check-in requests. */
export async function requireCanApproveManualCheckIns(user: User, companyId?: number | null) {
  const m = await requireHrOrAdmin(user, companyId);
  const caps = deriveCapabilities(m.role, { type: "company", companyId: m.companyId });
  if (!caps.canApproveManualCheckIns) throw attendanceForbidden("canApproveManualCheckIns");
  return { ...m, caps };
}

/** Guard for force-checking out an employee with an open session. */
export async function requireCanForceCheckout(user: User, companyId?: number | null) {
  const m = await requireHrOrAdmin(user, companyId);
  const caps = deriveCapabilities(m.role, { type: "company", companyId: m.companyId });
  if (!caps.canForceCheckout) throw attendanceForbidden("canForceCheckout");
  return { ...m, caps };
}

/** Guard for editing existing attendance records (status, times, notes). */
export async function requireCanEditAttendanceRecords(user: User, companyId?: number | null) {
  const m = await requireHrOrAdmin(user, companyId);
  const caps = deriveCapabilities(m.role, { type: "company", companyId: m.companyId });
  if (!caps.canEditAttendanceRecords) throw attendanceForbidden("canEditAttendanceRecords");
  return { ...m, caps };
}

/** Guard for reading the attendance audit log. */
export async function requireCanViewAttendanceAudit(user: User, companyId?: number | null) {
  const m = await requireHrOrAdmin(user, companyId);
  const caps = deriveCapabilities(m.role, { type: "company", companyId: m.companyId });
  if (!caps.canViewAttendanceAudit) throw attendanceForbidden("canViewAttendanceAudit");
  return { ...m, caps };
}

/** Guard for managing shift template definitions. */
export async function requireCanManageShiftTemplates(user: User, companyId?: number | null) {
  const m = await requireHrOrAdmin(user, companyId);
  const caps = deriveCapabilities(m.role, { type: "company", companyId: m.companyId });
  if (!caps.canManageShiftTemplates) throw attendanceForbidden("canManageShiftTemplates");
  return { ...m, caps };
}

/** Guard for managing attendance site and geo-fence definitions. */
export async function requireCanManageAttendanceSites(user: User, companyId?: number | null) {
  const m = await requireHrOrAdmin(user, companyId);
  const caps = deriveCapabilities(m.role, { type: "company", companyId: m.companyId });
  if (!caps.canManageAttendanceSites) throw attendanceForbidden("canManageAttendanceSites");
  return { ...m, caps };
}

/** Guard for assigning or updating employee shift schedules. */
export async function requireCanManageEmployeeSchedules(user: User, companyId?: number | null) {
  const m = await requireHrOrAdmin(user, companyId);
  const caps = deriveCapabilities(m.role, { type: "company", companyId: m.companyId });
  if (!caps.canManageEmployeeSchedules) throw attendanceForbidden("canManageEmployeeSchedules");
  return { ...m, caps };
}

/** Guard for creating client approval batches (Phase 10A). */
export async function requireCanCreateAttendanceClientApproval(user: User, companyId?: number | null) {
  const m = await requireHrOrAdmin(user, companyId);
  const caps = deriveCapabilities(m.role, { type: "company", companyId: m.companyId });
  if (!caps.canCreateAttendanceClientApproval) throw attendanceForbidden("canCreateAttendanceClientApproval");
  return { ...m, caps };
}

/** Guard for submitting a draft approval batch (Phase 10A). */
export async function requireCanSubmitAttendanceClientApproval(user: User, companyId?: number | null) {
  const m = await requireHrOrAdmin(user, companyId);
  const caps = deriveCapabilities(m.role, { type: "company", companyId: m.companyId });
  if (!caps.canSubmitAttendanceClientApproval) throw attendanceForbidden("canSubmitAttendanceClientApproval");
  return { ...m, caps };
}

/** Guard for approving or rejecting a submitted batch (Phase 10A). */
export async function requireCanApproveAttendanceClientApproval(user: User, companyId?: number | null) {
  const m = await requireHrOrAdmin(user, companyId);
  const caps = deriveCapabilities(m.role, { type: "company", companyId: m.companyId });
  if (!caps.canApproveAttendanceClientApproval) throw attendanceForbidden("canApproveAttendanceClientApproval");
  return { ...m, caps };
}

/** Guard for viewing client approval batches and items (Phase 10A). */
export async function requireCanViewAttendanceClientApproval(user: User, companyId?: number | null) {
  const m = await requireHrOrAdmin(user, companyId);
  const caps = deriveCapabilities(m.role, { type: "company", companyId: m.companyId });
  if (!caps.canViewAttendanceClientApproval) throw attendanceForbidden("canViewAttendanceClientApproval");
  return { ...m, caps };
}

/** Guard for exporting attendance reports (HR and finance_admin also have access). */
export async function requireCanExportAttendanceReports(user: User, companyId?: number | null) {
  const m = await requireAnyOperatorRole(user, companyId);
  const caps = deriveCapabilities(m.role, { type: "company", companyId: m.companyId });
  if (!caps.canExportAttendanceReports) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Exporting attendance reports requires HR Admin, Finance Admin, or Company Admin.",
    });
  }
  return { ...m, caps };
}

/** Guard for destructive attendance data repair (company_admin only). */
export async function requireCanRepairAttendanceData(user: User, companyId?: number | null) {
  const m = await requireAnyOperatorRole(user, companyId);
  const caps = deriveCapabilities(m.role, { type: "company", companyId: m.companyId });
  if (!caps.canRepairAttendanceData) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Repairing attendance data requires Company Admin access.",
    });
  }
  return { ...m, caps };
}

/**
 * Haversine distance in metres between two GPS coordinates.
 */
export function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check if current time (UTC) is within the site's operating hours.
 * operatingHoursStart / End are "HH:MM" strings in the site's timezone.
 */
export function isWithinOperatingHours(
  start: string | null | undefined,
  end: string | null | undefined,
  tz: string,
): boolean {
  if (!start || !end) return true;
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const h = parts.find((p) => p.type === "hour")?.value ?? "00";
    const m = parts.find((p) => p.type === "minute")?.value ?? "00";
    const current = `${h}:${m}`;
    if (start <= end) return current >= start && current <= end;
    return current >= start || current <= end;
  } catch {
    return true;
  }
}

/** DB stores `HH:MM:SS`; API may send `HH:MM` — normalize for muscatWallDateTimeToUtc. */
export function normalizeCorrectionHms(s: string | null | undefined): string {
  if (!s) return "00:00:00";
  const t = s.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  return t;
}
