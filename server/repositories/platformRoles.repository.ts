import { and, eq, inArray, isNull } from "drizzle-orm";
import { platformUserRoles } from "../../drizzle/schema";
import { getDb } from "../db.client";
import { GLOBAL_PLATFORM_ROLE_SLUGS } from "../../shared/identityAuthority";

const GLOBAL_ROLE_COLUMN_VALUES = [
  "super_admin",
  "platform_admin",
  "regional_manager",
  "client_services",
  "sanad_network_admin",
  "sanad_compliance_reviewer",
] as const;

export async function getActivePlatformRoleSlugsForUser(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ role: platformUserRoles.role })
    .from(platformUserRoles)
    .where(and(eq(platformUserRoles.userId, userId), isNull(platformUserRoles.revokedAt)));
  return rows.map((r) => r.role).filter((x): x is string => typeof x === "string");
}

/**
 * Replace active global platform grants for a user (super/platform/regional/etc.).
 * Tenant-shaped roles must not be passed here — they stay on `users.platformRole` only.
 */
export async function replaceGlobalPlatformRolesForUser(
  userId: number,
  nextRoles: string[],
  grantedBy: number | null,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const filtered = nextRoles.filter((r) => GLOBAL_PLATFORM_ROLE_SLUGS.has(r));
  const distinct = Array.from(new Set(filtered));

  await db
    .update(platformUserRoles)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(platformUserRoles.userId, userId),
        isNull(platformUserRoles.revokedAt),
        inArray(platformUserRoles.role, [...GLOBAL_ROLE_COLUMN_VALUES]),
      ),
    );

  if (distinct.length === 0) return;

  await db.insert(platformUserRoles).values(
    distinct.map((role) => ({
      userId,
      role: role as (typeof GLOBAL_ROLE_COLUMN_VALUES)[number],
      grantedBy,
      grantedAt: new Date(),
      revokedAt: null,
    })),
  );
}
