import { describe, expect, it } from "vitest";
import { toWhatsAppPhoneDigits } from "./whatsappPhoneDigits";

describe("toWhatsAppPhoneDigits", () => {
  it("accepts +968 with spaces", () => {
    expect(toWhatsAppPhoneDigits("+968 9234 5678")).toBe("96892345678");
  });

  it("accepts 968 prefix without plus, with dashes", () => {
    expect(toWhatsAppPhoneDigits("968-9234-5678")).toBe("96892345678");
  });

  it("strips international trunk 00 before country code", () => {
    expect(toWhatsAppPhoneDigits("0096892345678")).toBe("96892345678");
  });

  it("prefixes 968 for 8-digit Oman national mobile", () => {
    expect(toWhatsAppPhoneDigits("92345678")).toBe("96892345678");
  });

  it("drops a single leading 0 on 9-digit pasted local (0 + 8 digits)", () => {
    expect(toWhatsAppPhoneDigits("092345678")).toBe("96892345678");
  });

  it("normalizes 9680 + 8 digits (legacy/pasted with extra 0 after 968)", () => {
    expect(toWhatsAppPhoneDigits("+968 0923 4567 8")).toBe("96892345678");
    expect(toWhatsAppPhoneDigits("968092345678")).toBe("96892345678");
  });

  it("tolerates mixed spaces and punctuation in imports", () => {
    expect(toWhatsAppPhoneDigits("(968) 9 234-56 78")).toBe("96892345678");
  });

  it("returns null for empty or non-digit-only after strip", () => {
    expect(toWhatsAppPhoneDigits("")).toBeNull();
    expect(toWhatsAppPhoneDigits("   ")).toBeNull();
    expect(toWhatsAppPhoneDigits("n/a")).toBeNull();
  });

  it("returns null when digit count is out of WhatsApp range", () => {
    expect(toWhatsAppPhoneDigits("968123456")).toBeNull();
  });
});
