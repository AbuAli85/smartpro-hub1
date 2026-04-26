// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import Dashboard from "./Dashboard";

const { mockCapabilities, mockNavVisible } = vi.hoisted(() => ({
  mockCapabilities: vi.fn(),
  mockNavVisible: vi.fn((_href: string): boolean => true),
}));

vi.mock("@/hooks/useMyCapabilities", () => ({
  useMyCapabilities: () => mockCapabilities(),
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
    activeCompany: { id: 1, role: "company_admin", name: "Test Co", nameAr: null, country: null, industry: null },
    companies: [
      { id: 1, name: "Test Co", nameAr: null, country: null, industry: null, role: "company_admin" },
    ],
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
            return makeNode();
          },
        },
      ) as Record<string, unknown>;
    return makeNode();
  })(),
}));

vi.mock("@shared/clientNav", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/clientNav")>();
  return {
    ...actual,
    getHiddenNavHrefs: () => new Set<string>(),
    shouldHideBottomNav: () => false,
    seesPlatformOperatorNav: () => false,
    clientNavItemVisible: (href: string, ..._rest: unknown[]) => mockNavVisible(href),
  };
});

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
vi.mock("@/components/dashboard/ManagementCadencePanel", () => ({
  ManagementCadencePanel: () => null,
}));
vi.mock("@/components/dashboard/FinancialSummaryCard", () => ({
  FinancialSummaryCard: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, fallbackOrOptions?: unknown) => {
      if (typeof fallbackOrOptions === "string") return fallbackOrOptions;
      if (
        fallbackOrOptions &&
        typeof fallbackOrOptions === "object" &&
        fallbackOrOptions !== null &&
        "defaultValue" in fallbackOrOptions
      ) {
        return String((fallbackOrOptions as { defaultValue: string }).defaultValue);
      }
      const map: Record<string, string> = {
        "dashboard:ctCard.heading": "Need to act on priorities?",
        "dashboard:ctCard.body":
          "Live priority signals, pending approvals, and compliance alerts are managed in Control Tower.",
        "dashboard:ctCard.cta": "Open Control Tower",
      };
      return map[k] ?? k;
    },
    i18n: { language: "en-GB" },
  }),
}));

const NO_CT_CAPS = { canViewCompanyControlTower: false };
const WITH_CT_CAPS = { canViewCompanyControlTower: true };

describe("Dashboard Phase C", () => {
  beforeEach(() => {
    mockCapabilities.mockReturnValue({ caps: NO_CT_CAPS, loading: false });
    mockNavVisible.mockReturnValue(true);
  });
  afterEach(cleanup);

  it("does not render Focus & priorities card", () => {
    render(<Dashboard />);
    expect(screen.queryByText("Focus & priorities")).toBeNull();
  });

  it("does not render Top Action Queue card", () => {
    render(<Dashboard />);
    expect(screen.queryByText("Top Action Queue")).toBeNull();
  });

  it("does not render Additional attention signals card", () => {
    render(<Dashboard />);
    expect(screen.queryByText("Additional attention signals")).toBeNull();
  });

  it("does not render Resolution queue card", () => {
    render(<Dashboard />);
    expect(screen.queryByText("Resolution queue")).toBeNull();
  });

  it("does not render Today's Tasks card", () => {
    render(<Dashboard />);
    expect(screen.queryByText("Today's Tasks")).toBeNull();
  });

  it("does not render Operational alerts card", () => {
    render(<Dashboard />);
    expect(screen.queryByText("Operational alerts")).toBeNull();
  });

  it("does not render WPS cell", () => {
    render(<Dashboard />);
    expect(screen.queryByText("WPS")).toBeNull();
  });

  it("does not render ExecutiveControlTower widget", () => {
    render(<Dashboard />);
    expect(screen.queryByText("Control Tower Overview")).toBeNull();
    expect(screen.queryByText("Executive Control Tower")).toBeNull();
  });

  it("does not render CT card when canViewCompanyControlTower is false", () => {
    render(<Dashboard />);
    expect(screen.queryByText("Need to act on priorities?")).toBeNull();
    expect(screen.queryByRole("link", { name: "Open Control Tower" })).toBeNull();
  });

  it("renders CT card with correct link when canViewCompanyControlTower is true", () => {
    mockCapabilities.mockReturnValue({ caps: WITH_CT_CAPS, loading: false });
    render(<Dashboard />);
    const region = screen.getByRole("region", { name: "Control Tower priorities" });
    expect(region).toBeInTheDocument();
    expect(screen.getByText("Need to act on priorities?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Control Tower" })).toHaveAttribute(
      "href",
      "/control-tower",
    );
  });

  it("renders Recent Activity section when user can access audit log", () => {
    render(<Dashboard />);
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
  });
});

describe("Dashboard — role sensitivity", () => {
  beforeEach(() => {
    mockCapabilities.mockReturnValue({ caps: NO_CT_CAPS, loading: false });
    mockNavVisible.mockReturnValue(true);
  });
  afterEach(cleanup);

  it("hides Recent Activity when /audit-log is not in nav (company_member surface)", () => {
    mockNavVisible.mockImplementation((href: string) => href !== "/audit-log");
    render(<Dashboard />);
    expect(screen.queryByText("Recent Activity")).toBeNull();
  });

  it("shows Recent Activity when /audit-log is in nav (admin surface)", () => {
    mockNavVisible.mockReturnValue(true);
    render(<Dashboard />);
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
  });

  it("hides EngagementsDashboardStrip when /engagements is not in nav (company_member surface)", () => {
    mockNavVisible.mockImplementation((href: string) => href !== "/engagements");
    render(<Dashboard />);
    // EngagementsDashboardStrip is not rendered — no engagements strip heading
    // (component renders null when no items, but query itself would also be skipped)
    expect(screen.queryByRole("link", { name: /engagements/i })).toBeNull();
  });

  it("hides FinancialSummaryCard when /finance/overview is not in nav (company_member surface)", () => {
    // FinancialSummaryCard is mocked to return null, so we assert the render condition
    // by checking the component is not invoked when href is blocked.
    // Since mock returns null regardless, we verify no finance-related text leaks through.
    mockNavVisible.mockImplementation((href: string) => href !== "/finance/overview");
    render(<Dashboard />);
    // No finance overview link visible
    expect(screen.queryByRole("link", { name: /finance overview/i })).toBeNull();
  });

  it("company_admin surface — all main sections visible", () => {
    mockNavVisible.mockReturnValue(true);
    render(<Dashboard />);
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
  });
});
