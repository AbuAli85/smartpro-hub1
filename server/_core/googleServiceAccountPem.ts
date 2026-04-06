import { createPrivateKey } from "node:crypto";

/**
 * Fixes common secret-store mangling of Google service account `private_key`:
 * - Literal `\n` sequences instead of newlines (possibly double-escaped)
 * - CRLF
 * - Entire PEM pasted as one line (no newlines inside the base64 block)
 */
export function normalizeServiceAccountPrivateKeyPem(raw: string): string {
  let k = raw.trim().replace(/\r\n/g, "\n");
  for (let i = 0; i < 4 && k.includes("\\n"); i++) {
    k = k.replace(/\\n/g, "\n");
  }

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
  // Reflow only when the body has no line breaks (single-line PEM)
  if (!/\n/.test(inner.trim())) {
    const lines = compact.match(/.{1,64}/g)?.join("\n") ?? compact;
    return `${begin}\n${lines}\n${end}`;
  }
  return k;
}

export function isPemPrivateKeyParseable(pem: string): boolean {
  try {
    createPrivateKey(normalizeServiceAccountPrivateKeyPem(pem));
    return true;
  } catch {
    return false;
  }
}
