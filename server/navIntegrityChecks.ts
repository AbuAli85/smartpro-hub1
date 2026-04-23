/**
 * Server-side nav integrity check runner.
 * Imports the shared validation logic and the client-side nav definitions
 * so they can be executed in a tRPC procedure and surfaced in the admin UI.
 *
 * NOTE: This file runs in Node (server) context. `platformNav.tsx` pulls
 * `lucide-react` (and thus `react`); both must stay in package.json `dependencies`
 * so production installs satisfy the server bundle’s external imports.
 */
import { PLATFORM_NAV_GROUP_DEFS } from "../client/src/config/platformNav";
import { validatePlatformNavMetadata } from "../client/src/config/platformNavIntegrity";
import { HUB_BREADCRUMB_COVERED_PAGES, validateHubBreadcrumbCoverage } from "../client/src/components/hub/hubBreadcrumbCoverage";

export type NavCheckSeverity = "error" | "warning" | "info";

export interface NavCheckIssue {
  id: string;
  category: "nav_metadata" | "hub_breadcrumb";
  severity: NavCheckSeverity;
  message: string;
  /** Optional extra context (e.g. affected leaf IDs, file names). */
  detail?: string;
}

export interface HubDomainSummary {
  domain: string;
  totalPages: number;
  passingPages: number;
  failingPages: { sourceFile: string; issues: string[] }[];
}

export interface NavIntegrityReport {
  runAt: number; // UTC ms
  overallStatus: "pass" | "fail";
  navMetadataIssues: NavCheckIssue[];
  hubBreadcrumbIssues: NavCheckIssue[];
  hubDomains: HubDomainSummary[];
  totalLeaves: number;
  totalGroups: number;
  totalHubPages: number;
}

/** Run all integrity checks and return a structured report. */
export function runNavIntegrityChecks(): NavIntegrityReport {
  const runAt = Date.now();

  // ── 1. Platform nav metadata ──────────────────────────────────────────────
  const rawNavIssues = validatePlatformNavMetadata(PLATFORM_NAV_GROUP_DEFS);
  const navMetadataIssues: NavCheckIssue[] = rawNavIssues.map((msg, i) => ({
    id: `nav-meta-${i}`,
    category: "nav_metadata",
    severity: "error",
    message: msg,
  }));

  // Count total leaves and groups
  let totalLeaves = 0;
  let totalGroups = PLATFORM_NAV_GROUP_DEFS.length;
  for (const g of PLATFORM_NAV_GROUP_DEFS) {
    function countLeaves(items: typeof g.items): void {
      for (const item of items) {
        if (item.kind === "leaf") totalLeaves++;
        else if (item.kind === "branch") countLeaves(item.children as typeof g.items);
      }
    }
    countLeaves(g.items);
  }

  // ── 2. Hub breadcrumb coverage ────────────────────────────────────────────
  const rawHubIssues = validateHubBreadcrumbCoverage();
  const hubBreadcrumbIssues: NavCheckIssue[] = rawHubIssues.map((msg, i) => ({
    id: `hub-bc-${i}`,
    category: "hub_breadcrumb",
    severity: "error",
    message: msg,
    detail: msg.includes(":") ? msg.split(":")[0] : undefined,
  }));

  // ── 3. Per-domain summary ─────────────────────────────────────────────────
  const domainMap = new Map<string, { sourceFile: string; issues: string[] }[]>();
  for (const row of HUB_BREADCRUMB_COVERED_PAGES) {
    if (!domainMap.has(row.domain)) domainMap.set(row.domain, []);
    const pageIssues = rawHubIssues.filter((msg) => msg.startsWith(row.sourceFile));
    domainMap.get(row.domain)!.push({ sourceFile: row.sourceFile, issues: pageIssues });
  }

  const hubDomains: HubDomainSummary[] = [];
  for (const [domain, pages] of domainMap) {
    hubDomains.push({
      domain,
      totalPages: pages.length,
      passingPages: pages.filter((p) => p.issues.length === 0).length,
      failingPages: pages.filter((p) => p.issues.length > 0),
    });
  }

  const overallStatus =
    navMetadataIssues.length === 0 && hubBreadcrumbIssues.length === 0 ? "pass" : "fail";

  return {
    runAt,
    overallStatus,
    navMetadataIssues,
    hubBreadcrumbIssues,
    hubDomains,
    totalLeaves,
    totalGroups,
    totalHubPages: HUB_BREADCRUMB_COVERED_PAGES.length,
  };
}
