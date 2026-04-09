import { describe, expect, it } from "vitest";
import { CONTROL_TOWER_SECTION_ORDER, priorityActionIdsFromItems, queueItemsAfterPriorities } from "./controlTowerLayout";
import type { ActionQueueItem } from "./actionQueueTypes";
import type { PriorityItem } from "./priorityTypes";

describe("CONTROL_TOWER_SECTION_ORDER", () => {
  it("places priorities before risk strip, queue, and KPIs (CEO scan hierarchy)", () => {
    const idx = (id: string) => CONTROL_TOWER_SECTION_ORDER.indexOf(id as (typeof CONTROL_TOWER_SECTION_ORDER)[number]);
    expect(idx("priorities")).toBeLessThan(idx("risk_strip"));
    expect(idx("risk_strip")).toBeLessThan(idx("action_queue"));
    expect(idx("action_queue")).toBeLessThan(idx("kpi_snapshot"));
    expect(idx("kpi_snapshot")).toBeLessThan(idx("support_context"));
  });
});

describe("queueItemsAfterPriorities", () => {
  const a = (id: string): ActionQueueItem => ({
    id,
    kind: "generic_attention",
    title: id,
    severity: "low",
    blocking: false,
    source: "operations",
    href: "/x",
    ctaLabel: "Open",
  });

  it("excludes rows promoted into priorities (no duplicate truth)", () => {
    const items: ActionQueueItem[] = [a("p1"), a("p2"), a("rest")];
    const priorities: PriorityItem[] = [
      {
        id: "pr-1",
        actionId: "p1",
        title: "P1",
        summary: "P1",
        whyThisMatters: "w",
        recommendedAction: "r",
        priorityLevel: "critical",
        blocking: true,
        href: "/p1",
        ctaLabel: "Go",
        source: "operations",
        kind: "generic_attention",
      },
    ];
    const ids = priorityActionIdsFromItems(priorities);
    const rest = queueItemsAfterPriorities(items, ids);
    expect(rest.map((x) => x.id)).toEqual(["p2", "rest"]);
  });
});
