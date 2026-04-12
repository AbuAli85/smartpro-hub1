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
      className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-slate-50"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Minimal header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link href="/">
            <span className="text-sm font-medium text-white/70 hover:text-white transition-colors">
              {t("backToHome")}
            </span>
          </Link>
          <Badge
            variant="secondary"
            className="border border-white/10 bg-white/10 text-xs text-white backdrop-blur"
          >
            {t("subtitle")}
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
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
          <div className="space-y-6">
            {/* Hero */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-indigo-600/80 to-violet-600/70 px-8 py-10 shadow-2xl">
              <div className="pointer-events-none absolute -bottom-16 -right-16 h-52 w-52 rounded-full bg-white/10 blur-3xl" />
              <div className="relative space-y-4">
                <div className="inline-flex items-center gap-2.5 rounded-xl bg-white/15 px-3 py-2 ring-1 ring-white/20">
                  <Sparkles className="h-5 w-5 text-amber-200" aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-widest text-white/90">
                    {t("title")}
                  </span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {data.survey.titleEn}
                </h1>
                <p className="text-lg text-white/80" dir="rtl">
                  {data.survey.titleAr}
                </p>
              </div>
            </div>

            {/* Survey card */}
            <div className="rounded-2xl border border-white/10 bg-white text-slate-900 shadow-xl">
              {/* Meta badges */}
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-6 py-4">
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
              <div className="px-6 py-6 space-y-5">
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
                  className="w-full gap-2.5 bg-indigo-600 text-base font-semibold hover:bg-indigo-700 sm:w-auto"
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
                <p className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Lock className="h-3 w-3" aria-hidden />
                  {t("confidentialNote")}
                </p>
              </div>

              {/* Optional details expansion */}
              <div className="border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  className="flex w-full items-center justify-between px-6 py-3.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <span>{showDetails ? t("hideDetails") : t("addDetails")}</span>
                  {showDetails ? (
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  ) : (
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  )}
                </button>

                {showDetails && (
                  <div className="border-t border-slate-50 px-6 pb-5 pt-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-500">
                          {t("yourName")}
                        </label>
                        <Input
                          value={respondentName}
                          onChange={(e) => setRespondentName(e.target.value)}
                          placeholder={t("yourName")}
                          autoComplete="name"
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-500">
                          {t("yourEmail")}
                        </label>
                        <Input
                          type="email"
                          value={respondentEmail}
                          onChange={(e) => setRespondentEmail(e.target.value)}
                          placeholder={t("yourEmail")}
                          autoComplete="email"
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-500">
                          {t("yourPhone")}
                        </label>
                        <Input
                          type="tel"
                          value={respondentPhone}
                          onChange={(e) => setRespondentPhone(e.target.value)}
                          placeholder={t("yourPhone")}
                          autoComplete="tel"
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Resume section — collapsed by default */}
              <div className="border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowResume((v) => !v)}
                  className="flex w-full items-center justify-between px-6 py-3.5 text-sm text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <span>{t("resumePrompt")}</span>
                  {showResume ? (
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  ) : (
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  )}
                </button>

                {showResume && (
                  <div className="border-t border-slate-50 px-6 pb-5 pt-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="flex-1 space-y-1">
                        <label className="text-xs font-medium text-slate-500">
                          {t("resumeTokenLabel")}
                        </label>
                        <Input
                          value={resumeTokenInput}
                          onChange={(e) => setResumeTokenInput(e.target.value)}
                          placeholder={t("resumeTokenLabel")}
                          autoComplete="off"
                          className="h-9 font-mono text-sm"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleResume}
                        className="shrink-0"
                      >
                        {t("resume")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
