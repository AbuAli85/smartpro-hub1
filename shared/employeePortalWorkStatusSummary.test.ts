import { describe, expect, it } from "vitest";
import { buildEmployeeWorkStatusSummary } from "./employeePortalWorkStatusSummary";

/** Fixed “today” for stable assertions (UTC noon). */
const REF = new Date("2026-04-05T12:00:00.000Z");

describe("buildEmployeeWorkStatusSummary", () => {
  it("all green: Omani national, valid documents, no open tasks", () => {
    const s = buildEmployeeWorkStatusSummary({
      nationality: "Omani",
      permit: null,
      documents: [{ expiresAt: "2027-06-01" }],
      tasks: [{ status: "completed", dueDate: null }],
      referenceDate: REF,
    });
    expect(s.overallStatus).toBe("on_track");
    expect(s.permit.status).toBe("not_applicable");
    expect(s.documents.status).toBe("valid");
    expect(s.tasks.openCount).toBe(0);
    expect(s.primaryAction.type).toBe("none");
    expect(s.secondaryAction).toBeUndefined();
  });

  it("treats Omani as not_applicable even when a permit row exists", () => {
    const s = buildEmployeeWorkStatusSummary({
      nationality: "omani",
      permit: { permitStatus: "active", expiryDate: "2027-01-01" },
      documents: [{ expiresAt: "2027-06-01" }],
      tasks: [],
      referenceDate: REF,
    });
    expect(s.permit.status).toBe("not_applicable");
  });

  it("non-Omani: work permit expiring within 30 days", () => {
    const s = buildEmployeeWorkStatusSummary({
      nationality: "Indian",
      permit: { permitStatus: "active", expiryDate: "2026-04-17" },
      documents: [{ expiresAt: "2027-06-01" }],
      tasks: [],
      referenceDate: REF,
    });
    expect(s.permit.status).toBe("expiring_soon");
    expect(s.overallStatus).toBe("needs_attention");
    expect(s.primaryAction.type).toBe("contact_hr");
  });

  it("expired document takes urgent and primary open_documents", () => {
    const s = buildEmployeeWorkStatusSummary({
      nationality: "Indian",
      permit: { permitStatus: "active", expiryDate: "2027-06-01" },
      documents: [{ expiresAt: "2026-03-01" }],
      tasks: [],
      referenceDate: REF,
    });
    expect(s.documents.status).toBe("expired");
    expect(s.overallStatus).toBe("urgent");
    expect(s.primaryAction).toEqual(
      expect.objectContaining({ type: "open_documents", tab: "documents" }),
    );
  });

  it("overdue open task is urgent and primary open_tasks", () => {
    const s = buildEmployeeWorkStatusSummary({
      nationality: "Indian",
      permit: { permitStatus: "active", expiryDate: "2027-06-01" },
      documents: [{ expiresAt: "2027-06-01" }],
      tasks: [{ status: "pending", dueDate: "2026-04-03" }],
      referenceDate: REF,
    });
    expect(s.tasks.overdueCount).toBe(1);
    expect(s.overallStatus).toBe("urgent");
    expect(s.primaryAction).toEqual(expect.objectContaining({ type: "open_tasks", tab: "tasks" }));
  });

  it("expired document beats overdue task for primary CTA", () => {
    const s = buildEmployeeWorkStatusSummary({
      nationality: "Indian",
      permit: { permitStatus: "active", expiryDate: "2027-06-01" },
      documents: [{ expiresAt: "2026-03-01" }],
      tasks: [{ status: "pending", dueDate: "2026-04-03" }],
      referenceDate: REF,
    });
    expect(s.primaryAction.type).toBe("open_documents");
    expect(s.overallStatus).toBe("urgent");
  });

  it("overdue tasks plus expiring documents: primary open_tasks and secondary Contact HR", () => {
    const s = buildEmployeeWorkStatusSummary({
      nationality: "Indian",
      permit: { permitStatus: "active", expiryDate: "2027-06-01" },
      documents: [{ expiresAt: "2026-06-01" }],
      tasks: [{ status: "pending", dueDate: "2026-04-03" }],
      referenceDate: REF,
    });
    expect(s.documents.status).toBe("expiring_soon");
    expect(s.primaryAction.type).toBe("open_tasks");
    expect(s.secondaryAction).toEqual({ type: "contact_hr", label: "Contact HR" });
  });

  it("no documents on file: missing document state and needs_attention", () => {
    const s = buildEmployeeWorkStatusSummary({
      nationality: "Indian",
      permit: { permitStatus: "active", expiryDate: "2027-06-01" },
      documents: [],
      tasks: [],
      referenceDate: REF,
    });
    expect(s.documents.status).toBe("missing");
    expect(s.overallStatus).toBe("needs_attention");
    expect(s.primaryAction.tab).toBe("documents");
  });

  it("non-Omani without permit row: missing permit", () => {
    const s = buildEmployeeWorkStatusSummary({
      nationality: "Nepalese",
      permit: null,
      documents: [{ expiresAt: "2027-06-01" }],
      tasks: [],
      referenceDate: REF,
    });
    expect(s.permit.status).toBe("missing");
    expect(s.overallStatus).toBe("needs_attention");
  });

  it("nextDueAt is earliest future due among open tasks", () => {
    const s = buildEmployeeWorkStatusSummary({
      nationality: "Indian",
      permit: { permitStatus: "active", expiryDate: "2027-06-01" },
      documents: [{ expiresAt: "2027-06-01" }],
      tasks: [
        { status: "pending", dueDate: "2026-06-15" },
        { status: "pending", dueDate: "2026-05-10" },
        { status: "pending", dueDate: "2026-04-10" },
      ],
      referenceDate: REF,
    });
    expect(s.tasks.nextDueAt).toBe(new Date("2026-04-10T00:00:00.000Z").toISOString());
  });
});
