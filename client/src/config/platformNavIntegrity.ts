import { normalizeAppPath } from "@shared/normalizeAppPath";
import type { NavGroupDef, NavItemDef, NavLeafDef } from "./platformNav";

function walkItems(items: readonly NavItemDef[], visit: (item: NavItemDef) => void): void {
  for (const item of items) {
    visit(item);
    if (item.kind === "branch") walkItems(item.children, visit);
  }
}

/**
 * Validates structural metadata for `PLATFORM_NAV_GROUP_DEFS`.
 * Returns a list of human-readable issues (empty = OK).
 */
export function validatePlatformNavMetadata(defs: readonly NavGroupDef[]): string[] {
  const issues: string[] = [];

  const allLeaves: NavLeafDef[] = [];
  for (const g of defs) {
    walkItems(g.items, (item) => {
      if (item.kind === "branch") {
        if (!item.intent) issues.push(`Branch "${item.id}" missing intent`);
        if (item.children.length === 0) {
          issues.push(`Branch "${item.id}" has no children`);
        }
      }
      if (item.kind === "leaf") {
        allLeaves.push(item);
        if (!item.intent) issues.push(`Leaf "${item.id}" missing intent`);
        const href = item.href?.trim() ?? "";
        if (!href.startsWith("/")) {
          issues.push(`Leaf "${item.id}" href must be an app path starting with / (got "${item.href}")`);
        }
        const nh = normalizeAppPath(href);
        if (nh !== href) {
          issues.push(`Leaf "${item.id}" href should be normalized (use "${nh}" not "${href}")`);
        }
        const prefs = item.activePathPrefixes ?? [];
        const seen = new Set<string>();
        for (const p of prefs) {
          const np = normalizeAppPath(p);
          if (np !== p) {
            issues.push(`Leaf "${item.id}" activePathPrefixes entry should be normalized (use "${np}" not "${p}")`);
          }
          if (seen.has(np)) {
            issues.push(`Leaf "${item.id}" duplicate activePathPrefixes entry "${np}"`);
          }
          seen.add(np);
        }
        if (item.hubPrimary) {
          if (prefs.length === 0) {
            issues.push(`Leaf "${item.id}" is hubPrimary but activePathPrefixes is empty`);
          } else if (!prefs.some((p) => normalizeAppPath(p) === nh)) {
            issues.push(
              `Leaf "${item.id}" is hubPrimary but activePathPrefixes does not include href "${nh}"`,
            );
          }
        }
      }
    });
  }

  const hrefToIds = new Map<string, string[]>();
  for (const leaf of allLeaves) {
    const key = normalizeAppPath(leaf.href);
    const list = hrefToIds.get(key) ?? [];
    list.push(leaf.id);
    hrefToIds.set(key, list);
  }
  for (const [href, ids] of hrefToIds) {
    if (ids.length > 1) {
      issues.push(`Duplicate nav href "${href}" on leaves: ${ids.join(", ")}`);
    }
  }

  return issues;
}

/** Throws with a joined message if validation fails. */
export function assertPlatformNavIntegrity(defs: readonly NavGroupDef[]): void {
  const issues = validatePlatformNavMetadata(defs);
  if (issues.length > 0) {
    throw new Error(`Platform nav integrity failed:\n${issues.map((s) => `  - ${s}`).join("\n")}`);
  }
}
