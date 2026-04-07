import type { GovKeyRow } from "./types";
import { governorateKeyFromLabel, normalizeYearKey, parseIntSafe, parseNumeric } from "./normalize";

export type ParsedYearGovernorateValue = { year: number; governorateLabel: string; value: number }[];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Extract year -> governorate -> metric from TransactionStatistics-style JSON.
 * Ignores top-level keys that are not years (except nested "Total" rows inside a year object).
 */
export function parseYearGovernorateCounts(data: unknown): ParsedYearGovernorateValue {
  const out: ParsedYearGovernorateValue = [];
  if (!isPlainObject(data)) return out;

  for (const [k, v] of Object.entries(data)) {
    const year = normalizeYearKey(k);
    if (year === null) continue;
    if (!isPlainObject(v)) continue;

    for (const [govLabel, rawVal] of Object.entries(v)) {
      if (/^total$/i.test(collapse(govLabel))) continue;
      const n = parseIntSafe(rawVal);
      if (!Number.isFinite(n)) continue;
      out.push({ year, governorateLabel: collapse(govLabel), value: n });
    }
  }

  return out;
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Income uses same shape as transactions; values may be decimals. */
export function parseYearGovernorateIncome(data: unknown): { year: number; governorateLabel: string; value: number }[] {
  const out: { year: number; governorateLabel: string; value: number }[] = [];
  if (!isPlainObject(data)) return out;

  for (const [k, v] of Object.entries(data)) {
    const year = normalizeYearKey(k);
    if (year === null) continue;
    if (!isPlainObject(v)) continue;

    for (const [govLabel, rawVal] of Object.entries(v)) {
      if (/^total$/i.test(collapse(govLabel))) continue;
      const n = parseNumeric(rawVal);
      if (!Number.isFinite(n)) continue;
      out.push({ year, governorateLabel: collapse(govLabel), value: n });
    }
  }

  return out;
}

export type WorkforceRow = GovKeyRow & { ownerCount: number; staffCount: number; totalWorkforce: number; asOfYear?: number };

export function parseWorkforceByGovernorate(data: unknown): WorkforceRow[] {
  const out: WorkforceRow[] = [];
  if (!isPlainObject(data)) return out;

  for (const [govLabel, raw] of Object.entries(data)) {
    const { key, label } = governorateKeyFromLabel(govLabel);
    if (!isPlainObject(raw)) continue;

    const owners =
      parseIntSafe(raw.ownerCount ?? raw.owners ?? raw.owner ?? raw["Owner"] ?? raw["أصحاب المراكز"]);
    const staff =
      parseIntSafe(raw.staffCount ?? raw.staff ?? raw["Staff"] ?? raw["الموظفين"] ?? raw["موظفين"]);
    let total = parseIntSafe(raw.totalWorkforce ?? raw.total ?? raw["Total"] ?? raw["الإجمالي"]);
    if (total <= 0 && (owners > 0 || staff > 0)) total = owners + staff;

    out.push({
      governorateKey: key,
      governorateLabel: label,
      ownerCount: owners,
      staffCount: staff,
      totalWorkforce: total,
      asOfYear: typeof raw.year === "number" ? raw.year : normalizeYearKey(String(raw.year ?? "")) ?? undefined,
    });
  }

  return out;
}

export type GeographyRow = GovKeyRow & { wilayat: string; village: string; centerCount: number };

/**
 * Handles SanadCenterStatistics-style nesting: governorate → wilayat → village → count.
 */
function parseGeographyNestedThreeLevel(data: unknown): GeographyRow[] {
  const out: GeographyRow[] = [];
  if (!isPlainObject(data)) return out;
  for (const [govName, wilObj] of Object.entries(data)) {
    if (normalizeYearKey(govName) !== null) continue;
    if (!isPlainObject(wilObj)) continue;
    const g = governorateKeyFromLabel(govName);
    for (const [wilName, vilObj] of Object.entries(wilObj)) {
      if (isPlainObject(vilObj)) {
        for (const [vilName, cnt] of Object.entries(vilObj)) {
          const n = parseIntSafe(cnt);
          if (n > 0) {
            out.push({
              governorateKey: g.key,
              governorateLabel: g.label,
              wilayat: collapse(wilName),
              village: collapse(vilName),
              centerCount: n,
            });
          }
        }
      } else {
        const n = parseIntSafe(vilObj);
        if (n > 0) {
          out.push({
            governorateKey: g.key,
            governorateLabel: g.label,
            wilayat: collapse(wilName),
            village: "",
            centerCount: n,
          });
        }
      }
    }
  }
  return out;
}

export function parseGeographyCenterCounts(data: unknown): GeographyRow[] {
  const nested = parseGeographyNestedThreeLevel(data);
  if (nested.length > 0) return mergeGeographyDuplicates(nested);

  const out: GeographyRow[] = [];

  const visit = (node: unknown, ctx: { gov?: string; wil?: string }) => {
    if (Array.isArray(node)) {
      for (const item of node) {
        if (isPlainObject(item)) {
          const gov =
            (item.governorate as string) ||
            (item.Governorate as string) ||
            (item["المحافظة"] as string) ||
            ctx.gov;
          const wil =
            (item.wilayat as string) ||
            (item.Wilayat as string) ||
            (item["الولاية"] as string) ||
            ctx.wil;
          const vil =
            (item.village as string) || (item.Village as string) || (item["القرية"] as string) || "";
          const cnt =
            parseIntSafe(item.centerCount ?? item.count ?? item.centers ?? item["عدد المراكز"] ?? item.n);
          if (gov && cnt > 0) {
            const g = governorateKeyFromLabel(String(gov));
            out.push({
              governorateKey: g.key,
              governorateLabel: g.label,
              wilayat: wil ? collapse(String(wil)) : "",
              village: vil ? collapse(String(vil)) : "",
              centerCount: cnt,
            });
          } else {
            visit(item, { gov: gov ? String(gov) : ctx.gov, wil: wil ? String(wil) : ctx.wil });
          }
        }
      }
      return;
    }

    if (!isPlainObject(node)) return;

    for (const [k, v] of Object.entries(node)) {
      if (normalizeYearKey(k) !== null) {
        visit(v, ctx);
        continue;
      }
      if (isPlainObject(v)) {
        const maybeGov = governorateKeyFromLabel(k);
        visit(v, { gov: maybeGov.label, wil: ctx.wil });
      } else if (typeof v === "number" || typeof v === "string") {
        const cnt = parseIntSafe(v);
        if (cnt > 0 && ctx.gov) {
          const g = governorateKeyFromLabel(ctx.gov);
          out.push({
            governorateKey: g.key,
            governorateLabel: g.label,
            wilayat: ctx.wil ? collapse(ctx.wil) : "",
            village: collapse(k),
            centerCount: cnt,
          });
        }
      }
    }
  };

  visit(data, {});
  return mergeGeographyDuplicates(out);
}

function mergeGeographyDuplicates(rows: GeographyRow[]): GeographyRow[] {
  const map = new Map<string, GeographyRow>();
  for (const r of rows) {
    const w = r.wilayat || "";
    const v = r.village || "";
    const k = `${r.governorateKey}|${w}|${v}`;
    const prev = map.get(k);
    if (!prev) map.set(k, { ...r });
    else prev.centerCount += r.centerCount;
  }
  return Array.from(map.values());
}

export type ServiceUsageRow = {
  year: number;
  rankOrder: number;
  serviceNameAr?: string;
  serviceNameEn?: string;
  authorityNameAr?: string;
  authorityNameEn?: string;
  demandVolume: number;
};

export function parseMostUsedServices(data: unknown): ServiceUsageRow[] {
  const out: ServiceUsageRow[] = [];
  if (!isPlainObject(data)) return out;

  for (const [yk, list] of Object.entries(data)) {
    const year = normalizeYearKey(yk);
    if (year === null) continue;
    if (!Array.isArray(list)) continue;

    list.forEach((item, idx) => {
      if (!isPlainObject(item)) return;
      const demand = parseIntSafe(
        item.demandVolume ?? item.volume ?? item.count ?? item.transactions ?? item.rankValue ?? item.n ?? 0,
      );
      out.push({
        year,
        rankOrder: parseIntSafe(item.rank ?? item.rankOrder ?? idx + 1) || idx + 1,
        serviceNameAr: (item.serviceNameAr ?? item.service_ar ?? item.serviceAr ?? item["الخدمة"]) as string | undefined,
        serviceNameEn: (item.serviceNameEn ?? item.service_en ?? item.service) as string | undefined,
        authorityNameAr: (item.authorityNameAr ?? item.authority_ar ?? item.entity_ar) as string | undefined,
        authorityNameEn: (item.authorityNameEn ?? item.authority_en ?? item.authority ?? item.entity) as string | undefined,
        demandVolume: demand,
      });
    });
  }

  return out;
}

export type DirectoryXlsxRow = {
  centerName: string;
  responsiblePerson: string;
  contactNumber: string;
  governorateLabel: string;
  wilayat: string;
  village: string;
  raw: Record<string, unknown>;
};

const HEADER_ALIASES: Record<string, keyof DirectoryXlsxRow | "skip"> = {
  "center name": "centerName",
  "اسم المركز": "centerName",
  "name": "centerName",
  responsible: "responsiblePerson",
  "responsible person": "responsiblePerson",
  "الاسم": "responsiblePerson",
  "مسؤول": "responsiblePerson",
  phone: "contactNumber",
  mobile: "contactNumber",
  "contact": "contactNumber",
  "رقم الهاتف": "contactNumber",
  "الهاتف": "contactNumber",
  governorate: "governorateLabel",
  "المحافظة": "governorateLabel",
  wilayat: "wilayat",
  "الولاية": "wilayat",
  village: "village",
  "القرية": "village",
};

export function mapDirectoryHeaders(headers: string[]): (keyof DirectoryXlsxRow | "skip" | null)[] {
  return headers.map((h) => {
    const k = collapse(h).toLowerCase();
    return (HEADER_ALIASES[k] as keyof DirectoryXlsxRow | "skip" | undefined) ?? null;
  });
}

export function directoryRowFromArray(
  row: unknown[],
  colMap: (keyof DirectoryXlsxRow | "skip" | null)[],
): DirectoryXlsxRow | null {
  const acc: Record<string, string> = {};
  row.forEach((cell, i) => {
    const key = colMap[i];
    if (!key || key === "skip") return;
    acc[key] = cell === undefined || cell === null ? "" : String(cell).trim();
  });
  if (!acc.centerName && !acc.governorateLabel) return null;
  return {
    centerName: acc.centerName || "",
    responsiblePerson: acc.responsiblePerson || "",
    contactNumber: acc.contactNumber || "",
    governorateLabel: acc.governorateLabel || "",
    wilayat: acc.wilayat || "",
    village: acc.village || "",
    raw: Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v])),
  };
}
