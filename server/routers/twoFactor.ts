import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { COOKIE_NAME, SESSION_EXPIRY_MS } from "@shared/const";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import { getDb } from "../db";
import { users, type User } from "../../drizzle/schema";
import { recordSessionLoginAudits } from "../complianceAudit";
import {
  buildOtpauthUrl,
  consumeChallenge,
  decryptTotpSecret,
  encryptTotpSecret,
  generatePlainBackupCodes,
  generateTotpSecret,
  getUserForMfa,
  hashBackupCodes,
  loadPendingChallenge,
  parseBackupHashes,
  peekChallengeStatus,
  qrDataUrlForOtpauth,
  tryConsumeBackupCode,
  verifyTotpToken,
} from "../lib/twoFactorService";

export const twoFactorRouter = router({
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const u = ctx.user as User;
    return {
      enabled: Boolean(u.twoFactorEnabled),
      verifiedAt: u.twoFactorVerifiedAt ?? null,
      hasPendingSetup: Boolean(u.twoFactorSecretEncrypted) && !u.twoFactorEnabled,
    };
  }),

  getChallengePreview: publicProcedure
    .input(z.object({ challengeId: z.string().uuid() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { status: "missing" as const };
      const s = await peekChallengeStatus(db, input.challengeId);
      if (s === "ok") return { status: "ok" as const };
      if (s === "expired") return { status: "expired" as const };
      if (s === "used") return { status: "used" as const };
      return { status: "missing" as const };
    }),

  verifyChallenge: publicProcedure
    .input(
      z.object({
        challengeId: z.string().uuid(),
        code: z.string().min(6).max(32),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const challenge = await loadPendingChallenge(db, input.challengeId);
      if (!challenge) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired challenge" });
      }
      const user = await getUserForMfa(db, challenge.userId);
      if (!user?.twoFactorEnabled || !user.twoFactorSecretEncrypted) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Two-factor authentication is not active" });
      }
      const secret = decryptTotpSecret(user.twoFactorSecretEncrypted);
      const okTotp = verifyTotpToken(secret, input.code);
      const hashes = parseBackupHashes(user.twoFactorBackupCodesJson);
      if (!okTotp) {
        const remaining = await tryConsumeBackupCode(input.code, hashes);
        if (!remaining) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid verification code" });
        }
        await db
          .update(users)
          .set({ twoFactorBackupCodesJson: JSON.stringify(remaining) })
          .where(eq(users.id, user.id));
      }
      await consumeChallenge(db, input.challengeId);
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: SESSION_EXPIRY_MS,
      });
      // crossSite:true — MFA completes on the same origin as OAuth, which is a
      // cross-site redirect from manus.im. Must use SameSite=None;Secure=true.
      const cookieOptions = getSessionCookieOptions(ctx.req, { crossSite: true });
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_EXPIRY_MS });
      try {
        await recordSessionLoginAudits(db, {
          userId: user.id,
          loginMethod: "mfa_totp",
          ipAddress: typeof ctx.req.ip === "string" ? ctx.req.ip : null,
          userAgent: ctx.req.get("user-agent") ?? null,
        });
      } catch {
        /* non-fatal */
      }
      return { ok: true as const, redirectTo: challenge.returnPath };
    }),

  setupInitiate: protectedProcedure.mutation(async ({ ctx }) => {
    const u = ctx.user as User;
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const secret = generateTotpSecret();
    const enc = encryptTotpSecret(secret);
    await db
      .update(users)
      .set({ twoFactorSecretEncrypted: enc, twoFactorEnabled: false })
      .where(eq(users.id, u.id));
    const otpauth = buildOtpauthUrl({ email: u.email ?? "user", secret });
    const qrDataUrl = await qrDataUrlForOtpauth(otpauth);
    return { qrDataUrl, otpauthUrl: otpauth };
  }),

  setupConfirm: protectedProcedure
    .input(z.object({ code: z.string().min(6).max(12) }))
    .mutation(async ({ ctx, input }) => {
      const u = ctx.user as User;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db.select().from(users).where(eq(users.id, u.id)).limit(1);
      if (!row?.twoFactorSecretEncrypted) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Run setup first" });
      }
      const secret = decryptTotpSecret(row.twoFactorSecretEncrypted);
      if (!verifyTotpToken(secret, input.code)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid code" });
      }
      const plain = generatePlainBackupCodes();
      const hashed = await hashBackupCodes(plain);
      await db
        .update(users)
        .set({
          twoFactorEnabled: true,
          twoFactorVerifiedAt: new Date(),
          twoFactorBackupCodesJson: JSON.stringify(hashed),
        })
        .where(eq(users.id, u.id));
      return { backupCodes: plain };
    }),

  disable: protectedProcedure
    .input(z.object({ code: z.string().min(6).max(12) }))
    .mutation(async ({ ctx, input }) => {
      const u = ctx.user as User;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db.select().from(users).where(eq(users.id, u.id)).limit(1);
      if (!row?.twoFactorEnabled || !row.twoFactorSecretEncrypted) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "2FA is not enabled" });
      }
      const secret = decryptTotpSecret(row.twoFactorSecretEncrypted);
      if (!verifyTotpToken(secret, input.code)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid authenticator code" });
      }
      await db
        .update(users)
        .set({
          twoFactorEnabled: false,
          twoFactorSecretEncrypted: null,
          twoFactorBackupCodesJson: null,
          twoFactorVerifiedAt: null,
        })
        .where(eq(users.id, u.id));
      return { success: true as const };
    }),

  regenerateBackupCodes: protectedProcedure
    .input(z.object({ code: z.string().min(6).max(12) }))
    .mutation(async ({ ctx, input }) => {
      const u = ctx.user as User;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db.select().from(users).where(eq(users.id, u.id)).limit(1);
      if (!row?.twoFactorEnabled || !row.twoFactorSecretEncrypted) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "2FA is not enabled" });
      }
      const secret = decryptTotpSecret(row.twoFactorSecretEncrypted);
      if (!verifyTotpToken(secret, input.code)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid code" });
      }
      const plain = generatePlainBackupCodes();
      const hashed = await hashBackupCodes(plain);
      await db
        .update(users)
        .set({ twoFactorBackupCodesJson: JSON.stringify(hashed) })
        .where(eq(users.id, u.id));
      return { backupCodes: plain };
    }),
});
