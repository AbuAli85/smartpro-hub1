import type { HubCrumb } from "./HubBreadcrumb";

const home: HubCrumb = { label: "Home", href: "/dashboard" };
const people: HubCrumb = { label: "People", href: "/my-team" };
const compliance: HubCrumb = { label: "Compliance", href: "/compliance" };

export const HR_INSIGHTS_HUB: HubCrumb = { label: "HR insights", href: "/hr/insights" };
export const ORGANIZATION_HUB: HubCrumb = { label: "Organization", href: "/organization" };
export const RENEWALS_HUB: HubCrumb = { label: "Renewals & expiry", href: "/compliance/renewals" };

/** People → HR insights → … */
export function hrInsightsTrail(pageTitle: string): HubCrumb[] {
  return [home, people, HR_INSIGHTS_HUB, { label: pageTitle }];
}

/** People → Organization → … */
export function organizationTrail(pageTitle: string): HubCrumb[] {
  return [home, people, ORGANIZATION_HUB, { label: pageTitle }];
}

/** Compliance → Renewals & expiry → … */
export function renewalsTrail(pageTitle: string): HubCrumb[] {
  return [home, compliance, RENEWALS_HUB, { label: pageTitle }];
}
