/**
 * Router-level integration tests for SANAD partner/marketplace/roster flows.
 * Uses the same lightweight DB-mocking style as `sanadActivationBridge.test.ts`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";
import { sanadRouter } from "./routers/sanad";
import { sanadApplications, sanadOffices, sanadOfficeMembers, sanadServiceCatalogue } from "../drizzle/schema";

function makePlatformCtx(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `open-${userId}`,
      email: "platform@test.om",
      name: "Platform",
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

function makeAnonCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function mockListPublicProviders(offices: unknown[]) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve(offices)),
        })),
      })),
    })),
  };
}

function mockGetPublicProfile(office: unknown | null, catalogue: unknown[] = [], reviews: unknown[] = []) {
  return {
    select: vi.fn(() => ({
      from: vi.fn((table: object) => {
        if (table === sanadOffices) {
          return {
            where: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve(office ? [office] : [])),
            })),
          };
        }
        if (table === sanadServiceCatalogue) {
          return {
            where: vi.fn(() => ({
              orderBy: vi.fn(() => Promise.resolve(catalogue)),
            })),
          };
        }
        if (table === sanadApplications) {
          return {
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve(reviews)),
              })),
            })),
          };
        }
        return {
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
            orderBy: vi.fn(() => Promise.resolve([])),
          })),
        };
      }),
    })),
  };
}

function mockUpdatePublicProfileSequence(officeRow: Record<string, unknown>, activeCatalogueN: number) {
  return {
    select: vi.fn(() => ({
      from: vi.fn((table: object) => ({
        where: vi.fn(() => {
          if (table === sanadOffices) {
            return {
              limit: vi.fn(() => Promise.resolve([officeRow])),
            };
          }
          if (table === sanadServiceCatalogue) {
            return Promise.resolve([[{ n: activeCatalogueN }]]);
          }
          return { limit: vi.fn(() => Promise.resolve([])) };
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  };
}

function mockToggleCatalogueItem(opts: {
  row: { id: number; officeId: number; isActive: number };
  activeCount: number;
  officeRow: Record<string, unknown>;
}) {
  return {
    select: vi.fn((proj?: unknown) => ({
      from: vi.fn((table: object) => ({
        where: vi.fn(() => {
          if (table === sanadServiceCatalogue && proj && typeof proj === "object" && "n" in (proj as object)) {
            return Promise.resolve([[{ n: opts.activeCount }]]);
          }
          if (table === sanadServiceCatalogue) {
            return {
              limit: vi.fn(() => Promise.resolve([opts.row])),
            };
          }
          if (table === sanadOffices) {
            return {
              limit: vi.fn(() => Promise.resolve([opts.officeRow])),
            };
          }
          return { limit: vi.fn(() => Promise.resolve([])) };
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  };
}

function mockRemoveMemberSequence(opts: { role: string; ownerCount: number }) {
  let memberWhereCalls = 0;
  return {
    select: vi.fn((proj?: unknown) => ({
      from: vi.fn((table: object) => ({
        where: vi.fn(() => {
          if (table !== sanadOfficeMembers) {
            return { limit: vi.fn(() => Promise.resolve([])) };
          }
          memberWhereCalls++;
          if (memberWhereCalls === 1) {
            return {
              limit: vi.fn(() => Promise.resolve([{ role: opts.role }])),
            };
          }
          return Promise.resolve([{ n: opts.ownerCount }]);
        }),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
  };
}

describe("sanadRouter partner marketplace & roster (integration)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listPublicProviders returns mocked marketplace rows for anonymous caller", async () => {
    const rows = [
      { id: 1, name: "A", status: "active", isPublicListed: 1, governorate: "Muscat", city: null, phone: "1", avgRating: "4" },
    ];
    vi.spyOn(db, "getDb").mockResolvedValue(mockListPublicProviders(rows) as never);
    const caller = sanadRouter.createCaller(makeAnonCtx());
    const out = await caller.listPublicProviders({ governorate: "Muscat" });
    expect(out).toEqual(rows);
  });

  it("getPublicProfile returns office payload even when isPublicListed is off (discovery by id)", async () => {
    const office = {
      id: 9,
      name: "Private",
      status: "active",
      isPublicListed: 0,
      phone: "9900",
      governorate: "Muscat",
      city: null,
    };
    vi.spyOn(db, "getDb").mockResolvedValue(mockGetPublicProfile(office, [], []) as never);
    const caller = sanadRouter.createCaller(makeAnonCtx());
    const out = await caller.getPublicProfile({ officeId: 9 });
    expect(out?.office).toMatchObject({ id: 9, isPublicListed: 0 });
  });

  it("updatePublicProfile rejects enabling public listing when go-live readiness fails", async () => {
    const officeRow = {
      id: 1,
      name: "X",
      status: "active" as const,
      isPublicListed: 0,
      phone: null,
      governorate: "Muscat",
      city: null,
      description: null,
      languages: null,
      logoUrl: null,
      licenceNumber: null,
      licenceExpiry: null,
      descriptionAr: null,
      responseTimeHours: null,
      avgRating: null,
      totalReviews: null,
      isVerified: 0,
    };
    vi.spyOn(db, "getDb").mockResolvedValue(mockUpdatePublicProfileSequence(officeRow, 1) as never);
    const caller = sanadRouter.createCaller(makePlatformCtx());
    await expect(
      caller.updatePublicProfile({
        officeId: 1,
        isPublicListed: true,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("toggleCatalogueItem rejects deactivating the last active item for a public-listed office", async () => {
    const officeRow = {
      id: 10,
      name: "Listed",
      status: "active" as const,
      isPublicListed: 1,
      phone: "1",
      governorate: "A",
      city: null,
      description: null,
      languages: null,
      logoUrl: null,
      licenceNumber: null,
      licenceExpiry: null,
      descriptionAr: null,
      responseTimeHours: null,
      avgRating: null,
      totalReviews: null,
      isVerified: 0,
    };
    vi.spyOn(db, "getDb").mockResolvedValue(
      mockToggleCatalogueItem({
        row: { id: 50, officeId: 10, isActive: 1 },
        activeCount: 1,
        officeRow,
      }) as never,
    );
    const caller = sanadRouter.createCaller(makePlatformCtx());
    await expect(caller.toggleCatalogueItem({ id: 50, isActive: false })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("removeSanadOfficeMember rejects removing the sole owner", async () => {
    vi.spyOn(db, "getDb").mockResolvedValue(mockRemoveMemberSequence({ role: "owner", ownerCount: 1 }) as never);
    const caller = sanadRouter.createCaller(makePlatformCtx());
    await expect(caller.removeSanadOfficeMember({ officeId: 3, userId: 88 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("removeSanadOfficeMember proceeds when more than one owner exists", async () => {
    const m = mockRemoveMemberSequence({ role: "owner", ownerCount: 2 });
    vi.spyOn(db, "getDb").mockResolvedValue(m as never);
    const caller = sanadRouter.createCaller(makePlatformCtx());
    await expect(caller.removeSanadOfficeMember({ officeId: 3, userId: 88 })).resolves.toMatchObject({
      success: true,
    });
    expect(m.delete).toHaveBeenCalled();
  });
});
