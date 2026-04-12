import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./_core/env";

const AUDIENCE = "hr-letter-view";
const MIN_SECRET_LEN = 16;

function secretKey() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function signHRLetterViewToken(letterId: number): Promise<string | null> {
  if (ENV.cookieSecret.length < MIN_SECRET_LEN) return null;
  return new SignJWT({ lid: letterId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setAudience(AUDIENCE)
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function verifyHRLetterViewToken(token: string): Promise<number | null> {
  if (ENV.cookieSecret.length < MIN_SECRET_LEN) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      audience: AUDIENCE,
    });
    const lid = (payload as { lid?: unknown }).lid;
    return typeof lid === "number" && Number.isFinite(lid) ? Math.trunc(lid) : null;
  } catch {
    return null;
  }
}
