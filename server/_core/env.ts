import { isGoogleDocsServiceAccountEnvReady } from "./parseServiceAccountJson";

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  /** Buyer Portal API + UI scaffold (foundation). Set to "true" to enable. */
  buyerPortalEnabled: process.env.BUYER_PORTAL_ENABLED === "true",
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

/** True when env has parseable JSON (or base64-wrapped JSON) and a private_key OpenSSL can load. */
export function isGoogleDocsServiceAccountConfigured(): boolean {
  return isGoogleDocsServiceAccountEnvReady();
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
