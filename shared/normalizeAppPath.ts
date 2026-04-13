/**
 * Normalizes URL path strings for client-side routing and policy comparisons.
 * Does not parse absolute URLs; callers should pass pathname-like strings.
 */
export function normalizeAppPath(input: string): string {
  let p = input.trim();
  if (!p) return "";
  const noHash = p.split("#")[0] ?? "";
  const noQuery = noHash.split("?")[0] ?? "";
  p = noQuery.trim();
  if (!p) return "";
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}
