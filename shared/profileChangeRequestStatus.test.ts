import { describe, expect, it } from "vitest";
import {
  canCloseProfileChangeRequest,
  isTerminalProfileChangeStatus,
} from "./profileChangeRequestStatus";

describe("profileChangeRequestStatus", () => {
  it("isTerminalProfileChangeStatus", () => {
    expect(isTerminalProfileChangeStatus("pending")).toBe(false);
    expect(isTerminalProfileChangeStatus("resolved")).toBe(true);
    expect(isTerminalProfileChangeStatus("rejected")).toBe(true);
  });

  it("canCloseProfileChangeRequest only when pending", () => {
    expect(canCloseProfileChangeRequest("pending")).toBe(true);
    expect(canCloseProfileChangeRequest("resolved")).toBe(false);
    expect(canCloseProfileChangeRequest("rejected")).toBe(false);
  });
});
