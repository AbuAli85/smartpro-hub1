import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Info, Tag } from "lucide-react";

const CHART_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#8b5cf6", "#ec4899", "#eab308", "#ef4444"];

const SCORE_KEYS = [
  "smartpro_fit",
  "digital_maturity",
  "compliance_burden",
  "staffing_pressure",
  "adoption_readiness",
] as const;

const SCORE_COLORS: Record<(typeof SCORE_KEYS)[number], string> = {
  smartpro_fit: "#3b82f6",
  digital_maturity: "#22c55e",
  compliance_burden: "#f97316",
  staffing_pressure: "#ef4444",
  adoption_readiness: "#8b5cf6",
};

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-36 items-center justify-center rounded-lg border border-dashed">
      <p className="text-muted-foreground text-sm">{label}</p>
    </div>
  );
}

function barChartHeight(itemCount: number): number {
  if (itemCount <= 0) return 0;
  if (itemCount === 1) return 72;
  if (itemCount === 2) return 110;
  return Math.min(480, itemCount * 42 + 24);
}

function CompletedContext({
  completed,
  t,
}: {
  completed: number;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  if (completed <= 0) return null;
  return (
    <CardDescription>
      {completed === 1
        ? t("admin.lowSampleNote", { count: 1 }).split("—")[0].trim()
        : `${completed} ${t("admin.completed").toLowerCase()}`}
    </CardDescription>
  );
}

export default function SurveyAdminAnalyticsPage() {
  const { t } = useTranslation("survey");

  const { data, isLoading, isError, error } = trpc.survey.adminGetAnalytics.useQuery();

  const completed = data?.completedResponses ?? 0;

  const sectorChartData = useMemo(() => {
    if (!data?.sectorBreakdown) return [];
    return [...data.sectorBreakdown]
      .sort((a, b) => b.count - a.count)
      .map((s, i) => ({
        name: String(s.sector),
        count: s.count,
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }));
  }, [data?.sectorBreakdown]);

  const sizePieData = useMemo(() => {
    if (!data?.sizeBreakdown) return [];
    return data.sizeBreakdown.map((s, i) => ({
      name: String(s.size),
      value: s.count,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [data?.sizeBreakdown]);

  const governorateChartData = useMemo(() => {
    if (!data?.governorateBreakdown) return [];
    return [...data.governorateBreakdown]
      .sort((a, b) => b.count - a.count)
      .map((s, i) => ({
        name: String(s.governorate),
        count: s.count,
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }));
  }, [data?.governorateBreakdown]);

  const topTagMax = useMemo(() => {
    if (!data?.topTags?.length) return 1;
    return Math.max(1, data.topTags[0].count);
  }, [data?.topTags]);

  const topTagMin = useMemo(() => {
    if (!data?.topTags?.length) return 0;
    return data.topTags[data.topTags.length - 1].count;
  }, [data?.topTags]);

  const tagsAllEqual = topTagMax === topTagMin;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BarChart3 className="h-7 w-7 text-primary" aria-hidden />
          {t("admin.analytics")}
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {t("admin.analytics")} — {t("subtitle")}
        </p>
      </div>

      {isError && (
        <p className="text-destructive text-sm" role="alert">
          {error?.message ?? "Failed to load analytics"}
        </p>
      )}

      {/* ── KPI Cards ───────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: t("admin.totalResponses"), valueKey: "totalResponses" as const },
          { label: t("admin.completed"), valueKey: "completedResponses" as const },
          { label: t("admin.completionRate"), valueKey: "completionRate" as const, suffix: "%" },
          { label: t("admin.inProgress"), valueKey: "inProgressResponses" as const },
        ].map((card) => (
          <Card key={card.valueKey}>
            <CardHeader className="pb-2">
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {isLoading || !data ? (
                  <Skeleton className="mt-1 h-9 w-24" />
                ) : (
                  <>
                    {data[card.valueKey]}
                    {card.suffix ?? ""}
                  </>
                )}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* ── Low sample size note ────────────────────────────────────────── */}
      {!isLoading && data && completed > 0 && completed <= 5 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="text-sm leading-relaxed">
            {completed === 1
              ? t("admin.lowSampleNote", { count: 1 })
              : t("admin.lowSampleNotePlural", { count: completed })}
          </p>
        </div>
      )}

      {/* ── Average Scores ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.avgScores")}</CardTitle>
          <CardDescription>{t("admin.avgScoresDesc", { count: completed })}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <div className="space-y-4">
              {SCORE_KEYS.map((k) => (
                <div key={k} className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-full rounded-full" />
                </div>
              ))}
            </div>
          ) : completed === 0 ? (
            <EmptyState label={t("admin.noDataYet")} />
          ) : (
            <div className="space-y-5">
              {SCORE_KEYS.map((key) => {
                const score = data.avgScores[key] ?? 0;
                const fill = SCORE_COLORS[key];
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium">{t(`admin.${key}`)}</span>
                      <span className="text-muted-foreground tabular-nums text-xs font-semibold">
                        {score}
                        <span className="text-muted-foreground/60"> / 100</span>
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${Math.min(100, Math.max(0, score))}%`, backgroundColor: fill }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Breakdowns: Sector + Company Size ───────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sector */}
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.sectorBreakdown")}</CardTitle>
            {sectorChartData.length > 0 && <CompletedContext completed={completed} t={t} />}
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : sectorChartData.length === 0 ? (
              <EmptyState label={t("admin.noDataYet")} />
            ) : (
              <ResponsiveContainer width="100%" height={barChartHeight(sectorChartData.length)}>
                <BarChart
                  data={sectorChartData}
                  layout="vertical"
                  margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
                  barCategoryGap={sectorChartData.length <= 2 ? "30%" : "20%"}
                >
                  <XAxis type="number" allowDecimals={false} fontSize={11} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={160}
                    tick={{ fontSize: 11 }}
                    interval={0}
                  />
                  <Tooltip
                    formatter={(v) => [Number(v ?? 0), "Responses"]}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={28} barSize={sectorChartData.length === 1 ? 24 : undefined}>
                    {sectorChartData.map((entry, index) => (
                      <Cell key={`sector-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Company Size */}
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.sizeBreakdown")}</CardTitle>
            {sizePieData.length > 0 && <CompletedContext completed={completed} t={t} />}
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : sizePieData.length === 0 ? (
              <EmptyState label={t("admin.noDataYet")} />
            ) : sizePieData.length === 1 ? (
              /* Single category — show a clean stat instead of a full-circle donut */
              <div className="flex flex-col items-center justify-center gap-3 py-6">
                <div
                  className="flex h-24 w-24 items-center justify-center rounded-full text-white text-lg font-bold"
                  style={{ backgroundColor: sizePieData[0].fill }}
                >
                  100%
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold">{sizePieData[0].name}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {sizePieData[0].value} {t("admin.completed").toLowerCase()}
                  </p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={sizePieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="42%"
                    innerRadius={46}
                    outerRadius={82}
                    paddingAngle={3}
                    label={({ percent }: { percent?: number }) =>
                      `${Math.round((percent ?? 0) * 100)}%`
                    }
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {sizePieData.map((entry, index) => (
                      <Cell key={`size-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, _name, item) => {
                      const payload = item.payload as { name?: string } | undefined;
                      return [Number(v ?? 0), payload?.name ?? ""];
                    }}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) => (
                      <span className="text-xs text-foreground">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Governorate ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.governorateBreakdown")}</CardTitle>
          {governorateChartData.length > 0 && <CompletedContext completed={completed} t={t} />}
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <Skeleton className="h-48 w-full rounded-lg" />
          ) : governorateChartData.length === 0 ? (
            <EmptyState label={t("admin.noDataYet")} />
          ) : (
            <ResponsiveContainer width="100%" height={barChartHeight(governorateChartData.length)}>
              <BarChart
                data={governorateChartData}
                layout="vertical"
                margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
                barCategoryGap={governorateChartData.length <= 2 ? "30%" : "20%"}
              >
                <XAxis type="number" allowDecimals={false} fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={160}
                  tick={{ fontSize: 11 }}
                  interval={0}
                />
                <Tooltip
                  formatter={(v) => [Number(v ?? 0), "Responses"]}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={28} barSize={governorateChartData.length === 1 ? 24 : undefined}>
                  {governorateChartData.map((entry, index) => (
                    <Cell key={`gov-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Top Tags ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" aria-hidden />
            <CardTitle>{t("admin.topTags")}</CardTitle>
          </div>
          <CardDescription>{t("admin.topTagsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-5 w-5 shrink-0 rounded" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-10 rounded-full" />
                </div>
              ))}
            </div>
          ) : data.topTags.length === 0 ? (
            <EmptyState label={t("admin.noDataYet")} />
          ) : tagsAllEqual ? (
            /* All counts identical — show flat badges, no misleading bars */
            <div className="flex flex-wrap gap-2">
              {data.topTags.map((row) => (
                <Badge
                  key={row.tagSlug}
                  variant="secondary"
                  className="gap-1.5 px-3 py-1.5 text-sm"
                >
                  {row.tagLabel}
                  <span className="text-muted-foreground/70 tabular-nums text-xs">×{row.count}</span>
                </Badge>
              ))}
            </div>
          ) : (
            <ul className="space-y-2.5">
              {data.topTags.map((row, idx) => {
                const pct = Math.round((row.count / topTagMax) * 100);
                return (
                  <li key={row.tagSlug}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold tabular-nums text-muted-foreground">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2 mb-1">
                          <span className="text-sm font-medium truncate">{row.tagLabel}</span>
                          <Badge variant="secondary" className="tabular-nums shrink-0 text-xs">
                            {row.count}
                          </Badge>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/70 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
