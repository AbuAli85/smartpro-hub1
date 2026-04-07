import { describe, expect, it } from "vitest";
import { canExecuteDecisionAction, canActOnCollectionsQueue, filterDecisionWorkItemsForRole } from "./executionCapabilities";
import type { DecisionWorkItem } from "./decisionWorkItems";

describe("canExecuteDecisionAction", () => {
  it("restricts payroll to company_admin", () => {
    expect(canExecuteDecisionAction("company_admin", "payroll_approve_run")).toBe(true);
    expect(canExecuteDecisionAction("finance_admin", "payroll_approve_run")).toBe(false);
    expect(canExecuteDecisionAction("hr_admin", "payroll_mark_paid")).toBe(false);
  });

  it("restricts employee requests to company_admin and hr_admin", () => {
    expect(canExecuteDecisionAction("hr_admin", "employee_request_approve")).toBe(true);
    expect(canExecuteDecisionAction("finance_admin", "employee_request_approve")).toBe(false);
  });

  it("allows auditors nothing except contract navigation", () => {
    expect(canExecuteDecisionAction("external_auditor", "leave_approve")).toBe(false);
    expect(canExecuteDecisionAction("external_auditor", "contract_open_sign")).toBe(true);
  });
});

describe("canActOnCollectionsQueue", () => {
  it("matches finance and company admin", () => {
    expect(canActOnCollectionsQueue("company_admin")).toBe(true);
    expect(canActOnCollectionsQueue("finance_admin")).toBe(true);
    expect(canActOnCollectionsQueue("hr_admin")).toBe(false);
  });
});

describe("filterDecisionWorkItemsForRole", () => {
  it("strips payroll actions for finance_admin", () => {
    const items: DecisionWorkItem[] = [
      {
        workItemKey: "p:1",
        entityType: "payroll_run",
        entityId: 1,
        payrollAction: "approve_run",
        title: "Payroll",
        subtitle: "",
        urgency: "high",
        status: "draft",
        deepLink: "/payroll",
        actions: [
          { actionKey: "payroll_approve_run", label: "Approve", tone: "primary" },
          { actionKey: "payroll_mark_paid", label: "Paid", tone: "secondary" },
        ],
        actorHint: null,
      },
    ];
    const out = filterDecisionWorkItemsForRole(items, "finance_admin");
    expect(out[0].actions).toHaveLength(0);
  });
});
