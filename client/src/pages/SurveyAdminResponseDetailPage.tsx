import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, UserCircle2 } from "lucide-react";

const SCORE_KEYS = [
  "smartpro_fit",
  "digital_maturity",
  "compliance_burden",
  "staffing_pressure",
  "adoption_readiness",
] as const;

const SCORE_BAR_COLORS: Record<(typeof SCORE_KEYS)[number], string> = {
  smartpro_fit: "#3b82f6",
  digital_maturity: "#22c55e",
  compliance_burden: "#f97316",
  staffing_pressure: "#ef4444",
  adoption_readiness: "#8b5cf6",
};

type QuestionRow = {
  id: number;
  sectionId: number;
  sortOrder: number;
  type: string;
  labelEn: string;
  labelAr: string;
};

type OptionRow = {
  id: number;
  questionId: number;
  labelEn: string;
  labelAr: string;
};

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAnswerValue(
  q: QuestionRow,
  answer: { answerValue: string | null; selectedOptions: number[] | null },
  optionsByQuestion: Map<number, OptionRow[]>,
  lang: "en" | "ar",
): string {
  const opts = optionsByQuestion.get(q.id) ?? [];
  const label = (o: OptionRow) => (lang === "ar" ? o.labelAr : o.labelEn);

  if (answer.selectedOptions?.length) {
    const map = new Map(opts.map((o) => [o.id, o]));
    return answer.selectedOptions
      .map((id) => map.get(id))
      .filter(Boolean)
      .map((o) => label(o!))
      .join(", ");
  }

  if (answer.answerValue != null && answer.answerValue !== "") {
    return answer.answerValue;
  }

  return "—";
}

export default function SurveyAdminResponseDetailPage() {
  const { t } = useTranslation("survey");
  const [match, params] = useRoute("/survey/admin/responses/:id");
  const rawId = params?.id;
  const parsed = rawId != null ? Number(rawId) : NaN;
  const responseId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;

  const { data, isLoading, isError, error } = trpc.survey.adminGetResponseDetail.useQuery(
    { responseId: responseId! },
    { enabled: match && responseId != null },
  );

  const lang = data?.response.language === "ar" ? "ar" : "en";

  const optionsByQuestion = useMemo(() => {
    const m = new Map<number, OptionRow[]>();
    if (!data?.options) return m;
    for (const o of data.options) {
      const list = m.get(o.questionId) ?? [];
      list.push(o);
      m.set(o.questionId, list);
    }
    return m;
  }, [data?.options]);

  const answersByQuestion = useMemo(() => {
    const m = new Map<number, { answerValue: string | null; selectedOptions: number[] | null }>();
    if (!data?.answers) return m;
    for (const a of data.answers) {
      m.set(a.questionId, {
        answerValue: a.answerValue,
        selectedOptions: a.selectedOptions ?? null,
      });
    }
    return m;
  }, [data?.answers]);

  const sectionsWithQuestions = useMemo(() => {
    if (!data?.sections || !data?.questions) return [];
    const qBySection = new Map<number, QuestionRow[]>();
    for (const q of data.questions) {
      const list = qBySection.get(q.sectionId) ?? [];
      list.push(q);
      qBySection.set(q.sectionId, list);
    }
    return data.sections.map((s) => ({
      section: s,
      questions: (qBySection.get(s.id) ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    }));
  }, [data?.sections, data?.questions]);

  if (!match || responseId == null) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-muted-foreground text-sm">Invalid response link.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/survey/admin/responses">{t("admin.responses")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href="/survey/admin/responses">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("admin.responses")}
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <UserCircle2 className="h-7 w-7 text-primary" aria-hidden />
          {t("admin.responseDetail")}
        </h1>
        <p className="text-muted-foreground text-sm tabular-nums">ID #{responseId}</p>
      </div>

      {isError && (
        <p className="text-destructive text-sm" role="alert">
          {error?.message ?? "Failed to load response"}
        </p>
      )}

      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.respondent")}</CardTitle>
              <CardDescription>{fmtDate(data.response.startedAt)}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground text-xs uppercase">{t("yourName")}</p>
                <p className="font-medium">{data.response.respondentName?.trim() || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase">{t("yourEmail")}</p>
                <p className="font-medium">{data.response.respondentEmail?.trim() || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase">{t("yourPhone")}</p>
                <p className="font-medium">{data.response.respondentPhone?.trim() || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase">{t("companyName")}</p>
                <p className="font-medium">{data.response.companyName?.trim() || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase">{t("companySector")}</p>
                <p className="font-medium">{data.response.companySector?.trim() || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase">{t("companySize")}</p>
                <p className="font-medium">{data.response.companySize?.trim() || "—"}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-muted-foreground text-xs uppercase">{t("companyGovernorate")}</p>
                <p className="font-medium">{data.response.companyGovernorate?.trim() || "—"}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-muted-foreground text-xs uppercase">{t("admin.status")}</p>
                <p className="font-medium">
                  {data.response.status === "completed"
                    ? t("admin.completed")
                    : data.response.status === "in_progress"
                      ? t("admin.inProgress")
                      : t("admin.abandoned", { defaultValue: "Abandoned" })}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("admin.scores")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {SCORE_KEYS.map((key) => {
                const value = (data.response.scores as Record<string, number> | null | undefined)?.[key] ?? 0;
                const pct = Math.min(100, Math.max(0, value));
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span>{t(`admin.${key}`)}</span>
                      <span className="text-muted-foreground tabular-nums">{pct}</span>
                    </div>
                    <div className="bg-muted h-2.5 w-full overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: SCORE_BAR_COLORS[key],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("admin.tags")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {data.tags.length === 0 ? (
                <span className="text-muted-foreground text-sm">—</span>
              ) : (
                data.tags.map((tag) => (
                  <Badge key={tag.id} variant="secondary">
                    {lang === "ar" ? tag.labelAr : tag.labelEn}
                  </Badge>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("admin.answers")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              {sectionsWithQuestions.map(({ section, questions }) => (
                <div key={section.id} className="space-y-4">
                  <h2 className="border-b pb-2 text-lg font-semibold">
                    {lang === "ar" ? section.titleAr : section.titleEn}
                  </h2>
                  <ul className="space-y-4">
                    {questions.map((q) => {
                      const ans = answersByQuestion.get(q.id) ?? {
                        answerValue: null,
                        selectedOptions: null,
                      };
                      const display = formatAnswerValue(q, ans, optionsByQuestion, lang);
                      return (
                        <li key={q.id} className="space-y-1">
                          <p className="text-sm font-medium">
                            {lang === "ar" ? q.labelAr : q.labelEn}
                          </p>
                          <p className="text-muted-foreground text-sm whitespace-pre-wrap">{display}</p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
