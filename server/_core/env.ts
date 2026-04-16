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
  /** Public origin for payment redirects and absolute links (either APP_PUBLIC_URL or PUBLIC_APP_URL). */
  appPublicUrl: (process.env.APP_PUBLIC_URL ?? process.env.PUBLIC_APP_URL ?? "").trim(),
  thawaniSecretKey: (process.env.THAWANI_SECRET_KEY ?? "").trim(),
  thawaniPublishableKey: (process.env.THAWANI_PUBLISHABLE_KEY ?? "").trim(),
  thawaniWebhookSecret: (process.env.THAWANI_WEBHOOK_SECRET ?? "").trim(),
  /** When true, use Thawani UAT hosts (default in development unless THAWANI_SANDBOX=false). */
  thawaniSandbox:
    process.env.THAWANI_SANDBOX === "true" ||
    (process.env.NODE_ENV !== "production" && process.env.THAWANI_SANDBOX !== "false"),
  stripeSecretKey: (process.env.STRIPE_SECRET_KEY ?? "").trim(),
  stripeWebhookSecret: (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim(),
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
  if (!ENV.appPublicUrl) problems.push("APP_PUBLIC_URL or PUBLIC_APP_URL");
  if (!ENV.thawaniSecretKey) problems.push("THAWANI_SECRET_KEY");
  if (!ENV.thawaniWebhookSecret) problems.push("THAWANI_WEBHOOK_SECRET");
  if (!ENV.stripeSecretKey) problems.push("STRIPE_SECRET_KEY");
  if (!ENV.stripeWebhookSecret) problems.push("STRIPE_WEBHOOK_SECRET");
  if (problems.length) {
    console.error(
      "[SmartPRO] Refusing to start — invalid production environment:",
      problems.join(", ")
    );
    process.exit(1);
  }
}
