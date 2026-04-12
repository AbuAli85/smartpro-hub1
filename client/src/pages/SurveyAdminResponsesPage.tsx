import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, ChevronLeft, ChevronRight } from "lucide-react";

type StatusFilter = "all" | "in_progress" | "completed" | "abandoned";

const STATUS_BADGE: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
  in_progress: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  abandoned: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
};

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function SurveyAdminResponsesPage() {
  const { t } = useTranslation("survey");
  const [page, setPage] = useState(1);
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("all");

  useEffect(() => {
    setPage(1);
  }, [selectedStatus]);

  const { data: stats } = trpc.survey.adminGetAnalytics.useQuery();

  const { data, isLoading, isError, error } = trpc.survey.adminListResponses.useQuery(
    {
      page,
      limit: 25,
      status: selectedStatus === "all" ? undefined : selectedStatus,
    },
  );

  const total = data?.total ?? 0;
  const limit = data?.limit ?? 25;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ClipboardList className="h-7 w-7 text-primary" aria-hidden />
            {t("admin.responses")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("admin.filterByStatus")}</p>
        </div>
        <Select
          value={selectedStatus}
          onValueChange={(v) => setSelectedStatus(v as StatusFilter)}
        >
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder={t("admin.filterByStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.all")}</SelectItem>
            <SelectItem value="in_progress">{t("admin.inProgress")}</SelectItem>
            <SelectItem value="completed">{t("admin.completed")}</SelectItem>
            <SelectItem value="abandoned">{t("admin.abandoned", { defaultValue: "Abandoned" })}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <CardDescription>
                {i === 0 && t("admin.totalResponses")}
                {i === 1 && t("admin.completed")}
                {i === 2 && t("admin.inProgress")}
              </CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {!stats ? (
                  <Skeleton className="mt-1 h-9 w-20" />
                ) : i === 0 ? (
                  stats.totalResponses
                ) : i === 1 ? (
                  stats.completedResponses
                ) : (
                  stats.inProgressResponses
                )}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.responses")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isError && (
            <p className="text-destructive text-sm" role="alert">
              {error?.message ?? "Failed to load responses"}
            </p>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.respondent")}</TableHead>
                  <TableHead>{t("admin.company")}</TableHead>
                  <TableHead>{t("companySector")}</TableHead>
                  <TableHead>{t("admin.status")}</TableHead>
                  <TableHead>{t("admin.date")}</TableHead>
                  <TableHead className="text-right">
                    {t("admin.actions", { defaultValue: "Actions" })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, r) => (
                      <TableRow key={r}>
                        {Array.from({ length: 6 }).map((__, c) => (
                          <TableCell key={c}>
                            <Skeleton className="h-4 w-full max-w-[140px]" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : (data?.rows.length ?? 0) === 0
                    ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-muted-foreground h-24 text-center">
                            {t("admin.noResponses")}
                          </TableCell>
                        </TableRow>
                      )
                    : data?.rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">
                            {row.respondentName?.trim() || "—"}
                          </TableCell>
                          <TableCell>{row.companyName?.trim() || "—"}</TableCell>
                          <TableCell>{row.companySector?.trim() || "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={STATUS_BADGE[row.status] ?? "border-border"}
                            >
                              {row.status === "completed"
                                ? t("admin.completed")
                                : row.status === "in_progress"
                                  ? t("admin.inProgress")
                                  : t("admin.abandoned", { defaultValue: "Abandoned" })}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground tabular-nums">
                            {fmtDate(row.startedAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/survey/admin/responses/${row.id}`}>{t("admin.viewDetail")}</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-muted-foreground text-sm">
              {total === 0
                ? "—"
                : `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} / ${total}`}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isLoading || page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isLoading || page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
