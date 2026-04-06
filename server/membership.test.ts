import { describe, expect, it, vi, beforeEach } from "vitest";
import * as db from "./db";
import * as tenant from "./_core/tenant";
import {
  getActiveCompanyMembership,
  requireActiveCompanyMembership,
  requireWorkspaceMembership,
} from "./_core/membership";

vi.mock("./_core/tenant", () => ({
  requireActiveCompanyId: vi.fn(),
}));

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserCompany: vi.fn(),
    getUserCompanyById: vi.fn(),
  };
});

describe("getActiveCompanyMembership", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompany).mockReset();
  });

  it("returns null when getUserCompany is null", async () => {
    vi.mocked(db.getUserCompany).mockResolvedValue(null);
    await expect(getActiveCompanyMembership(1)).resolves.toBeNull();
  });

  it("returns null when company id missing", async () => {
    vi.mocked(db.getUserCompany).mockResolvedValue({ company: {}, member: { role: "member" } } as any);
    await expect(getActiveCompanyMembership(1)).resolves.toBeNull();
  });

  it("returns companyId and role from active membership", async () => {
    vi.mocked(db.getUserCompany).mockResolvedValue({
      company: { id: 100 },
      member: { role: "hr_manager" },
    } as any);
    await expect(getActiveCompanyMembership(7)).resolves.toEqual({ companyId: 100, role: "hr_manager" });
  });
});

describe("requireActiveCompanyMembership", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompany).mockReset();
  });

  it("throws FORBIDDEN when no membership", async () => {
    vi.mocked(db.getUserCompany).mockResolvedValue(null);
    await expect(requireActiveCompanyMembership(1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns membership when present", async () => {
    vi.mocked(db.getUserCompany).mockResolvedValue({
      company: { id: 2 },
      member: { role: "member" },
    } as any);
    await expect(requireActiveCompanyMembership(1)).resolves.toEqual({ companyId: 2, role: "member" });
  });
});

describe("requireWorkspaceMembership", () => {
  const user = { id: 5 } as any;

  beforeEach(() => {
    vi.mocked(tenant.requireActiveCompanyId).mockReset();
    vi.mocked(db.getUserCompanyById).mockReset();
  });

  it("returns companyId and role after requireActiveCompanyId + getUserCompanyById", async () => {
    vi.mocked(tenant.requireActiveCompanyId).mockResolvedValue(42);
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 42 },
      member: { role: "hr_manager" },
    } as any);
    await expect(requireWorkspaceMembership(user, 42)).resolves.toEqual({ companyId: 42, role: "hr_manager" });
    expect(tenant.requireActiveCompanyId).toHaveBeenCalledWith(5, 42, user);
  });

  it("throws FORBIDDEN when member row missing after cid resolution", async () => {
    vi.mocked(tenant.requireActiveCompanyId).mockResolvedValue(42);
    vi.mocked(db.getUserCompanyById).mockResolvedValue(null);
    await expect(requireWorkspaceMembership(user, 42)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
