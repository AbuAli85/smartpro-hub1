import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as db from "../db";
import * as overdueSvc from "../overdueCheckoutIssues.service";
import { runEnsureOverdueCheckoutIssuesJob } from "./ensureOverdueCheckoutIssuesJob";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../overdueCheckoutIssues.service", () => ({
  computeAndEnsureOverdueCheckoutIssues: vi.fn(),
}));

describe("runEnsureOverdueCheckoutIssuesJob", () => {
  beforeEach(() => {
    vi.mocked(overdueSvc.computeAndEnsureOverdueCheckoutIssues).mockResolvedValue({
      date: "2026-04-23",
      overdueEmployees: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns early when DB unavailable", async () => {
    vi.mocked(db.getDb).mockResolvedValue(null as never);
    const r = await runEnsureOverdueCheckoutIssuesJob();
    expect(r).toEqual({ companiesScanned: 0, errors: 0 });
    expect(overdueSvc.computeAndEnsureOverdueCheckoutIssues).not.toHaveBeenCalled();
  });

  it("invokes overdue sync once per active company", async () => {
    const where = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    vi.mocked(db.getDb).mockResolvedValue({ select } as never);

    const r = await runEnsureOverdueCheckoutIssuesJob();
    expect(r.companiesScanned).toBe(3);
    expect(r.errors).toBe(0);
    expect(overdueSvc.computeAndEnsureOverdueCheckoutIssues).toHaveBeenCalledTimes(3);
  });
});
