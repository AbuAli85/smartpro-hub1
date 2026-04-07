import { createHash } from "node:crypto";

/** Collapse whitespace and trim for comparison keys. */
export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Normalize odd year keys from exports (e.g. "2024.000", "2024,0") to integer year.
 */
export function normalizeYearKey(raw: string | number): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const y = Math.floor(raw);
    return y >= 1990 && y <= 2100 ? y : null;
  }
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return y >= 1990 && y <= 2100 ? y : null;
}

/** Map common Arabic / English governorate labels to a stable slug for joins. */
const ALIAS_TO_KEY: { pattern: RegExp; key: string; labelEn: string }[] = [
  { pattern: /مسقط|muscat|maskat/i, key: "muscat", labelEn: "Muscat" },
  { pattern: /ظفار|dhofar|ẓufār|salalah/i, key: "dhofar", labelEn: "Dhofar" },
  { pattern: /شمال\s*الباطنة|north\s*al\s*batinah|al\s*batinah\s*north/i, key: "north_batinah", labelEn: "North Al Batinah" },
  { pattern: /جنوب\s*الباطنة|south\s*al\s*batinah/i, key: "south_batinah", labelEn: "South Al Batinah" },
  { pattern: /شمال\s*الشرقية|north\s*al\s*sharqiyah/i, key: "north_sharqiyah", labelEn: "North Ash Sharqiyah" },
  { pattern: /جنوب\s*الشرقية|south\s*al\s*sharqiyah/i, key: "south_sharqiyah", labelEn: "South Ash Sharqiyah" },
  { pattern: /الداخلية|al\s*dakhiliyah|dakhliyah|nizwa/i, key: "dakhliyah", labelEn: "Ad Dakhiliyah" },
  { pattern: /الظاهرة|al\s*dhahirah|dhahirah|ibri/i, key: "dhahirah", labelEn: "Ad Dhahirah" },
  { pattern: /البريمي|al\s*buraimi|buraimi/i, key: "buraimi", labelEn: "Al Buraimi" },
  { pattern: /الوسطى|al\s*wusta|wusta/i, key: "wusta", labelEn: "Al Wusta" },
  { pattern: /مسندم|musandam|khasab/i, key: "musandam", labelEn: "Musandam" },
];

export function governorateKeyFromLabel(raw: string): { key: string; label: string } {
  const label = collapseWhitespace(raw);
  if (!label) return { key: "unknown", label: "Unknown" };
  for (const { pattern, key, labelEn } of ALIAS_TO_KEY) {
    if (pattern.test(label)) return { key, label: labelEn };
  }
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 120);
  if (slug) return { key: slug, label };
  const fallback = createHash("sha256").update(label, "utf8").digest("hex").slice(0, 16);
  return { key: `gov_${fallback}`, label };
}

export function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return "";
  /** Digits only so +968… and 968… fingerprint the same for dedup. */
  return collapseWhitespace(String(raw)).replace(/\D/g, "");
}

/**
 * Dedup fingerprint for directory rows: stable hash of normalized identity fields.
 */
export function fingerprintCenterRow(parts: {
  centerName: string;
  governorateKey: string;
  wilayat: string;
  village: string;
  contactNumber: string;
}): string {
  const payload = [
    collapseWhitespace(parts.centerName).toLowerCase(),
    parts.governorateKey,
    collapseWhitespace(parts.wilayat).toLowerCase(),
    collapseWhitespace(parts.village).toLowerCase(),
    normalizePhone(parts.contactNumber),
  ].join("|");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function parseNumeric(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").replace(/\s/g, "");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function parseIntSafe(value: unknown): number {
  return Math.round(parseNumeric(value));
}
