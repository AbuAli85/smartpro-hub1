/**
 * Shared helpers for the attendance router sub-modules.
 *
 * Keep this file focused on attendance-domain auth guards and stateless
 * utility functions.  Business-logic helpers that are only used by a single
 * sub-module should live in that sub-module instead.
 */
import { TRPCError } from "@trpc/server";
import { requireDb } from "../../db.client";
import { getUserCompanyById } from "../../repositories/companies.repository";
import { requireActiveCompanyId } from "../../_core/tenant";
import type { User } from "../../../drizzle/schema";

export { requireDb };

/** HR/company admin for the active or explicitly selected company. */
export async function requireAdminOrHR(user: User, companyId?: number | null) {
  const cid = await requireActiveCompanyId(user.id, companyId, user);
  const row = await getUserCompanyById(user.id, cid);
  const role = row?.member?.role;
  if (!role) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
  if (role !== "company_admin" && role !== "hr_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "HR Admin or Company Admin required" });
  }
  return { company: { id: cid }, companyId: cid, role, member: { role } };
}

/**
 * Haversine distance in metres between two GPS coordinates.
 */
export function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check if current time (UTC) is within the site's operating hours.
 * operatingHoursStart / End are "HH:MM" strings in the site's timezone.
 */
export function isWithinOperatingHours(
  start: string | null | undefined,
  end: string | null | undefined,
  tz: string,
): boolean {
  if (!start || !end) return true;
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const h = parts.find((p) => p.type === "hour")?.value ?? "00";
    const m = parts.find((p) => p.type === "minute")?.value ?? "00";
    const current = `${h}:${m}`;
    if (start <= end) return current >= start && current <= end;
    return current >= start || current <= end;
  } catch {
    return true;
  }
}

/** DB stores `HH:MM:SS`; API may send `HH:MM` — normalize for muscatWallDateTimeToUtc. */
export function normalizeCorrectionHms(s: string | null | undefined): string {
  if (!s) return "00:00:00";
  const t = s.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  return t;
}
