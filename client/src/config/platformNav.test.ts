import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PLATFORM_NAV_GROUP_DEFS,
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

  it("expands the correct section for nested hub routes (HR Insights)", () => {
    const people = findGroup("peopleHr");
    expect(people).toBeDefined();
    const leaf = walkLeaves(people!.items).find((l) => l.href === "/hr/insights");
    expect(leaf).toBeDefined();
    expect(isNavLeafActive(leaf!, "/hr/workforce-intelligence")).toBe(true);
    expect(groupContainsActiveRoute(people!, "/hr/workforce-intelligence")).toBe(true);
  });

  it("expands Government & compliance for renewals deep links", () => {
    const gov = findGroup("govCompliance");
    expect(gov).toBeDefined();
    expect(groupContainsActiveRoute(gov!, "/compliance/renewals")).toBe(true);
    expect(groupContainsActiveRoute(gov!, "/alerts")).toBe(true);
  });

  it("maps Team access under Access & permissions (no duplicate href)", () => {
    const access = findGroup("access");
    expect(access).toBeDefined();
    const leaves = walkLeaves(access!.items);
    const hrefs = leaves.map((l) => l.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toContain("/company/team-access");
  });

  it("keeps Operations overview and Operations hub as distinct routes", () => {
    const ops = findGroup("operations");
    const hrefs = walkLeaves(ops!.items).map((l) => l.href);
    expect(hrefs).toContain("/operations");
    expect(hrefs).toContain("/company/hub");
  });

  it("tertiary platform group defaults collapsed in config (progressive disclosure)", () => {
    const plat = findGroup("platform");
    expect(plat?.tier).toBe("tertiary");
    expect(plat?.collapsible).toBe(true);
    expect(plat?.defaultCollapsed).toBe(true);
  });

  it("role-based filtering: company_admin retains primary business groups", () => {
    const hidden = new Set<string>();
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
});
