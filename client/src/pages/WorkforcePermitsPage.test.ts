import { describe, expect, it } from "vitest";
import { parsePermitFiltersFromSearch } from "./WorkforcePermitsPage";

describe("parsePermitFiltersFromSearch", () => {
  it("keeps default filters when no status query is provided", () => {
    expect(parsePermitFiltersFromSearch("")).toEqual({
      statusFilter: "all",
      expiringFilter: "all",
    });
  });

  it("maps status=expired to expired status filter", () => {
    expect(parsePermitFiltersFromSearch("?status=expired")).toEqual({
      statusFilter: "expired",
      expiringFilter: "all",
    });
  });

  it("maps status=expiring_soon to expiring_soon status filter", () => {
    expect(parsePermitFiltersFromSearch("?status=expiring_soon")).toEqual({
      statusFilter: "expiring_soon",
      expiringFilter: "all",
    });
  });

  it("maps status=at_risk to expiring window filter", () => {
    expect(parsePermitFiltersFromSearch("?status=at_risk")).toEqual({
      statusFilter: "all",
      expiringFilter: "30",
    });
  });
});
