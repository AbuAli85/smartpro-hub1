import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../drizzle/schema";
import { getCenterDetail } from "./queries";

type DB = MySql2Database<typeof schema>;

const COMPLIANCE_DONE_STATUSES = ["verified", "waived", "not_applicable"] as const;

/** Single client-facing message for any unusable invite (wrong token, expired, replaced, or lifecycle closed). */
export const SANAD_INVITE_PEEK_NOT_FOUND_MESSAGE = "Invalid or unknown invite link";

type OpsInviteSlice = {
  inviteExpiresAt: Date | null;
  linkedSanadOfficeId: number | null;
  activatedAt: Date | null;
};

/** True when the centre may still use the public invite URL (token row must also match and not be expired). */
export function isSanadInviteOnboardingChannelOpen(ops: OpsInviteSlice | null | undefined): boolean {
  if (!ops) return false;
  if (ops.linkedSanadOfficeId != null) return false;
  if (ops.activatedAt != null) return false;
  return true;
}

export type ActivationServerGateResult =
  | { ok: true }
  | { ok: false; code: "BAD_REQUEST" | "PRECONDITION_FAILED"; message: string };

/**
 * Server-side gate for `activateCenterAsOffice` (conservative): centre name, compliance seeded, no linked office.
 * Does not depend on UI readiness; call inside the activation transaction after re-reading state.
 */
export function evaluateActivationServerGate(input: {
  centerName: string | null | undefined;
  complianceItemsTotal: number;
  linkedSanadOfficeId: number | null | undefined;
  registeredUserId: number | null | undefined;
}): ActivationServerGateResult {
  if (input.linkedSanadOfficeId != null) {
    return { ok: false, code: "BAD_REQUEST", message: "This centre already has a linked SANAD office." };
  }
  if (!String(input.centerName ?? "").trim()) {
    return { ok: false, code: "BAD_REQUEST", message: "Centre name is required to create an office." };
  }
  if (input.complianceItemsTotal <= 0) {
    return {
      ok: false,
      code: "PRECONDITION_FAILED",
      message: "Seed compliance checklist items for this centre before activating an office.",
    };
  }
  if (input.registeredUserId == null) {
    return {
      ok: false,
      code: "PRECONDITION_FAILED",
      message: "Link a SmartPRO account to this centre before activating an office.",
    };
  }
  return { ok: true };
}

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
  const serverActivationAllowed =
    evaluateActivationServerGate({
      centerName: detail.center.centerName,
      complianceItemsTotal,
      linkedSanadOfficeId: ops?.linkedSanadOfficeId ?? null,
      registeredUserId: ops?.registeredUserId ?? null,
    }).ok === true;

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
      serverActivationAllowed,
    },
  };
}
