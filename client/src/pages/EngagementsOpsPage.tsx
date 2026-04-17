import { useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { fmtDateTimeShort } from "@/lib/dateUtils";
import { toast } from "sonner";
import { seesPlatformOperatorNav } from "@shared/clientNav";
import { useAuth } from "@/_core/hooks/useAuth";

const BUCKETS = [
  "open",
  "awaiting_team",
  "awaiting_client",
  "overdue",
  "at_risk",
  "no_owner",
  "pending_replies",
  "overdue_payments",
  "pending_signatures",
  "docs_pending_review",
  "all",
] as const;

export default function EngagementsOpsPage() {
  const { t } = useTranslation("engagements");
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const isPlatform = user != null && seesPlatformOperatorNav(user);
  const [bucket, setBucket] = useState<(typeof BUCKETS)[number]>("open");
  const [platformCompanyId, setPlatformCompanyId] = useState<string>("");

  const companyIdForQuery = isPlatform && platformCompanyId ? Number(platformCompanyId) : activeCompanyId ?? undefined;

  const summary = trpc.engagements.getOpsSummary.useQuery(
    { companyId: companyIdForQuery },
    { enabled: !isPlatform ? activeCompanyId != null : true },
  );
  const list = trpc.engagements.listForOps.useQuery(
    { bucket, page: 1, pageSize: 75, companyId: companyIdForQuery, resyncDerived: false },
    { enabled: !isPlatform ? activeCompanyId != null : true },
  );

  const assign = trpc.engagements.assignOwner.useMutation({
    onSuccess: () => {
      toast.success(t("ops.assignDone"));
      list.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const priority = trpc.engagements.setPriority.useMutation({
    onSuccess: () => {
      toast.success(t("ops.priorityDone"));
      list.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const esc = trpc.engagements.escalate.useMutation({
    onSuccess: () => {
      toast.success(t("ops.escalateDone"));
      list.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const complete = trpc.engagements.applyTransition.useMutation({
    onSuccess: () => {
      toast.success(t("ops.completeDone"));
      list.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const summaryChips = useMemo(() => {
    const s = summary.data;
    if (!s) return [];
    return BUCKETS.filter((b) => (s[b] ?? 0) > 0).map((b) => ({ b, n: s[b] ?? 0 }));
  }, [summary.data]);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("ops.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("ops.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/engagements">{t("backToList")}</Link>
        </Button>
      </div>

      {isPlatform && (
        <Card className="border-dashed">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">{t("ops.platformCompanyFilter")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <input
              className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={t("ops.companyIdPlaceholder")}
              value={platformCompanyId}
              onChange={(e) => setPlatformCompanyId(e.target.value.replace(/\D/g, ""))}
            />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {BUCKETS.map((b) => (
          <Button
            key={b}
            size="sm"
            variant={bucket === b ? "default" : "outline"}
            className="capitalize"
            onClick={() => setBucket(b)}
          >
            {b.replace(/_/g, " ")}
            {summary.data?.[b] != null ? (
              <Badge variant="secondary" className="ml-2">
                {summary.data[b]}
              </Badge>
            ) : null}
          </Button>
        ))}
      </div>

      {summaryChips.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {summaryChips.map(({ b, n }) => `${b}: ${n}`).join(" · ")}
        </p>
      )}

      {list.isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {list.isError && (
        <Card>
          <CardContent className="py-6 text-destructive text-sm">{list.error.message}</CardContent>
        </Card>
      )}

      {list.data && list.data.items.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">{t("ops.empty")}</CardContent>
        </Card>
      )}

      {list.data && list.data.items.length > 0 && (
        <div className="space-y-2">
          {list.data.items.map((e) => (
            <Card key={e.id} className="border-border/80">
              <CardContent className="py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium truncate">{e.title}</span>
                    {e.companyName && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        {e.companyName}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    #{e.id} · {e.engagementType.replace(/_/g, " ")} · {fmtDateTimeShort(e.updatedAt)}
                  </p>
                  {e.topActionLabel && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">{t("ops.next")}:</span> {e.topActionLabel}
                    </p>
                  )}
                  {e.healthReason && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">{e.healthReason}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary" className="capitalize">
                      {e.status.replace(/_/g, " ")}
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {e.health.replace(/_/g, " ")}
                    </Badge>
                    <Badge variant="outline" className="uppercase text-[10px]">
                      {e.opsPriority}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button size="sm" variant="default" asChild>
                    <Link href={`/engagements/${e.id}`}>{t("ops.open")}</Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      assign.mutate({
                        engagementId: e.id,
                        ownerUserId: user?.id ?? null,
                        companyId: isPlatform ? e.companyId : activeCompanyId ?? undefined,
                      })
                    }
                  >
                    {t("ops.assignMe")}
                  </Button>
                  <Select
                    onValueChange={(v) =>
                      priority.mutate({
                        engagementId: e.id,
                        priority: v as "normal" | "high" | "urgent",
                        companyId: isPlatform ? e.companyId : activeCompanyId ?? undefined,
                      })
                    }
                  >
                    <SelectTrigger className="w-[130px] h-9">
                      <SelectValue placeholder={t("ops.priority")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">normal</SelectItem>
                      <SelectItem value="high">high</SelectItem>
                      <SelectItem value="urgent">urgent</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      esc.mutate({
                        engagementId: e.id,
                        note: "Escalated from ops queue",
                        companyId: isPlatform ? e.companyId : activeCompanyId ?? undefined,
                      })
                    }
                  >
                    {t("ops.escalate")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      complete.mutate({
                        engagementId: e.id,
                        to: "completed",
                        reason: "ops.complete",
                        companyId: isPlatform ? e.companyId : activeCompanyId ?? undefined,
                      })
                    }
                  >
                    {t("ops.complete")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
