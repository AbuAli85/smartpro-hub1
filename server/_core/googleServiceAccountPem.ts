import { createPrivateKey } from "node:crypto";

function stripUtf8Bom(s: string): string {
  return s.length > 0 && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Remove zero-width chars; normalize Unicode dashes to ASCII hyphen (PEM headers must use 0x2D). */
function sanitizePemSource(s: string): string {
  let k = stripUtf8Bom(s).trim().replace(/\r\n/g, "\n");
  k = k.replace(/[\u200B-\u200D\uFEFF]/g, "");
  k = k.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-");
  for (let i = 0; i < 4 && k.includes("\\n"); i++) {
    k = k.replace(/\\n/g, "\n");
  }
  return k;
}

/**
 * Rebuild PEM with clean 64-column base64 lines. Fixes broken line breaks, extra spaces,
 * and single-line pastes. Strips non-base64 noise inside the body.
 */
function tryCanonicalReflowPrivateKeyPem(k: string): string | null {
  const re =
    /^(-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----)\s*([\s\S]*?)\s*(-----END [A-Z0-9 ]+PRIVATE KEY-----)$/im;
  const m = k.match(re);
  if (!m) return null;
  const begin = m[1];
  const end = m[3];
  const b64 = m[2].replace(/\s+/g, "").replace(/[^A-Za-z0-9+/=]/g, "");
  if (b64.length < 64) return null;
  const lines = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
  return `${begin}\n${lines}\n${end}`;
}

/**
 * Fixes common secret-store mangling of Google service account `private_key`:
 * - BOM / zero-width / Unicode hyphen in PEM headers
 * - Literal `\n` sequences instead of newlines (possibly double-escaped)
 * - CRLF
 * - Entire PEM pasted as one line, or broken wrapping
 */
export function normalizeServiceAccountPrivateKeyPem(raw: string): string {
  const k = sanitizePemSource(raw);
  const reflowed = tryCanonicalReflowPrivateKeyPem(k);
  if (reflowed) return reflowed;

  const beginRe = /^(-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----)/i;
  const endRe = /(-----END [A-Z0-9 ]+PRIVATE KEY-----)$/i;
  const bm = k.match(beginRe);
  const em = k.match(endRe);
  if (!bm || !em) return k;

  const begin = bm[1];
  const end = em[1];
  const inner = k.slice(begin.length, k.length - end.length);
  const compact = inner.replace(/\s+/g, "");
  if (compact.length === 0) return k;
  if (!/\n/.test(inner.trim())) {
    const lines = compact.match(/.{1,64}/g)?.join("\n") ?? compact;
    return `${begin}\n${lines}\n${end}`;
  }
  return k;
}

export function isPemPrivateKeyParseable(pem: string): boolean {
  const n = normalizeServiceAccountPrivateKeyPem(pem);
  try {
    createPrivateKey({ key: n, format: "pem" });
    return true;
  } catch {
    return false;
  }
}
