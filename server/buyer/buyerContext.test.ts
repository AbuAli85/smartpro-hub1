import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getUserCustomerMembership,
  requireCustomerAccountMembership,
  resolveBuyerContext,
} from "./buyerContext";
import * as db from "../db";
import type { User } from "../../drizzle/schema";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

function mockDbRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ innerJoin });
  const select = vi.fn().mockReturnValue({ from });
  vi.mocked(db.getDb).mockResolvedValue({ select } as never);
}

const user = (id: number) => ({ id, name: "Test", email: "t@test.com" } as User);

describe("buyerContext", () => {
  beforeEach(() => {
    vi.mocked(db.getDb).mockReset();
  });

  it("getUserCustomerMembership returns row when active", async () => {
    mockDbRows([
      {
        membershipId: 10,
        customerAccountId: 5,
        userId: 1,
        role: "buyer_admin",
        status: "active",
        providerCompanyId: 100,
      },
    ]);
    const row = await getUserCustomerMembership(1, 5);
    expect(row).toEqual({
      membershipId: 10,
      customerAccountId: 5,
      userId: 1,
      role: "buyer_admin",
      status: "active",
      providerCompanyId: 100,
    });
  });

  it("getUserCustomerMembership returns null when no row", async () => {
    mockDbRows([]);
    expect(await getUserCustomerMembership(1, 999)).toBeNull();
  });

  it("requireCustomerAccountMembership denies wrong account (NOT_FOUND)", async () => {
    mockDbRows([]);
    await expect(requireCustomerAccountMembership(user(1), 42)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("requireCustomerAccountMembership denies inactive member", async () => {
    mockDbRows([
      {
        membershipId: 10,
        customerAccountId: 5,
        userId: 1,
        role: "buyer_viewer",
        status: "revoked",
        providerCompanyId: 100,
      },
    ]);
    await expect(requireCustomerAccountMembership(user(1), 5)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("requireCustomerAccountMembership allows active member independent of company workspace", async () => {
    mockDbRows([
      {
        membershipId: 10,
        customerAccountId: 5,
        userId: 1,
        role: "buyer_finance",
        status: "active",
        providerCompanyId: 100,
      },
    ]);
    const row = await requireCustomerAccountMembership(user(1), 5);
    expect(row.providerCompanyId).toBe(100);
    expect(row.role).toBe("buyer_finance");
  });

  it("resolveBuyerContext returns BuyerContext for active member", async () => {
    mockDbRows([
      {
        membershipId: 10,
        customerAccountId: 5,
        userId: 1,
        role: "buyer_operations",
        status: "active",
        providerCompanyId: 200,
      },
    ]);
    const ctx = await resolveBuyerContext(user(1), { customerAccountId: 5 });
    expect(ctx).toEqual({
      customerAccountId: 5,
      providerCompanyId: 200,
      role: "buyer_operations",
      membershipId: 10,
    });
  });

  it("requireCustomerAccountMembership throws UNAUTHORIZED when user is null", async () => {
    mockDbRows([]);
    await expect(requireCustomerAccountMembership(null, 5)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("getUserCustomerMembership returns null when db unavailable", async () => {
    vi.mocked(db.getDb).mockResolvedValue(null);
    expect(await getUserCustomerMembership(1, 5)).toBeNull();
  });
});
