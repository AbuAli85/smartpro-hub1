import { describe, expect, it } from "vitest";
import { sanitizeLetterHtml } from "./sanitizeLetterHtml";

describe("sanitizeLetterHtml", () => {
  it("strips script tags", () => {
    const dirty = `<p>Hello</p><script>alert(1)</script>`;
    expect(sanitizeLetterHtml(dirty)).toBe("<p>Hello</p>");
  });

  it("allows basic formatting tags", () => {
    const html = `<p>Dear <strong>User</strong>,</p><br><p>Regards.</p>`;
    expect(sanitizeLetterHtml(html)).toContain("<strong>User</strong>");
  });

  it("returns null for null input", () => {
    expect(sanitizeLetterHtml(null)).toBeNull();
  });
});
