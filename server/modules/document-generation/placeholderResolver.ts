import { format } from "date-fns";

export type PlaceholderDefinitionRow = {
  placeholder: string;
  sourcePath: string;
  dataType: string;
  required: boolean;
  defaultValue: string | null;
};

const DATE_DISPLAY_FORMAT = "yyyy-MM-dd";

function getByPath(root: unknown, path: string): unknown {
  const segments = path.split(".").filter(Boolean);
  let cur: unknown = root;
  for (const seg of segments) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function isEmptyString(v: string): boolean {
  return v.trim().length === 0;
}

export function formatDateValue(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return format(value, DATE_DISPLAY_FORMAT);
  }
  if (typeof value === "string") {
    const t = Date.parse(value);
    if (!Number.isNaN(t)) return format(new Date(t), DATE_DISPLAY_FORMAT);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  }
  return null;
}

function formatStringValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") {
    return isEmptyString(value) ? null : value;
  }
  return null;
}

/**
 * Resolves template placeholders from a nested context object using dot paths.
 * Returns string values keyed by placeholder token (without braces) and a list of missing required keys.
 */
export function resolvePlaceholders(
  definitions: PlaceholderDefinitionRow[],
  contextRoot: Record<string, unknown>
): { values: Record<string, string>; missing: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];

  for (const def of definitions) {
    const raw = getByPath(contextRoot, def.sourcePath);
    let out: string | null = null;

    if (def.dataType === "date") {
      out = formatDateValue(raw);
    } else {
      out = formatStringValue(raw);
    }

    if (out == null && def.defaultValue != null && def.defaultValue !== "") {
      out = def.defaultValue;
    }

    if (out == null || isEmptyString(out)) {
      if (def.required) missing.push(def.placeholder);
      continue;
    }

    values[def.placeholder] = out;
  }

  return { values, missing };
}
