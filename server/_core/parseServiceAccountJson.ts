import { isPemPrivateKeyParseable } from "./googleServiceAccountPem";

function stripUtf8Bom(s: string): string {
  return s.length > 0 && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export type ParsedServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

/** Shown when googleDocsConfigured is false (no secret values exposed). */
export type GoogleDocsEnvIssue =
  | "unset"
  | "invalid_json"
  | "missing_client_email_or_private_key"
  | "private_key_unreadable";

function tryParseJsonObject(raw: string): unknown | null {
  const trimmed = stripUtf8Bom(raw.trim());
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    try {
      const b64 = trimmed.replace(/\s/g, "");
      const dec = Buffer.from(b64, "base64").toString("utf8");
      return JSON.parse(stripUtf8Bom(dec.trim()));
    } catch {
      return null;
    }
  }
}

function extractCredentials(j: unknown): ParsedServiceAccountCredentials | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const client_email = o.client_email;
  const private_key = o.private_key;
  if (typeof client_email !== "string" || !client_email.trim()) return null;
  if (typeof private_key !== "string" || !private_key.trim()) return null;
  return { client_email: client_email.trim(), private_key };
}

/**
 * Parses GOOGLE_DOCS_SERVICE_ACCOUNT_JSON: raw JSON, optional UTF-8 BOM strip,
 * or whole value base64-encoded JSON (some secret UIs store it that way).
 */
export function parseServiceAccountJsonString(raw: string): ParsedServiceAccountCredentials | null {
  const j = tryParseJsonObject(raw);
  if (j === null) return null;
  return extractCredentials(j);
}

export function getGoogleDocsEnvDiagnostic():
  | { ok: true }
  | { ok: false; issue: GoogleDocsEnvIssue } {
  const raw = process.env.GOOGLE_DOCS_SERVICE_ACCOUNT_JSON ?? "";
  if (!stripUtf8Bom(raw.trim())) {
    return { ok: false, issue: "unset" };
  }
  const j = tryParseJsonObject(raw);
  if (j === null) {
    return { ok: false, issue: "invalid_json" };
  }
  const creds = extractCredentials(j);
  if (!creds) {
    return { ok: false, issue: "missing_client_email_or_private_key" };
  }
  if (!isPemPrivateKeyParseable(creds.private_key)) {
    return { ok: false, issue: "private_key_unreadable" };
  }
  return { ok: true };
}

export function isGoogleDocsServiceAccountEnvReady(): boolean {
  return getGoogleDocsEnvDiagnostic().ok;
}
