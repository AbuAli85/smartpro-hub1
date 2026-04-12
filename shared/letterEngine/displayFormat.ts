/**
 * Safe display formatting for English names and titles on official letters.
 * Does not replace legal source-of-truth fields in the database.
 */

const ACRONYMS = new Set(["HR", "IT", "CEO", "CFO", "CTO", "UAE", "UK", "US", "OMR", "GCC"]);

function titleCaseWord(w: string): string {
  if (!w) return w;
  const upper = w.toUpperCase();
  if (ACRONYMS.has(upper)) return upper;
  if (w.length <= 3 && w === upper && /^[A-Z]+$/.test(w)) return w;
  if (w.includes("-")) {
    return w.split("-").map((p) => titleCaseWord(p)).join("-");
  }
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/** Full name from first + last (English display). */
export function formatEnglishPersonName(first: string, last: string): string {
  const parts = [first, last]
    .filter((s) => s && s.trim())
    .join(" ")
    .trim()
    .split(/\s+/)
    .map(titleCaseWord);
  return parts.join(" ");
}

/** Signatory name or single-line English proper name. */
export function formatEnglishProperName(name: string): string {
  if (!name?.trim()) return "";
  return name
    .trim()
    .split(/\s+/)
    .map(titleCaseWord)
    .join(" ");
}

/** Job title / signatory title line (English). */
export function formatEnglishTitleLine(title: string): string {
  if (!title?.trim()) return "";
  return title
    .trim()
    .split(/\s+/)
    .map(titleCaseWord)
    .join(" ");
}

/** Strip placeholder purpose values that should not appear in documents. */
export function isPlaceholderNocPurpose(p: string): boolean {
  const t = p.trim().toLowerCase();
  return t === "noc" || t === "n.o.c" || t.length < 2;
}
