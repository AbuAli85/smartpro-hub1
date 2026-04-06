import { describe, it, expect } from "vitest";
import { partyAndCompanyNamesLooselyMatch } from "./party.repository";

describe("partyAndCompanyNamesLooselyMatch", () => {
  it("matches identical normalized names", () => {
    expect(partyAndCompanyNamesLooselyMatch("Acme Trading LLC", "Acme Trading LLC")).toBe(true);
  });

  it("matches when one string contains the other (after strip)", () => {
    expect(partyAndCompanyNamesLooselyMatch("Acme Trading", "Acme Trading LLC")).toBe(true);
  });

  it("returns false for very short strings", () => {
    expect(partyAndCompanyNamesLooselyMatch("AB", "XY")).toBe(false);
  });

  it("returns false for clearly different entities", () => {
    expect(partyAndCompanyNamesLooselyMatch("Globex Corporation", "Initech LLC")).toBe(false);
  });
});
