/**
 * Harden relative app paths used in OAuth `state` return segments and similar flows.
 * Same-origin absolute URLs are built by the caller; this only validates the path part.
 */
export function sanitizeRelativeAppPath(path: string): string {
  const p = path.trim();
  if (!p.startsWith("/") || p.startsWith("//") || p.includes("\\") || p.includes("://")) {
    return "/";
  }
  return p;
}
