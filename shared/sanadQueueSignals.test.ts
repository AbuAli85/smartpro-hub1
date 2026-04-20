import { describe, expect, it } from "vitest";
import {
  compareSignalsForPrimaryPick,
  computeSanadQueueSignalScore,
  detectSignalsForCenter,
  isLeadStaleForQueue,
  pickPrimarySignal,
  SANAD_QUEUE_DEFAULT_CAP,
  SANAD_QUEUE_SIGNAL_KEYS,
  type SanadQueueCenterSnapshot,
} from "./sanadQueueSignals";

const fixedNow = new Date("2026-04-20T12:00:00.000Z");

describe("SANAD_QUEUE_SIGNAL_KEYS", () => {
  it("includes every spec §4 key", () => {
    const keys = new Set(SANAD_QUEUE_SIGNAL_KEYS);
    expect(keys.has("SANAD_UNASSIGNED_PIPELINE")).toBe(true);
    expect(keys.has("SANAD_OVERDUE_FOLLOWUP")).toBe(true);
    expect(keys.has("SANAD_DUE_TODAY")).toBe(true);
    expect(keys.has("SANAD_STALE_CONTACT")).toBe(true);
    expect(keys.has("SANAD_INVITED_NO_ACCOUNT")).toBe(true);
    expect(keys.has("SANAD_LINKED_NOT_ACTIVATED")).toBe(true);
    expect(keys.has("SANAD_STUCK_ONBOARDING")).toBe(true);
    expect(keys.has("SANAD_LICENSED_NO_OFFICE")).toBe(true);
    expect(keys.has("SANAD_ACTIVATED_UNLISTED")).toBe(true);
    expect(keys.has("SANAD_LISTED_NO_CATALOGUE")).toBe(true);
    expect(keys.has("SANAD_SOLO_OWNER_ROSTER")).toBe(true);
    expect(keys.has("SANAD_NO_PHONE")).toBe(true);
    expect(keys.has("SANAD_PHONE_NO_REPLY_EMAIL")).toBe(true);
    expect(keys.has("SANAD_RECORD_QUALITY")).toBe(true);
  });

  it("exposes default cap for server wiring", () => {
    expect(SANAD_QUEUE_DEFAULT_CAP).toBe(15);
  });
});

describe("detectSignalsForCenter", () => {
  it("returns no signals for archived centres", () => {
    const s: SanadQueueCenterSnapshot = {
      centerId: 1,
      isArchived: 1,
      ownerUserId: null,
      pipelineStatus: "invited",
      nextActionDueAt: "2026-04-01T00:00:00.000Z",
    };
    expect(detectSignalsForCenter(s, fixedNow)).toEqual([]);
  });

  it("detects overdue follow-up and unassigned pipeline (overlap)", () => {
    const s: SanadQueueCenterSnapshot = {
      centerId: 2,
      ownerUserId: null,
      pipelineStatus: "invited",
      nextActionDueAt: "2026-04-19T00:00:00.000Z",
    };
    const sigs = detectSignalsForCenter(s, fixedNow);
    const keys = sigs.map((x) => x.key).sort();
    expect(keys).toContain("SANAD_OVERDUE_FOLLOWUP");
    expect(keys).toContain("SANAD_UNASSIGNED_PIPELINE");
  });

  it("detects due today but not overdue", () => {
    const s: SanadQueueCenterSnapshot = {
      centerId: 3,
      ownerUserId: 99,
      pipelineStatus: "contacted",
      nextActionDueAt: "2026-04-20T08:00:00.000Z",
    };
    const keys = detectSignalsForCenter(s, fixedNow).map((x) => x.key);
    expect(keys).toContain("SANAD_DUE_TODAY");
    expect(keys).not.toContain("SANAD_OVERDUE_FOLLOWUP");
  });

  it("does not flag stale contact for registered/active stages", () => {
    const old = "2026-01-01T00:00:00.000Z";
    expect(
      isLeadStaleForQueue({ lastContactedAt: old, pipelineStatus: "registered" }, fixedNow),
    ).toBe(false);
    expect(isLeadStaleForQueue({ lastContactedAt: old, pipelineStatus: "active" }, fixedNow)).toBe(false);
    expect(isLeadStaleForQueue({ lastContactedAt: old, pipelineStatus: "invited" }, fixedNow)).toBe(true);
  });

  it("detects invited without account", () => {
    const s: SanadQueueCenterSnapshot = {
      centerId: 4,
      ownerUserId: 1,
      pipelineStatus: "invited",
      inviteSentAt: "2026-04-01T00:00:00.000Z",
      registeredUserId: null,
      linkedSanadOfficeId: null,
    };
    expect(detectSignalsForCenter(s, fixedNow).map((x) => x.key)).toContain("SANAD_INVITED_NO_ACCOUNT");
  });

  it("prefers stuck onboarding over generic linked-not-activated", () => {
    const s: SanadQueueCenterSnapshot = {
      centerId: 5,
      registeredUserId: 10,
      linkedSanadOfficeId: null,
      onboardingStatus: "intake",
    };
    const keys = detectSignalsForCenter(s, fixedNow).map((x) => x.key);
    expect(keys).toContain("SANAD_STUCK_ONBOARDING");
    expect(keys).not.toContain("SANAD_LINKED_NOT_ACTIVATED");
  });

  it("detects licensed without office", () => {
    const s: SanadQueueCenterSnapshot = {
      centerId: 6,
      registeredUserId: 11,
      linkedSanadOfficeId: null,
      onboardingStatus: "licensed",
    };
    const keys = detectSignalsForCenter(s, fixedNow).map((x) => x.key);
    expect(keys).toContain("SANAD_LICENSED_NO_OFFICE");
    expect(keys).not.toContain("SANAD_STUCK_ONBOARDING");
  });

  it("emits office flags only when booleans are known", () => {
    const linked: SanadQueueCenterSnapshot = {
      centerId: 7,
      linkedSanadOfficeId: 500,
      ownerUserId: 1,
      pipelineStatus: "active",
    };
    expect(detectSignalsForCenter(linked, fixedNow).map((x) => x.key)).not.toContain("SANAD_ACTIVATED_UNLISTED");

    const unlisted: SanadQueueCenterSnapshot = {
      ...linked,
      centerId: 8,
      officeIsPublicListed: false,
    };
    expect(detectSignalsForCenter(unlisted, fixedNow).map((x) => x.key)).toContain("SANAD_ACTIVATED_UNLISTED");

    const listedNoCat: SanadQueueCenterSnapshot = {
      ...linked,
      centerId: 9,
      officeIsPublicListed: true,
      officeHasActiveCatalogue: false,
    };
    expect(detectSignalsForCenter(listedNoCat, fixedNow).map((x) => x.key)).toContain("SANAD_LISTED_NO_CATALOGUE");
  });

  it("detects solo owner roster when server sets flag", () => {
    const s: SanadQueueCenterSnapshot = {
      centerId: 10,
      linkedSanadOfficeId: 1,
      ownerUserId: 1,
      pipelineStatus: "active",
      rosterIsSoloOwnerOnly: true,
    };
    expect(detectSignalsForCenter(s, fixedNow).map((x) => x.key)).toContain("SANAD_SOLO_OWNER_ROSTER");
  });

  it("detects no phone vs phone without reply email", () => {
    const noPhone: SanadQueueCenterSnapshot = {
      centerId: 11,
      contactNumber: "   ",
      ownerUserId: 1,
      pipelineStatus: "active",
      linkedSanadOfficeId: 1,
    };
    expect(detectSignalsForCenter(noPhone, fixedNow).map((x) => x.key)).toContain("SANAD_NO_PHONE");

    const phoneOnly: SanadQueueCenterSnapshot = {
      centerId: 12,
      contactNumber: "+96870000000",
      ownerUserId: 1,
      pipelineStatus: "invited",
      linkedSanadOfficeId: null,
      surveyOutreachReplyEmail: null,
    };
    const keys = detectSignalsForCenter(phoneOnly, fixedNow).map((x) => x.key);
    expect(keys).toContain("SANAD_PHONE_NO_REPLY_EMAIL");
    expect(keys).not.toContain("SANAD_NO_PHONE");
  });

  it("detects record quality flags", () => {
    const s: SanadQueueCenterSnapshot = {
      centerId: 13,
      ownerUserId: 1,
      pipelineStatus: "active",
      linkedSanadOfficeId: 1,
      isInvalid: 1,
    };
    expect(detectSignalsForCenter(s, fixedNow).map((x) => x.key)).toContain("SANAD_RECORD_QUALITY");
  });
});

describe("pickPrimarySignal / compareSignalsForPrimaryPick", () => {
  it("orders by dedupe tier then score then key (deterministic)", () => {
    const a = { key: "SANAD_UNASSIGNED_PIPELINE" as const, band: "important" as const, score: 50 };
    const b = { key: "SANAD_OVERDUE_FOLLOWUP" as const, band: "important" as const, score: 10 };
    expect(compareSignalsForPrimaryPick(a, b)).toBeGreaterThan(0);
    const picked = pickPrimarySignal([a, b]);
    expect(picked.primary.key).toBe("SANAD_OVERDUE_FOLLOWUP");
    expect(picked.secondaryKeys).toEqual(["SANAD_UNASSIGNED_PIPELINE"]);
  });

  it("prefers higher dedupe tier even when another signal has higher score", () => {
    const overdueLow = { key: "SANAD_OVERDUE_FOLLOWUP" as const, band: "important" as const, score: 1 };
    const staleHigh = { key: "SANAD_STALE_CONTACT" as const, band: "important" as const, score: 99 };
    const picked = pickPrimarySignal([staleHigh, overdueLow]);
    expect(picked.primary.key).toBe("SANAD_OVERDUE_FOLLOWUP");
    expect(picked.secondaryKeys).toEqual(["SANAD_STALE_CONTACT"]);
  });

  it("uses signal key asc when tier and score are equal", () => {
    const x = { key: "SANAD_DUE_TODAY" as const, band: "important" as const, score: 55 };
    const y = { key: "SANAD_DUE_TODAY" as const, band: "important" as const, score: 55 };
    expect(compareSignalsForPrimaryPick(x, y)).toBe(0);
  });

  it("throws on empty candidates", () => {
    expect(() => pickPrimarySignal([])).toThrow(/empty candidates/);
  });
});

describe("computeSanadQueueSignalScore", () => {
  it("returns a number in 0–100", () => {
    const snap: SanadQueueCenterSnapshot = {
      centerId: 1,
      ownerUserId: null,
      pipelineStatus: "invited",
      nextActionDueAt: "2026-04-19T00:00:00.000Z",
    };
    const n = computeSanadQueueSignalScore(snap, "SANAD_OVERDUE_FOLLOWUP", fixedNow);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(100);
  });
});
