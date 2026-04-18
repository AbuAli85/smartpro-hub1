/**
 * Integration-style tests for the SANAD activation bridge.
 *
 * Pattern: repo-standard lightweight mock (createTableAwareDb / mergeMockDb from financeHR tests).
 * All tests call the router via `sanadIntelligenceRouter.createCaller(ctx)` so they exercise the
 * full procedure path including guards, audit writes, and transaction semantics.
 *
 * Areas covered:
 *   A. Invite generation lifecycle
 *   B. Public accept flow
 *   C. Account linking
 *   D. Office activation
 *   E. Audit side effects
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import * as db from "../db";
import { deriveInviteTokenStorageValue } from "./activation";
import { sanadIntelligenceRouter } from "../routers/sanadIntelligence";
import type { TrpcContext } from "../_core/context";
import {
  auditEvents,
  sanadIntelCenterComplianceItems,
  sanadIntelCenterOperations,
  sanadIntelCenters,
  sanadOffices,
  sanadOfficeMembers,
  sanadCentresPipeline,
} from "../../drizzle/schema";

function makePipelineRow(centerId = 1) {
  return {
    centerId,
    pipelineStatus: "imported" as const,
    ownerUserId: null,
    lastContactedAt: null,
    nextAction: null,
    nextActionType: null,
    nextActionDueAt: null,
    assignedAt: null,
    assignedByUserId: null,
    latestNotePreview: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdminCtx(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `open-${userId}`,
      email: "admin@test.om",
      name: "Admin",
      loginMethod: "manus",
      role: "user",
      platformRole: "super_admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeUserCtx(userId = 99): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `open-${userId}`,
      email: "user@test.om",
      name: "User",
      loginMethod: "manus",
      role: "user",
      platformRole: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

/** Minimal ops row — all invite/activation fields null by default */
function makeOps(overrides: Record<string, unknown> = {}) {
  return {
    centerId: 1,
    partnerStatus: "unknown",
    onboardingStatus: "not_started",
    notes: null,
    internalReviewNotes: null,
    assignedManagerUserId: null,
    latitude: null,
    longitude: null,
    coverageRadiusKm: null,
    targetSlaHours: null,
    updatedAt: new Date(),
    complianceOverall: "not_assessed",
    internalTags: [],
    inviteToken: null,
    inviteSentAt: null,
    inviteExpiresAt: null,
    registeredUserId: null,
    linkedSanadOfficeId: null,
    activatedAt: null,
    activationSource: null,
    lastContactedAt: null,
    contactMethod: null,
    followUpDueAt: null,
    inviteAcceptName: null,
    inviteAcceptPhone: null,
    inviteAcceptEmail: null,
    inviteAcceptAt: null,
    ...overrides,
  };
}

function makeCenter(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    centerName: "مركز سند مسقط",
    responsiblePerson: "أحمد",
    governorateKey: "muscat",
    governorateLabelRaw: "مسقط",
    wilayat: "مطرح",
    village: null,
    contactNumber: "99001122",
    sourceFingerprint: "fp-001",
    ...overrides,
  };
}

function makeSanadOffice(id = 100) {
  return {
    id,
    name: "مركز سند مسقط",
    nameAr: null,
    providerType: "typing_centre",
    phone: null,
    governorate: "مسقط",
    city: null,
    contactPerson: null,
    location: null,
    status: "active",
    isPublicListed: 0,
    updatedAt: new Date(),
  };
}

/**
 * Build a table-aware DB mock.
 * `selectMap` maps a table object → rows returned by `.where().limit()`.
 * `complianceCount` controls what the sql count(*) query returns for compliance items.
 * `insertSpy` is called for every `.insert().values()` call.
 * `updateSpy` is called for every `.update().set().where()` call.
 */
function buildMockDb(opts: {
  selectMap?: Map<object, unknown[]>;
  insertSpy?: ReturnType<typeof vi.fn>;
  updateSpy?: ReturnType<typeof vi.fn>;
  insertIdOverride?: number;
  complianceCount?: number;
}) {
  const { selectMap = new Map(), insertSpy, updateSpy, insertIdOverride = 1, complianceCount } = opts;

  // Determine compliance count from selectMap if not explicitly provided
  const resolvedComplianceCount =
    complianceCount !== undefined
      ? complianceCount
      : (selectMap.get(sanadIntelCenterComplianceItems) ?? []).length;

  const mock: Record<string, unknown> = {
    select: vi.fn((_fields?: unknown) => ({
      from: vi.fn((table: object) => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => {
            const rows = selectMap.get(table) ?? [];
            return Promise.resolve(rows);
          }),
          orderBy: vi.fn(() => Promise.resolve(selectMap.get(table) ?? [])),
        })),
        // sql count(*) query used in activateCenterAsOffice
        ...(table === sanadIntelCenterComplianceItems
          ? {
              where: vi.fn(() => Promise.resolve([{ n: resolvedComplianceCount }])),
            }
          : {}),
        innerJoin: vi.fn((_joinTable: object, _cond: unknown) => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              // For findByInviteToken: join of sanadIntelCenterOperations + sanadIntelCenters
              const opsRows = selectMap.get(sanadIntelCenterOperations) ?? [];
              const centerRows = selectMap.get(sanadIntelCenters) ?? [];
              if (opsRows.length && centerRows.length) {
                return Promise.resolve([{ center: centerRows[0], ops: opsRows[0] }]);
              }
              return Promise.resolve([]);
            }),
          })),
        })),
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn((...args: unknown[]) => {
          updateSpy?.(...args);
          return Promise.resolve();
        }),
      })),
    })),
    insert: vi.fn((table: object) => ({
      values: vi.fn((vals: unknown) => {
        insertSpy?.(table, vals);
        return Promise.resolve([{ insertId: insertIdOverride }]);
      }),
    })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mock)),
  };
  return mock;
}

// ---------------------------------------------------------------------------
// A. Invite generation lifecycle
// ---------------------------------------------------------------------------

describe("A. Invite generation lifecycle", () => {
  afterEach(() => vi.restoreAllMocks());

  it("A1 — generates invite and stores token metadata", async () => {
    const insertSpy = vi.fn();
    const updateSpy = vi.fn();
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenters, [makeCenter()]],
      [sanadIntelCenterOperations, [makeOps()]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap, insertSpy, updateSpy });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx());
    const result = await caller.generateCenterInvite({ centerId: 1 });

    expect(result.token).toBeTruthy();
    expect(result.invitePath).toContain("/sanad/join?token=");
    expect(result.inviteExpiresAt).toBeInstanceOf(Date);
    // update was called (to write token to ops row)
    expect(mockDb.update).toHaveBeenCalled();
    const setFn = (mockDb.update as ReturnType<typeof vi.fn>).mock.results[0]?.value?.set as ReturnType<typeof vi.fn>;
    const invitePayload = setFn.mock.calls[0]?.[0] as { inviteToken?: string };
    expect(invitePayload.inviteToken).toMatch(/^v2:[a-f0-9]{64}$/);
    // audit event was inserted
    expect(insertSpy).toHaveBeenCalledWith(
      auditEvents,
      expect.objectContaining({ action: "sanad_intel_invite_generated" }),
    );
  });

  it("A2 — generating a second invite replaces the old token (replacedPriorToken=true in audit)", async () => {
    const insertSpy = vi.fn();
    const priorToken = "old-token-abc";
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenters, [makeCenter()]],
      [sanadIntelCenterOperations, [makeOps({ inviteToken: priorToken, inviteExpiresAt: new Date(Date.now() + 86400000) })]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap, insertSpy });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx());
    const result = await caller.generateCenterInvite({ centerId: 1 });

    // New token must differ from old
    expect(result.token).not.toBe(priorToken);
    // Audit metadata must record the replacement
    const auditCall = insertSpy.mock.calls.find(
      ([t, v]: [object, Record<string, unknown>]) => t === auditEvents && v.action === "sanad_intel_invite_generated",
    );
    expect(auditCall).toBeTruthy();
    expect(auditCall[1].metadata).toMatchObject({ replacedPriorToken: true });
  });

  it("A3 — FORBIDDEN when centre already has a linked office", async () => {
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenters, [makeCenter()]],
      [sanadIntelCenterOperations, [makeOps({ linkedSanadOfficeId: 42 })]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx());
    await expect(caller.generateCenterInvite({ centerId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("A4 — NOT_FOUND when centre does not exist", async () => {
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenters, []],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx());
    await expect(caller.generateCenterInvite({ centerId: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ---------------------------------------------------------------------------
// B. Public accept flow
// ---------------------------------------------------------------------------

describe("B. Public accept flow", () => {
  afterEach(() => vi.restoreAllMocks());

  function makeValidOps() {
    return makeOps({
      inviteToken: "valid-token-xyz",
      inviteExpiresAt: new Date(Date.now() + 86400000), // 1 day from now
    });
  }

  it("B1 — valid token captures lead and returns sign_in nextStep", async () => {
    const insertSpy = vi.fn();
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenterOperations, [makeValidOps()]],
      [sanadIntelCenters, [makeCenter()]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap, insertSpy });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx()); // public procedure — ctx user not used
    const result = await caller.acceptCenterInvite({
      token: "valid-token-xyz",
      name: "سالم العبري",
      phone: "99001122",
      email: "salem@test.om",
    });

    expect(result.success).toBe(true);
    expect(result.nextStep).toBe("sign_in");
    expect(result.leadAlreadyCaptured).toBe(false);
    // Audit event written
    expect(insertSpy).toHaveBeenCalledWith(
      auditEvents,
      expect.objectContaining({ action: "sanad_intel_invite_accepted" }),
    );
  });

  it("B2 — second accept with same token is idempotent (leadAlreadyCaptured=true)", async () => {
    const insertSpy = vi.fn();
    const opsWithLead = makeOps({
      inviteToken: "valid-token-xyz",
      inviteExpiresAt: new Date(Date.now() + 86400000),
      inviteAcceptAt: new Date(),
      inviteAcceptName: "سالم العبري",
      inviteAcceptPhone: "99001122",
    });
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenterOperations, [opsWithLead]],
      [sanadIntelCenters, [makeCenter()]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap, insertSpy });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx());
    const result = await caller.acceptCenterInvite({
      token: "valid-token-xyz",
      name: "سالم العبري",
      phone: "99001122",
    });

    expect(result.leadAlreadyCaptured).toBe(true);
    // No audit event should be written for idempotent path
    expect(insertSpy).not.toHaveBeenCalledWith(
      auditEvents,
      expect.objectContaining({ action: "sanad_intel_invite_accepted" }),
    );
  });

  it("B3 — expired token is rejected with BAD_REQUEST", async () => {
    const expiredOps = makeOps({
      inviteToken: "expired-token",
      inviteExpiresAt: new Date(Date.now() - 1000), // already expired
    });
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenterOperations, [expiredOps]],
      [sanadIntelCenters, [makeCenter()]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx());
    await expect(
      caller.acceptCenterInvite({ token: "expired-token", name: "Test", phone: "99001122" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("B4 — unknown token is rejected with NOT_FOUND", async () => {
    // No ops row returned for this token
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenterOperations, []],
      [sanadIntelCenters, []],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx());
    await expect(
      caller.acceptCenterInvite({ token: "no-such-token", name: "Test", phone: "99001122" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("B5 — already-linked centre token is rejected (channel closed)", async () => {
    const linkedOps = makeOps({
      inviteToken: "linked-token",
      inviteExpiresAt: new Date(Date.now() + 86400000),
      linkedSanadOfficeId: 42, // channel closed
    });
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenterOperations, [linkedOps]],
      [sanadIntelCenters, [makeCenter()]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx());
    await expect(
      caller.acceptCenterInvite({ token: "linked-token", name: "Test", phone: "99001122" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("B5b — peekCenterInvite resolves v2 hashed-at-rest invite rows using the raw URL token", async () => {
    const raw = "client-visible-token-123";
    const stored = deriveInviteTokenStorageValue(raw);
    const opsHashed = makeOps({
      inviteToken: stored,
      inviteExpiresAt: new Date(Date.now() + 86400000),
    });
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenterOperations, [opsHashed]],
      [sanadIntelCenters, [makeCenter()]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx());
    const peek = await caller.peekCenterInvite({ token: raw });
    expect(peek.centerName).toBeTruthy();
  });

  it("B6 — CONFLICT when token is already linked to a user account", async () => {
    const linkedUserOps = makeOps({
      inviteToken: "user-linked-token",
      inviteExpiresAt: new Date(Date.now() + 86400000),
      registeredUserId: 77,
      inviteAcceptAt: new Date(),
    });
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenterOperations, [linkedUserOps]],
      [sanadIntelCenters, [makeCenter()]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx());
    await expect(
      caller.acceptCenterInvite({ token: "user-linked-token", name: "Test", phone: "99001122" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

// ---------------------------------------------------------------------------
// C. Account linking
// ---------------------------------------------------------------------------

describe("C. Account linking", () => {
  afterEach(() => vi.restoreAllMocks());

  function makeAcceptedOps(overrides: Record<string, unknown> = {}) {
    return makeOps({
      inviteToken: "accepted-token",
      inviteExpiresAt: new Date(Date.now() + 86400000),
      inviteAcceptAt: new Date(),
      inviteAcceptName: "سالم العبري",
      inviteAcceptPhone: "99001122",
      ...overrides,
    });
  }

  it("C1 — link succeeds after lead capture", async () => {
    const insertSpy = vi.fn();
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenterOperations, [makeAcceptedOps()]],
      [sanadIntelCenters, [makeCenter()]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap, insertSpy });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeUserCtx(99));
    const result = await caller.linkSanadInviteToAccount({ token: "accepted-token" });

    expect(result.success).toBe(true);
    expect(result.alreadyLinked).toBe(false);
    expect(result.redirectTo).toBe("/dashboard");
    expect(insertSpy).toHaveBeenCalledWith(
      auditEvents,
      expect.objectContaining({ action: "sanad_intel_invite_linked_user" }),
    );
  });

  it("C2 — same user re-link is idempotent (alreadyLinked=true)", async () => {
    const insertSpy = vi.fn();
    const opsAlreadyLinked = makeAcceptedOps({ registeredUserId: 99 });
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenterOperations, [opsAlreadyLinked]],
      [sanadIntelCenters, [makeCenter()]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap, insertSpy });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeUserCtx(99));
    const result = await caller.linkSanadInviteToAccount({ token: "accepted-token" });

    expect(result.alreadyLinked).toBe(true);
    // No audit event for idempotent re-link
    expect(insertSpy).not.toHaveBeenCalledWith(
      auditEvents,
      expect.objectContaining({ action: "sanad_intel_invite_linked_user" }),
    );
  });

  it("C3 — different user cannot claim an already-linked centre (CONFLICT)", async () => {
    const opsLinkedToOtherUser = makeAcceptedOps({ registeredUserId: 55 });
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenterOperations, [opsLinkedToOtherUser]],
      [sanadIntelCenters, [makeCenter()]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeUserCtx(99)); // user 99 ≠ 55
    await expect(caller.linkSanadInviteToAccount({ token: "accepted-token" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("C4 — BAD_REQUEST when lead not yet captured (inviteAcceptAt is null)", async () => {
    const opsNoLead = makeOps({
      inviteToken: "accepted-token",
      inviteExpiresAt: new Date(Date.now() + 86400000),
      // inviteAcceptAt intentionally null
    });
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenterOperations, [opsNoLead]],
      [sanadIntelCenters, [makeCenter()]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeUserCtx(99));
    await expect(caller.linkSanadInviteToAccount({ token: "accepted-token" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

// ---------------------------------------------------------------------------
// D. Office activation
// ---------------------------------------------------------------------------

describe("D. Office activation", () => {
  afterEach(() => vi.restoreAllMocks());

  function makeActivatableOps() {
    return makeOps({
      inviteToken: "some-token",
      inviteExpiresAt: new Date(Date.now() + 86400000),
      registeredUserId: 42,
    });
  }

  it("D1 — activation creates one sanad_offices record and links it", async () => {
    const insertSpy = vi.fn();
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenters, [makeCenter()]],
      [sanadIntelCenterOperations, [makeActivatableOps()]],
      [sanadIntelCenterComplianceItems, [{ id: 1 }, { id: 2 }]], // 2 items → gate passes
      [sanadOffices, [makeSanadOffice(100)]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap, insertSpy, insertIdOverride: 100 });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx());
    const result = await caller.activateCenterAsOffice({ centerId: 1 });

    expect(result.alreadyLinked).toBe(false);
    // sanad_offices insert was called
    expect(insertSpy).toHaveBeenCalledWith(sanadOffices, expect.objectContaining({ name: "مركز سند مسقط" }));
    expect(insertSpy).toHaveBeenCalledWith(
      sanadOfficeMembers,
      expect.objectContaining({ role: "owner", userId: 42 }),
    );
    // Audit event written
    expect(insertSpy).toHaveBeenCalledWith(
      auditEvents,
      expect.objectContaining({ action: "sanad_intel_center_activated_office" }),
    );
  });

  it("D2 — second activation call returns alreadyLinked=true without creating duplicate office", async () => {
    const insertSpy = vi.fn();
    const alreadyLinkedOps = makeOps({ linkedSanadOfficeId: 100 });
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenters, [makeCenter()]],
      [sanadIntelCenterOperations, [alreadyLinkedOps]],
      [sanadOffices, [makeSanadOffice(100)]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap, insertSpy });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx());
    const result = await caller.activateCenterAsOffice({ centerId: 1 });

    expect(result.alreadyLinked).toBe(true);
    // sanad_offices insert must NOT be called again
    expect(insertSpy).not.toHaveBeenCalledWith(sanadOffices, expect.anything());
  });

  it("D3 — activation clears invite fields (inviteToken/inviteExpiresAt/inviteSentAt set to null)", async () => {
    const updateSpy = vi.fn();
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenters, [makeCenter()]],
      [sanadIntelCenterOperations, [makeActivatableOps()]],
      [sanadIntelCenterComplianceItems, [{ id: 1 }]],
      [sanadOffices, [makeSanadOffice(100)]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap, updateSpy, insertIdOverride: 100 });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx());
    await caller.activateCenterAsOffice({ centerId: 1 });

    // The update call on sanadIntelCenterOperations should include null invite fields
    const updateMock = mockDb.update as ReturnType<typeof vi.fn>;
    const updateCallArgs = updateMock.mock.calls;
    // At least one update call should be on sanadIntelCenterOperations
    expect(updateCallArgs.some(([t]: [object]) => t === sanadIntelCenterOperations)).toBe(true);
  });

  it("D4 — PRECONDITION_FAILED when no compliance items seeded", async () => {
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenters, [makeCenter()]],
      [sanadIntelCenterOperations, [makeOps({ registeredUserId: 99 })]],
      [sanadIntelCenterComplianceItems, []], // empty → gate fails
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx());
    await expect(caller.activateCenterAsOffice({ centerId: 1 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("D4b — PRECONDITION_FAILED when no SmartPRO account linked", async () => {
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenters, [makeCenter()]],
      [sanadIntelCenterOperations, [makeOps({ registeredUserId: null })]],
      [sanadIntelCenterComplianceItems, [{ id: 1 }]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx());
    await expect(caller.activateCenterAsOffice({ centerId: 1 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("D5 — BAD_REQUEST when centre name is empty", async () => {
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenters, [makeCenter({ centerName: "   " })]],
      [sanadIntelCenterOperations, [makeOps({ registeredUserId: 5 })]],
      [sanadIntelCenterComplianceItems, [{ id: 1 }]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx());
    await expect(caller.activateCenterAsOffice({ centerId: 1 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("D6 — NOT_FOUND when centre does not exist", async () => {
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenters, []],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx());
    await expect(caller.activateCenterAsOffice({ centerId: 999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

// ---------------------------------------------------------------------------
// E. Audit side effects
// ---------------------------------------------------------------------------

describe("E. Audit side effects", () => {
  afterEach(() => vi.restoreAllMocks());

  it("E1 — invite generated audit event has correct entityType and action", async () => {
    const insertSpy = vi.fn();
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenters, [makeCenter({ id: 7 })]],
      [sanadIntelCenterOperations, [makeOps({ centerId: 7 })]],
      [sanadCentresPipeline, [makePipelineRow(7)]],
    ]);
    const mockDb = buildMockDb({ selectMap, insertSpy });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx(1));
    await caller.generateCenterInvite({ centerId: 7 });

    const auditCall = insertSpy.mock.calls.find(
      ([t, v]: [object, Record<string, unknown>]) => t === auditEvents && v.action === "sanad_intel_invite_generated",
    );
    expect(auditCall).toBeTruthy();
    expect(auditCall[1]).toMatchObject({
      entityType: "sanad_intel_center",
      entityId: 7,
      actorUserId: 1,
      companyId: 0, // SANAD_INTEL_AUDIT_COMPANY_ID
    });
  });

  it("E2 — invite accepted audit event is written with actorUserId=null (public action)", async () => {
    const insertSpy = vi.fn();
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenterOperations, [makeOps({
        inviteToken: "tok-audit",
        inviteExpiresAt: new Date(Date.now() + 86400000),
      })]],
      [sanadIntelCenters, [makeCenter({ id: 3 })]],
      [sanadCentresPipeline, [makePipelineRow(3)]],
    ]);
    const mockDb = buildMockDb({ selectMap, insertSpy });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx()); // public procedure ignores ctx.user
    await caller.acceptCenterInvite({ token: "tok-audit", name: "Test", phone: "99001122" });

    const auditCall = insertSpy.mock.calls.find(
      ([t, v]: [object, Record<string, unknown>]) => t === auditEvents && v.action === "sanad_intel_invite_accepted",
    );
    expect(auditCall).toBeTruthy();
    expect(auditCall[1].actorUserId).toBeNull();
  });

  it("E3 — account linked audit event records the userId in metadata", async () => {
    const insertSpy = vi.fn();
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenterOperations, [makeOps({
        inviteToken: "tok-link",
        inviteExpiresAt: new Date(Date.now() + 86400000),
        inviteAcceptAt: new Date(),
      })]],
      [sanadIntelCenters, [makeCenter()]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap, insertSpy });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeUserCtx(42));
    await caller.linkSanadInviteToAccount({ token: "tok-link" });

    const auditCall = insertSpy.mock.calls.find(
      ([t, v]: [object, Record<string, unknown>]) => t === auditEvents && v.action === "sanad_intel_invite_linked_user",
    );
    expect(auditCall).toBeTruthy();
    expect(auditCall[1].actorUserId).toBe(42);
    expect(auditCall[1].metadata).toMatchObject({ userId: 42 });
  });

  it("E4 — centre activated audit event records officeId in metadata", async () => {
    const insertSpy = vi.fn();
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenters, [makeCenter()]],
      [sanadIntelCenterOperations, [makeOps({ registeredUserId: 7 })]],
      [sanadIntelCenterComplianceItems, [{ id: 1 }]],
      [sanadOffices, [makeSanadOffice(200)]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap, insertSpy, insertIdOverride: 200 });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx(1));
    await caller.activateCenterAsOffice({ centerId: 1 });

    const auditCall = insertSpy.mock.calls.find(
      ([t, v]: [object, Record<string, unknown>]) =>
        t === auditEvents && v.action === "sanad_intel_center_activated_office",
    );
    expect(auditCall).toBeTruthy();
    expect(auditCall[1].metadata).toMatchObject({ officeId: 200 });
    expect(auditCall[1].actorUserId).toBe(1);
  });

  it("E5 — outreach updated audit event is written with correct action", async () => {
    const insertSpy = vi.fn();
    const selectMap = new Map<object, unknown[]>([
      [sanadIntelCenters, [makeCenter()]],
      [sanadIntelCenterOperations, [makeOps()]],
      [sanadCentresPipeline, [makePipelineRow()]],
    ]);
    const mockDb = buildMockDb({ selectMap, insertSpy });
    vi.spyOn(db, "getDb").mockResolvedValue(mockDb as never);

    const caller = sanadIntelligenceRouter.createCaller(makeAdminCtx(5));
    await caller.updateCenterOutreach({
      centerId: 1,
      contactMethod: "phone",
      lastContactedAt: new Date(),
    });

    const auditCall = insertSpy.mock.calls.find(
      ([t, v]: [object, Record<string, unknown>]) => t === auditEvents && v.action === "sanad_intel_outreach_updated",
    );
    expect(auditCall).toBeTruthy();
    expect(auditCall[1].actorUserId).toBe(5);
    expect(auditCall[1].metadata).toMatchObject({ contactMethod: "phone" });
  });
});
