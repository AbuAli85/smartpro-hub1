// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, cleanup, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);
import ExpiryAlertsPage from "./ExpiryAlertsPage";

// ─── Arabic translation map (mirrors ar-OM/alerts.json) ──────────────────────

const AR: Record<string, string> = {
  // page
  "page.title": "تنبيهات انتهاء الصلاحية والتجديد",
  "page.subtitle":
    "تتبع انتهاء الصلاحية في الوقت الفعلي — تصاريح العمل والتأشيرات وPASI وCR ورخص ساند والوثائق الوظيفية · عُمان ودول الخليج",
  "page.breadcrumb": "تنبيهات انتهاء الصلاحية",
  // source badges
  "sourceBadges.ministryOfLabour": "وزارة العمل",
  "sourceBadges.pasi": "PASI",
  "sourceBadges.ropVisa": "تأشيرة الشرطة الملكية",
  "sourceBadges.crRenewal": "تجديد السجل التجاري",
  "sourceBadges.sanadLicence": "رخصة ساند",
  // actions
  "actions.refresh": "تحديث",
  "actions.clearFilters": "مسح الفلاتر",
  "actions.view": "عرض",
  "actions.renew": "تجديد",
  // severity
  "severity.critical": "حرج",
  "severity.high": "مرتفع",
  "severity.medium": "متوسط",
  "severity.low": "منخفض",
  "severity.criticalDays": "≤ 7 أيام",
  "severity.highDays": "≤ 30 يوماً",
  "severity.mediumDays": "≤ 60 يوماً",
  "severity.lowDays": "≤ 90 يوماً",
  // category
  "category.work_permit": "تصريح عمل",
  "category.visa": "تأشيرة",
  "category.resident_card": "بطاقة إقامة",
  "category.labour_card": "بطاقة عمل",
  "category.pro_service": "خدمة PRO",
  "category.sanad_licence": "رخصة ساند",
  "category.officer_document": "وثيقة المسؤول",
  "category.employee_document": "وثيقة الموظف",
  // filters
  "filters.searchPlaceholder": "البحث في التنبيهات...",
  "filters.allCategories": "جميع الفئات",
  "filters.allSeverities": "جميع مستويات الخطورة",
  "filters.next7Days": "الـ 7 أيام القادمة",
  "filters.next30Days": "الـ 30 يوماً القادمة",
  "filters.next60Days": "الـ 60 يوماً القادمة",
  "filters.next90Days": "الـ 90 يوماً القادمة",
  "filters.next180Days": "الـ 180 يوماً القادمة",
  // list
  "list.showing_one": "عرض {{count}} تنبيه",
  "list.showing_other": "عرض {{count}} تنبيهات",
  "list.filteredFrom": "(مُصفَّى من {{total}})",
  "list.expires": "ينتهي",
  "list.days": "أيام",
  // empty state
  "emptyState.title": "لا توجد تنبيهات",
  "emptyState.allUpToDate": "جميع الوثائق والتصاريح محدّثة ضمن الفترة المحددة.",
  "emptyState.noMatch": "لا توجد تنبيهات تطابق الفلاتر الحالية.",
};

/** Resolve count-based plurals and basic interpolation. */
function arT(key: string, opts?: Record<string, unknown>): string {
  // i18next plural suffix: _one (count=1) / _other (everything else)
  const count = opts?.count as number | undefined;
  const pluralKey = count === 1 ? `${key}_one` : `${key}_other`;
  const raw = AR[pluralKey] ?? AR[key] ?? key;
  // Replace {{variable}} placeholders
  return raw.replace(/\{\{(\w+)\}\}/g, (_, name) => String(opts?.[name] ?? `{{${name}}}`));
}

// ─── react-i18next mock ───────────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: arT,
    i18n: { language: "ar-OM" },
  }),
  Trans: ({
    t: tFn,
    i18nKey,
    count,
    values,
  }: {
    t?: typeof arT;
    i18nKey: string;
    count?: number;
    values?: Record<string, unknown>;
  }) => {
    const fn = tFn ?? arT;
    const text = fn(i18nKey, { count, ...values });
    // Strip <bold>…</bold> tags — just render the inner text
    return <span>{text.replace(/<\/?bold>/g, "")}</span>;
  },
}));

// ─── Dependency mocks ─────────────────────────────────────────────────────────

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, name: "Test", email: "t@example.com" }, isLoading: false }),
}));

vi.mock("@/contexts/ActiveCompanyContext", () => ({
  useActiveCompany: () => ({ activeCompanyId: 1 }),
}));

vi.mock("@shared/clientNav", () => ({
  seesPlatformOperatorNav: () => false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    alerts: {
      getExpiryAlerts: {
        useQuery: () => ({
          data: {
            alerts: [],
            summary: { critical: 3, high: 1, medium: 0, low: 0, total: 4 },
          },
          isLoading: false,
          isFetching: false,
          refetch: vi.fn(),
        }),
      },
      triggerRenewal: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      getAlertBadgeCount: { invalidate: vi.fn() },
    },
    useUtils: () => ({
      alerts: {
        getExpiryAlerts: { invalidate: vi.fn() },
        getAlertBadgeCount: { invalidate: vi.fn() },
      },
    }),
  },
}));

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/hub/HubBreadcrumb", () => ({
  HubBreadcrumb: ({ items }: { items: { label: string }[] }) => (
    <nav aria-label="breadcrumb">
      {items.map((item, i) => (
        <span key={i}>{item.label}</span>
      ))}
    </nav>
  ),
}));

vi.mock("@/components/hub/hubCrumbs", () => ({
  renewalsTrail: (pageTitle: string) => [
    { label: "الرئيسية", href: "/dashboard" },
    { label: "الامتثال", href: "/compliance" },
    { label: "التجديدات وانتهاء الصلاحية", href: "/compliance/renewals" },
    { label: pageTitle },
  ],
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ExpiryAlertsPage — Arabic / RTL translations", () => {
  it("renders the Arabic page title", () => {
    render(
      <div dir="rtl" lang="ar-OM">
        <ExpiryAlertsPage />
      </div>,
    );
    expect(screen.getByText("تنبيهات انتهاء الصلاحية والتجديد")).toBeInTheDocument();
  });

  it("renders the Arabic breadcrumb label", () => {
    render(<ExpiryAlertsPage />);
    const nav = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(within(nav).getByText("تنبيهات انتهاء الصلاحية")).toBeInTheDocument();
  });

  it("renders Arabic severity card labels", () => {
    render(<ExpiryAlertsPage />);
    expect(screen.getAllByText("حرج").length).toBeGreaterThan(0);
    expect(screen.getByText("مرتفع")).toBeInTheDocument();
    expect(screen.getByText("متوسط")).toBeInTheDocument();
    expect(screen.getByText("منخفض")).toBeInTheDocument();
  });

  it("renders Arabic days-threshold labels on severity cards", () => {
    render(<ExpiryAlertsPage />);
    expect(screen.getByText("≤ 7 أيام")).toBeInTheDocument();
    expect(screen.getByText("≤ 30 يوماً")).toBeInTheDocument();
  });

  it("renders Arabic source-authority badges", () => {
    render(<ExpiryAlertsPage />);
    expect(screen.getByText("وزارة العمل")).toBeInTheDocument();
    expect(screen.getByText("تأشيرة الشرطة الملكية")).toBeInTheDocument();
  });

  it("renders Arabic empty-state message (no matching alerts)", () => {
    render(<ExpiryAlertsPage />);
    expect(screen.getByText("لا توجد تنبيهات")).toBeInTheDocument();
    // summary.total > 0 so "noMatch" variant should show
    expect(
      screen.getByText("لا توجد تنبيهات تطابق الفلاتر الحالية."),
    ).toBeInTheDocument();
  });

  it("renders Arabic refresh button label", () => {
    render(<ExpiryAlertsPage />);
    expect(screen.getByText("تحديث")).toBeInTheDocument();
  });

  // ── Absence checks — ensure English strings are NOT rendered ──────────────

  it("does NOT render English page title", () => {
    render(<ExpiryAlertsPage />);
    expect(screen.queryByText("Expiry & Renewal Alerts")).not.toBeInTheDocument();
  });

  it("does NOT render English severity labels", () => {
    render(<ExpiryAlertsPage />);
    expect(screen.queryByText("Critical")).not.toBeInTheDocument();
    expect(screen.queryByText("High")).not.toBeInTheDocument();
    expect(screen.queryByText("Medium")).not.toBeInTheDocument();
    expect(screen.queryByText("Low")).not.toBeInTheDocument();
  });

  it("does NOT render English empty-state text", () => {
    render(<ExpiryAlertsPage />);
    expect(screen.queryByText("No alerts found")).not.toBeInTheDocument();
    expect(
      screen.queryByText("No alerts match the current filters."),
    ).not.toBeInTheDocument();
  });

  it("does NOT render English 'Refresh' button label", () => {
    render(<ExpiryAlertsPage />);
    expect(screen.queryByText("Refresh")).not.toBeInTheDocument();
  });

  it("does NOT render English days threshold labels", () => {
    render(<ExpiryAlertsPage />);
    expect(screen.queryByText("≤ 7 days")).not.toBeInTheDocument();
    expect(screen.queryByText("≤ 30 days")).not.toBeInTheDocument();
  });

  it("does NOT render English 'Ministry of Labour' badge", () => {
    render(<ExpiryAlertsPage />);
    expect(screen.queryByText("Ministry of Labour")).not.toBeInTheDocument();
  });
});
