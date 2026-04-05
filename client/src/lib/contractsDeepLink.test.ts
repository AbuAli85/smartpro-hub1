import { describe, expect, it } from "vitest";
import { isContractHiddenByFilters, parseContractIdFromSearch } from "./contractsDeepLink";

describe("parseContractIdFromSearch", () => {
  it("parses ?id= from search string with or without leading ?", () => {
    expect(parseContractIdFromSearch("?id=42")).toBe(42);
    expect(parseContractIdFromSearch("id=42")).toBe(42);
    expect(parseContractIdFromSearch("?tab=1&id=7&x=y")).toBe(7);
  });

  it("returns null for missing, invalid, or non-positive id", () => {
    expect(parseContractIdFromSearch("")).toBeNull();
    expect(parseContractIdFromSearch("?foo=1")).toBeNull();
    expect(parseContractIdFromSearch("?id=0")).toBeNull();
    expect(parseContractIdFromSearch("?id=-3")).toBeNull();
    expect(parseContractIdFromSearch("?id=abc")).toBeNull();
  });
});

describe("isContractHiddenByFilters", () => {
  const contracts = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it("is false when lists are empty or contract is absent", () => {
    expect(isContractHiddenByFilters(2, undefined, [{ id: 2 }])).toBe(false);
    expect(isContractHiddenByFilters(2, [], [{ id: 2 }])).toBe(false);
    expect(isContractHiddenByFilters(99, contracts, contracts)).toBe(false);
  });

  it("is false when contract appears in filtered list", () => {
    expect(isContractHiddenByFilters(2, contracts, [{ id: 2 }])).toBe(false);
    expect(isContractHiddenByFilters(2, contracts, contracts)).toBe(false);
  });

  it("is true when contract exists in full list but not in filtered list", () => {
    expect(isContractHiddenByFilters(2, contracts, [{ id: 1 }, { id: 3 }])).toBe(true);
    expect(isContractHiddenByFilters(2, contracts, [])).toBe(true);
  });
});
