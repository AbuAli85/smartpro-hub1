import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { AlertCircle, BookmarkCheck, ChevronLeft, ChevronRight, Copy, Loader2, Lock, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QuestionRenderer from "@/components/survey/QuestionRenderer";

type AnswerState = {
  answerValue: string | null;
  selectedOptions: number[];
};

type SurveyQuestion = {
  id: number;
  sectionId: number;
  type: string;
  labelEn: string;
  labelAr: string;
  hintEn: string | null;
  hintAr: string | null;
  isRequired: boolean;
  sortOrder: number;
  settings: Record<string, unknown> | null;
  scoringRule: Record<string, unknown> | null;
};

type SurveyOption = {
  id: number;
  questionId: number;
  value: string;
  labelEn: string;
  labelAr: string;
  score: number;
  sortOrder: number;
  tags: string[] | null;
};

function sortSections<T extends { sortOrder: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
}

function isQuestionAnswered(q: SurveyQuestion, answer: AnswerState): boolean {
  switch (q.type) {
    case "text":
    case "textarea":
    case "number":
      return (answer.answerValue ?? "").trim().length > 0;
    case "single_choice":
    case "dropdown":
    case "multi_choice":
      return answer.selectedOptions.length > 0;
    case "yes_no":
      return answer.answerValue === "yes" || answer.answerValue === "no";
    case "rating":
      return answer.answerValue != null && String(answer.answerValue).trim().length > 0;
    default:
      return true;
  }
}

function mergeResumeAnswers(
  existing: { questionId: number; answerValue: string | null; selectedOptions: number[] | null }[],
): Record<number, AnswerState> {
  const out: Record<number, AnswerState> = {};
  for (const row of existing) {
    const sel = row.selectedOptions;
    out[row.questionId] = {
      answerValue: row.answerValue,
      selectedOptions: Array.isArray(sel) ? sel : [],
    };
  }
  return out;
}

export default function SurveyRespondPage() {
  const [match, params] = useRoute("/survey/:slug");
  const slug = match ? params.slug : undefined;
  const [, setLocation] = useLocation();
  const { t, i18n } = useTranslation("survey");
  const surveyLanguage = i18n.language.startsWith("ar") ? "ar" : "en";
  const isAr = surveyLanguage === "ar";

  const storageKey = slug ? `survey_resume_${slug}` : null;

  const readResumeToken = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    const urlToken = new URLSearchParams(window.location.search).get("resume");
    if (urlToken) {
      if (storageKey) localStorage.setItem(storageKey, urlToken);
      const url = new URL(window.location.href);
      url.searchParams.delete("resume");
      window.history.replaceState({}, "", url.toString());
      return urlToken;
    }
    if (!storageKey) return null;
    return localStorage.getItem(storageKey);
  }, [storageKey]);

  const [resumeToken, setResumeToken] = useState<string | null>(() => readResumeToken());

  const {
    data: surveyData,
    isLoading: surveyLoading,
    isError: surveyIsError,
    error: surveyError,
  } = trpc.survey.getBySlug.useQuery({ slug: slug ?? "" }, { enabled: !!slug, retry: false });

  const {
    data: resumeData,
    isLoading: resumeLoading,
    isError: resumeIsError,
    isFetching: resumeFetching,
  } = trpc.survey.resumeResponse.useQuery(
    { resumeToken: resumeToken! },
    { enabled: !!resumeToken, retry: false },
  );

  const [responseId, setResponseId] = useState<number | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [sessionReady, setSessionReady] = useState(false);
  const startRequestedRef = useRef(false);

  useEffect(() => {
    setResumeToken(readResumeToken());
    setSessionReady(false);
    startRequestedRef.current = false;
    setResponseId(null);
    setSessionToken(null);
    setAnswers({});
    setCurrentSectionIndex(0);
  }, [slug, readResumeToken]);

  const startMutation = trpc.survey.startResponse.useMutation({
    onSuccess: (data) => {
      if (storageKey && typeof window !== "undefined") {
        localStorage.setItem(storageKey, data.resumeToken);
      }
      setResumeToken(data.resumeToken);
      setResponseId(data.responseId);
      setSessionToken(data.resumeToken);
      setAnswers({});
      setCurrentSectionIndex(0);
      setSessionReady(true);
    },
    onError: (e) => {
      startRequestedRef.current = false;
      toast.error(e.message);
    },
  });

  const submitSectionMutation = trpc.survey.submitSection.useMutation();
  const completeMutation = trpc.survey.completeResponse.useMutation();

  const sections = useMemo(
    () => (surveyData?.sections ? sortSections(surveyData.sections) : []),
    [surveyData?.sections],
  );

  const questions = surveyData?.questions ?? [];
  const options = surveyData?.options ?? [];

  const clearStoredResume = useCallback(() => {
    if (storageKey && typeof window !== "undefined") {
      localStorage.removeItem(storageKey);
    }
    setResumeToken(null);
  }, [storageKey]);

  useEffect(() => {
    if (!resumeIsError || !resumeToken) return;
    clearStoredResume();
  }, [resumeIsError, resumeToken, clearStoredResume]);

  useEffect(() => {
    if (!surveyData?.survey || !slug) return;
    if (sessionReady) return;

    if (resumeToken) {
      if (resumeLoading || resumeFetching) return;
      if (resumeIsError) return;
      if (!resumeData) return;

      if (resumeData.response.surveyId !== surveyData.survey.id) {
        clearStoredResume();
        return;
      }

      if (resumeData.response.status === "completed") {
        setSessionReady(true);
        setLocation(`/survey/${slug}/complete`);
        return;
      }

      setResponseId(resumeData.response.id);
      setSessionToken(resumeData.response.resumeToken);
      setAnswers(mergeResumeAnswers(resumeData.existingAnswers));

      const idx = resumeData.response.currentSectionId
        ? sections.findIndex((s) => s.id === resumeData.response.currentSectionId)
        : 0;
      setCurrentSectionIndex(idx >= 0 ? idx : 0);
      setSessionReady(true);
      return;
    }

    if (resumeToken === null && !resumeLoading && !resumeFetching) {
      if (startRequestedRef.current || startMutation.isPending) return;
      startRequestedRef.current = true;
      startMutation.mutate({
        surveyId: surveyData.survey.id,
        language: surveyLanguage === "ar" ? "ar" : "en",
      });
    }
  }, [
    surveyData,
    slug,
    resumeToken,
    resumeLoading,
    resumeFetching,
    resumeIsError,
    resumeData,
    sections,
    setLocation,
    clearStoredResume,
    startMutation,
    surveyLanguage,
    sessionReady,
  ]);

  const currentSection = sections[currentSectionIndex] ?? null;
  const sectionQuestions = useMemo(() => {
    if (!currentSection) return [];
    return sortSections(
      questions.filter((q) => q.sectionId === currentSection.id) as SurveyQuestion[],
    );
  }, [currentSection, questions]);

  const getAnswer = useCallback(
    (questionId: number): AnswerState =>
      answers[questionId] ?? { answerValue: null, selectedOptions: [] },
    [answers],
  );

  const setAnswer = useCallback((questionId: number, next: AnswerState) => {
    setAnswers((prev) => ({ ...prev, [questionId]: next }));
  }, []);

  const validateCurrentSection = useCallback((): boolean => {
    for (const q of sectionQuestions) {
      if (!q.isRequired) continue;
      if (!isQuestionAnswered(q, getAnswer(q.id))) {
        toast.error(
          isAr ? "يرجى الإجابة على جميع الأسئلة المطلوبة في هذا القسم." : "Please answer all required questions in this section.",
        );
        return false;
      }
    }
    return true;
  }, [sectionQuestions, getAnswer, isAr]);

  const buildSectionPayload = useCallback(() => {
    if (!currentSection) return [];
    return sectionQuestions.map((q) => {
      const a = getAnswer(q.id);
      return {
        questionId: q.id,
        answerValue: a.answerValue,
        selectedOptions: a.selectedOptions,
      };
    });
  }, [currentSection, sectionQuestions, getAnswer]);

  const isLastSection = sections.length > 0 && currentSectionIndex >= sections.length - 1;

  // Save Progress dialog
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveEmail, setSaveEmail] = useState("");
  const [saveEmailSent, setSaveEmailSent] = useState(false);
  const sendResumeEmailMutation = trpc.survey.sendResumeEmail.useMutation({
    onSuccess: () => setSaveEmailSent(true),
    onError: (e) => toast.error(e.message),
  });
  const handleSaveProgress = () => {
    if (!sessionToken) return;
    setSaveEmailSent(false);
    setSaveEmail("");
    setSaveDialogOpen(true);
  };
  const handleSendResumeEmail = () => {
    if (!sessionToken || !saveEmail.trim()) return;
    sendResumeEmailMutation.mutate({
      resumeToken: sessionToken,
      email: saveEmail.trim(),
      origin: window.location.origin,
    });
  };
  const handleCopyToken = () => {
    if (!sessionToken) return;
    navigator.clipboard.writeText(sessionToken).then(() =>
      toast.success(isAr ? "تم نسخ رمز الاستئناف" : "Resume token copied to clipboard"),
    );
  };

  const handlePrevious = () => {
    setCurrentSectionIndex((i) => Math.max(0, i - 1));
  };

  const handleNextOrSubmit = async () => {
    if (!currentSection || responseId == null || sessionToken == null) return;
    if (!validateCurrentSection()) return;

    const payload = buildSectionPayload();

    try {
      await submitSectionMutation.mutateAsync({
        responseId,
        resumeToken: sessionToken,
        sectionId: currentSection.id,
        answers: payload,
      });

      if (isLastSection) {
        await completeMutation.mutateAsync({
          responseId,
          resumeToken: sessionToken,
        });
        setLocation(`/survey/${slug}/complete`);
        return;
      }

      setCurrentSectionIndex((i) => Math.min(sections.length - 1, i + 1));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    }
  };

  const sessionBootPending =
    !!surveyData &&
    !sessionReady &&
    !surveyIsError &&
    (resumeToken ? resumeLoading || resumeFetching : !startMutation.isError);

  const showPageSkeleton = !slug || surveyLoading || sessionBootPending;

  // Error: could not start
  if (surveyData && !sessionReady && !resumeToken && startMutation.isError) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-12">
          <Card className="border-destructive/40">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <CardTitle>{isAr ? "تعذر بدء الاستبيان" : "Could not start survey"}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {startMutation.error?.message ?? (isAr ? "حدث خطأ غير معروف" : "Unknown error")}
              </p>
              <Button
                type="button"
                onClick={() => {
                  startRequestedRef.current = false;
                  startMutation.reset();
                  startMutation.mutate({
                    surveyId: surveyData.survey.id,
                    language: surveyLanguage === "ar" ? "ar" : "en",
                  });
                }}
              >
                {isAr ? "إعادة المحاولة" : "Try again"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // No match
  if (!match || !slug) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-12">
          <Card>
            <CardContent className="pt-6 flex items-center gap-2 text-muted-foreground">
              <AlertCircle className="h-5 w-5" />
              <span>{t("surveyNotFound")}</span>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Survey error
  if (surveyIsError) {
    const notFound =
      surveyError?.message?.includes("not found") ||
      (surveyError as { data?: { code?: string } } | undefined)?.data?.code === "NOT_FOUND";
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-12">
          <Card className="border-destructive/40">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <CardTitle>{notFound ? t("surveyNotFound") : t("surveyNotActive")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {surveyError?.message ?? t("surveyNotActive")}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Loading skeleton
  if (showPageSkeleton) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="h-20 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 shadow-inner" />
        <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-3 w-full rounded-full" />
          <Card>
            <CardHeader>
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-full" />
            </CardHeader>
            <CardContent className="space-y-6">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // No data
  if (!surveyData || sections.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-12">
          <Card>
            <CardHeader>
              <CardTitle>{t("surveyNotFound")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{t("surveyNotActive")}</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Waiting for session
  if (!currentSection || responseId == null || sessionToken == null) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-16 flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">{t("saving")}</p>
        </div>
      </div>
    );
  }

  const sectionTitle = isAr ? currentSection.titleAr : currentSection.titleEn;
  const sectionDescription = isAr ? currentSection.descriptionAr : currentSection.descriptionEn;
  const isBusy = submitSectionMutation.isPending || completeMutation.isPending;
  const pct = sections.length > 0 ? Math.round(((currentSectionIndex + 1) / sections.length) * 100) : 0;
  const sectionQCount = sectionQuestions.length;
  const sectionAnswered = sectionQuestions.filter((q) => isQuestionAnswered(q, getAnswer(q.id))).length;

  return (
    <div className="min-h-screen bg-slate-50 pb-[env(safe-area-inset-bottom)]" dir={isAr ? "rtl" : "ltr"}>
      {/* Integrated branded shell header — matches landing gradient family */}
      <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 pt-[env(safe-area-inset-top)] shadow-md">
        {/* Title row */}
        <div className="mx-auto max-w-2xl px-4 pt-3 pb-1.5 sm:px-5 sm:pt-3.5">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-200/90" aria-hidden />
              <h1 className="truncate text-sm font-semibold leading-tight text-white sm:text-base">
                {isAr ? surveyData.survey.titleAr : surveyData.survey.titleEn}
              </h1>
            </div>
            <Badge
              variant="secondary"
              className="shrink-0 border border-white/25 bg-white/15 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur"
            >
              {surveyLanguage.toUpperCase()}
            </Badge>
          </div>
        </div>

        {/* Progress row */}
        <div className="mx-auto max-w-2xl px-4 pb-3.5 sm:px-5 sm:pb-4">
          <div className="mb-2 flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <span className="min-w-0 text-[12px] font-medium leading-snug text-white sm:text-[13px]">
              {sectionTitle}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-white/90 sm:text-xs">
              {t("progress", { current: currentSectionIndex + 1, total: sections.length })} · {pct}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]">
            <div
              className="h-full rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.35)] transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          {sections.length > 1 && sections.length <= 10 && (
            <div className="mt-2.5 flex items-center justify-center gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {sections.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 shrink-0 rounded-full transition-all duration-300 ${
                    i <= currentSectionIndex
                      ? "w-3.5 bg-white/85"
                      : "w-1 bg-white/25"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-4 sm:space-y-5 sm:px-5 sm:py-5">
        {/* Section card */}
        <Card className="overflow-hidden border-0 shadow-md ring-1 ring-black/[0.06]">
          <div className="h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-600" />
          <CardHeader className="border-b border-slate-100 bg-slate-50/70 pb-3 pt-3.5 sm:pb-3.5 sm:pt-4">
            <div className="flex items-start justify-between gap-2 sm:items-center">
              <CardTitle className="text-base leading-snug sm:text-lg">{sectionTitle}</CardTitle>
              <span className="shrink-0 rounded-md border border-slate-200/80 bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">
                {sectionAnswered}/{sectionQCount}
              </span>
            </div>
            {sectionDescription && (
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{sectionDescription}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-7 py-5 sm:space-y-8 sm:py-6">
            {sectionQuestions.map((q) => {
              const qOptions = sortSections(
                (options as SurveyOption[]).filter((o) => o.questionId === q.id),
              );
              return (
                <QuestionRenderer
                  key={q.id}
                  question={q}
                  options={qOptions}
                  language={surveyLanguage}
                  answer={getAnswer(q.id)}
                  onChange={(next) => setAnswer(q.id, next)}
                />
              );
            })}
          </CardContent>
        </Card>

        {/* Navigation — row; primary actions grouped and right-aligned */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handlePrevious}
            disabled={currentSectionIndex <= 0}
            className="gap-1 text-muted-foreground hover:text-foreground min-h-[44px] px-3 sm:min-h-9"
          >
            <ChevronLeft className="h-4 w-4" />
            {t("previous")}
          </Button>

          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSaveProgress}
              disabled={!sessionToken}
              className="gap-1.5 text-muted-foreground/75 hover:text-foreground min-h-[44px] shrink-0 sm:min-h-9"
            >
              <BookmarkCheck className="h-3.5 w-3.5" />
              {isAr ? "حفظ" : "Save"}
            </Button>

            <Button
              type="button"
              onClick={() => void handleNextOrSubmit()}
              disabled={isBusy}
              className="min-h-[44px] min-w-[7.5rem] gap-1.5 bg-indigo-600 px-5 shadow-sm hover:bg-indigo-700 sm:min-h-9 sm:min-w-0 sm:px-6"
            >
              {isBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isLastSection ? t("submitting") : t("saving")}
                </>
              ) : isLastSection ? (
                <>
                  {t("submit")}
                  <ChevronRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  {t("next")}
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5 px-1 pb-2 text-center text-[11px] leading-snug text-muted-foreground/55 sm:pb-0">
          <Lock className="h-3 w-3 shrink-0" aria-hidden />
          <span>{t("confidentialNote")}</span>
        </div>
      </div>

      {/* Save Progress Dialog */}
      <Dialog
        open={saveDialogOpen}
        onOpenChange={(open) => {
          setSaveDialogOpen(open);
          if (!open) setSaveEmailSent(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookmarkCheck className="h-5 w-5 text-primary" />
              {isAr ? "حفظ التقدم" : "Save Your Progress"}
            </DialogTitle>
            <DialogDescription>
              {isAr
                ? "يمكنك المتابعة من حيث توقفت في أي وقت باستخدام رمز الاستئناف أو رابط البريد الإلكتروني."
                : "You can continue where you left off at any time using your resume token or the email link."}
            </DialogDescription>
          </DialogHeader>

          {saveEmailSent ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <Mail className="h-6 w-6 text-green-600" />
              </div>
              <p className="font-medium text-sm">{isAr ? "تم إرسال الرابط!" : "Link sent!"}</p>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? `تحقق من بريدك الإلكتروني ${saveEmail} للحصول على رابط الاستئناف.`
                  : `Check ${saveEmail} for your resume link.`}
              </p>
              <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(false)}>
                {isAr ? "إغلاق" : "Close"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Resume token */}
              <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {isAr ? "رمز الاستئناف الخاص بك" : "Your Resume Token"}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-background border px-2 py-1.5 text-xs font-mono truncate">
                    {sessionToken}
                  </code>
                  <Button type="button" variant="outline" size="sm" onClick={handleCopyToken}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? "احتفظ بهذا الرمز. يمكنك إدخاله في صفحة الاستبيان للمتابعة."
                    : "Keep this token safe. Enter it on the survey start page to resume."}
                </p>
              </div>

              {/* Email option */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {isAr ? "أو أرسل رابط الاستئناف إلى بريدك الإلكتروني" : "Or email yourself a resume link"}
                </p>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder={isAr ? "بريدك الإلكتروني" : "your@email.com"}
                    value={saveEmail}
                    onChange={(e) => setSaveEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSendResumeEmail();
                    }}
                    className="flex-1 text-sm"
                  />
                  <Button
                    type="button"
                    onClick={handleSendResumeEmail}
                    disabled={!saveEmail.trim() || sendResumeEmailMutation.isPending}
                    size="sm"
                  >
                    {sendResumeEmailMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!saveEmailSent && (
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setSaveDialogOpen(false)}>
                {isAr ? "إغلاق" : "Close"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
