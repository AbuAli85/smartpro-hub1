/**
 * JWT-based approval token for attendance client approval batches (Phase 10B).
 *
 * Each token encodes (batchId, companyId) and is signed with the app's
 * cookieSecret (HS256). The token is time-limited (14 days) and audience-checked
 * so it cannot be reused for other purposes.
 *
 * Mirrors the pattern used in hrLetterViewToken.ts.
 */
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./_core/env";

const AUDIENCE = "attendance-client-approval";
const EXPIRY_DAYS = 14;
const MIN_SECRET_LEN = 16;

function secretKey() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

export type ClientApprovalTokenPayload = {
  batchId: number;
  companyId: number;
};

export async function signClientApprovalToken(
  payload: ClientApprovalTokenPayload,
): Promise<string | null> {
  if (ENV.cookieSecret.length < MIN_SECRET_LEN) return null;
  return new SignJWT({ bid: payload.batchId, cid: payload.companyId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setAudience(AUDIENCE)
    .setExpirationTime(`${EXPIRY_DAYS}d`)
    .sign(secretKey());
}

export async function verifyClientApprovalToken(
  token: string,
): Promise<ClientApprovalTokenPayload | null> {
  if (ENV.cookieSecret.length < MIN_SECRET_LEN) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      audience: AUDIENCE,
    });
    const bid = (payload as { bid?: unknown }).bid;
    const cid = (payload as { cid?: unknown }).cid;
    if (typeof bid !== "number" || !Number.isFinite(bid)) return null;
    if (typeof cid !== "number" || !Number.isFinite(cid)) return null;
    return { batchId: Math.trunc(bid), companyId: Math.trunc(cid) };
  } catch {
    return null;
  }
}

export { EXPIRY_DAYS as CLIENT_APPROVAL_TOKEN_EXPIRY_DAYS };
