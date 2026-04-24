// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TeamAccessPage, { matchesEmployeeListFilter, topIssueKeyToEmployeeFilter } from "./TeamAccessPage";

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
        accessAnalyticsOverview: { invalidate: vi.fn() },
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
      accessAnalyticsOverview: {
        useQuery: () => ({ data: null, isLoading: false }),
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
      recentAccessAudit: {
        useQuery: () => ({ data: [], isLoading: false }),
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

function statValueByLabel(label: string): string {
  const candidates = screen.getAllByText(label);
  const labelNode = candidates.find((el) => {
    const parent = el.parentElement;
    if (!parent || parent.children.length < 2) return false;
    return el === parent.children[1] && el.textContent?.trim() === label;
  });
  if (!labelNode) {
    throw new Error(`Could not find stat card label: ${label}`);
  }
  const wrapper = labelNode.parentElement;
  const valueNode = wrapper?.firstElementChild;
  return valueNode?.textContent?.trim() ?? "";
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
    expect(await screen.findByText("Account not linked")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /link account/i })).toBeInTheDocument();
  });

  it("shows identity conflict chip and opens review dialog with guidance", async () => {
    mockState.employees = [
      baseEmployee({
        accessState: "ACTIVE",
        flags: { needsLink: true, conflict: true, missingEmail: false },
        primaryAction: "RESOLVE_CONFLICT",
        stateReason: "CONFLICT_IDENTITY_MISMATCH",
      }),
    ];

    render(<TeamAccessPage initialTab="employees" />);
    expect(await screen.findByText("Identity conflict")).toBeInTheDocument();
    const reviewBtn = await screen.findByRole("button", { name: /review conflict/i });
    expect(reviewBtn).not.toBeDisabled();
    fireEvent.click(reviewBtn);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/HR record and login do not line up/i)).toBeInTheDocument();
  });

  it("shows Missing Email indicator and Add Email action", async () => {
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
    expect(await screen.findByText("Missing email")).toBeInTheDocument();
    const addEmailBtn = await screen.findByRole("button", { name: /add email/i });
    expect(addEmailBtn).not.toBeDisabled();
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

  it("renders canonical stat card values and needs-attention count", async () => {
    mockState.employees = [
      baseEmployee({
        employeeId: 11,
        accessState: "ACTIVE",
        flags: { needsLink: false, conflict: false, missingEmail: false },
      }),
      baseEmployee({
        employeeId: 12,
        accessState: "INVITED",
        accessStatus: "no_access",
        flags: { needsLink: false, conflict: false, missingEmail: false },
      }),
      baseEmployee({
        employeeId: 13,
        accessState: "SUSPENDED",
        accessStatus: "inactive",
        flags: { needsLink: true, conflict: false, missingEmail: false },
      }),
      baseEmployee({
        employeeId: 14,
        accessState: "HR_ONLY",
        accessStatus: "no_access",
        flags: { needsLink: false, conflict: true, missingEmail: true },
      }),
    ];

    render(<TeamAccessPage initialTab="employees" />);
    expect(await screen.findByText("Total Employees")).toBeInTheDocument();
    expect(statValueByLabel("Total Employees")).toBe("4");
    expect(statValueByLabel("Direct Access Only")).toBe("0");
    expect(statValueByLabel("With Active Access")).toBe("1");
    expect(statValueByLabel("Pending Invites")).toBe("1");
    expect(statValueByLabel("Suspended")).toBe("1");
    expect(statValueByLabel("Needs Attention")).toBe("2");
  });

  it("counts Direct Access Only for active members with no HR employee row", async () => {
    mockState.members = [
      { memberId: 100, userId: 1, role: "company_member", isActive: true, name: "Linked", email: "linked@acme.com" },
      { memberId: 200, userId: 2, role: "company_member", isActive: true, name: "Direct", email: "direct@acme.com" },
    ];
    mockState.employees = [
      baseEmployee({
        employeeId: 1,
        memberId: 100,
        accessState: "ACTIVE",
        flags: { needsLink: false, conflict: false, missingEmail: false },
      }),
    ];

    render(<TeamAccessPage initialTab="employees" />);
    expect(await screen.findByText("Direct Access Only")).toBeInTheDocument();
    expect(statValueByLabel("Direct Access Only")).toBe("1");
  });
});

describe("matchesEmployeeListFilter", () => {
  const row = (state: string, flags?: { needsLink?: boolean; conflict?: boolean; missingEmail?: boolean }) => ({
    canonicalAccessState: state as "HR_ONLY" | "INVITED" | "ACTIVE" | "SUSPENDED",
    canonicalFlags: flags ?? {},
  });

  it("filters by canonical accessState (not email)", () => {
    expect(matchesEmployeeListFilter(row("ACTIVE"), "ACTIVE")).toBe(true);
    expect(matchesEmployeeListFilter(row("INVITED"), "INVITED")).toBe(true);
    expect(matchesEmployeeListFilter(row("SUSPENDED"), "SUSPENDED")).toBe(true);
    expect(matchesEmployeeListFilter(row("HR_ONLY"), "HR_ONLY")).toBe(true);
    expect(matchesEmployeeListFilter(row("ACTIVE"), "INVITED")).toBe(false);
  });

  it("needs_attention uses membership/HR flags only — unlinked HR row with same email still flags if needsLink etc.", () => {
    expect(matchesEmployeeListFilter(row("ACTIVE", { needsLink: true }), "needs_attention")).toBe(true);
    expect(matchesEmployeeListFilter(row("HR_ONLY", { conflict: true }), "needs_attention")).toBe(true);
    expect(matchesEmployeeListFilter(row("ACTIVE", {}), "needs_attention")).toBe(false);
  });

  it("all passes every row", () => {
    expect(matchesEmployeeListFilter(row("ACTIVE"), "all")).toBe(true);
    expect(matchesEmployeeListFilter(row("HR_ONLY", { missingEmail: true }), "all")).toBe(true);
  });

  it("reconciles stat buckets with filtered row counts (empty search)", () => {
    const rows = [
      { canonicalAccessState: "ACTIVE" as const, canonicalFlags: {} },
      { canonicalAccessState: "INVITED" as const, canonicalFlags: {} },
      { canonicalAccessState: "SUSPENDED" as const, canonicalFlags: { needsLink: true } },
      { canonicalAccessState: "HR_ONLY" as const, canonicalFlags: { conflict: true, missingEmail: true } },
    ];
    const count = (f: "all" | "ACTIVE" | "SUSPENDED" | "INVITED" | "HR_ONLY" | "needs_attention") =>
      rows.filter((r) => matchesEmployeeListFilter(r, f)).length;
    expect(count("all")).toBe(4);
    expect(count("ACTIVE")).toBe(1);
    expect(count("INVITED")).toBe(1);
    expect(count("SUSPENDED")).toBe(1);
    expect(count("HR_ONLY")).toBe(1);
    expect(count("needs_attention")).toBe(2);
  });
});

describe("topIssueKeyToEmployeeFilter", () => {
  it("maps synthetic keys to needs_attention", () => {
    expect(topIssueKeyToEmployeeFilter("ACCOUNT_NOT_LINKED")).toBe("needs_attention");
    expect(topIssueKeyToEmployeeFilter("MISSING_EMAIL")).toBe("needs_attention");
    expect(topIssueKeyToEmployeeFilter("IDENTITY_CONFLICT")).toBe("needs_attention");
  });

  it("maps STATE_REASON keys to the closest HR Employees filter", () => {
    expect(topIssueKeyToEmployeeFilter("STATE_REASON:INVITED_PENDING")).toBe("INVITED");
    expect(topIssueKeyToEmployeeFilter("STATE_REASON:HR_ONLY")).toBe("HR_ONLY");
    expect(topIssueKeyToEmployeeFilter("STATE_REASON:CONFLICT_EMAIL_MISMATCH")).toBe("needs_attention");
    expect(topIssueKeyToEmployeeFilter("STATE_REASON:ACTIVE_MEMBER_LINK_DRIFT")).toBe("needs_attention");
    expect(topIssueKeyToEmployeeFilter("STATE_REASON:ACTIVE_MEMBER")).toBe("ACTIVE");
    expect(topIssueKeyToEmployeeFilter("STATE_REASON:SUSPENDED_MEMBER")).toBe("SUSPENDED");
  });

  it("defaults unknown keys to needs_attention", () => {
    expect(topIssueKeyToEmployeeFilter("UNKNOWN_BUCKET")).toBe("needs_attention");
  });
});
