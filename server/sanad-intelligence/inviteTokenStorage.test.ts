import { describe, expect, it } from "vitest";
import {
  deriveInviteTokenStorageValue,
  inviteTokenStoredLooksHashedAtRest,
  SANAD_INVITE_TOKEN_STORAGE_PREFIX,
} from "./activation";

describe("SANAD invite token at-rest storage", () => {
  it("stores v2-prefixed SHA-256 hex of the URL token", () => {
    const raw = "a".repeat(32);
    const stored = deriveInviteTokenStorageValue(raw);
    expect(stored.startsWith(SANAD_INVITE_TOKEN_STORAGE_PREFIX)).toBe(true);
    expect(stored.length).toBe(SANAD_INVITE_TOKEN_STORAGE_PREFIX.length + 64);
    expect(stored).toMatch(/^v2:[a-f0-9]{64}$/);
  });

  it("is stable for the same plaintext", () => {
    expect(deriveInviteTokenStorageValue("tok-1")).toBe(deriveInviteTokenStorageValue("tok-1"));
  });

  it("detects hashed-at-rest rows", () => {
    expect(inviteTokenStoredLooksHashedAtRest("v2:ab")).toBe(true);
    expect(inviteTokenStoredLooksHashedAtRest("plain-legacy")).toBe(false);
    expect(inviteTokenStoredLooksHashedAtRest(null)).toBe(false);
  });
});
