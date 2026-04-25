import type { TFunction } from "i18next";
import type { HubCrumb } from "./HubBreadcrumb";

export const HR_INSIGHTS_HUB_HREF = "/hr/insights";
export const ORGANIZATION_HUB_HREF = "/organization";
export const RENEWALS_HUB_HREF = "/compliance/renewals";

/**
 * People → HR insights → …
 *
 * Pass `t` (from `useTranslation("nav")`) to get fully localised crumb labels.
 * If `t` is omitted the function falls back to the original English strings so
 * existing call sites continue to work unchanged.
 */
export function hrInsightsTrail(pageTitle: string, t?: TFunction): HubCrumb[] {
  return [
    { label: t ? t("home") : "Home", href: "/dashboard" },
    { label: t ? t("people") : "People", href: "/my-team" },
    { label: t ? t("hrInsights") : "HR insights", href: HR_INSIGHTS_HUB_HREF },
    { label: pageTitle },
  ];
}

/** People → Organization → … */
export function organizationTrail(pageTitle: string, t?: TFunction): HubCrumb[] {
  return [
    { label: t ? t("home") : "Home", href: "/dashboard" },
    { label: t ? t("people") : "People", href: "/my-team" },
    { label: t ? t("organization") : "Organization", href: ORGANIZATION_HUB_HREF },
    { label: pageTitle },
  ];
}

export const ATTENDANCE_SETUP_HUB_HREF = "/hr/attendance-setup";

/** People → Attendance → Attendance Setup → … */
export function attendanceSetupTrail(pageTitle: string, t?: TFunction): HubCrumb[] {
  return [
    { label: t ? t("home") : "Home", href: "/dashboard" },
    { label: t ? t("people") : "People", href: "/hr/attendance" },
    { label: t ? t("attendanceSetup") : "Attendance Setup", href: ATTENDANCE_SETUP_HUB_HREF },
    { label: pageTitle },
  ];
}

/** Compliance → Renewals & expiry → … */
export function renewalsTrail(pageTitle: string, t?: TFunction): HubCrumb[] {
  return [
    { label: t ? t("home") : "Home", href: "/dashboard" },
    { label: t ? t("compliance") : "Compliance", href: "/compliance" },
    { label: t ? t("renewalsExpiry") : "Renewals & expiry", href: RENEWALS_HUB_HREF },
    { label: pageTitle },
  ];
}
