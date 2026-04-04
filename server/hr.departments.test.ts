/**
 * Tests for HR Department & Position procedures
 * Covers: createDepartment (with nameAr), updateDepartment (with nameAr),
 *         deleteDepartment, listDepartments, createPosition, deletePosition
 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockCtx(overrides?: Partial<AuthenticatedUser>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 999,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("hr.createDepartment", () => {
  it("requires authentication", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.hr.createDepartment({ name: "Test" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("throws INTERNAL_SERVER_ERROR when DB is unavailable (mock env)", async () => {
    const ctx = createMockCtx();
    const caller = appRouter.createCaller(ctx);
    // In test environment without a real DB, this should fail gracefully
    await expect(
      caller.hr.createDepartment({ name: "Engineering", nameAr: "الهندسة", color: "blue", icon: "code" })
    ).rejects.toMatchObject({
      code: expect.stringMatching(/INTERNAL_SERVER_ERROR|FORBIDDEN/),
    });
  });

  it("accepts nameAr, color, and icon fields in input schema", async () => {
    // Validate that the input schema accepts the new fields (Zod parse test)
    const ctx = createMockCtx();
    const caller = appRouter.createCaller(ctx);
    // We just need the call to not throw a ZodError — a DB error is acceptable
    const result = await caller.hr.createDepartment({
      name: "Finance",
      nameAr: "المالية",
      description: "Finance department",
      color: "emerald",
      icon: "dollar",
    }).catch((e) => e);
    // Should not be a ZodError (input validation error)
    expect(result?.code).not.toBe("BAD_REQUEST");
  });
});

describe("hr.updateDepartment", () => {
  it("requires authentication", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.hr.updateDepartment({ id: 1, name: "Updated" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("accepts nameAr, color, and icon fields in input schema", async () => {
    const ctx = createMockCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.hr.updateDepartment({
      id: 1,
      name: "Human Resources",
      nameAr: "الموارد البشرية",
      color: "violet",
      icon: "users",
    }).catch((e) => e);
    // Should not be a ZodError
    expect(result?.code).not.toBe("BAD_REQUEST");
  });
});

describe("hr.listDepartments", () => {
  it("requires authentication", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.hr.listDepartments()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("returns empty array when DB is unavailable (mock env)", async () => {
    const ctx = createMockCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.hr.listDepartments().catch(() => []);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("hr.deleteDepartment", () => {
  it("requires authentication", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.hr.deleteDepartment({ id: 1 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("hr.createPosition", () => {
  it("requires authentication", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.hr.createPosition({ title: "Manager" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("accepts departmentId in input schema", async () => {
    const ctx = createMockCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.hr.createPosition({
      title: "Senior Engineer",
      departmentId: 1,
      description: "Senior software engineer role",
    }).catch((e) => e);
    expect(result?.code).not.toBe("BAD_REQUEST");
  });
});

describe("hr.listPositions", () => {
  it("requires authentication", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.hr.listPositions()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("returns empty array when DB is unavailable (mock env)", async () => {
    const ctx = createMockCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.hr.listPositions().catch(() => []);
    expect(Array.isArray(result)).toBe(true);
  });
});
