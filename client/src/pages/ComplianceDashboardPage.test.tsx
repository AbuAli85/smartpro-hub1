// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";

vi.stubGlobal("React", React);
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, role: "user", platformRole: "company_admin", email: "admin@test.om", name: "Admin" },
    isLoading: false,
  }),
}));

vi.mock("@/contexts/ActiveCompanyContext", () => ({
  useActiveCompany: () => ({
    activeCompanyId: 1,
    activeCompany: { id: 1, role: "company_admin", name: "Test Co" },
    loading: false,
  }),
}));

const { mockCtSummaryQuery, mockCaps } = vi.hoisted(() => {
  const mockCtSummaryQuery = vi.fn().mockReturnValue({ data: undefined, isLoading: false });
  const mockCaps = vi.fn().mockReturnValue({
    caps: {
      canViewCompanyControlTower: true,
      canViewPlatformControlTower: false,
      canManageControlTowerItems: false,
      canAssignControlTowerItems: false,
      canResolveControlTowerItems: false,
    },
    loading: false,
  });
  return { mockCtSummaryQuery, mockCaps };
});

vi.mock("@/hooks/useMyCapabilities", () => ({
  useMyCapabilities: mockCaps,
}));

vi.mock("@shared/clientNav", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/clientNav")>();
  return { ...actual, seesPlatformOperatorNav: () => false };
});

const queryResult = { data: undefined, isLoading: false, isFetching: false, error: null };

vi.mock("@/lib/trpc", () => ({
  trpc: new Proxy(
    {},
    {
      get: (_t, ns) => {
        if (ns === "controlTower") {
          return {
            summary: { useQuery: mockCtSummaryQuery },
          };
        }
        return new Proxy(
          {},
          {
            get: (_t2, key) => {
              if (key === "useQuery" || key === "useInfiniteQuery") return () => queryResult;
              if (key === "useMutation") return () => ({ mutate: vi.fn(), isPending: false });
              return new Proxy({}, { get: () => () => queryResult });
            },
          },
        );
      },
    },
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, opts?: unknown) => {
      if (opts && typeof opts === "object" && "defaultValue" in (opts as object))
        return String((opts as { defaultValue: string }).defaultValue);
      return k;
    },
    i18n: { language: "en-GB" },
  }),
}));

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import ComplianceDashboardPage from "./ComplianceDashboardPage";

afterEach(cleanup);

describe("ComplianceDashboardPage CT signal banner", () => {
  beforeEach(() => {
    mockCaps.mockReturnValue({
      caps: {
        canViewCompanyControlTower: true,
        canViewPlatformControlTower: false,
        canManageControlTowerItems: false,
        canAssignControlTowerItems: false,
        canResolveControlTowerItems: false,
      },
      loading: false,
    });
  });

  it("shows banner when compliance signals > 0", () => {
    mockCtSummaryQuery.mockReturnValue({
      data: {
        totalOpen: 5,
        bySeverity: { critical: 0, high: 1, medium: 2, low: 2 },
        byDomain: { compliance: 3 },
        visibleDomains: ["compliance"],
      },
      isLoading: false,
    });

    render(<ComplianceDashboardPage />);

    const banner = screen.getByRole("region", { name: "Control Tower compliance signals" });
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent("3 open compliance signals in Control Tower");
    expect(screen.getByRole("link", { name: /View in Control Tower/ })).toHaveAttribute(
      "href",
      "/control-tower?domain=compliance",
    );
  });

  it("shows singular copy for exactly 1 signal", () => {
    mockCtSummaryQuery.mockReturnValue({
      data: {
        totalOpen: 1,
        bySeverity: { critical: 0, high: 0, medium: 1, low: 0 },
        byDomain: { compliance: 1 },
        visibleDomains: ["compliance"],
      },
      isLoading: false,
    });

    render(<ComplianceDashboardPage />);

    expect(screen.getByRole("region", { name: "Control Tower compliance signals" })).toHaveTextContent(
      "1 open compliance signal in Control Tower",
    );
  });

  it("does not show banner when compliance signals = 0", () => {
    mockCtSummaryQuery.mockReturnValue({
      data: {
        totalOpen: 2,
        bySeverity: { critical: 0, high: 0, medium: 1, low: 1 },
        byDomain: { hr: 2 },
        visibleDomains: ["hr"],
      },
      isLoading: false,
    });

    render(<ComplianceDashboardPage />);

    expect(screen.queryByRole("region", { name: "Control Tower compliance signals" })).toBeNull();
  });

  it("does not show banner when user lacks canViewCompanyControlTower", () => {
    mockCaps.mockReturnValue({
      caps: { canViewCompanyControlTower: false },
      loading: false,
    });
    mockCtSummaryQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<ComplianceDashboardPage />);

    expect(screen.queryByRole("region", { name: "Control Tower compliance signals" })).toBeNull();
  });

  it("does not break when CT query returns no data", () => {
    mockCtSummaryQuery.mockReturnValue({ data: undefined, isLoading: false });

    render(<ComplianceDashboardPage />);

    expect(screen.queryByRole("region", { name: "Control Tower compliance signals" })).toBeNull();
  });
});
