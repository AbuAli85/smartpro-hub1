import { describe, expect, it } from "vitest";
import { sortInterventionsForDisplay, type MyWorkspaceIntervention } from "./workspaceData";

function iv(p: Partial<MyWorkspaceIntervention> & Pick<MyWorkspaceIntervention, "id">): MyWorkspaceIntervention {
  return {
    kind: "follow_up",
    status: "open",
    followUpAt: null,
    note: null,
    managerLabel: "M",
    ...p,
  };
}

describe("sortInterventionsForDisplay", () => {
  it("ranks escalated status before open", () => {
    const a = iv({ id: 1, status: "open", followUpAt: "2026-04-01" });
    const b = iv({ id: 2, status: "escalated", followUpAt: "2026-04-20" });
    const out = sortInterventionsForDisplay([a, b]);
    expect(out[0].id).toBe(2);
  });

  it("ranks overdue follow-up before upcoming", () => {
    const future = iv({ id: 1, status: "open", followUpAt: "2099-01-01" });
    const past = iv({ id: 2, status: "open", followUpAt: "2020-01-01" });
    const out = sortInterventionsForDisplay([future, past]);
    expect(out[0].id).toBe(2);
  });

  it("earlier follow-up date first when both open and not overdue", () => {
    const later = iv({ id: 1, status: "open", followUpAt: "2026-04-15" });
    const sooner = iv({ id: 2, status: "open", followUpAt: "2026-04-10" });
    const out = sortInterventionsForDisplay([later, sooner]);
    expect(out[0].id).toBe(2);
  });
});
