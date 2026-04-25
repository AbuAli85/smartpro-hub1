import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PLATFORM_NAV_GROUP_DEFS,
  PLATFORM_NAV_GROUP_IDS,
  filterVisibleNavGroups,
  groupContainsActiveRoute,
  isNavLeafActive,
} from "./platformNav";
import type { NavGroupDef, NavLeafDef, NavItemDef } from "./platformNav";
import { assertPlatformNavIntegrity } from "./platformNavIntegrity";

const __dirname = dirname(fileURLToPath(import.meta.url));

function walkLeaves(items: readonly NavItemDef[], out: NavLeafDef[] = []): NavLeafDef[] {
  for (const item of items) {
    if (item.kind === "leaf") out.push(item);
    else walkLeaves(item.children, out);
  }
  return out;
}

function findGroup(id: string): NavGroupDef | undefined {
  return PLATFORM_NAV_GROUP_DEFS.find((g) => g.id === id);
}

const ownerUser = { role: "user" as const, platformRole: "company_admin" as const };
const companyOpts = {
  hasCompanyWorkspace: true,
  hasCompanyMembership: true,
  memberRole: "company_admin" as const,
};

describe("platformNav IA & routing", () => {
  it("passes structural integrity checks", () => {
    expect(() => assertPlatformNavIntegrity(PLATFORM_NAV_GROUP_DEFS)).not.toThrow();
  });

  it("uses the final canonical section order (company + operator shell; client portal is separate)", () => {
    expect(PLATFORM_NAV_GROUP_IDS).toEqual([
      "getStarted",
      "control",
      "govPartner",
      "company",
      "peopleHr",
      "operations",
      "marketplaceSection",
      "complianceWorkforce",
      "access",
      "proShared",
      "platform",
    ]);
  });

  it("places Team Directory under People & HR, not under Access", () => {
    const people = findGroup("peopleHr")!;
    const access = findGroup("access")!;
    expect(walkLeaves(people.items).some((l) => l.href === "/my-team")).toBe(true);
    expect(walkLeaves(access.items).some((l) => l.href === "/my-team")).toBe(false);
  });

  it("maps Team access to Access & permissions (/company/team-access), distinct from Roles & permissions", () => {
    const access = findGroup("access")!;
    const leaves = walkLeaves(access.items);
    const teamAccess = leaves.find((l) => l.href === "/company/team-access");
    const roles = leaves.find((l) => l.href === "/company-admin");
    expect(teamAccess?.labelKey).toBe("teamAccess");
    expect(teamAccess?.badgeMeta?.key).toBe("teamAccessPendingInvites");
    expect(roles?.labelKey).toBe("rolesPermissions");
    expect(leaves.map((l) => l.href).join()).not.toContain("/my-team");
  });

  it("expands People & HR for HR Insights hub deep links", () => {
    const people = findGroup("peopleHr")!;
    const leaf = walkLeaves(people.items).find((l) => l.href === "/hr/insights");
    expect(leaf).toBeDefined();
    expect(isNavLeafActive(leaf!, "/hr/workforce-intelligence")).toBe(true);
    expect(groupContainsActiveRoute(people, "/hr/workforce-intelligence")).toBe(true);
  });

  it("expands Compliance & workforce for renewals and portal sync", () => {
    const cw = findGroup("complianceWorkforce")!;
    expect(groupContainsActiveRoute(cw, "/compliance/renewals")).toBe(true);
    expect(groupContainsActiveRoute(cw, "/alerts")).toBe(true);
    expect(groupContainsActiveRoute(cw, "/workforce/sync")).toBe(true);
  });

  it("places Control overview routes together (incl. Operations Overview)", () => {
    const control = findGroup("control")!;
    const hrefs = walkLeaves(control.items).map((l) => l.href);
    expect(hrefs).toEqual([
      "/control-tower",
      "/dashboard",
      "/operations",
      "/analytics",
      "/finance/overview",
      "/finance/attendance-billing",
      "/compliance",
    ]);
  });

  it("keeps Operations section to hub, task manager, CRM, and quotations", () => {
    const ops = findGroup("operations")!;
    const leaves = walkLeaves(ops.items);
    expect(leaves.map((l) => l.href)).toEqual([
      "/company/hub",
      "/hr/tasks",
      "/crm",
      "/quotations",
    ]);
    expect(leaves.find((l) => l.href === "/hr/tasks")?.badgeMeta?.key).toBe("taskManagerOpen");
  });

  it("tertiary platform group defaults collapsed in config", () => {
    const plat = findGroup("platform");
    expect(plat?.tier).toBe("tertiary");
    expect(plat?.collapsible).toBe(true);
    expect(plat?.defaultCollapsed).toBe(true);
  });

  it("expands Platform & admin for /admin and /audit-log", () => {
    const plat = findGroup("platform")!;
    expect(groupContainsActiveRoute(plat, "/admin")).toBe(true);
    expect(groupContainsActiveRoute(plat, "/audit-log")).toBe(true);
    expect(walkLeaves(plat.items).find((l) => l.href === "/sanad/ratings-moderation")).toBeDefined();
  });

  it("wires renewals and government cases badge metadata", () => {
    const cw = findGroup("complianceWorkforce")!;
    const leaves = walkLeaves(cw.items);
    expect(leaves.find((l) => l.href === "/compliance/renewals")?.badgeMeta?.key).toBe("renewalsAttention");
    expect(leaves.find((l) => l.href === "/workforce/cases")?.badgeMeta?.key).toBe("governmentCasesOpen");
  });

  it("role-based filtering: company_admin retains primary business groups", () => {
    const groups = filterVisibleNavGroups(ownerUser, companyOpts);
    expect(groups.some((g) => g.id === "control")).toBe(true);
    expect(groups.some((g) => g.id === "company")).toBe(true);
    expect(groups.some((g) => g.id === "peopleHr")).toBe(true);
    expect(groups.some((g) => g.id === "operations")).toBe(true);
    expect(groups.length).toBeGreaterThan(0);
  });

  it("role-based filtering: HR manager membership hides finance-only leaves", () => {
    const hrSynced = { role: "user" as const, platformRole: "company_admin" as const };
    const opts = { ...companyOpts, memberRole: "hr_admin" as const };
    const groups = filterVisibleNavGroups(hrSynced, opts);
    const allLeaves = groups.flatMap((g) => walkLeaves(g.items));
    expect(allLeaves.some((l) => l.href === "/payroll")).toBe(false);
  });

  it("pre-company shell shows get-started + essentials only (no tenant OS tree)", () => {
    const pre = { role: "user" as const, platformRole: "company_member" as const };
    const groups = filterVisibleNavGroups(pre, { hasCompanyMembership: false });
    const hrefs = groups.flatMap((g) => walkLeaves(g.items)).map((l) => l.href);
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/company/create");
    expect(hrefs).toContain("/marketplace");
    expect(hrefs).not.toContain("/control-tower");
    expect(hrefs).not.toContain("/operations");
    expect(hrefs).not.toContain("/hr/employees");
  });

  it("portal shell (customer member) uses explicit client whitelist only — no tenant OS groups", () => {
    const portal = { role: "user" as const, platformRole: "client" as const };
    const groups = filterVisibleNavGroups(portal, {
      hasCompanyWorkspace: true,
      hasCompanyMembership: true,
      memberRole: "client" as const,
    });
    expect(groups.map((g) => g.id)).toEqual(["clientWorkspace"]);
    const hrefs = groups.flatMap((g) => walkLeaves(g.items)).map((l) => l.href);
    expect(hrefs).toEqual([
      "/client",
      "/client/engagements",
      "/client/documents",
      "/client/invoices",
      "/client/messages",
      "/client/team",
      "/preferences",
    ]);
    expect(hrefs).not.toContain("/payroll");
    expect(hrefs).not.toContain("/hr/employees");
    expect(hrefs).not.toContain("/engagements/ops");
  });

  it("company_admin shell does not include client portal group (customer channel only)", () => {
    const groups = filterVisibleNavGroups(ownerUser, companyOpts);
    expect(groups.some((g) => g.id === "clientWorkspace")).toBe(false);
  });

  it("operator shell does not include client portal group", () => {
    const op = { role: "user" as const, platformRole: "regional_manager" as const };
    const groups = filterVisibleNavGroups(op, {
      hasCompanyWorkspace: true,
      hasCompanyMembership: true,
      memberRole: "company_admin" as const,
    });
    expect(groups.some((g) => g.id === "clientWorkspace")).toBe(false);
  });
});

describe("sidebar active state styling (CSS guard)", () => {
  it("does not use Tailwind destructive / red utilities for .sidebar-nav-item.active", () => {
    const css = readFileSync(join(__dirname, "../index.css"), "utf8");
    const start = css.indexOf(".sidebar-nav-item.active");
    expect(start).toBeGreaterThan(-1);
    const end = css.indexOf("}", start);
    const block = css.slice(start, end + 1);
    expect(block).not.toMatch(/text-red-|bg-red-|border-red-|destructive/i);
  });

  it("does not use destructive red tokens for branch ancestor highlight", () => {
    const css = readFileSync(join(__dirname, "../index.css"), "utf8");
    const m = css.match(/\.sidebar-nav-branch-trigger--active\s*\{[^}]*\}/);
    expect(m?.[0]).toBeDefined();
    expect(m![0]).not.toMatch(/text-red-|bg-red-|border-red-|destructive/i);
  });
});
