import crypto, { createHash, randomBytes } from "node:crypto";
import { generateSecret, generateURI, verifySync } from "otplib";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import type { getDb } from "../db.client";
import { mfaChallenges, users } from "../../drizzle/schema";
import { ENV } from "../_core/env";

/** ±30s clock skew (~one TOTP step) vs. strict single-step verification. */
const TOTP_EPOCH_TOLERANCE_SEC = 30;

const IV_LEN = 12;
const TAG_LEN = 16;
const BCRYPT_ROUNDS = 10;
const BACKUP_CODE_COUNT = 10;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

export type AppDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function encryptionKey(): Buffer {
  const raw = ENV.twoFactorEncryptionKey;
  if (!raw || raw.length < 32) {
    throw new Error("TWO_FACTOR_ENCRYPTION_KEY must be set (min 32 characters) for 2FA.");
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptTotpSecret(plain: string): string {
  const key = encryptionKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptTotpSecret(encB64: string): string {
  const key = encryptionKey();
  const buf = Buffer.from(encB64, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final("utf8");
}

export function generateTotpSecret(): string {
  return generateSecret();
}

export function verifyTotpToken(secretPlain: string, token: string): boolean {
  const t = token.replace(/\s+/g, "");
  if (!/^\d{6,8}$/.test(t)) return false;
  const result = verifySync({
    secret: secretPlain,
    token: t,
    epochTolerance: TOTP_EPOCH_TOLERANCE_SEC,
  });
  return result.valid === true;
}

export function buildOtpauthUrl(params: { email: string; secret: string }): string {
  return generateURI({
    issuer: "SmartPRO",
    label: params.email || "user",
    secret: params.secret,
  });
}

export async function qrDataUrlForOtpauth(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: "M", width: 240 });
}

export function generatePlainBackupCodes(): string[] {
  const out: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    out.push(randomBytes(5).toString("hex").toUpperCase());
  }
  return out;
}

export async function hashBackupCodes(plain: string[]): Promise<string[]> {
  return Promise.all(plain.map((p) => bcrypt.hash(p, BCRYPT_ROUNDS)));
}

export async function tryConsumeBackupCode(
  plain: string,
  hashed: string[]
): Promise<string[] | null> {
  const trimmed = plain.replace(/\s+/g, "").toUpperCase();
  for (let i = 0; i < hashed.length; i++) {
    if (await bcrypt.compare(trimmed, hashed[i])) {
      return hashed.filter((_, j) => j !== i);
    }
  }
  return null;
}

export function parseBackupHashes(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const p = JSON.parse(json) as unknown;
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function createMfaChallengeForUser(
  db: AppDb,
  params: { userId: number; returnPath: string }
): Promise<string> {
  const id = crypto.randomUUID();
  const rp = params.returnPath.startsWith("/") ? params.returnPath : "/";
  await db.insert(mfaChallenges).values({
    id,
    userId: params.userId,
    returnPath: rp,
    status: "pending",
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  return id;
}

export async function peekChallengeStatus(
  db: AppDb,
  challengeId: string
): Promise<"missing" | "used" | "expired" | "ok"> {
  const [row] = await db.select().from(mfaChallenges).where(eq(mfaChallenges.id, challengeId)).limit(1);
  if (!row) return "missing";
  if (row.status !== "pending") return "used";
  if (row.expiresAt.getTime() < Date.now()) return "expired";
  return "ok";
}

export async function loadPendingChallenge(db: AppDb, challengeId: string) {
  const [row] = await db.select().from(mfaChallenges).where(eq(mfaChallenges.id, challengeId)).limit(1);
  if (!row) return null;
  if (row.status !== "pending") return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.update(mfaChallenges).set({ status: "expired" }).where(eq(mfaChallenges.id, challengeId));
    return null;
  }
  return row;
}

export async function consumeChallenge(db: AppDb, challengeId: string): Promise<void> {
  await db.update(mfaChallenges).set({ status: "consumed" }).where(eq(mfaChallenges.id, challengeId));
}

export async function getUserForMfa(db: AppDb, userId: number) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return u ?? null;
}
