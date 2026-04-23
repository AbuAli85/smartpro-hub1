import { describe, expect, it } from "vitest";
import type { employeeSchedules } from "../../drizzle/schema";
import { countExpectedWorkdaysInMonth } from "./payrollExecuteMonthly";

describe("countExpectedWorkdaysInMonth (Muscat weekday)", () => {
  it("counts weekdays in April 2026 excluding holidays for a Mon–Fri schedule", () => {
    const schedules = [
      {
        id: 1,
        companyId: 1,
        employeeUserId: 10,
        isActive: true,
        startDate: "2020-01-01",
        endDate: null as string | null,
        workingDays: "1,2,3,4,5",
        shiftTemplateId: 1,
        siteId: null,
      },
    ] as unknown as (typeof employeeSchedules.$inferSelect)[];
    const holidays = new Set<string>(["2026-04-06"]);
    const n = countExpectedWorkdaysInMonth({ userId: 10, hireDate: null }, schedules, holidays, 2026, 4);
    expect(n).toBeGreaterThan(15);
    expect(n).toBeLessThanOrEqual(22);
  });
});
