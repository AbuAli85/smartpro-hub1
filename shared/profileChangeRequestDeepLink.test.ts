import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatProfileRequestAge,
  parseProfileRequestIdFromSearch,
  previewProfileRequestValue,
  scheduleScrollToProfileChangeRequest,
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

describe("previewProfileRequestValue", () => {
  it("returns short strings unchanged", () => {
    expect(previewProfileRequestValue("hello")).toBe("hello");
  });

  it("truncates with ellipsis", () => {
    const long = "a".repeat(100);
    const out = previewProfileRequestValue(long, 10);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(10);
  });
});

describe("scheduleScrollToProfileChangeRequest", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("scrolls when element exists", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    el.id = "profile-change-request-9";
    const scrollIntoView = vi.fn();
    el.scrollIntoView = scrollIntoView;
    document.body.appendChild(el);

    scheduleScrollToProfileChangeRequest(9, { maxAttempts: 2 });
    vi.runAllTimers();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("retries until element appears", () => {
    vi.useFakeTimers();
    scheduleScrollToProfileChangeRequest(3, { maxAttempts: 10 });

    vi.advanceTimersByTime(150);
    const el = document.createElement("div");
    el.id = "profile-change-request-3";
    const scrollIntoView = vi.fn();
    el.scrollIntoView = scrollIntoView;
    document.body.appendChild(el);

    vi.runAllTimers();
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
