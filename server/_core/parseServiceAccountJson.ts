import { isPemPrivateKeyParseable } from "./googleServiceAccountPem";

function stripUtf8Bom(s: string): string {
  return s.length > 0 && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export type ParsedServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

/**
 * Parses GOOGLE_DOCS_SERVICE_ACCOUNT_JSON: raw JSON, optional UTF-8 BOM strip,
 * or whole value base64-encoded JSON (some secret UIs store it that way).
 */
export function parseServiceAccountJsonString(raw: string): ParsedServiceAccountCredentials | null {
  const trimmed = stripUtf8Bom(raw.trim());
  if (!trimmed) return null;

  let j: unknown;
  try {
    j = JSON.parse(trimmed);
  } catch {
    try {
      const b64 = trimmed.replace(/\s/g, "");
      const dec = Buffer.from(b64, "base64").toString("utf8");
      j = JSON.parse(stripUtf8Bom(dec.trim()));
    } catch {
      return null;
    }
  }

  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const client_email = o.client_email;
  const private_key = o.private_key;
  if (typeof client_email !== "string" || !client_email.trim()) return null;
  if (typeof private_key !== "string" || !private_key.trim()) return null;
  return { client_email: client_email.trim(), private_key };
}

export function isGoogleDocsServiceAccountEnvReady(): boolean {
  const raw = process.env.GOOGLE_DOCS_SERVICE_ACCOUNT_JSON ?? "";
  const p = parseServiceAccountJsonString(raw);
  if (!p) return false;
  return isPemPrivateKeyParseable(p.private_key);
}
