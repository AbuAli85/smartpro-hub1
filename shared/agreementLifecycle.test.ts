import { describe, it, expect } from "vitest";
import {
  mergeLifecycleMetadata,
  parseOutsourcingContractLifecycleMetadata,
} from "./agreementLifecycle";

describe("parseOutsourcingContractLifecycleMetadata", () => {
  it("returns empty object for null", () => {
    expect(parseOutsourcingContractLifecycleMetadata(null)).toEqual({});
  });

  it("reads known keys", () => {
    expect(
      parseOutsourcingContractLifecycleMetadata({
        lifecycleKind: "amendment",
        amendsContractId: "uuid-1",
        rootContractId: "uuid-0",
      })
    ).toEqual({
      lifecycleKind: "amendment",
      amendsContractId: "uuid-1",
      rootContractId: "uuid-0",
      renewedFromContractId: undefined,
    });
  });
});

describe("mergeLifecycleMetadata", () => {
  it("shallow-merges lifecycle fields", () => {
    const out = mergeLifecycleMetadata({ foo: 1 }, { lifecycleKind: "renewal", renewedFromContractId: "x" });
    expect(out).toEqual({ foo: 1, lifecycleKind: "renewal", renewedFromContractId: "x" });
  });
});
