import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PAGES_DIR = join(import.meta.dirname, "..", "..", "pages");

export type HubBreadcrumbDomain = "hrInsights" | "organization" | "renewals";

/**
 * Key child pages that must stay aligned with hub taxonomy breadcrumbs.
 * Extend this when adding a new hub child route that should train the domain model.
 */
export const HUB_BREADCRUMB_COVERED_PAGES: readonly {
  sourceFile: string;
  trailHelper: "hrInsightsTrail" | "organizationTrail" | "renewalsTrail";
  /** Buckets the page under the hub domain for reviewers. */
  domain: HubBreadcrumbDomain;
  /** Why this file is governed (keeps manifest maintainable after merges). */
  note: string;
}[] = [
  {
    sourceFile: "WorkforceIntelligencePage.tsx",
    trailHelper: "hrInsightsTrail",
    domain: "hrInsights",
    note: "Deep link from HR insights hub (workforce signals).",
  },
  {
    sourceFile: "ExecutiveDashboardPage.tsx",
    trailHelper: "hrInsightsTrail",
    domain: "hrInsights",
    note: "HR operations health surface under insights domain.",
  },
  {
    sourceFile: "HRKpiPage.tsx",
    trailHelper: "hrInsightsTrail",
    domain: "hrInsights",
    note: "KPI workspace; hub card destination.",
  },
  {
    sourceFile: "HRPerformancePage.tsx",
    trailHelper: "hrInsightsTrail",
    domain: "hrInsights",
    note: "Performance & growth; hub card destination.",
  },
  {
    sourceFile: "OrgChartPage.tsx",
    trailHelper: "organizationTrail",
    domain: "organization",
    note: "Org chart; hub section CTA.",
  },
  {
    sourceFile: "OrgStructurePage.tsx",
    trailHelper: "organizationTrail",
    domain: "organization",
    note: "Org structure tree; hub section CTA.",
  },
  {
    sourceFile: "DepartmentsPage.tsx",
    trailHelper: "organizationTrail",
    domain: "organization",
    note: "Department records; hub section CTA.",
  },
  {
    sourceFile: "RenewalWorkflowsPage.tsx",
    trailHelper: "renewalsTrail",
    domain: "renewals",
    note: "Renewal automation rules; renewals hub lifecycle column.",
  },
  {
    sourceFile: "ExpiryAlertsPage.tsx",
    trailHelper: "renewalsTrail",
    domain: "renewals",
    note: "Cross-surface expiry alerts; expiring column.",
  },
  {
    sourceFile: "DocumentExpiryDashboard.tsx",
    trailHelper: "renewalsTrail",
    domain: "renewals",
    note: "HR-scoped expiry dashboard; expiring column.",
  },
];

/**
 * Ensures listed pages still import `hubCrumbs` and use the expected trail helper + HubBreadcrumb.
 * Intended for CI / Vitest — not for browser runtime.
 */
export function validateHubBreadcrumbCoverage(): string[] {
  const issues: string[] = [];
  for (const row of HUB_BREADCRUMB_COVERED_PAGES) {
    const fp = join(PAGES_DIR, row.sourceFile);
    if (!existsSync(fp)) {
      issues.push(`Missing page file: ${row.sourceFile}`);
      continue;
    }
    const content = readFileSync(fp, "utf8");
    if (!content.includes("HubBreadcrumb")) {
      issues.push(`${row.sourceFile}: expected <HubBreadcrumb`);
    }
    if (!content.includes("hubCrumbs")) {
      issues.push(`${row.sourceFile}: expected import from hubCrumbs`);
    }
    if (!content.includes(row.trailHelper)) {
      issues.push(`${row.sourceFile}: expected ${row.trailHelper}(...)`);
    }
  }
  return issues;
}

export function assertHubBreadcrumbCoverage(): void {
  const issues = validateHubBreadcrumbCoverage();
  if (issues.length > 0) {
    throw new Error(`Hub breadcrumb coverage failed:\n${issues.map((s) => `  - ${s}`).join("\n")}`);
  }
}
