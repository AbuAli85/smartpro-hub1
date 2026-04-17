/** Normalized key for CSI grouping — must match `clientBilling` generation. */
export function clientKeyFromDisplayName(name: string): string {
  const k = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 200);
  return k || "client";
}
