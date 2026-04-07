import { describe, expect, it } from "vitest";
import { buildOwnerAttentionQueue } from "./ownerAttentionQueue";

describe("buildOwnerAttentionQueue", () => {
  it("prefers critical SLA before high overdue for platform", () => {
    const q = buildOwnerAttentionQueue({
      isPlatformOperator: true,
      slaBreaches: 2,
      casesActionRequired: 0,
      pendingLeaveRequests: 0,
      payrollDraftThisMonth: 0,
      pendingPayrollApprovedAwaitingPayment: 0,
      expiringPermits7Days: 0,
      employeeDocsExpiring7Days: 0,
      pendingContracts: 0,
      overdueInvoiceCount: 1,
      overdueInvoiceTotalOmr: 100,
      renewalWorkflowsFailed: 0,
      draftQuotations: 0,
    });
    expect(q[0]?.key).toBe("sla");
    expect(q.find((i) => i.key === "overdue_ar")?.href).toBe("/billing");
  });

  it("routes overdue invoices to client portal for company users", () => {
    const q = buildOwnerAttentionQueue({
      isPlatformOperator: false,
      slaBreaches: 0,
      casesActionRequired: 0,
      pendingLeaveRequests: 0,
      payrollDraftThisMonth: 0,
      pendingPayrollApprovedAwaitingPayment: 0,
      expiringPermits7Days: 0,
      employeeDocsExpiring7Days: 0,
      pendingContracts: 0,
      overdueInvoiceCount: 1,
      overdueInvoiceTotalOmr: 50,
      renewalWorkflowsFailed: 0,
      draftQuotations: 0,
    });
    expect(q[0]?.href).toBe("/client-portal?tab=invoices");
  });

  it("routes SLA to operations for company users", () => {
    const q = buildOwnerAttentionQueue({
      isPlatformOperator: false,
      slaBreaches: 1,
      casesActionRequired: 0,
      pendingLeaveRequests: 0,
      payrollDraftThisMonth: 0,
      pendingPayrollApprovedAwaitingPayment: 0,
      expiringPermits7Days: 0,
      employeeDocsExpiring7Days: 0,
      pendingContracts: 0,
      overdueInvoiceCount: 0,
      overdueInvoiceTotalOmr: 0,
      renewalWorkflowsFailed: 0,
      draftQuotations: 0,
    });
    expect(q[0]?.href).toBe("/operations");
  });

  it("returns empty when nothing is blocked", () => {
    expect(
      buildOwnerAttentionQueue({
        isPlatformOperator: false,
        slaBreaches: 0,
        casesActionRequired: 0,
        pendingLeaveRequests: 0,
        payrollDraftThisMonth: 0,
        pendingPayrollApprovedAwaitingPayment: 0,
        expiringPermits7Days: 0,
        employeeDocsExpiring7Days: 0,
        pendingContracts: 0,
        overdueInvoiceCount: 0,
        overdueInvoiceTotalOmr: 0,
        renewalWorkflowsFailed: 0,
        draftQuotations: 0,
      }),
    ).toEqual([]);
  });
});
