import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  ClipboardList,
  Clock,
  Layers,
  ListChecks,
  Loader2,
  Sparkles,
} from "lucide-react";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SURVEY_SLUG = "oman-business-sector-2026";

/** Matches `SurveyRespondPage` localStorage key. */
export function surveyResumeStorageKey(slug: string) {
  return `survey_resume_${slug}`;
}

export default function SurveyStartPage() {
  const { t, i18n } = useTranslation("survey");
  const [, navigate] = useLocation();
  const isRtl = i18n.language?.startsWith("ar");

  const [showContactForm, setShowContactForm] = useState(false);
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

  const handleStartSubmit = () => {
    if (!data?.survey?.id) return;
    const email = respondentEmail.trim();
    startMutation.mutate({
      surveyId: data.survey.id,
      language: surveyLanguage,
      respondentName: respondentName.trim() || undefined,
      respondentEmail: email ? email : undefined,
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
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/">
            <span className="text-sm font-medium text-white/90 hover:text-white">
              {t("backToHome")}
            </span>
          </Link>
          <Badge
            variant="secondary"
            className="border border-white/10 bg-white/10 text-white backdrop-blur"
          >
            {t("subtitle")}
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-white/80">
            <Loader2 className="h-10 w-10 animate-spin" aria-hidden />
          </div>
        )}

        {isError && !notFound && (
          <Card className="border-white/10 bg-white/95 text-slate-900 shadow-xl">
            <CardHeader>
              <CardTitle>{t("loadError")}</CardTitle>
              <CardDescription>{error.message}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild variant="outline">
                <Link href="/">{t("backToHome")}</Link>
              </Button>
            </CardFooter>
          </Card>
        )}

        {notFound && (
          <Card className="border-white/10 bg-white/95 text-slate-900 shadow-xl">
            <CardHeader>
              <CardTitle>{t("surveyNotFound")}</CardTitle>
              <CardDescription>{t("surveyNotActive")}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild variant="outline">
                <Link href="/">{t("backToHome")}</Link>
              </Button>
            </CardFooter>
          </Card>
        )}

        {!isLoading && !notFound && data?.survey && (
          <div className="space-y-8">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-indigo-600/90 via-violet-600/80 to-fuchsia-600/70 p-8 shadow-2xl">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-16 left-10 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" />
              <div className="relative flex items-start gap-4">
                <div className="rounded-xl bg-white/15 p-3 ring-1 ring-white/20">
                  <Sparkles className="h-8 w-8 text-amber-200" aria-hidden />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-white/80">
                    {t("title")}
                  </p>
                  <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    {data.survey.titleEn}
                  </h1>
                  <p className="text-lg text-white/90" dir="rtl">
                    {data.survey.titleAr}
                  </p>
                </div>
              </div>
            </div>

            <Card className="border-white/10 bg-white/95 text-slate-900 shadow-xl">
              <CardHeader className="border-b border-slate-100 pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {t("estimatedTime", { minutes: data.survey.estimatedMinutes })}
                  </Badge>
                  <Badge variant="outline" className="gap-1 border-slate-200">
                    <Layers className="h-3.5 w-3.5" aria-hidden />
                    {t("sectionCount", { count: data.sections.length })}
                  </Badge>
                  <Badge variant="outline" className="gap-1 border-slate-200">
                    <ListChecks className="h-3.5 w-3.5" aria-hidden />
                    {t("questionCount", { count: data.questions.length })}
                  </Badge>
                </div>
                <CardTitle className="text-xl sm:text-2xl">{t("subtitle")}</CardTitle>
                <CardDescription className="space-y-3 text-base text-slate-600">
                  <span className="block">{data.survey.descriptionEn}</span>
                  <span className="block" dir="rtl">
                    {data.survey.descriptionAr}
                  </span>
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6 pt-6">
                {!showContactForm ? (
                  <Button
                    size="lg"
                    className="w-full gap-2 bg-indigo-600 text-base hover:bg-indigo-700 sm:w-auto"
                    onClick={() => setShowContactForm(true)}
                  >
                    <ClipboardList className="h-5 w-5" aria-hidden />
                    {t("start")}
                  </Button>
                ) : (
                  <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">
                        {t("enterContactInfo")}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-slate-600"
                        onClick={() => setShowContactForm(false)}
                      >
                        {t("previous")}
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-slate-500">
                          {t("yourName")}{" "}
                          <span className="text-slate-400">({t("optional")})</span>
                        </p>
                        <Input
                          value={respondentName}
                          onChange={(e) => setRespondentName(e.target.value)}
                          placeholder={t("yourName")}
                          autoComplete="name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-slate-500">
                          {t("yourEmail")}{" "}
                          <span className="text-slate-400">({t("optional")})</span>
                        </p>
                        <Input
                          type="email"
                          value={respondentEmail}
                          onChange={(e) => setRespondentEmail(e.target.value)}
                          placeholder={t("yourEmail")}
                          autoComplete="email"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-slate-500">
                          {t("yourPhone")}{" "}
                          <span className="text-slate-400">({t("optional")})</span>
                        </p>
                        <Input
                          type="tel"
                          value={respondentPhone}
                          onChange={(e) => setRespondentPhone(e.target.value)}
                          placeholder={t("yourPhone")}
                          autoComplete="tel"
                        />
                      </div>
                    </div>
                    <Button
                      size="lg"
                      className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 sm:w-auto"
                      disabled={startMutation.isPending}
                      onClick={handleStartSubmit}
                    >
                      {startMutation.isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                      ) : (
                        <ClipboardList className="h-5 w-5" aria-hidden />
                      )}
                      {startMutation.isPending ? t("saving") : t("next")}
                    </Button>
                  </div>
                )}

                <div className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-800">{t("resumePrompt")}</p>
                  <p className="text-xs text-slate-500">{t("resumeInstructions")}</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1 space-y-1.5">
                      <p className="text-xs font-medium text-slate-500">{t("resumeTokenLabel")}</p>
                      <Input
                        value={resumeTokenInput}
                        onChange={(e) => setResumeTokenInput(e.target.value)}
                        placeholder={t("resumeTokenLabel")}
                        autoComplete="off"
                      />
                    </div>
                    <Button type="button" variant="outline" onClick={handleResume}>
                      {t("resume")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
