// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PreCompanyDashboard from "./PreCompanyDashboard";

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, name: "مستخدم تجريبي", email: "t@example.com" },
    isLoading: false,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const ar: Record<string, string> = {
        "dashboard:greeting.evening": "مساء الخير",
        "dashboard:preCompany.subtitle": "جهّز مساحة عملك لتفعيل SmartPRO لأعمالك.",
        "dashboard:preCompany.heroTitle": "أنشئ مساحة عمل أو انضم إلى شركة",
        "dashboard:preCompany.heroBody": "نص تجريبي.",
        "dashboard:preCompany.heroValueLine": "اجمع الموارد البشرية والعقود في مكان واحد.",
        "dashboard:preCompany.chipsUnlockNote": "تُفتح بعد إنشاء أو الانضمام إلى شركة",
        "dashboard:preCompany.chips.teamHr": "الفريق",
        "dashboard:preCompany.chips.contracts": "العقود",
        "dashboard:preCompany.chips.compliance": "الامتثال",
        "dashboard:preCompany.chips.tasks": "المهام",
        "dashboard:preCompany.ctaCreate": "إنشاء مساحة عمل",
        "dashboard:preCompany.ctaJoin": "الانضمام لشركة",
        "dashboard:preCompany.ctaExplore": "استكشاف الخدمات",
        "dashboard:preCompany.joinHint": "تلميح",
        "dashboard:preCompany.checklist.title": "البدء",
        "dashboard:preCompany.checklist.profile": "الملف الشخصي",
        "dashboard:preCompany.checklist.company": "شركة",
        "dashboard:preCompany.checklist.explore": "السوق",
        "dashboard:preCompany.checklist.invite": "دعوة",
        "dashboard:preCompany.nextSteps": "خطوات",
        "dashboard:preCompany.cards.profileTitle": "ملف",
        "dashboard:preCompany.cards.profileDesc": "وصف",
        "dashboard:preCompany.cards.guideTitle": "دليل",
        "dashboard:preCompany.cards.guideDesc": "وصف",
        "dashboard:preCompany.cards.inviteTitle": "دعوة",
        "dashboard:preCompany.cards.inviteDesc": "وصف",
        "dashboard:preCompany.cards.marketplaceTitle": "سوق",
        "dashboard:preCompany.cards.marketplaceDesc": "وصف",
        "dashboard:preCompany.activityTitle": "نشاط",
        "dashboard:preCompany.activityEmpty": "لا نشاط",
        "dashboard:preCompany.activityHint": "تلميح",
      };
      return ar[key] ?? key;
    },
    i18n: { language: "ar-OM" },
  }),
}));

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

describe("PreCompanyDashboard Arabic / RTL smoke", () => {
  it("renders primary Arabic hero copy inside an RTL root", () => {
    const { container } = render(
      <div dir="rtl" lang="ar-OM">
        <PreCompanyDashboard />
      </div>,
    );

    expect(container.querySelector('[dir="rtl"]')).toBeInTheDocument();
    expect(screen.getByText("أنشئ مساحة عمل أو انضم إلى شركة")).toBeInTheDocument();
    expect(screen.getByText("البدء")).toBeInTheDocument();
  });
});
