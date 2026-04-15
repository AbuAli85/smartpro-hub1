// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, role: "user", platformRole: "company_admin", email: "u@test.om", name: "Sam" },
    isLoading: false,
  }),
}));

vi.mock("@/contexts/ActiveCompanyContext", () => ({
  useActiveCompany: () => ({
    activeCompanyId: null,
    activeCompany: null,
    companies: [],
    loading: false,
    switchCompany: vi.fn(),
    expiryWarningDays: 30,
  }),
}));

vi.mock("@/hooks/useSmartRoleHomeRedirect", () => ({
  useSmartRoleHomeRedirect: () => {},
}));

vi.mock("@/lib/trpc", () => ({
  trpc: (() => {
    const emptyQuery = { data: undefined, isLoading: false, isFetching: false, error: null };
    const makeNode = (): Record<string, unknown> =>
      new Proxy(
        {},
        {
          get: (_target, prop) => {
            if (prop === "useQuery" || prop === "useInfiniteQuery") return () => emptyQuery;
            if (prop === "useMutation") return () => ({ mutate: vi.fn(), isPending: false });
            if (prop === "useUtils") return () => ({ operations: { getRoleActionQueue: { prefetch: vi.fn() } } });
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
    seesPlatformOperatorNav: () => false,
    clientNavItemVisible: () => true,
  };
});

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
  useLocation: () => ["/dashboard", vi.fn()],
}));

vi.mock("@/components/OwnerSetupChecklist", () => ({ default: () => null }));
vi.mock("@/components/WorkforceHealthWidget", () => ({ WorkforceHealthWidget: () => null }));
vi.mock("@/components/contracts/ContractKpiWidget", () => ({ ContractKpiWidget: () => null }));
vi.mock("@/components/dashboard/ExecutiveControlTower", () => ({ ExecutiveControlTower: () => null }));
vi.mock("@/components/dashboard/ManagementCadencePanel", () => ({ ManagementCadencePanel: () => null }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        "dashboard:greeting.morning": "Good morning",
        "dashboard:greeting.afternoon": "Good afternoon",
        "dashboard:greeting.evening": "Good evening",
        "dashboard:preCompany.subtitle": "Set up your business workspace",
        "dashboard:preCompany.heroTitle": "Create or join a company workspace",
        "dashboard:preCompany.heroBody": "Create a company workspace or join an existing team.",
        "dashboard:preCompany.chips.teamHr": "Team & HR tools",
        "dashboard:preCompany.chips.contracts": "Contracts & documents",
        "dashboard:preCompany.chips.compliance": "Compliance & expiry alerts",
        "dashboard:preCompany.chips.tasks": "Tasks & operations",
        "dashboard:preCompany.ctaCreate": "Create company workspace",
        "dashboard:preCompany.ctaJoin": "Join existing company",
        "dashboard:preCompany.ctaExplore": "Explore services",
        "dashboard:preCompany.joinHint": "Have an invite?",
        "dashboard:preCompany.nextSteps": "Next steps",
        "dashboard:preCompany.activityTitle": "Workspace activity",
        "dashboard:preCompany.activityEmpty": "No activity yet.",
        "dashboard:preCompany.activityHint": "Activity will appear after setup.",
        "dashboard:preCompany.cards.profileTitle": "Complete your profile",
        "dashboard:preCompany.cards.profileDesc": "Add your details.",
        "dashboard:preCompany.cards.guideTitle": "Learn what SmartPRO can do",
        "dashboard:preCompany.cards.guideDesc": "Walk through modules.",
        "dashboard:preCompany.cards.inviteTitle": "Join via invitation",
        "dashboard:preCompany.cards.inviteDesc": "Use the invite link.",
        "dashboard:preCompany.cards.marketplaceTitle": "Explore SmartPRO services",
        "dashboard:preCompany.cards.marketplaceDesc": "Browse the marketplace.",
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
    i18n: { language: "en-GB" },
  }),
}));

describe("Dashboard pre-company workspace", () => {
  it("renders onboarding setup hero instead of business command-center copy", () => {
    render(<Dashboard />);
    expect(screen.getByText("Create or join a company workspace")).toBeInTheDocument();
    expect(screen.queryByText(/Command center — your business at a glance/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create company workspace/i })).toHaveAttribute("href", "/company/create");
    expect(screen.getByRole("link", { name: /Join existing company/i })).toHaveAttribute("href", "/onboarding-guide");
  });
});
