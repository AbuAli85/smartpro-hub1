import { describe, expect, it } from "vitest";
import { sanitizeRelativeAppPath } from "./sanitizeRelativeAppPath";

describe("sanitizeRelativeAppPath", () => {
  it("allows normal relative paths", () => {
    expect(sanitizeRelativeAppPath("/invite/abc")).toBe("/invite/abc");
    expect(sanitizeRelativeAppPath("/client/company/create")).toBe("/client/company/create");
  });

  it("replaces protocol-relative and absolute tricks with root", () => {
    expect(sanitizeRelativeAppPath("//evil.example")).toBe("/");
    expect(sanitizeRelativeAppPath("https://evil.example")).toBe("/");
    expect(sanitizeRelativeAppPath("/\\evil")).toBe("/");
  });

  it("rejects backslash path tricks", () => {
    expect(sanitizeRelativeAppPath("/foo\\bar")).toBe("/");
  });
});
