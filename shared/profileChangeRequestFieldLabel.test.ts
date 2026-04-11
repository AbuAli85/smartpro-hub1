import { describe, expect, it } from "vitest";
import { normalizeProfileFieldLabelForKey } from "./profileChangeRequestFieldLabel";

describe("normalizeProfileFieldLabelForKey", () => {
  it("trims and lowercases for stable comparison", () => {
    expect(normalizeProfileFieldLabelForKey("  Legal Name ")).toBe("legal name");
    expect(normalizeProfileFieldLabelForKey("PHONE")).toBe("phone");
  });
});
