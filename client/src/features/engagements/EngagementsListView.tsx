import { useMemo, useState, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { fmtDateTimeShort } from "@/lib/dateUtils";
import { toast } from "sonner";
import { useWorkspaceCompanyTrpc } from "@/hooks/useWorkspaceCompanyTrpc";

const CLIENT_FILTERS = [
  "all",
  "awaiting_your_action",
  "in_progress",
  "completed",
  "overdue",
  "at_risk",
  "awaiting_payment",
  "awaiting_signature",
] as const;

const CLIENT_SORTS = ["due_date", "recently_updated", "priority"] as const;

export type EngagementsListViewProps = {
  /** Href prefix for detail links, e.g. `/engagements` or `/client/engagements` */
  detailBasePath: string;
  /** Use filtered clientWorkspace list + controls */
  clientShell: boolean;
  /** Optional back link for legacy full page */
  showOpsAndBackfill?: boolean;
};

function parseFilterFromSearch(search: string): (typeof CLIENT_FILTERS)[number] | null {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = q.get("filter");
  if (!raw) return null;
  return (CLIENT_FILTERS as readonly string[]).includes(raw) ? (raw as (typeof CLIENT_FILTERS)[number]) : null;
}

export function EngagementsListView({ detailBasePath, clientShell, showOpsAndBackfill }: EngagementsListViewProps) {
  const { t } = useTranslation("engagements");
  const { workspaceReady, companyId } = useWorkspaceCompanyTrpc();
  const urlSearch = useSearch();
  const [filter, setFilter] = useState<(typeof CLIENT_FILTERS)[number]>("all");
  const [sort, setSort] = useState<(typeof CLIENT_SORTS)[number]>("recently_updated");

  useEffect(() => {
    if (!clientShell) return;
    const f = parseFilterFromSearch(urlSearch);
    if (f) setFilter(f);
  }, [urlSearch, clientShell]);

  const legacyList = trpc.engagements.list.useQuery(
    { page: 1, pageSize: 50, companyId: companyId ?? undefined },
    { enabled: !clientShell && workspaceReady },
  );
  const clientList = trpc.clientWorkspace.listEngagements.useQuery(
    { page: 1, pageSize: 50, filter, sort, companyId: companyId! },
    { enabled: clientShell && workspaceReady },
  );

  const list = clientShell ? clientList : legacyList;

  const backfill = trpc.engagements.backfillFromTenant.useMutation({
    onSuccess: (r) => {
      void list.refetch();
      toast.success(t("backfillDone", { created: r.created, skipped: r.skipped }));
    },
    onError: (e) => toast.error(e.message),
  });

  const items = useMemo(() => {
    if (!list.data?.items) return [];
    return list.data.items;
  }, [list.data?.items]);

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{clientShell ? t("clientWorkspace.engagementsTitle") : t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {clientShell ? t("clientWorkspace.engagementsSubtitle") : t("subtitle")}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {clientShell ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/client">{t("clientWorkspace.backDashboard")}</Link>
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href="/client">{t("clientWorkspace.backDashboard")}</Link>
              </Button>
              {showOpsAndBackfill !== false && (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/engagements/ops">{t("ops.link")}</Link>
                </Button>
              )}
              {showOpsAndBackfill !== false && (
                <Button variant="secondary" size="sm" disabled={backfill.isPending} onClick={() => backfill.mutate({})}>
                  {backfill.isPending ? t("linking") : t("linkWorkspace")}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {clientShell && (
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Filter</p>
            <Select value={filter} onValueChange={(v) => setFilter(v as (typeof CLIENT_FILTERS)[number])}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLIENT_FILTERS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {t(`clientWorkspace.filterLabels.${f}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Sort</p>
            <Select value={sort} onValueChange={(v) => setSort(v as (typeof CLIENT_SORTS)[number])}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due_date">{t("clientWorkspace.sortLabels.due_date")}</SelectItem>
                <SelectItem value="recently_updated">{t("clientWorkspace.sortLabels.recently_updated")}</SelectItem>
                <SelectItem value="priority">{t("clientWorkspace.sortLabels.priority")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {list.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {list.isError && (
        <Card>
          <CardContent className="py-8 text-destructive text-sm">{list.error.message}</CardContent>
        </Card>
      )}

      {list.data && items.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            {clientShell ? t("clientWorkspace.engagementsEmptyClient") : t("empty")}
          </CardContent>
        </Card>
      )}

      {list.data && items.length > 0 && (
        <div className="space-y-2">
          {items.map((e) => {
            const row = e as typeof e & { unreadCount?: number; progressPercent?: number | null };
            const href = `${detailBasePath}/${e.id}`;
            return (
              <Link key={e.id} href={href}>
                <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="py-4 px-5 flex flex-row items-center justify-between gap-3 space-y-0">
                    <div className="min-w-0 text-left">
                      <CardTitle className="text-base font-semibold truncate">{e.title}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {e.engagementType.replace(/_/g, " ")} · {fmtDateTimeShort(e.updatedAt)}
                        {e.dueDate ? ` · due ${fmtDateTimeShort(e.dueDate)}` : ""}
                      </p>
                      {e.topActionLabel && (
                        <p className="text-xs mt-1 line-clamp-2">
                          <span className="text-muted-foreground">{t("topAction")}:</span> {e.topActionLabel}
                        </p>
                      )}
                      {clientShell && row.progressPercent != null && (
                        <div className="mt-2 max-w-xs">
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${row.progressPercent}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{row.progressPercent}%</p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="capitalize">
                          {e.status.replace(/_/g, " ")}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {e.health.replace(/_/g, " ")}
                        </Badge>
                        {clientShell && (row.unreadCount ?? 0) > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {row.unreadCount} unread
                          </Badge>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
