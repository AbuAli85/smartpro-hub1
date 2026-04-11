import { describe, expect, it } from "vitest";
import {
  formatProfileRequestAge,
  parseProfileRequestIdFromSearch,
} from "./profileChangeRequestDeepLink";

describe("parseProfileRequestIdFromSearch", () => {
  it("returns null for empty", () => {
    expect(parseProfileRequestIdFromSearch("")).toBeNull();
    expect(parseProfileRequestIdFromSearch("?")).toBeNull();
  });

  it("parses profileRequest from query string with or without leading ?", () => {
    expect(parseProfileRequestIdFromSearch("?profileRequest=42")).toBe(42);
    expect(parseProfileRequestIdFromSearch("profileRequest=7&other=1")).toBe(7);
  });

  it("returns null for invalid id", () => {
    expect(parseProfileRequestIdFromSearch("?profileRequest=abc")).toBeNull();
    expect(parseProfileRequestIdFromSearch("?profileRequest=0")).toBeNull();
  });
});

describe("formatProfileRequestAge", () => {
  it("shows <1h for very recent", () => {
    const d = new Date(Date.now() - 30 * 60 * 1000);
    expect(formatProfileRequestAge(d)).toBe("<1h");
  });

  it("shows hours under 48h", () => {
    const d = new Date(Date.now() - 5 * 3600000);
    expect(formatProfileRequestAge(d)).toBe("5h");
  });

  it("shows days for older", () => {
    const d = new Date(Date.now() - 5 * 24 * 3600000);
    expect(formatProfileRequestAge(d)).toBe("5d");
  });
});
