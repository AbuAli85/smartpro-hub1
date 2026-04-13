import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { validateGenerateCenterInvite } from "@shared/sanadLifecycleTransitions";
import { toWhatsAppPhoneDigits } from "@shared/whatsappPhoneDigits";
import * as schema from "../../drizzle/schema";
import { resolvePublicAppBaseUrl } from "../_core/publicAppUrl";
import { insertSanadIntelAuditEvent } from "./sanadIntelAudit";
import {
  buildSanadInvitePath,
  ensureCenterOperations,
  generateInviteTokenValue,
} from "./activation";
import { isSanadInviteWhatsAppTemplateConfigured, sendSanadCenterInviteTemplateAr } from "../whatsappCloud";
import { promoteSanadCentrePipelineStatus } from "./pipelineActions";
import { insertCentreActivityLog } from "./pipelineActivity";
import type { Request } from "express";

type DB = MySql2Database<typeof schema>;

export async function runGenerateCenterInvite(
  db: DB,
  args: {
    centerId: number;
    expiresInDays?: number;
    actorUserId: number;
    req: Request | undefined;
  },
) {
  const { centerId, actorUserId, req } = args;
  const [c] = await db
    .select({ id: schema.sanadIntelCenters.id })
    .from(schema.sanadIntelCenters)
    .where(eq(schema.sanadIntelCenters.id, centerId))
    .limit(1);
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Center not found" });

  const prior = await ensureCenterOperations(db, centerId);
  const genCheck = validateGenerateCenterInvite(prior);
  if (!genCheck.ok) {
    throw new TRPCError({ code: genCheck.code, message: genCheck.message });
  }

  const token = generateInviteTokenValue();
  const now = new Date();
  const days = args.expiresInDays ?? 14;
  const inviteExpiresAt = new Date(now.getTime() + days * 86400000);

  await db
    .update(schema.sanadIntelCenterOperations)
    .set({
      inviteToken: token,
      inviteSentAt: now,
      inviteExpiresAt,
    })
    .where(eq(schema.sanadIntelCenterOperations.centerId, centerId));

  await insertSanadIntelAuditEvent(db, {
    actorUserId,
    entityType: "sanad_intel_center",
    entityId: centerId,
    action: "sanad_intel_invite_generated",
    metadata: { expiresInDays: days, replacedPriorToken: Boolean(prior.inviteToken) },
    beforeState: { hadInviteToken: Boolean(prior.inviteToken), inviteExpiresAt: prior.inviteExpiresAt },
    afterState: { inviteExpiresAt, reissued: true },
  });

  await promoteSanadCentrePipelineStatus(db, centerId, "invited");

  await insertCentreActivityLog(db, {
    centerId,
    actorUserId,
    activityType: "invite_sent",
    note: null,
    metadata: { inviteExpiresAt: inviteExpiresAt.toISOString() },
  });

  const invitePath = buildSanadInvitePath(token);
  const [centerContact] = await db
    .select({
      centerName: schema.sanadIntelCenters.centerName,
      contactNumber: schema.sanadIntelCenters.contactNumber,
    })
    .from(schema.sanadIntelCenters)
    .where(eq(schema.sanadIntelCenters.id, centerId))
    .limit(1);

  const base = resolvePublicAppBaseUrl(req).replace(/\/+$/, "");
  const inviteUrl = base ? `${base}${invitePath}` : "";

  let whatsappAutoSent = false;
  let whatsappAutoSkippedReason: "not_configured" | "no_public_base_url" | "invalid_phone" | null = null;
  let whatsappAutoError: string | null = null;

  if (!isSanadInviteWhatsAppTemplateConfigured()) {
    whatsappAutoSkippedReason = "not_configured";
  } else if (!base) {
    whatsappAutoSkippedReason = "no_public_base_url";
  } else {
    const digits = toWhatsAppPhoneDigits(centerContact?.contactNumber);
    if (!digits) {
      whatsappAutoSkippedReason = "invalid_phone";
    } else {
      const wa = await sendSanadCenterInviteTemplateAr({
        toDigits: digits,
        centerName: (centerContact?.centerName ?? "").trim() || "مركز",
        inviteUrl,
      });
      if (wa.ok) whatsappAutoSent = true;
      else whatsappAutoError = wa.error;
    }
  }

  return {
    token,
    invitePath,
    inviteSentAt: now,
    inviteExpiresAt,
    whatsappAutoSent,
    whatsappAutoSkippedReason,
    whatsappAutoError,
  };
}
