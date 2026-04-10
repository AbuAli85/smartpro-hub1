import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  canAccessSanadIntelFull,
  canAccessSanadIntelRead,
} from "@shared/sanadRoles";
import * as schema from "../drizzle/schema";

type DB = MySql2Database<typeof schema>;

export type SanadOfficeMemberRole = "owner" | "manager" | "staff";

export { canAccessSanadIntelFull, canAccessSanadIntelRead };

export function canManageSanadCatalogue(role: SanadOfficeMemberRole | null): boolean {
  return role === "owner" || role === "manager";
}

export function canEditSanadOfficeProfile(role: SanadOfficeMemberRole | null): boolean {
  return role === "owner" || role === "manager";
}

export function canViewSanadServiceRequests(role: SanadOfficeMemberRole | null): boolean {
  return role === "owner" || role === "manager" || role === "staff";
}

export function canUpdateSanadServiceRequestStatus(role: SanadOfficeMemberRole | null): boolean {
  return role === "owner" || role === "manager" || role === "staff";
}

export async function getSanadOfficeRoleForUser(
  db: DB,
  userId: number,
  officeId: number,
): Promise<SanadOfficeMemberRole | null> {
  const [row] = await db
    .select({ role: schema.sanadOfficeMembers.role })
    .from(schema.sanadOfficeMembers)
    .where(
      and(eq(schema.sanadOfficeMembers.sanadOfficeId, officeId), eq(schema.sanadOfficeMembers.userId, userId)),
    )
    .limit(1);
  if (row?.role) return row.role as SanadOfficeMemberRole;

  const [intel] = await db
    .select({ id: schema.sanadIntelCenterOperations.linkedSanadOfficeId })
    .from(schema.sanadIntelCenterOperations)
    .where(
      and(
        eq(schema.sanadIntelCenterOperations.registeredUserId, userId),
        eq(schema.sanadIntelCenterOperations.linkedSanadOfficeId, officeId),
      ),
    )
    .limit(1);
  if (intel?.id) return "owner";

  return null;
}

export async function getSanadOfficeIdsForUser(db: DB, userId: number): Promise<number[]> {
  const memberRows = await db
    .select({ officeId: schema.sanadOfficeMembers.sanadOfficeId })
    .from(schema.sanadOfficeMembers)
    .where(eq(schema.sanadOfficeMembers.userId, userId));
  const fromMembers = new Set(memberRows.map((r) => r.officeId));

  const intelRows = await db
    .select({ oid: schema.sanadIntelCenterOperations.linkedSanadOfficeId })
    .from(schema.sanadIntelCenterOperations)
    .where(eq(schema.sanadIntelCenterOperations.registeredUserId, userId));
  for (const r of intelRows) {
    if (r.oid != null) fromMembers.add(r.oid);
  }
  return [...fromMembers];
}

export async function assertSanadOfficeAccess(
  db: DB,
  userId: number,
  officeId: number,
  message = "You do not have access to this SANAD office.",
): Promise<SanadOfficeMemberRole> {
  const role = await getSanadOfficeRoleForUser(db, userId, officeId);
  if (!role) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
  return role;
}

export async function assertSanadOfficeCatalogueAccess(db: DB, userId: number, officeId: number): Promise<void> {
  const role = await assertSanadOfficeAccess(db, userId, officeId);
  if (!canManageSanadCatalogue(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Catalogue changes require owner or manager access." });
  }
}

export async function assertSanadOfficeProfileAccess(db: DB, userId: number, officeId: number): Promise<void> {
  const role = await assertSanadOfficeAccess(db, userId, officeId);
  if (!canEditSanadOfficeProfile(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Profile updates require owner or manager access." });
  }
}

/** Load office rows the user may operate (for dashboards). */
export async function getSanadOfficesForUser(db: DB, userId: number): Promise<typeof schema.sanadOffices.$inferSelect[]> {
  const ids = await getSanadOfficeIdsForUser(db, userId);
  if (ids.length === 0) return [];
  return db
    .select()
    .from(schema.sanadOffices)
    .where(inArray(schema.sanadOffices.id, ids))
    .orderBy(desc(schema.sanadOffices.createdAt));
}
