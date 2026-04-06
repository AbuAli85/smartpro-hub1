import { describe, it, expect } from "vitest";
import { activeCompanyInvolvedInContract } from "./contractAccess";

describe("activeCompanyInvolvedInContract", () => {
  it("matches header companyId when set", () => {
    expect(
      activeCompanyInvolvedInContract(10, { companyId: 10 }, [], undefined)
    ).toBe(true);
  });

  it("matches when header companyId is null but first_party party has company", () => {
    expect(
      activeCompanyInvolvedInContract(
        10,
        { companyId: null },
        [{ companyId: 10 }, { companyId: 20 }],
        undefined
      )
    ).toBe(true);
  });

  it("matches second_party company id", () => {
    expect(
      activeCompanyInvolvedInContract(
        20,
        { companyId: null },
        [{ companyId: 10 }, { companyId: 20 }],
        undefined
      )
    ).toBe(true);
  });

  it("matches promoter employer company", () => {
    expect(
      activeCompanyInvolvedInContract(30, { companyId: null }, [{ companyId: 10 }], 30)
    ).toBe(true);
  });

  it("returns false for unrelated tenant", () => {
    expect(
      activeCompanyInvolvedInContract(
        99,
        { companyId: 10 },
        [{ companyId: 20 }],
        30
      )
    ).toBe(false);
  });

  it("ignores null party company ids", () => {
    expect(
      activeCompanyInvolvedInContract(99, { companyId: null }, [{ companyId: null }], undefined)
    ).toBe(false);
  });
});
