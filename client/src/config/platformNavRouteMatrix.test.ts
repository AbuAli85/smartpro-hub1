import { describe, it, expect } from "vitest";
import {
  PLATFORM_NAV_GROUP_DEFS,
  PLATFORM_NAV_ALL_LEAVES,
  groupContainsActiveRoute,
  isNavLeafActive,
  normalizeNavPathForMatching,
} from "./platformNav";
import type { NavGroupDef, NavLeafDef, NavItemDef } from "./platformNav";

function findGroup(id: string): NavGroupDef | undefined {
  return PLATFORM_NAV_GROUP_DEFS.find((g) => g.id === id);
}

function walkLeaves(items: readonly NavItemDef[], out: NavLeafDef[] = []): NavLeafDef[] {
  for (const item of items) {
    if (item.kind === "leaf") out.push(item);
    else walkLeaves(item.children, out);
  }
  return out;
}

/** Groups whose *single* active leaf belongs to that route (single group). */
function owningGroupIdsForPath(path: string): string[] {
  const actives = PLATFORM_NAV_ALL_LEAVES.filter((l) => isNavLeafActive(l, path));
  expect(actives.length).toBe(1);
  const leaf = actives[0];
  return PLATFORM_NAV_GROUP_DEFS.filter((g) =>
    walkLeaves(g.items).some((l) => l.id === leaf.id),
  ).map((g) => g.id);
}

describe("route → group ownership matrix", () => {
  const cases: { path: string; groupId: string }[] = [
    { path: "/operations", groupId: "control" },
    { path: "/operations/kpi", groupId: "control" },
    { path: "/operations?tab=metrics", groupId: "control" },
    { path: "/company/hub", groupId: "operations" },
    { path: "/company/hub/settings", groupId: "operations" },
    { path: "/company/team-access", groupId: "access" },
    { path: "/company/team-access?invite=1", groupId: "access" },
    { path: "/company-admin", groupId: "access" },
    { path: "/my-team", groupId: "peopleHr" },
    { path: "/my-team/import", groupId: "peopleHr" },
    { path: "/workforce/sync", groupId: "complianceWorkforce" },
    { path: "/workforce/sync?dryRun=1", groupId: "complianceWorkforce" },
    { path: "/admin", groupId: "platform" },
    { path: "/admin/users", groupId: "platform" },
    { path: "/marketplace", groupId: "marketplaceSection" },
    { path: "/sanad/marketplace", groupId: "marketplaceSection" },
    { path: "/sanad/catalogue-admin", groupId: "marketplaceSection" },
    { path: "/sanad/ratings-moderation", groupId: "marketplaceSection" },
    { path: "/sanad/partner-onboarding", groupId: "govPartner" },
    { path: "/sanad", groupId: "govPartner" },
    { path: "/finance/overview", groupId: "control" },
    { path: "/compliance", groupId: "control" },
    { path: "/compliance/renewals", groupId: "complianceWorkforce" },
    { path: "/workforce/documents", groupId: "complianceWorkforce" },
    { path: "/workforce/profile-change-requests", groupId: "peopleHr" },
  ];

  for (const { path, groupId } of cases) {
    it(`route ${path} → group ${groupId}`, () => {
      const g = findGroup(groupId);
      expect(g, `missing group ${groupId}`).toBeDefined();
      expect(groupContainsActiveRoute(g!, path), path).toBe(true);
      expect(owningGroupIdsForPath(path)).toEqual([groupId]);
    });
  }

  it("normalizes paths for matching", () => {
    expect(normalizeNavPathForMatching("/operations?x=1")).toBe("/operations");
    expect(normalizeNavPathForMatching("/operations#hash")).toBe("/operations");
  });

  it("does not double-highlight Sanad marketplace under /sanad parent leaf", () => {
    const sanadRoot = PLATFORM_NAV_ALL_LEAVES.find((l) => l.href === "/sanad");
    const sanadMp = PLATFORM_NAV_ALL_LEAVES.find((l) => l.href === "/sanad/marketplace");
    expect(sanadRoot).toBeDefined();
    expect(sanadMp).toBeDefined();
    expect(isNavLeafActive(sanadMp!, "/sanad/marketplace")).toBe(true);
    expect(isNavLeafActive(sanadRoot!, "/sanad/marketplace")).toBe(false);
  });
});
