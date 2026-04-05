import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  assertKpiTargetRowEditableForMetrics,
  assertKpiTargetStatusTransition,
} from "./kpiTargetGuards";

describe("kpiTargetGuards", () => {
  it("allows draft → active and draft → cancelled", () => {
    expect(() => assertKpiTargetStatusTransition("draft", "active")).not.toThrow();
    expect(() => assertKpiTargetStatusTransition("draft", "cancelled")).not.toThrow();
  });

  it("rejects draft → completed", () => {
    expect(() => assertKpiTargetStatusTransition("draft", "completed")).toThrow(TRPCError);
  });

  it("allows active → completed, archived, cancelled", () => {
    expect(() => assertKpiTargetStatusTransition("active", "completed")).not.toThrow();
    expect(() => assertKpiTargetStatusTransition("active", "archived")).not.toThrow();
    expect(() => assertKpiTargetStatusTransition("active", "cancelled")).not.toThrow();
  });

  it("rejects cancelled → anything", () => {
    expect(() => assertKpiTargetStatusTransition("cancelled", "active")).toThrow(TRPCError);
  });

  it("assertKpiTargetRowEditableForMetrics allows draft and active only", () => {
    expect(() => assertKpiTargetRowEditableForMetrics("draft")).not.toThrow();
    expect(() => assertKpiTargetRowEditableForMetrics("active")).not.toThrow();
    expect(() => assertKpiTargetRowEditableForMetrics("completed")).toThrow(TRPCError);
  });
});
