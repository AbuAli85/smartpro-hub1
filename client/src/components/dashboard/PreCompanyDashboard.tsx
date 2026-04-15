import React from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Circle,
  Compass,
  MapPin,
  Sparkles,
  User,
  UserPlus,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Dedicated dashboard for users with no company membership — setup-first UX
 * (not the business “command center” shell).
 *
 * Join CTA: routes to `/onboarding-guide` as an interim step; replace with a dedicated
 * `/company/join` (or similar) when invite/code entry and pending-invite flows exist.
 */
export default function PreCompanyDashboard() {
  const { t, i18n } = useTranslation(["dashboard", "common"]);
  const { user } = useAuth();
  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? t("dashboard:greeting.morning")
      : hour < 17
        ? t("dashboard:greeting.afternoon")
        : t("dashboard:greeting.evening");
  const dateStr = new Date().toLocaleDateString(i18n.language === "ar-OM" ? "ar-OM" : "en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const onboardingCards = [
    {
      key: "profile",
      title: t("dashboard:preCompany.cards.profileTitle"),
      description: t("dashboard:preCompany.cards.profileDesc"),
      href: "/preferences",
      icon: <User size={18} />,
    },
    {
      key: "guide",
      title: t("dashboard:preCompany.cards.guideTitle"),
      description: t("dashboard:preCompany.cards.guideDesc"),
      href: "/onboarding-guide",
      icon: <Compass size={18} />,
    },
    {
      key: "invite",
      title: t("dashboard:preCompany.cards.inviteTitle"),
      description: t("dashboard:preCompany.cards.inviteDesc"),
      href: "/onboarding-guide",
      icon: <UserPlus size={18} />,
    },
    {
      key: "marketplace",
      title: t("dashboard:preCompany.cards.marketplaceTitle"),
      description: t("dashboard:preCompany.cards.marketplaceDesc"),
      href: "/marketplace",
      icon: <Sparkles size={18} />,
    },
  ];

  return (
    <div className="p-5 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground">
            {greeting}, {user?.name?.split(" ")[0] ?? "there"} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-xl">
            {t("dashboard:preCompany.subtitle")}
          </p>
          <p className="text-muted-foreground text-xs flex items-center gap-2 flex-wrap mt-2">
            {user?.name && (
              <span className="flex items-center gap-1 min-w-0">
                <User size={12} className="shrink-0" /> <span className="truncate">{user.name}</span>
              </span>
            )}
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <MapPin size={12} /> Sultanate of Oman
            </span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1">
              <Calendar size={12} /> {dateStr}
            </span>
          </p>
        </div>
      </div>

      <Card className="border-border/70 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t("dashboard:preCompany.checklist.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="space-y-2.5 text-sm">
            <li className="flex gap-2.5 items-start">
              <Circle className="size-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
              <Link href="/preferences" className="text-foreground hover:underline underline-offset-2">
                {t("dashboard:preCompany.checklist.profile")}
              </Link>
            </li>
            <li className="flex gap-2.5 items-start">
              <Circle className="size-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
              <span className="text-foreground">{t("dashboard:preCompany.checklist.company")}</span>
            </li>
            <li className="flex gap-2.5 items-start">
              <Circle className="size-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
              <Link href="/marketplace" className="text-foreground hover:underline underline-offset-2">
                {t("dashboard:preCompany.checklist.explore")}
              </Link>
            </li>
            <li className="flex gap-2.5 items-start">
              <Circle className="size-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
              <Link href="/onboarding-guide" className="text-foreground hover:underline underline-offset-2">
                {t("dashboard:preCompany.checklist.invite")}
              </Link>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-[var(--smartpro-orange)]/25 bg-gradient-to-br from-card to-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-bold">{t("dashboard:preCompany.heroTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">{t("dashboard:preCompany.heroBody")}</p>
          <p className="text-sm text-foreground/90 font-medium pt-1 leading-snug">{t("dashboard:preCompany.heroValueLine")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("dashboard:preCompany.chipsUnlockNote")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="font-normal">
              {t("dashboard:preCompany.chips.teamHr")}
            </Badge>
            <Badge variant="secondary" className="font-normal">
              {t("dashboard:preCompany.chips.contracts")}
            </Badge>
            <Badge variant="secondary" className="font-normal">
              {t("dashboard:preCompany.chips.compliance")}
            </Badge>
            <Badge variant="secondary" className="font-normal">
              {t("dashboard:preCompany.chips.tasks")}
            </Badge>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <Button asChild className="gap-2">
              <Link href="/company/create">
                <Building2 size={16} />
                {t("dashboard:preCompany.ctaCreate")}
              </Link>
            </Button>
            {/* Interim join path — see file-level TODO for dedicated join flow */}
            <Button asChild variant="outline" className="gap-2">
              <Link href="/onboarding-guide">
                <Users size={16} />
                {t("dashboard:preCompany.ctaJoin")}
              </Link>
            </Button>
            <Button asChild variant="ghost" className="gap-2 text-muted-foreground">
              <Link href="/marketplace">
                <Sparkles size={16} />
                {t("dashboard:preCompany.ctaExplore")}
              </Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground border-t border-border/60 pt-3">
            {t("dashboard:preCompany.joinHint")}
          </p>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          {t("dashboard:preCompany.nextSteps")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {onboardingCards.map((c) => (
            <Link key={c.key} href={c.href}>
              <Card className="h-full hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer border-border/80">
                <CardContent className="p-4 flex gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                    {c.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm text-foreground">{c.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{c.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <Card className="border-dashed border-border/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 size={14} className="text-muted-foreground" />
            {t("dashboard:preCompany.activityTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("dashboard:preCompany.activityEmpty")}</p>
          <p className="text-xs text-muted-foreground/80 mt-1">{t("dashboard:preCompany.activityHint")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
