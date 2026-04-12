import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  Cell,
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
import { BarChart3 } from "lucide-react";

const CHART_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899"];

const SCORE_KEYS = [
  "smartpro_fit",
  "digital_maturity",
  "compliance_burden",
  "staffing_pressure",
  "adoption_readiness",
] as const;

export default function SurveyAdminAnalyticsPage() {
  const { t } = useTranslation("survey");

  const { data, isLoading, isError, error } = trpc.survey.adminGetAnalytics.useQuery();

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

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BarChart3 className="h-7 w-7 text-primary" aria-hidden />
          {t("admin.analytics")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("admin.totalResponses")}</p>
      </div>

      {isError && (
        <p className="text-destructive text-sm" role="alert">
          {error?.message ?? "Failed to load analytics"}
        </p>
      )}

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

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.avgScores")}</CardTitle>
          <CardDescription>{t("admin.completed")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <div className="space-y-4">
              {SCORE_KEYS.map((k) => (
                <div key={k} className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ))}
            </div>
          ) : data.completedResponses === 0 ? (
            <p className="text-muted-foreground text-sm">—</p>
          ) : (
            <div className="space-y-5">
              {SCORE_KEYS.map((key, i) => {
                const score = data.avgScores[key] ?? 0;
                const fill = CHART_COLORS[i % CHART_COLORS.length];
                const row = [{ key: String(key), score }];
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{t(`admin.${key}`)}</span>
                      <span className="text-muted-foreground tabular-nums">{score}</span>
                    </div>
                    <ResponsiveContainer width="100%" height={44}>
                      <BarChart
                        data={row}
                        layout="vertical"
                        margin={{ left: 0, right: 8, top: 4, bottom: 4 }}
                      >
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis type="category" dataKey="key" hide width={0} />
                        <Tooltip formatter={(v: number) => [v, t(`admin.${key}`)]} />
                        <Bar dataKey="score" fill={fill} radius={[0, 4, 4, 0]} maxBarSize={20}>
                          <Cell fill={fill} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.sectorBreakdown")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <Skeleton className="h-72 w-full rounded-lg" />
            ) : sectorChartData.length === 0 ? (
              <p className="text-muted-foreground text-sm">—</p>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={Math.min(520, Math.max(220, sectorChartData.length * 36))}
              >
                <BarChart
                  data={sectorChartData}
                  layout="vertical"
                  margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                >
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={132} tick={{ fontSize: 11 }} interval={0} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={26}>
                    {sectorChartData.map((entry, index) => (
                      <Cell key={`cell-sector-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("admin.sizeBreakdown")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <Skeleton className="h-72 w-full rounded-lg" />
            ) : sizePieData.length === 0 ? (
              <p className="text-muted-foreground text-sm">—</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={sizePieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={96}
                    label={(props: { name?: string; percent?: number }) =>
                      `${String(props.name ?? "")} (${Math.round((props.percent ?? 0) * 100)}%)`
                    }
                  >
                    {sizePieData.map((entry, index) => (
                      <Cell key={`cell-size-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.governorateBreakdown")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <Skeleton className="h-72 w-full rounded-lg" />
          ) : governorateChartData.length === 0 ? (
            <p className="text-muted-foreground text-sm">—</p>
          ) : (
            <ResponsiveContainer
              width="100%"
              height={Math.min(520, Math.max(220, governorateChartData.length * 36))}
            >
              <BarChart
                data={governorateChartData}
                layout="vertical"
                margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
              >
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={132} tick={{ fontSize: 11 }} interval={0} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={26}>
                  {governorateChartData.map((entry, index) => (
                    <Cell key={`cell-gov-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.topTags")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-28 rounded-full" />
              ))}
            </div>
          ) : data.topTags.length === 0 ? (
            <p className="text-muted-foreground text-sm">—</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.topTags.map((row) => (
                <li
                  key={row.tagSlug}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <span className="text-sm font-medium">{row.tagLabel}</span>
                  <Badge variant="secondary" className="tabular-nums">
                    {row.count}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
