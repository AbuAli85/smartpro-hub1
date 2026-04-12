import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import QuestionRenderer from "@/components/survey/QuestionRenderer";
import SurveyProgress from "@/components/survey/SurveyProgress";

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
    if (!storageKey || typeof window === "undefined") return null;
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
        if (storageKey && typeof window !== "undefined") {
          localStorage.removeItem(storageKey);
        }
        setLocation(`/survey/${slug}/complete`);
        return;
      }

      setCurrentSectionIndex((i) => Math.min(sections.length - 1, i + 1));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    }
  };

  /** Keep a loading shell until the session exists (covers the tick before `startResponse` is pending). */
  const sessionBootPending =
    !!surveyData &&
    !sessionReady &&
    !surveyIsError &&
    (resumeToken ? resumeLoading || resumeFetching : !startMutation.isError);

  const showPageSkeleton = !slug || surveyLoading || sessionBootPending;

  if (surveyData && !sessionReady && !resumeToken && startMutation.isError) {
    return (
      <div className="container max-w-3xl py-10">
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
    );
  }

  if (!match || !slug) {
    return (
      <div className="container max-w-3xl py-10">
        <Card>
          <CardContent className="pt-6 flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-5 w-5" />
            <span>{t("surveyNotFound")}</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (surveyIsError) {
    const notFound =
      surveyError?.message?.includes("not found") ||
      (surveyError as { data?: { code?: string } } | undefined)?.data?.code === "NOT_FOUND";
    return (
      <div className="container max-w-3xl py-10">
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
    );
  }

  if (showPageSkeleton) {
    return (
      <div className="container max-w-3xl py-8 space-y-6">
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-2 w-full" />
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
    );
  }

  if (!surveyData || sections.length === 0) {
    return (
      <div className="container max-w-3xl py-10">
        <Card>
          <CardHeader>
            <CardTitle>{t("surveyNotFound")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{t("surveyNotActive")}</CardContent>
        </Card>
      </div>
    );
  }

  if (!currentSection || responseId == null || sessionToken == null) {
    return (
      <div className="container max-w-3xl py-8 flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">{t("saving")}</p>
      </div>
    );
  }

  const sectionTitle = isAr ? currentSection.titleAr : currentSection.titleEn;
  const sectionDescription = isAr ? currentSection.descriptionAr : currentSection.descriptionEn;

  return (
    <div className="container max-w-3xl py-8 space-y-8">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isAr ? surveyData.survey.titleAr : surveyData.survey.titleEn}
          </h1>
          <Badge variant="secondary">{surveyLanguage.toUpperCase()}</Badge>
        </div>
        {(isAr ? surveyData.survey.descriptionAr : surveyData.survey.descriptionEn) && (
          <p className="text-sm text-muted-foreground max-w-2xl">
            {isAr ? surveyData.survey.descriptionAr : surveyData.survey.descriptionEn}
          </p>
        )}
      </div>

      <SurveyProgress
        currentIndex={currentSectionIndex}
        totalSections={sections.length}
        sectionTitle={sectionTitle}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{sectionTitle}</CardTitle>
          {sectionDescription ? (
            <p className="text-sm text-muted-foreground leading-relaxed">{sectionDescription}</p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-8">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={handlePrevious} disabled={currentSectionIndex <= 0}>
          <ChevronLeft className="h-4 w-4 me-1" />
          {t("previous")}
        </Button>
        <Button
          type="button"
          onClick={() => void handleNextOrSubmit()}
          disabled={submitSectionMutation.isPending || completeMutation.isPending}
        >
          {submitSectionMutation.isPending || completeMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin me-2" />
              {isLastSection ? t("submitting") : t("saving")}
            </>
          ) : isLastSection ? (
            <>
              {t("submit")}
              <ChevronRight className="h-4 w-4 ms-1" />
            </>
          ) : (
            <>
              {t("next")}
              <ChevronRight className="h-4 w-4 ms-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
