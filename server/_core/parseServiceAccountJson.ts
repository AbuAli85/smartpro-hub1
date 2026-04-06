import { isPemPrivateKeyParseable } from "./googleServiceAccountPem";

function stripUtf8Bom(s: string): string {
  return s.length > 0 && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Some UIs paste "NAME=value" into the value field by mistake. */
function stripAccidentalEnvAssignmentPrefix(s: string): string {
  const prefix = "GOOGLE_DOCS_SERVICE_ACCOUNT_JSON=";
  let t = s;
  while (t.startsWith(prefix)) t = t.slice(prefix.length).trim();
  return t;
}

export type ParsedServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

/** Safe diagnosis codes — no secret values are ever included. */
export type GoogleDocsConfigReason =
  | "ok"
  | "unset"
  | "invalid_json"
  | "missing_client_email_or_private_key"
  | "private_key_unreadable";

/**
 * Parses GOOGLE_DOCS_SERVICE_ACCOUNT_JSON: raw JSON, optional UTF-8 BOM strip,
 * or whole value base64-encoded JSON (some secret UIs store it that way).
 */
export function parseServiceAccountJsonString(raw: string): ParsedServiceAccountCredentials | null {
  const trimmed = stripUtf8Bom(stripAccidentalEnvAssignmentPrefix(raw).trim());
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

/**
 * Returns a safe diagnosis code for the current GOOGLE_DOCS_SERVICE_ACCOUNT_JSON env value.
 * Never leaks any secret values — only returns a code string.
 */
export function diagnoseGoogleDocsServiceAccountEnv(): GoogleDocsConfigReason {
  const raw = process.env.GOOGLE_DOCS_SERVICE_ACCOUNT_JSON ?? "";
  const trimmed = stripUtf8Bom(stripAccidentalEnvAssignmentPrefix(raw).trim());
  if (!trimmed) return "unset";

  const p = parseServiceAccountJsonString(trimmed);
  if (!p) {
    // Distinguish between JSON parse failure and missing fields
    let j: unknown;
    try {
      j = JSON.parse(trimmed);
    } catch {
      try {
        const b64 = trimmed.replace(/\s/g, "");
        const dec = Buffer.from(b64, "base64").toString("utf8");
        j = JSON.parse(stripUtf8Bom(dec.trim()));
      } catch {
        return "invalid_json";
      }
    }
    if (!j || typeof j !== "object") return "invalid_json";
    const o = j as Record<string, unknown>;
    const email = o.client_email;
    const key = o.private_key;
    if (
      typeof email !== "string" || !email.trim() ||
      typeof key !== "string" || !key.trim()
    ) {
      return "missing_client_email_or_private_key";
    }
    return "private_key_unreadable";
  }

  if (!isPemPrivateKeyParseable(p.private_key)) return "private_key_unreadable";
  return "ok";
}

/**
 * Returns a diagnostic object for the readiness tRPC query.
 * `ok: true` means the env is fully configured; `ok: false` includes a safe `issue` code.
 */
export function getGoogleDocsEnvDiagnostic():
  | { ok: true }
  | { ok: false; issue: GoogleDocsConfigReason } {
  const reason = diagnoseGoogleDocsServiceAccountEnv();
  if (reason === "ok") return { ok: true };
  return { ok: false, issue: reason };
}
