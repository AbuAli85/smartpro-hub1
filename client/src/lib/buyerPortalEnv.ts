/** Client-side Buyer Portal scaffold — must align with server `BUYER_PORTAL_ENABLED` for a working E2E. */
export function isBuyerPortalUiEnabled(): boolean {
  return import.meta.env.VITE_BUYER_PORTAL_ENABLED === "true";
}
