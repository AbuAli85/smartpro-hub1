// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";

const { mockRoleQueue } = vi.hoisted(() => ({
  mockRoleQueue: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, role: "user", platformRole: "company_admin", email: "owner@test.om", name: "Owner" },
    isLoading: false,
  }),
}));

vi.mock("@/contexts/ActiveCompanyContext", () => ({
  useActiveCompany: () => ({
    activeCompanyId: 1,
    activeCompany: { id: 1, role: "company_admin", name: "Test Co" },
    companies: [],
    loading: false,
    switchCompany: vi.fn(),
    expiryWarningDays: 30,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: (() => {
    const queryResult = { data: null, isLoading: false, isFetching: false, error: null };
    const makeNode = (): Record<string, unknown> =>
      new Proxy(
        {},
        {
          get: (_target, prop) => {
            if (prop === "useQuery" || prop === "useInfiniteQuery") return () => queryResult;
            if (prop === "useMutation") return () => ({ mutate: vi.fn(), isPending: false });
            if (prop === "useUtils") return () => ({ operations: { getRoleActionQueue: { prefetch: vi.fn() } } });
            if (prop === "operations") {
              return new Proxy(
                {
                  getRoleActionQueue: { useQuery: () => mockRoleQueue() },
                },
                {
                  get: (target, key) => (key in target ? (target as Record<string, unknown>)[String(key)] : makeNode()),
                },
              );
            }
            return makeNode();
          },
        },
      ) as Record<string, unknown>;
    const node = makeNode();
    return node;
  })(),
}));

vi.mock("@shared/clientNav", () => ({
  getHiddenNavHrefs: () => new Set<string>(),
  shouldHideBottomNav: () => false,
  seesPlatformOperatorNav: () => false,
  clientNavItemVisible: () => true,
}));

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
  useLocation: () => ["/dashboard", vi.fn()],
}));

vi.mock("@/components/OwnerSetupChecklist", () => ({
  OwnerSetupChecklist: () => null,
  default: () => null,
}));
vi.mock("@/components/WorkforceHealthWidget", () => ({
  WorkforceHealthWidget: () => null,
}));
vi.mock("@/components/contracts/ContractKpiWidget", () => ({
  ContractKpiWidget: () => null,
}));
vi.mock("@/components/dashboard/ExecutiveControlTower", () => ({
  ExecutiveControlTower: () => null,
}));
vi.mock("@/components/dashboard/ManagementCadencePanel", () => ({
  ManagementCadencePanel: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, fallbackOrOptions?: unknown) => (typeof fallbackOrOptions === "string" ? fallbackOrOptions : k),
    i18n: { language: "en-GB" },
  }),
}));

describe("Dashboard role queue widget", () => {
  beforeEach(() => {
    mockRoleQueue.mockReset();
  });

  it("renders empty queue state", () => {
    mockRoleQueue.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      error: null,
    });

    render(<Dashboard />);
    expect(screen.getByText("Focus view")).toBeInTheDocument();
    expect(screen.getByText("No urgent work detected.")).toBeInTheDocument();
  });

  it("renders non-empty queue state", () => {
    mockRoleQueue.mockReturnValue({
      data: [
        {
          id: "payroll-1",
          type: "payroll_blocker",
          title: "Payroll waiting for approval",
          severity: "critical",
          ownerUserId: "1",
          dueAt: null,
          status: "blocked",
          href: "/payroll",
          reason: "Current month run is not approved.",
        },
      ],
      isLoading: false,
      isFetching: false,
      error: null,
    });

    render(<Dashboard />);
    expect(screen.getByText("Payroll waiting for approval")).toBeInTheDocument();
    expect(screen.getByText("Owner: you")).toBeInTheDocument();
  });
});
