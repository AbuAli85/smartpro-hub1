import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PAGES_DIR = join(import.meta.dirname, "..", "..", "pages");

/** Key child pages that must stay aligned with hub taxonomy breadcrumbs. */
export const HUB_BREADCRUMB_COVERED_PAGES: readonly {
  sourceFile: string;
  trailHelper: "hrInsightsTrail" | "organizationTrail" | "renewalsTrail";
}[] = [
  { sourceFile: "WorkforceIntelligencePage.tsx", trailHelper: "hrInsightsTrail" },
  { sourceFile: "ExecutiveDashboardPage.tsx", trailHelper: "hrInsightsTrail" },
  { sourceFile: "HRKpiPage.tsx", trailHelper: "hrInsightsTrail" },
  { sourceFile: "HRPerformancePage.tsx", trailHelper: "hrInsightsTrail" },
  { sourceFile: "OrgChartPage.tsx", trailHelper: "organizationTrail" },
  { sourceFile: "OrgStructurePage.tsx", trailHelper: "organizationTrail" },
  { sourceFile: "DepartmentsPage.tsx", trailHelper: "organizationTrail" },
  { sourceFile: "RenewalWorkflowsPage.tsx", trailHelper: "renewalsTrail" },
  { sourceFile: "ExpiryAlertsPage.tsx", trailHelper: "renewalsTrail" },
  { sourceFile: "DocumentExpiryDashboard.tsx", trailHelper: "renewalsTrail" },
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
