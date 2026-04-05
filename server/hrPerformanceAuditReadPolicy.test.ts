import { describe, expect, it, vi, afterEach } from "vitest";
import * as db from "./db";
import {
  canReadHrPerformanceAuditSensitiveRows,
  isHrPerformanceSensitiveEntityType,
} from "./hrPerformanceAuditReadPolicy";

describe("hrPerformanceAuditReadPolicy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("isHrPerformanceSensitiveEntityType matches HR Performance audit entity types", () => {
    expect(isHrPerformanceSensitiveEntityType("kpi_target")).toBe(true);
    expect(isHrPerformanceSensitiveEntityType("training_record")).toBe(true);
    expect(isHrPerformanceSensitiveEntityType("self_review")).toBe(true);
    expect(isHrPerformanceSensitiveEntityType("work_permit")).toBe(false);
    expect(isHrPerformanceSensitiveEntityType("government_case")).toBe(false);
  });

  it("canReadHrPerformanceAuditSensitiveRows is false for company_member with no HR permissions", async () => {
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([{ role: "company_member", permissions: [] }])),
          })),
        })),
      })),
    };
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const ok = await canReadHrPerformanceAuditSensitiveRows(
      { id: 1, role: "user", platformRole: null },
      10
    );
    expect(ok).toBe(false);
  });

  it("canReadHrPerformanceAuditSensitiveRows is true for platform-global admin without consulting membership", async () => {
    const getDbSpy = vi.spyOn(db, "getDb").mockResolvedValue(null);

    const ok = await canReadHrPerformanceAuditSensitiveRows(
      { id: 1, role: "user", platformRole: "super_admin" },
      10
    );
    expect(ok).toBe(true);
    expect(getDbSpy).not.toHaveBeenCalled();
  });

  it("canReadHrPerformanceAuditSensitiveRows is true when member has hr.targets.read", async () => {
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() =>
              Promise.resolve([{ role: "company_member", permissions: ["hr.targets.read"] }])
            ),
          })),
        })),
      })),
    };
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const ok = await canReadHrPerformanceAuditSensitiveRows(
      { id: 1, role: "user", platformRole: null },
      10
    );
    expect(ok).toBe(true);
  });
});
