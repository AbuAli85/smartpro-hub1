import { describe, expect, it } from "vitest";
import { getCommandCenterSectionOrder, resolveEmployeePortalPriorityProfile } from "./employeePortalPriorityProfile";

describe("resolveEmployeePortalPriorityProfile", () => {
  it("defaults when no signals", () => {
    expect(resolveEmployeePortalPriorityProfile({ membershipRole: null, position: null, department: null })).toBe("default");
  });

  it("maps reviewer membership to approver", () => {
    expect(resolveEmployeePortalPriorityProfile({ membershipRole: "reviewer", position: null, department: null })).toBe("approver");
  });

  it("maps hr_admin to hr_operational", () => {
    expect(resolveEmployeePortalPriorityProfile({ membershipRole: "hr_admin", position: null, department: null })).toBe(
      "hr_operational",
    );
  });

  it("maps field position keywords", () => {
    expect(resolveEmployeePortalPriorityProfile({ membershipRole: "member", position: "Field technician", department: null })).toBe(
      "field",
    );
  });

  it("maps store/sales department", () => {
    expect(resolveEmployeePortalPriorityProfile({ membershipRole: "member", position: null, department: "Retail store" })).toBe(
      "store_sales",
    );
  });
});

describe("getCommandCenterSectionOrder", () => {
  it("places requests_summary before work_summary for approver profile", () => {
    const order = getCommandCenterSectionOrder("approver");
    expect(order.indexOf("requests_summary")).toBeLessThan(order.indexOf("work_summary"));
  });

  it("places work_summary before requests_summary for default profile", () => {
    const order = getCommandCenterSectionOrder("default");
    expect(order.indexOf("work_summary")).toBeLessThan(order.indexOf("requests_summary"));
  });
});
