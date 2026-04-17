export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
// Pass an optional returnPath (e.g. "/invite/abc123") to land back there after login.
export const getLoginUrl = (returnPath?: string) => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  // Encode origin + optional return path so the OAuth callback can redirect correctly
  const statePayload = returnPath
    ? `${window.location.origin}|${returnPath}`
    : window.location.origin;
  const state = btoa(statePayload);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};

/**
 * Warm up the production server before redirecting to OAuth login.
 * Production containers may be sleeping; pinging /api/health ensures the server
 * is warm and ready to handle the OAuth callback before the short-lived auth code
 * is issued — preventing "invalid or expired authorization code" errors on cold starts.
 *
 * Usage: await warmUpServer(); window.location.href = getLoginUrl();
 */
export const warmUpServer = async (): Promise<void> => {
  try {
    await fetch("/api/health", { method: "GET", cache: "no-store" });
  } catch {
    // Non-fatal: if the ping fails, proceed with login anyway
  }
};
