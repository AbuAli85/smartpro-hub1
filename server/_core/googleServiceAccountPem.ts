import { createPrivateKey } from "node:crypto";

/** Unicode "dash-like" characters that some editors/UIs substitute for ASCII hyphen-minus (U+002D). */
const UNICODE_DASHES_RE =
  /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g;

/** Zero-width and invisible characters that some editors/UIs insert silently. */
const ZERO_WIDTH_RE =
  /[\u200B\u200C\u200D\u200E\u200F\uFEFF\u00AD\u2060\u2061\u2062\u2063]/g;

/**
 * Fixes common secret-store mangling of Google service account `private_key`:
 * 1. Strips BOM and zero-width / invisible characters.
 * 2. Normalises Unicode "dash" characters to ASCII hyphen-minus (so PEM headers parse).
 * 3. Unescapes literal `\n` sequences (up to 4 passes, handles double-escaping).
 * 4. CRLF → LF.
 * 5. Canonical reflow: strips all whitespace and non-base64 chars from the body,
 *    then rewraps to standard 64-character lines — covers both single-line PEM
 *    and PEM with irregular line lengths.
 */
export function normalizeServiceAccountPrivateKeyPem(raw: string): string {
  // 1. Strip BOM and zero-width characters
  let k = raw.replace(ZERO_WIDTH_RE, "").trim();

  // 2. Normalize Unicode dashes to ASCII hyphen-minus
  k = k.replace(UNICODE_DASHES_RE, "-");

  // 3. CRLF → LF
  k = k.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 4. Unescape literal \n sequences (up to 4 passes for double-escaping)
  for (let i = 0; i < 4 && k.includes("\\n"); i++) {
    k = k.replace(/\\n/g, "\n");
  }

  // 5. Canonical reflow: extract header/footer and reflow the base64 body
  const beginRe = /(-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----)/i;
  const endRe = /(-----END [A-Z0-9 ]+PRIVATE KEY-----)/i;
  const bm = k.match(beginRe);
  const em = k.match(endRe);
  if (!bm || !em) return k;

  const begin = bm[1];
  const end = em[1];
  const beginIdx = k.indexOf(begin);
  const endIdx = k.lastIndexOf(end);
  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) return k;

  const inner = k.slice(beginIdx + begin.length, endIdx);
  // Strip everything that isn't base64 (letters, digits, +, /, =)
  const compact = inner.replace(/[^A-Za-z0-9+/=]/g, "");
  if (compact.length === 0) return k;

  const lines = compact.match(/.{1,64}/g)?.join("\n") ?? compact;
  return `${begin}\n${lines}\n${end}`;
}

export function isPemPrivateKeyParseable(pem: string): boolean {
  try {
    createPrivateKey(normalizeServiceAccountPrivateKeyPem(pem));
    return true;
  } catch {
    return false;
  }
}
