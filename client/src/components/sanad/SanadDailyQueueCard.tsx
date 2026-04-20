import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { fmtDateTime } from "@/lib/dateUtils";
import { canAccessSanadIntelFull } from "@shared/sanadRoles";
import { CalendarClock, ExternalLink, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";

type OwnerScope = "all" | "mine_and_unassigned";

export function SanadDailyQueueCard() {
  const { t } = useTranslation("sanadIntel");
  const { user } = useAuth();
  const fullOps = Boolean(user && canAccessSanadIntelFull(user));
  const [ownerScope, setOwnerScope] = useState<OwnerScope>(() => (fullOps ? "mine_and_unassigned" : "all"));

  const q = trpc.sanad.intelligence.dailyActionQueue.useQuery(
    { limit: 15, ownerScope },
    { staleTime: 45_000 },
  );

  const generatedLabel = useMemo(() => {
    if (!q.data?.generatedAt) return null;
    return fmtDateTime(q.data.generatedAt);
  }, [q.data?.generatedAt]);

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
            {t("sanadDailyQueue.title")}
            {q.data?.viewer === "reviewer" ? (
              <Badge variant="secondary" className="font-normal">
                {t("sanadDailyQueue.viewOnlyBadge")}
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>{t("sanadDailyQueue.subtitle")}</CardDescription>
          {generatedLabel ? (
            <p className="text-[11px] text-muted-foreground">
              {t("sanadDailyQueue.generatedAt", { time: generatedLabel })}
            </p>
          ) : null}
        </div>
        {fullOps ? (
          <div className="flex w-full flex-col gap-1 sm:w-56">
            <span className="text-[11px] font-medium text-muted-foreground">{t("sanadDailyQueue.scopeMine")}</span>
            <Select value={ownerScope} onValueChange={(v) => setOwnerScope(v as OwnerScope)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mine_and_unassigned">{t("sanadDailyQueue.scopeMine")}</SelectItem>
                <SelectItem value="all">{t("sanadDailyQueue.scopeAll")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            …
          </div>
        ) : q.isError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">{t("sanadDailyQueue.errorTitle")}</p>
            <Button type="button" variant="outline" size="sm" className="mt-2 h-8" onClick={() => void q.refetch()}>
              {t("sanadDailyQueue.retry")}
            </Button>
          </div>
        ) : !q.data?.items.length ? (
          <p className="text-sm text-muted-foreground">{t("sanadDailyQueue.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {q.data.items.map((item) => {
              const titleKey = `sanadDailyQueue.signals.${item.signalKey}`;
              const title = t(titleKey, { defaultValue: item.signalKey });
              const ctaKey = `sanadDailyQueue.cta.${item.recommendedActionKey}`;
              const cta = t(ctaKey, { defaultValue: item.recommendedActionKey });
              const secondaries =
                item.secondarySignalKeys.length > 0
                  ? item.secondarySignalKeys
                      .map((k) => t(`sanadDailyQueue.signals.${k}`, { defaultValue: k }))
                      .join(", ")
                  : "";
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 rounded-md border border-border/70 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium leading-snug text-foreground [overflow-wrap:anywhere]">{title}</p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {item.centerName}
                      {item.governorateLabelRaw ? ` · ${item.governorateLabelRaw}` : null}
                    </p>
                    {secondaries ? (
                      <p className="text-[11px] text-muted-foreground">
                        {t("sanadDailyQueue.secondary", { list: secondaries })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button size="sm" variant={item.ctaVariant === "read_only" ? "outline" : "default"} className="h-8" asChild>
                      <Link href={item.href}>
                        <ExternalLink className="me-1 h-3.5 w-3.5" aria-hidden />
                        {item.ctaVariant === "read_only" ? t("sanadDailyQueue.cta.view_in_directory") : cta}
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
