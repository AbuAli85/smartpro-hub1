import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  ListChecks,
  Loader2,
  Lock,
  Sparkles,
} from "lucide-react";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const SURVEY_SLUG = "oman-business-sector-2026";

export function surveyResumeStorageKey(slug: string) {
  return `survey_resume_${slug}`;
}

export default function SurveyStartPage() {
  const { t, i18n } = useTranslation("survey");
  const [, navigate] = useLocation();
  const isRtl = i18n.language?.startsWith("ar");

  const [showDetails, setShowDetails] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [respondentName, setRespondentName] = useState("");
  const [respondentEmail, setRespondentEmail] = useState("");
  const [respondentPhone, setRespondentPhone] = useState("");
  const [resumeTokenInput, setResumeTokenInput] = useState("");

  const { data, isLoading, isError, error } = trpc.survey.getBySlug.useQuery(
    { slug: SURVEY_SLUG },
    { retry: false },
  );

  const startMutation = trpc.survey.startResponse.useMutation({
    onSuccess: ({ resumeToken }) => {
      localStorage.setItem(surveyResumeStorageKey(SURVEY_SLUG), resumeToken);
      navigate(`/survey/${SURVEY_SLUG}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const surveyLanguage = i18n.language?.startsWith("ar") ? "ar" : "en";

  const handleStart = () => {
    if (!data?.survey?.id) return;
    const email = respondentEmail.trim();
    startMutation.mutate({
      surveyId: data.survey.id,
      language: surveyLanguage,
      respondentName: respondentName.trim() || undefined,
      respondentEmail: email || undefined,
      respondentPhone: respondentPhone.trim() || undefined,
    });
  };

  const handleResume = () => {
    const token = resumeTokenInput.trim();
    if (!token) {
      toast.error(t("resumeInstructions"));
      return;
    }
    localStorage.setItem(surveyResumeStorageKey(SURVEY_SLUG), token);
    navigate(`/survey/${SURVEY_SLUG}`);
  };

  const errCode =
    error instanceof TRPCClientError
      ? (error.data as { code?: string } | undefined)?.code
      : undefined;
  const notFound = isError && errCode === "NOT_FOUND";

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 pb-[env(safe-area-inset-bottom)] text-slate-50"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Minimal header */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/25 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 sm:px-5">
          <Link href="/" className="-m-1 inline-flex min-h-[44px] min-w-[44px] items-center rounded-md px-1 py-2 text-sm font-medium text-white/75 transition-colors hover:text-white sm:min-h-0 sm:min-w-0 sm:py-1">
            {t("backToHome")}
          </Link>
          <Badge
            variant="secondary"
            className="border border-white/10 bg-white/10 text-xs text-white backdrop-blur"
          >
            {t("subtitle")}
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-12 pt-6 sm:px-5 sm:pb-16 sm:pt-8">
        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-white/80">
            <Loader2 className="h-10 w-10 animate-spin" aria-hidden />
          </div>
        )}

        {/* Generic error */}
        {isError && !notFound && (
          <div className="rounded-2xl border border-white/10 bg-white/95 p-8 text-slate-900 shadow-xl">
            <h2 className="text-xl font-semibold">{t("loadError")}</h2>
            <p className="mt-2 text-sm text-slate-500">{error.message}</p>
            <Button asChild variant="outline" className="mt-6">
              <Link href="/">{t("backToHome")}</Link>
            </Button>
          </div>
        )}

        {/* Not found */}
        {notFound && (
          <div className="rounded-2xl border border-white/10 bg-white/95 p-8 text-slate-900 shadow-xl">
            <h2 className="text-xl font-semibold">{t("surveyNotFound")}</h2>
            <p className="mt-2 text-sm text-slate-500">{t("surveyNotActive")}</p>
            <Button asChild variant="outline" className="mt-6">
              <Link href="/">{t("backToHome")}</Link>
            </Button>
          </div>
        )}

        {/* Main content */}
        {!isLoading && !notFound && data?.survey && (
          <div className="space-y-4 sm:space-y-5">
            {/* Hero */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-indigo-600/80 to-violet-600/70 px-5 py-7 shadow-2xl sm:px-8 sm:py-9">
              <div className="pointer-events-none absolute -bottom-16 -right-16 h-52 w-52 rounded-full bg-white/10 blur-3xl" />
              <div className="relative space-y-3 sm:space-y-4">
                <div className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-2.5 py-1.5 ring-1 ring-white/20 sm:rounded-xl sm:px-3 sm:py-2">
                  <Sparkles className="h-4 w-4 text-amber-200 sm:h-5 sm:w-5" aria-hidden />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/90 sm:text-xs">
                    {t("title")}
                  </span>
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl md:text-3xl">
                  {data.survey.titleEn}
                </h1>
                <p className="text-base text-white/85 sm:text-lg" dir="rtl">
                  {data.survey.titleAr}
                </p>
              </div>
            </div>

            {/* Survey card */}
            <div className="rounded-2xl border border-white/10 bg-white text-slate-900 shadow-xl ring-1 ring-black/5">
              {/* Meta badges */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-4 py-3 sm:gap-2 sm:px-6 sm:py-3.5">
                <Badge variant="secondary" className="gap-1.5 text-xs font-medium">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {t("estimatedTime", { minutes: data.survey.estimatedMinutes })}
                </Badge>
                <Badge variant="outline" className="gap-1.5 border-slate-200 text-xs font-medium">
                  <Layers className="h-3.5 w-3.5" aria-hidden />
                  {t("sectionCount", { count: data.sections.length })}
                </Badge>
                <Badge variant="outline" className="gap-1.5 border-slate-200 text-xs font-medium">
                  <ListChecks className="h-3.5 w-3.5" aria-hidden />
                  {t("questionCount", { count: data.questions.length })}
                </Badge>
              </div>

              {/* Description + CTA */}
              <div className="space-y-4 px-4 py-5 sm:px-6 sm:py-6">
                <div className="space-y-2">
                  <p className="text-sm leading-relaxed text-slate-600">
                    {data.survey.descriptionEn}
                  </p>
                  <p className="text-sm leading-relaxed text-slate-500" dir="rtl">
                    {data.survey.descriptionAr}
                  </p>
                </div>

                {/* Primary CTA */}
                <Button
                  size="lg"
                  className="h-12 w-full min-h-[44px] gap-2.5 bg-indigo-600 text-base font-semibold shadow-sm hover:bg-indigo-700 sm:h-11 sm:w-auto sm:min-h-0"
                  disabled={startMutation.isPending}
                  onClick={handleStart}
                >
                  {startMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  ) : (
                    <ArrowRight className="h-5 w-5" aria-hidden />
                  )}
                  {startMutation.isPending ? t("saving") : t("beginSurvey")}
                </Button>

                {/* Trust signal */}
                <p className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-400 sm:text-xs">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  {t("confidentialNote")}
                </p>
              </div>

              {/* Secondary flows — shared subtle surface */}
              <div className="rounded-b-2xl border-t border-slate-100 bg-slate-50/60">
                {/* Optional details */}
                <div>
                  <button
                    type="button"
                    aria-expanded={showDetails}
                    id="survey-start-details"
                    aria-controls="survey-start-details-panel"
                    onClick={() => setShowDetails((v) => !v)}
                    className="flex w-full min-h-[44px] items-center justify-between px-4 py-2 text-left text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100/80 hover:text-slate-700 sm:min-h-10 sm:px-6"
                  >
                    <span>{showDetails ? t("hideDetails") : t("addDetails")}</span>
                    {showDetails ? (
                      <ChevronUp className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                    )}
                  </button>

                  {showDetails && (
                    <div
                      id="survey-start-details-panel"
                      role="region"
                      aria-labelledby="survey-start-details"
                      className="border-t border-slate-100/80 px-4 pb-3 pt-1 sm:px-6"
                    >
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Input
                          value={respondentName}
                          onChange={(e) => setRespondentName(e.target.value)}
                          placeholder={t("yourName")}
                          autoComplete="name"
                          className="h-9 border-slate-200/80 bg-white text-xs shadow-none"
                        />
                        <Input
                          type="email"
                          value={respondentEmail}
                          onChange={(e) => setRespondentEmail(e.target.value)}
                          placeholder={t("yourEmail")}
                          autoComplete="email"
                          className="h-9 border-slate-200/80 bg-white text-xs shadow-none"
                        />
                        <Input
                          type="tel"
                          value={respondentPhone}
                          onChange={(e) => setRespondentPhone(e.target.value)}
                          placeholder={t("yourPhone")}
                          autoComplete="tel"
                          className="h-9 border-slate-200/80 bg-white text-xs shadow-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Resume */}
                <div className="border-t border-slate-100/80">
                  <button
                    type="button"
                    aria-expanded={showResume}
                    id="survey-start-resume"
                    aria-controls="survey-start-resume-panel"
                    onClick={() => setShowResume((v) => !v)}
                    className="flex w-full min-h-[44px] items-center justify-between px-4 py-2 text-left text-[11px] text-slate-400 transition-colors hover:bg-slate-100/60 hover:text-slate-600 sm:min-h-9 sm:px-6 sm:py-1.5"
                  >
                    <span>{t("resumePrompt")}</span>
                    {showResume ? (
                      <ChevronUp className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
                    ) : (
                      <ChevronDown className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
                    )}
                  </button>

                  {showResume && (
                    <div
                      id="survey-start-resume-panel"
                      role="region"
                      aria-labelledby="survey-start-resume"
                      className="flex flex-col gap-2 border-t border-slate-100/80 px-4 pb-3 pt-2 sm:flex-row sm:items-center sm:px-6"
                    >
                      <Input
                        value={resumeTokenInput}
                        onChange={(e) => setResumeTokenInput(e.target.value)}
                        placeholder={t("resumeTokenLabel")}
                        autoComplete="off"
                        className="h-9 min-h-[44px] flex-1 font-mono text-xs sm:min-h-0 sm:h-8"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleResume}
                        className="h-9 shrink-0 px-4 text-xs text-slate-500 hover:bg-slate-200/80 hover:text-slate-800 sm:h-8"
                      >
                        {t("resume")}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
