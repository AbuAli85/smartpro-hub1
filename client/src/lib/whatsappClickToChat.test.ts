import { describe, expect, it } from "vitest";
import {
  buildSanadDirectoryOutreachBodyAr,
  buildWhatsAppMessageHref,
  buildWhatsAppMessageHrefFromRawPhone,
  isValidWhatsAppPhoneDigits,
} from "./whatsappClickToChat";

describe("isValidWhatsAppPhoneDigits", () => {
  it("accepts typical Oman mobile without plus", () => {
    expect(isValidWhatsAppPhoneDigits("96892345678")).toBe(true);
  });
  it("rejects empty and non-numeric", () => {
    expect(isValidWhatsAppPhoneDigits("")).toBe(false);
    expect(isValidWhatsAppPhoneDigits("   ")).toBe(false);
    expect(isValidWhatsAppPhoneDigits("968abc")).toBe(false);
  });
  it("rejects too short or too long", () => {
    expect(isValidWhatsAppPhoneDigits("968123456")).toBe(false);
    expect(isValidWhatsAppPhoneDigits("1".repeat(16))).toBe(false);
  });
});

describe("buildWhatsAppMessageHref", () => {
  it("encodes Arabic message for WhatsApp query string", () => {
    const href = buildWhatsAppMessageHref("96892345678", "مرحبا العربية");
    expect(href).not.toBeNull();
    const u = new URL(href!);
    expect(u.searchParams.get("phone")).toBe("96892345678");
    expect(u.searchParams.get("text")).toBe("مرحبا العربية");
  });

  it("returns null for invalid phone", () => {
    expect(buildWhatsAppMessageHref("", "text")).toBeNull();
    expect(buildWhatsAppMessageHref("123", "text")).toBeNull();
    expect(buildWhatsAppMessageHref("968abc", "text")).toBeNull();
  });

  it("returns null for empty message", () => {
    expect(buildWhatsAppMessageHref("96892345678", "")).toBeNull();
    expect(buildWhatsAppMessageHref("96892345678", "   ")).toBeNull();
  });
});

describe("buildWhatsAppMessageHrefFromRawPhone", () => {
  it("normalizes Oman 8-digit local to 968 and builds href", () => {
    const href = buildWhatsAppMessageHrefFromRawPhone("92345678", "Hello");
    expect(href).not.toBeNull();
    expect(new URL(href!).searchParams.get("phone")).toBe("96892345678");
  });
  it("returns null when raw phone cannot be normalized", () => {
    expect(buildWhatsAppMessageHrefFromRawPhone("", "Hi")).toBeNull();
  });
});

describe("buildSanadDirectoryOutreachBodyAr", () => {
  const join = "https://example.com/join?token=x";
  const survey = "https://example.com/survey?s=1";

  it("includes center block only when centerName is non-empty", () => {
    const withCenter = buildSanadDirectoryOutreachBodyAr("مركز آزال", join, survey);
    expect(withCenter).toContain("بيانات المركز المسجّلة لدينا:");
    expect(withCenter).toContain("مركز آزال");

    const noCenter = buildSanadDirectoryOutreachBodyAr("", join, survey);
    expect(noCenter).not.toContain("بيانات المركز المسجّلة لدينا:");
  });

  it("includes join block only when joinUrl is non-empty", () => {
    const onlySurvey = buildSanadDirectoryOutreachBodyAr("مركز", "", survey);
    expect(onlySurvey).not.toContain(join);
    expect(onlySurvey).toContain(survey);
    expect(onlySurvey).not.toContain("طلب الانضمام والتفعيل عبر الرابط التالي:");
    expect(onlySurvey).toContain("المشاركة في الاستبيان المختصر");
  });

  it("includes survey block only when surveyUrl is non-empty", () => {
    const onlyJoin = buildSanadDirectoryOutreachBodyAr("مركز", join, "");
    expect(onlyJoin).toContain(join);
    expect(onlyJoin).not.toContain(survey);
    expect(onlyJoin).not.toContain("المشاركة في الاستبيان المختصر");
    expect(onlyJoin).toContain("طلب الانضمام والتفعيل عبر الرابط التالي:");
  });

  it("uses link-options paragraph when at least one link exists", () => {
    const j = buildSanadDirectoryOutreachBodyAr("", join, "");
    expect(j).toContain("وذلك عبر أحد الخيارات التالية:");
    expect(j).not.toContain("أو بأي استفسار ذي صلة، عبر الرد المباشر على هذه الرسالة");
  });

  it("uses direct-reply paragraph when neither link exists", () => {
    const n = buildSanadDirectoryOutreachBodyAr("اسم", "", "");
    expect(n).toContain("أو بأي استفسار ذي صلة، عبر الرد المباشر على هذه الرسالة");
    expect(n).not.toContain("وذلك عبر أحد الخيارات التالية:");
  });

  it("full case: center + join + survey", () => {
    const m = buildSanadDirectoryOutreachBodyAr("مركز تجريبي", join, survey);
    expect(m).toContain("مركز تجريبي");
    expect(m).toContain(join);
    expect(m).toContain(survey);
    expect(m).toContain("«المندوب الذكي»");
    expect(m).toContain("يرجى العلم بأن هذا التواصل");
  });

  it("trims whitespace-only inputs as absent", () => {
    const m = buildSanadDirectoryOutreachBodyAr("   ", "  ", "\t");
    expect(m).not.toContain("بيانات المركز المسجّلة لدينا:");
    expect(m).toContain("عبر الرد المباشر على هذه الرسالة");
  });

  it("does not produce triple blank lines between sections", () => {
    const m = buildSanadDirectoryOutreachBodyAr("A", join, survey);
    expect(m).not.toMatch(/\n\n\n\n/);
  });
});
