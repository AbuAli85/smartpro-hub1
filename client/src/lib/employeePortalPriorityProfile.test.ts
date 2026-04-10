import { describe, expect, it } from "vitest";
import { getBaseCommandCenterSectionOrder, resolveEmployeePortalPriorityProfile } from "./employeePortalPriorityProfile";

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

describe("getBaseCommandCenterSectionOrder", () => {
  it("places requests_summary before work_summary for approver profile", () => {
    const order = getBaseCommandCenterSectionOrder("approver");
    expect(order.indexOf("requests_summary")).toBeLessThan(order.indexOf("work_summary"));
  });

  it("places work_summary before requests_summary for default profile", () => {
    const order = getBaseCommandCenterSectionOrder("default");
    expect(order.indexOf("work_summary")).toBeLessThan(order.indexOf("requests_summary"));
  });

  it("uses pay_and_files (not legacy pay_files) in order arrays", () => {
    for (const p of ["default", "field", "approver", "hr_operational", "store_sales"] as const) {
      const order = getBaseCommandCenterSectionOrder(p);
      expect(order).toContain("pay_and_files");
      expect(order).not.toContain("pay_files" as any);
    }
  });

  it("places at_a_glance before requests_summary for store_sales", () => {
    const order = getBaseCommandCenterSectionOrder("store_sales");
    expect(order.indexOf("at_a_glance")).toBeLessThan(order.indexOf("requests_summary"));
  });
});
