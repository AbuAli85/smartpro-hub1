/**
 * Phase 12E + 12F: Attendance invoice state machine tests.
 *
 * Tests:
 *  1.  All valid edges pass isAllowedAttendanceInvoiceTransition
 *  2.  Invalid edges return false
 *  3.  paid is a terminal state (no allowed transitions)
 *  4.  cancelled is a terminal state (no allowed transitions)
 *  5.  assertAttendanceInvoiceTransition throws on invalid transition
 *  6.  assertAttendanceInvoiceTransition does not throw on valid transition
 *  7.  canIssueAttendanceInvoice returns true only for draft/review_ready
 *  8.  canCancelAttendanceInvoice returns true only for draft/review_ready
 *  9.  canVoidAttendanceInvoice returns true only for issued/sent
 * 10.  canRecordAttendanceInvoicePayment returns true only for issued/sent (Phase 12F)
 */

import { describe, expect, it } from "vitest";
import {
  isAllowedAttendanceInvoiceTransition,
  assertAttendanceInvoiceTransition,
  canIssueAttendanceInvoice,
  canCancelAttendanceInvoice,
  canVoidAttendanceInvoice,
  canRecordAttendanceInvoicePayment,
  type AttendanceInvoiceStatus,
} from "./attendanceInvoiceStateMachine";

describe("isAllowedAttendanceInvoiceTransition — valid edges", () => {
  const validEdges: [AttendanceInvoiceStatus, AttendanceInvoiceStatus][] = [
    ["draft", "review_ready"],
    ["draft", "issued"],
    ["draft", "cancelled"],
    ["review_ready", "issued"],
    ["review_ready", "cancelled"],
    ["issued", "sent"],
    ["issued", "paid"],
    ["issued", "cancelled"],
    ["sent", "paid"],
    ["sent", "cancelled"],
  ];

  for (const [from, to] of validEdges) {
    it(`allows ${from} → ${to}`, () => {
      expect(isAllowedAttendanceInvoiceTransition(from, to)).toBe(true);
    });
  }
});

describe("isAllowedAttendanceInvoiceTransition — invalid edges", () => {
  const invalidEdges: [AttendanceInvoiceStatus, AttendanceInvoiceStatus][] = [
    ["draft", "paid"],
    ["draft", "sent"],
    ["review_ready", "draft"],
    ["review_ready", "paid"],
    ["review_ready", "sent"],
    ["issued", "draft"],
    ["issued", "review_ready"],
    ["sent", "draft"],
    ["sent", "review_ready"],
    ["sent", "issued"],
    ["paid", "draft"],
    ["paid", "review_ready"],
    ["paid", "issued"],
    ["paid", "sent"],
    ["paid", "cancelled"],
    ["cancelled", "draft"],
    ["cancelled", "review_ready"],
    ["cancelled", "issued"],
    ["cancelled", "sent"],
    ["cancelled", "paid"],
  ];

  for (const [from, to] of invalidEdges) {
    it(`rejects ${from} → ${to}`, () => {
      expect(isAllowedAttendanceInvoiceTransition(from, to)).toBe(false);
    });
  }
});

describe("terminal states", () => {
  const statuses: AttendanceInvoiceStatus[] = ["draft", "review_ready", "issued", "sent", "paid", "cancelled"];

  it("paid has no allowed outgoing transitions", () => {
    const allowed = statuses.filter((s) => isAllowedAttendanceInvoiceTransition("paid", s));
    expect(allowed).toHaveLength(0);
  });

  it("cancelled has no allowed outgoing transitions", () => {
    const allowed = statuses.filter((s) => isAllowedAttendanceInvoiceTransition("cancelled", s));
    expect(allowed).toHaveLength(0);
  });
});

describe("assertAttendanceInvoiceTransition", () => {
  it("does not throw on a valid transition", () => {
    expect(() => assertAttendanceInvoiceTransition("draft", "issued")).not.toThrow();
    expect(() => assertAttendanceInvoiceTransition("review_ready", "issued")).not.toThrow();
    expect(() => assertAttendanceInvoiceTransition("issued", "cancelled")).not.toThrow();
  });

  it("throws on an invalid transition with a descriptive message", () => {
    expect(() => assertAttendanceInvoiceTransition("paid", "cancelled")).toThrow(
      /invalid attendance invoice transition/i,
    );
    expect(() => assertAttendanceInvoiceTransition("draft", "paid")).toThrow(
      /draft.*paid/i,
    );
  });
});

describe("canIssueAttendanceInvoice", () => {
  it("returns true for draft", () => expect(canIssueAttendanceInvoice("draft")).toBe(true));
  it("returns true for review_ready", () => expect(canIssueAttendanceInvoice("review_ready")).toBe(true));
  it("returns false for issued", () => expect(canIssueAttendanceInvoice("issued")).toBe(false));
  it("returns false for sent", () => expect(canIssueAttendanceInvoice("sent")).toBe(false));
  it("returns false for paid", () => expect(canIssueAttendanceInvoice("paid")).toBe(false));
  it("returns false for cancelled", () => expect(canIssueAttendanceInvoice("cancelled")).toBe(false));
});

describe("canCancelAttendanceInvoice", () => {
  it("returns true for draft", () => expect(canCancelAttendanceInvoice("draft")).toBe(true));
  it("returns true for review_ready", () => expect(canCancelAttendanceInvoice("review_ready")).toBe(true));
  it("returns false for issued", () => expect(canCancelAttendanceInvoice("issued")).toBe(false));
  it("returns false for sent", () => expect(canCancelAttendanceInvoice("sent")).toBe(false));
  it("returns false for paid", () => expect(canCancelAttendanceInvoice("paid")).toBe(false));
  it("returns false for cancelled", () => expect(canCancelAttendanceInvoice("cancelled")).toBe(false));
});

describe("canVoidAttendanceInvoice", () => {
  it("returns true for issued", () => expect(canVoidAttendanceInvoice("issued")).toBe(true));
  it("returns true for sent", () => expect(canVoidAttendanceInvoice("sent")).toBe(true));
  it("returns false for draft", () => expect(canVoidAttendanceInvoice("draft")).toBe(false));
  it("returns false for review_ready", () => expect(canVoidAttendanceInvoice("review_ready")).toBe(false));
  it("returns false for paid", () => expect(canVoidAttendanceInvoice("paid")).toBe(false));
  it("returns false for cancelled", () => expect(canVoidAttendanceInvoice("cancelled")).toBe(false));
});

describe("canRecordAttendanceInvoicePayment — Phase 12F", () => {
  it("returns true for issued", () => expect(canRecordAttendanceInvoicePayment("issued")).toBe(true));
  it("returns true for sent", () => expect(canRecordAttendanceInvoicePayment("sent")).toBe(true));
  it("returns false for draft", () => expect(canRecordAttendanceInvoicePayment("draft")).toBe(false));
  it("returns false for review_ready", () => expect(canRecordAttendanceInvoicePayment("review_ready")).toBe(false));
  it("returns false for paid", () => expect(canRecordAttendanceInvoicePayment("paid")).toBe(false));
  it("returns false for cancelled", () => expect(canRecordAttendanceInvoicePayment("cancelled")).toBe(false));
});
