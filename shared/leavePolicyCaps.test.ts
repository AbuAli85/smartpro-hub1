import { describe, expect, it } from "vitest";
import { mergeLeavePolicyCaps } from "./leavePolicyCaps";
import { OMAN_LEAVE_PORTAL_DEFAULTS } from "./omanLeavePolicyDefaults";

describe("mergeLeavePolicyCaps", () => {
  it("uses Oman defaults when null or undefined", () => {
    expect(mergeLeavePolicyCaps(null)).toEqual({ ...OMAN_LEAVE_PORTAL_DEFAULTS });
    expect(mergeLeavePolicyCaps(undefined)).toEqual({ ...OMAN_LEAVE_PORTAL_DEFAULTS });
  });

  it("merges partial overrides", () => {
    expect(mergeLeavePolicyCaps({ sick: 10 })).toEqual({
      annual: OMAN_LEAVE_PORTAL_DEFAULTS.annual,
      sick: 10,
      emergency: OMAN_LEAVE_PORTAL_DEFAULTS.emergency,
    });
  });
});
