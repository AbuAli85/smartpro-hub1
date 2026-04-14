// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TeamAccessPage from "./TeamAccessPage";

const { mockState, mockMutation } = vi.hoisted(() => ({
  mockState: {
    employees: [] as any[],
    members: [] as any[],
    invites: [] as any[],
  },
  mockMutation: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, email: "owner@acme.com", name: "Owner", role: "admin", platformRole: "company_admin" },
  }),
}));

vi.mock("@/contexts/ActiveCompanyContext", () => ({
  useActiveCompany: () => ({
    activeCompanyId: 10,
    activeCompany: { id: 10, role: "company_admin", name: "Acme" },
    companies: [{ id: 10, name: "Acme", role: "company_admin" }, { id: 11, name: "Beta", role: "company_admin" }],
    loading: false,
  }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/company/team-access", vi.fn()],
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      companies: {
        employeesWithAccess: { invalidate: vi.fn() },
        members: { invalidate: vi.fn() },
        listInvites: { invalidate: vi.fn() },
      },
      auth: { me: { invalidate: vi.fn() } },
    }),
    companies: {
      employeesWithAccess: {
        useQuery: () => ({ data: mockState.employees, isLoading: false, refetch: vi.fn() }),
      },
      members: {
        useQuery: () => ({ data: mockState.members, isLoading: false }),
      },
      listInvites: {
        useQuery: () => ({ data: mockState.invites, refetch: vi.fn() }),
      },
      revokeInvite: {
        useMutation: () => ({ mutate: mockMutation, isPending: false }),
      },
      grantMultiCompanyAccess: {
        useMutation: () => ({ mutate: mockMutation, isPending: false }),
      },
      grantEmployeeAccess: {
        useMutation: () => ({ mutate: mockMutation, isPending: false }),
      },
      revokeEmployeeAccess: {
        useMutation: () => ({ mutate: mockMutation, isPending: false }),
      },
      updateEmployeeAccessRole: {
        useMutation: () => ({ mutate: mockMutation, isPending: false }),
      },
      addMemberByEmail: {
        useMutation: () => ({ mutate: mockMutation, isPending: false }),
      },
      updateMemberRole: {
        useMutation: () => ({ mutate: mockMutation, isPending: false }),
      },
      linkMemberToEmployee: {
        useMutation: () => ({
          mutate: mockMutation,
          isPending: false,
          reset: vi.fn(),
          isError: false,
          error: null,
        }),
      },
      removeMember: {
        useMutation: () => ({ mutate: mockMutation, isPending: false }),
      },
    },
  },
}));

function baseEmployee(overrides: Record<string, unknown> = {}) {
  return {
    employeeId: 1,
    firstName: "Ali",
    lastName: "One",
    firstNameAr: null,
    lastNameAr: null,
    email: "ali@acme.com",
    department: "Ops",
    position: "Lead",
    employeeStatus: "active",
    employeeNumber: "E-001",
    nationality: "OM",
    hireDate: null,
    accessStatus: "active",
    memberRole: "company_member",
    memberId: 501,
    hasLogin: true,
    lastSignedIn: null,
    loginEmail: "ali@acme.com",
    ...overrides,
  };
}

describe("TeamAccessPage canonical rendering parity", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockMutation.mockReset();
    mockState.members = [];
    mockState.invites = [];
    mockState.employees = [];
  });

  it("renders Active + Change Role for canonical ACTIVE", async () => {
    mockState.employees = [
      baseEmployee({
        accessState: "ACTIVE",
        flags: { needsLink: false, conflict: false, missingEmail: false },
        primaryAction: "CHANGE_ROLE",
        stateReason: "ACTIVE_MEMBER",
      }),
    ];

    render(<TeamAccessPage initialTab="employees" />);
    expect(await screen.findByRole("button", { name: /change role/i })).toBeInTheDocument();
  });

  it("shows Needs Link indicator and Link Account primary action", async () => {
    mockState.employees = [
      baseEmployee({
        accessState: "ACTIVE",
        flags: { needsLink: true, conflict: false, missingEmail: false },
        primaryAction: "LINK_ACCOUNT",
        stateReason: "ACTIVE_MEMBER_LINK_DRIFT",
      }),
    ];

    render(<TeamAccessPage initialTab="employees" />);
    expect(await screen.findByText("Needs Link")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /link account/i })).toBeInTheDocument();
  });

  it("shows conflict indicator and disabled Review action", async () => {
    mockState.employees = [
      baseEmployee({
        accessState: "ACTIVE",
        flags: { needsLink: true, conflict: true, missingEmail: false },
        primaryAction: "RESOLVE_CONFLICT",
        stateReason: "CONFLICT_IDENTITY_MISMATCH",
      }),
    ];

    render(<TeamAccessPage initialTab="employees" />);
    expect(await screen.findByText("Conflict")).toBeInTheDocument();
    const reviewBtn = await screen.findByRole("button", { name: /review/i });
    expect(reviewBtn).toBeDisabled();
  });

  it("shows Missing Email indicator and disabled No Email action", async () => {
    mockState.employees = [
      baseEmployee({
        email: null,
        accessState: "HR_ONLY",
        accessStatus: "no_access",
        flags: { needsLink: false, conflict: false, missingEmail: true },
        primaryAction: "NONE",
        stateReason: "HR_ONLY_NO_IDENTITY",
      }),
    ];

    render(<TeamAccessPage initialTab="employees" />);
    expect(await screen.findByText("Missing Email")).toBeInTheDocument();
    const noEmailBtn = await screen.findByRole("button", { name: /no email/i });
    expect(noEmailBtn).toBeDisabled();
  });

  it("falls back to legacy accessStatus when canonical fields are absent", async () => {
    mockState.employees = [
      baseEmployee({
        accessStatus: "active",
        accessState: undefined,
        flags: undefined,
        primaryAction: undefined,
      }),
    ];

    render(<TeamAccessPage initialTab="employees" />);
    expect(await screen.findByRole("button", { name: /change role/i })).toBeInTheDocument();
  });
});
