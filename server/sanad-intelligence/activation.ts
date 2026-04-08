import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../drizzle/schema";
import { getCenterDetail } from "./queries";

type DB = MySql2Database<typeof schema>;

const COMPLIANCE_DONE_STATUSES = ["verified", "waived", "not_applicable"] as const;

export function buildSanadInvitePath(token: string): string {
  return `/sanad/join?token=${encodeURIComponent(token)}`;
}

export function generateInviteTokenValue(): string {
  return randomBytes(32).toString("hex");
}

export async function ensureCenterOperations(db: DB, centerId: number) {
  const [ops] = await db
    .select()
    .from(schema.sanadIntelCenterOperations)
    .where(eq(schema.sanadIntelCenterOperations.centerId, centerId))
    .limit(1);
  if (ops) return ops;
  await db.insert(schema.sanadIntelCenterOperations).values({ centerId });
  const [created] = await db
    .select()
    .from(schema.sanadIntelCenterOperations)
    .where(eq(schema.sanadIntelCenterOperations.centerId, centerId))
    .limit(1);
  return created!;
}

export async function findByInviteToken(db: DB, token: string) {
  const [row] = await db
    .select({
      center: schema.sanadIntelCenters,
      ops: schema.sanadIntelCenterOperations,
    })
    .from(schema.sanadIntelCenterOperations)
    .innerJoin(
      schema.sanadIntelCenters,
      eq(schema.sanadIntelCenters.id, schema.sanadIntelCenterOperations.centerId),
    )
    .where(eq(schema.sanadIntelCenterOperations.inviteToken, token))
    .limit(1);
  return row ?? null;
}

export function inviteIsExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt) < new Date();
}

export async function computeCenterActivationReadiness(db: DB, centerId: number) {
  const detail = await getCenterDetail(db, centerId);
  if (!detail) return null;

  const [reqTotalRow] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.sanadIntelLicenseRequirements);
  const requirementsTotal = reqTotalRow?.n ?? 0;

  const [itemsTotalRow] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.sanadIntelCenterComplianceItems)
    .where(eq(schema.sanadIntelCenterComplianceItems.centerId, centerId));
  const complianceItemsTotal = itemsTotalRow?.n ?? 0;

  const [doneRow] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.sanadIntelCenterComplianceItems)
    .where(
      and(
        eq(schema.sanadIntelCenterComplianceItems.centerId, centerId),
        inArray(schema.sanadIntelCenterComplianceItems.status, [...COMPLIANCE_DONE_STATUSES]),
      ),
    );
  const complianceCompleted = doneRow?.n ?? 0;

  const ops = detail.ops;
  const now = new Date();
  const hasActiveInvite =
    Boolean(ops?.inviteToken) && ops?.inviteExpiresAt != null && new Date(ops.inviteExpiresAt) > now;

  const registeredUserExists = ops?.registeredUserId != null;
  const linkedOfficeExists = ops?.linkedSanadOfficeId != null;
  const complianceSeeded = complianceItemsTotal > 0;
  const hasCenterName = Boolean(detail.center.centerName?.trim());
  const canActivateAsOffice = hasCenterName && !linkedOfficeExists;
  const activationReady = canActivateAsOffice && registeredUserExists;

  return {
    center: detail.center,
    ops,
    compliance: {
      requirementsTotal,
      complianceItemsTotal,
      complianceCompleted,
      complianceSeeded,
    },
    flags: {
      inviteHasActive: hasActiveInvite,
      inviteCanBeSent: true,
      registeredUserExists,
      linkedOfficeExists,
      activationReady,
      canActivateAsOffice,
    },
  };
}
