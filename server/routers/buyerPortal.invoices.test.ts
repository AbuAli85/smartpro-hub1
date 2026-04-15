import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { buyerPortalRouter } from "./buyerPortal";
import * as buyerContext from "../buyer/buyerContext";
import * as buyerInvoices from "../buyer/buyerInvoices";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

function createCtx(userId: number) {
  return {
    user: {
      id: userId,
      openId: "test-openid",
      name: "Test",
      email: "t@example.com",
      loginMethod: "manus" as const,
      role: "user" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as never,
    res: {} as never,
  };
}

describe("buyerPortal.listInvoices", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockResolvedValue({} as never);
    vi.spyOn(buyerInvoices, "queryBuyerInvoicesForAccount").mockResolvedValue({ items: [], total: 0 });
  });

  afterEach(() => {
    process.env.BUYER_PORTAL_ENABLED = undefined;
    vi.restoreAllMocks();
  });

  it("returns NOT_FOUND when buyer portal is disabled", async () => {
    process.env.BUYER_PORTAL_ENABLED = "false";
    const caller = buyerPortalRouter.createCaller(createCtx(1) as never);
    await expect(caller.listInvoices({ customerAccountId: 1 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("denies wrong buyer account (NOT_FOUND from resolveBuyerContext)", async () => {
    process.env.BUYER_PORTAL_ENABLED = "true";
    vi.spyOn(buyerContext, "resolveBuyerContext").mockRejectedValue(
      new TRPCError({ code: "NOT_FOUND", message: "Customer account not found" }),
    );
    const caller = buyerPortalRouter.createCaller(createCtx(1) as never);
    await expect(caller.listInvoices({ customerAccountId: 999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(buyerInvoices.queryBuyerInvoicesForAccount).not.toHaveBeenCalled();
  });

  it("denies inactive member (FORBIDDEN from resolveBuyerContext)", async () => {
    process.env.BUYER_PORTAL_ENABLED = "true";
    vi.spyOn(buyerContext, "resolveBuyerContext").mockRejectedValue(
      new TRPCError({ code: "FORBIDDEN", message: "Buyer membership is not active" }),
    );
    const caller = buyerPortalRouter.createCaller(createCtx(1) as never);
    await expect(caller.listInvoices({ customerAccountId: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(buyerInvoices.queryBuyerInvoicesForAccount).not.toHaveBeenCalled();
  });

  it("returns linked invoices from scoped query only", async () => {
    process.env.BUYER_PORTAL_ENABLED = "true";
    vi.spyOn(buyerContext, "resolveBuyerContext").mockResolvedValue({
      customerAccountId: 1,
      providerCompanyId: 10,
      role: "buyer_finance",
      membershipId: 5,
    });
    vi.spyOn(buyerInvoices, "queryBuyerInvoicesForAccount").mockResolvedValue({
      items: [
        {
          id: 42,
          reference: "INV-2026-01-0042",
          issueDate: "2026-01-01",
          dueDate: "2026-02-15",
          status: "pending",
          amount: "150.000",
          currency: "OMR",
          documentUrl: null,
        },
      ],
      total: 1,
    });
    const caller = buyerPortalRouter.createCaller(createCtx(1) as never);
    const out = await caller.listInvoices({ customerAccountId: 1, page: 1, pageSize: 20 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]?.reference).toBe("INV-2026-01-0042");
    expect(buyerInvoices.queryBuyerInvoicesForAccount).toHaveBeenCalledTimes(1);
    const args = vi.mocked(buyerInvoices.queryBuyerInvoicesForAccount).mock.calls[0];
    expect(args?.[1]).toMatchObject({ customerAccountId: 1, providerCompanyId: 10 });
  });

  it("returns empty when no linked invoices (unlinked never returned by query layer)", async () => {
    process.env.BUYER_PORTAL_ENABLED = "true";
    vi.spyOn(buyerContext, "resolveBuyerContext").mockResolvedValue({
      customerAccountId: 2,
      providerCompanyId: 10,
      role: "buyer_viewer",
      membershipId: 9,
    });
    vi.spyOn(buyerInvoices, "queryBuyerInvoicesForAccount").mockResolvedValue({ items: [], total: 0 });
    const caller = buyerPortalRouter.createCaller(createCtx(2) as never);
    const out = await caller.listInvoices({ customerAccountId: 2 });
    expect(out.items).toHaveLength(0);
    expect(out.total).toBe(0);
  });
});
