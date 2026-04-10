import { describe, expect, it } from "vitest";
import { buildUnifiedEmployeeRequests, isOnApprovedLeaveToday, summarizeRequestsForHome } from "./employeeRequestsPresentation";

describe("buildUnifiedEmployeeRequests", () => {
  it("maps leave, shift, correction, and expense rows with unified status labels", () => {
    const rows = buildUnifiedEmployeeRequests({
      leave: [
        {
          id: 1,
          leaveType: "annual",
          status: "pending",
          startDate: "2026-05-01",
          endDate: "2026-05-03",
          createdAt: "2026-04-01T10:00:00Z",
        },
      ],
      shiftRequests: [
        {
          id: 2,
          request: {
            type: "time_off",
            status: "approved",
            startDate: "2026-06-01",
            reason: "Trip",
            createdAt: "2026-04-02T10:00:00Z",
          },
        },
      ],
      corrections: [{ id: 3, status: "pending", requestedDate: "2026-04-05", reason: "Wrong time", createdAt: "2026-04-03" }],
      expenses: [
        {
          id: 4,
          expenseStatus: "rejected",
          expenseDate: "2026-04-04",
          description: "Taxi",
          amount: 12,
          createdAt: "2026-04-04",
        },
      ],
    });
    expect(rows.find((r) => r.id === "leave-1")?.status).toBe("pending");
    expect(rows.find((r) => r.id === "shift-2")?.status).toBe("approved");
    expect(rows.find((r) => r.id === "corr-3")?.kind).toBe("attendance_correction");
    expect(rows.find((r) => r.id === "exp-4")?.status).toBe("rejected");
  });
});

describe("summarizeRequestsForHome", () => {
  it("counts pending-like rows and surfaces latest by submittedAt order", () => {
    const rows = buildUnifiedEmployeeRequests({
      leave: [{ id: 1, leaveType: "sick", status: "pending", startDate: "2026-05-01" }],
      shiftRequests: [],
      corrections: [],
      expenses: [],
    });
    const s = summarizeRequestsForHome(rows);
    expect(s.pendingCount).toBe(1);
    expect(s.latestLine).toContain("Pending");
    expect(s.topPendingTitle).toBeTruthy();
  });
});

describe("isOnApprovedLeaveToday", () => {
  it("returns true when approved leave spans the given calendar day", () => {
    const d = new Date(2026, 3, 10);
    const ok = isOnApprovedLeaveToday(
      [{ status: "approved", startDate: "2026-04-08", endDate: "2026-04-12" }],
      d,
    );
    expect(ok).toBe(true);
  });

  it("returns false when only pending", () => {
    const d = new Date(2026, 3, 10);
    const ok = isOnApprovedLeaveToday([{ status: "pending", startDate: "2026-04-10", endDate: "2026-04-10" }], d);
    expect(ok).toBe(false);
  });
});
