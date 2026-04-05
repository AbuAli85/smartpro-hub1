import { and, eq } from "drizzle-orm";
import { companyMembers, type User } from "../drizzle/schema";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { HR_PERF, HR_TARGETS, memberHasHrPerformancePermission } from "@shared/hrPerformancePermissions";
import { getDb } from "./db";

/**
 * Read policy for HR Performance rows in `audit_events` (written via `insertHrPerformanceAuditEvent`).
 * Legacy `audit_logs` / `analytics.auditLogs` is a separate surface — align sensitivity policy there when revisiting.
 */

/** Rows written by `insertHrPerformanceAuditEvent` for HR Performance entities. */
export const HR_AUDIT_SENSITIVE_ENTITY_TYPES = ["training_record", "self_review", "kpi_target"] as const;

const HR_AUDIT_READ_PERMISSIONS = [
  HR_PERF.READ,
  HR_PERF.MANAGE,
  HR_PERF.TRAINING_MANAGE,
  HR_PERF.SELF_READ,
  HR_PERF.SELF_REVIEW,
  HR_TARGETS.READ,
  HR_TARGETS.MANAGE,
] as const;

export function isHrPerformanceSensitiveEntityType(entityType: string): boolean {
  return (HR_AUDIT_SENSITIVE_ENTITY_TYPES as readonly string[]).includes(entityType);
}

/**
 * Whether this user may read full `audit_events` rows (including beforeState/afterState) for
 * HR Performance entity types (`training_record`, `self_review`, `kpi_target`) within a company.
 *
 * **Platform-global admins** (`canAccessGlobalAdminProcedures`): may read sensitive HR audit rows for any
 * tenant — intentional ops visibility; not granted to ordinary company-scoped or operations users.
 */
export async function canReadHrPerformanceAuditSensitiveRows(
  user: Pick<User, "id" | "role" | "platformRole">,
  companyId: number
): Promise<boolean> {
  if (canAccessGlobalAdminProcedures(user)) return true;

  const db = await getDb();
  if (!db) return false;

  const [member] = await db
    .select({ role: companyMembers.role, permissions: companyMembers.permissions })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.userId, user.id),
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.isActive, true)
      )
    )
    .limit(1);

  if (!member) return false;
  if (member.role === "company_admin") return true;

  for (const p of HR_AUDIT_READ_PERMISSIONS) {
    if (memberHasHrPerformancePermission(member, p)) return true;
  }
  return false;
}
