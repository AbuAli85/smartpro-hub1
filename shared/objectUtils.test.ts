import { describe, expect, it } from "vitest";
import { omitUndefined } from "./objectUtils";

describe("omitUndefined", () => {
  it("removes undefined keys", () => {
    expect(omitUndefined({ a: 1, b: undefined, c: "" })).toEqual({ a: 1, c: "" });
  });

  it("keeps null", () => {
    expect(omitUndefined({ x: null as string | null })).toEqual({ x: null });
  });

  it("keeps false and zero for patch semantics", () => {
    expect(omitUndefined({ a: false, b: 0, c: undefined })).toEqual({ a: false, b: 0 });
  });
});
