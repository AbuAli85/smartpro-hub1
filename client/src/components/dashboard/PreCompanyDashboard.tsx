import React, { useState } from "react";
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
  Play,
  Sparkles,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Dedicated dashboard for users with no company membership — setup-first UX
 * (not the business "command center" shell).
 *
 * Join CTA: routes to `/onboarding-guide` as an interim step; replace with a dedicated
 * `/company/join` (or similar) when invite/code entry and pending-invite flows exist.
 */
export default function PreCompanyDashboard() {
  const { t, i18n } = useTranslation(["dashboard", "common"]);
  const { user } = useAuth();
  const [videoOpen, setVideoOpen] = useState(false);

  const isRtl = i18n.language === "ar-OM";
  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? t("dashboard:greeting.morning")
      : hour < 17
        ? t("dashboard:greeting.afternoon")
        : t("dashboard:greeting.evening");
  const dateStr = new Date().toLocaleDateString(isRtl ? "ar-OM" : "en-GB", {
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

  const tutorialTopics = [
    t("dashboard:preCompany.videoTutorial.topics.createWorkspace"),
    t("dashboard:preCompany.videoTutorial.topics.inviteTeam"),
    t("dashboard:preCompany.videoTutorial.topics.activateModules"),
    t("dashboard:preCompany.videoTutorial.topics.govServices"),
  ];

  return (
    <div className="p-5 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
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

      {/* ── Quick checklist ── */}
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

      {/* ── Hero CTA card ── */}
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

      {/* ── Video Tutorial section ── */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          {t("dashboard:preCompany.videoTutorial.sectionTitle")}
        </h2>
        <Card className="overflow-hidden border-border/80">
          <div className="flex flex-col md:flex-row">
            {/* Thumbnail / play area */}
            <button
              type="button"
              onClick={() => setVideoOpen(true)}
              className="relative md:w-72 lg:w-80 shrink-0 bg-gradient-to-br from-[var(--smartpro-orange)]/20 to-muted/60 flex items-center justify-center min-h-[160px] group cursor-pointer"
              aria-label={t("dashboard:preCompany.videoTutorial.watchNow")}
            >
              {/* Play button */}
              <div className="w-16 h-16 rounded-full bg-background/90 shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                <Play size={28} className="text-[var(--smartpro-orange)] ms-1" fill="currentColor" />
              </div>
              {/* Duration badge */}
              <span className="absolute bottom-3 end-3 text-xs font-medium bg-background/80 text-foreground px-2 py-0.5 rounded-full border border-border/60">
                {t("dashboard:preCompany.videoTutorial.duration")}
              </span>
            </button>

            {/* Content */}
            <CardContent className="p-5 flex flex-col justify-between gap-4 flex-1">
              <div>
                <h3 className="font-bold text-base text-foreground mb-1">
                  {t("dashboard:preCompany.videoTutorial.title")}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("dashboard:preCompany.videoTutorial.description")}
                </p>
              </div>

              {/* Topic checklist */}
              <ul className="space-y-1.5">
                {tutorialTopics.map((topic, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 size={14} className="text-[var(--smartpro-orange)] mt-0.5 shrink-0" />
                    <span>{topic}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant="outline"
                className="gap-2 self-start"
                onClick={() => setVideoOpen(true)}
              >
                <Play size={14} fill="currentColor" className="text-[var(--smartpro-orange)]" />
                {t("dashboard:preCompany.videoTutorial.watchNow")}
              </Button>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* ── Video modal overlay ── */}
      {videoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setVideoOpen(false)}
        >
          <div
            className="relative w-full max-w-3xl bg-background rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setVideoOpen(false)}
              className="absolute top-3 end-3 z-10 w-8 h-8 rounded-full bg-background/80 border border-border flex items-center justify-center hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
            {/* 16:9 responsive iframe wrapper */}
            <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0"
                title={t("dashboard:preCompany.videoTutorial.title")}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Next steps cards ── */}
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

      {/* ── Activity placeholder ── */}
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
