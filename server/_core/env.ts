export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  /** JSON string of a Google Cloud service account with Drive + Docs API access */
  googleDocsServiceAccountJson: process.env.GOOGLE_DOCS_SERVICE_ACCOUNT_JSON ?? "",
};

function isGoogleDocsServiceAccountJsonWellFormed(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const j = JSON.parse(trimmed) as { client_email?: unknown; private_key?: unknown };
    const email = j.client_email;
    const key = j.private_key;
    return (
      typeof email === "string" &&
      email.trim().length > 0 &&
      typeof key === "string" &&
      key.trim().length > 0
    );
  } catch {
    return false;
  }
}

/** True when GOOGLE_DOCS_SERVICE_ACCOUNT_JSON is valid JSON with client_email and private_key. */
export function isGoogleDocsServiceAccountConfigured(): boolean {
  return isGoogleDocsServiceAccountJsonWellFormed(ENV.googleDocsServiceAccountJson);
}

/**
 * Fail fast in production when critical configuration is missing.
 * Forge/storage keys remain optional until all deployments use the same storage path.
 */
export function validateProductionEnvironment(): void {
  if (!ENV.isProduction) return;
  const problems: string[] = [];
  if (!ENV.databaseUrl.trim()) problems.push("DATABASE_URL");
  if (!ENV.cookieSecret || ENV.cookieSecret.length < 16) problems.push("JWT_SECRET (min 16 characters)");
  if (!ENV.appId.trim()) problems.push("VITE_APP_ID");
  if (!ENV.oAuthServerUrl.trim()) problems.push("OAUTH_SERVER_URL");
  if (problems.length) {
    console.error(
      "[SmartPRO] Refusing to start — invalid production environment:",
      problems.join(", ")
    );
    process.exit(1);
  }
}
