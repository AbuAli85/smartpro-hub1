import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { fmtDateTimeShort } from "@/lib/dateUtils";
import { toast } from "sonner";

export default function EngagementsPage() {
  const { t } = useTranslation("engagements");
  const list = trpc.engagements.list.useQuery({ page: 1, pageSize: 50 });
  const backfill = trpc.engagements.backfillFromTenant.useMutation({
    onSuccess: (r) => {
      list.refetch();
      toast.success(t("backfillDone", { created: r.created, skipped: r.skipped }));
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild>
            <Link href="/client-portal">{t("backToPortal")}</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/engagements/ops">{t("ops.link")}</Link>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={backfill.isPending}
            onClick={() => backfill.mutate({})}
          >
            {backfill.isPending ? t("linking") : t("linkWorkspace")}
          </Button>
        </div>
      </div>

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

      {list.data && list.data.items.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            {t("empty")}
          </CardContent>
        </Card>
      )}

      {list.data && list.data.items.length > 0 && (
        <div className="space-y-2">
          {list.data.items.map((e) => (
            <Link key={e.id} href={`/engagements/${e.id}`}>
              <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="py-4 px-5 flex flex-row items-center justify-between gap-3 space-y-0">
                  <div className="min-w-0 text-left">
                    <CardTitle className="text-base font-semibold truncate">{e.title}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {e.engagementType.replace(/_/g, " ")} · {fmtDateTimeShort(e.updatedAt)}
                    </p>
                    {e.topActionLabel && (
                      <p className="text-xs mt-1 line-clamp-2">
                        <span className="text-muted-foreground">{t("topAction")}:</span> {e.topActionLabel}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="capitalize">
                      {e.status.replace(/_/g, " ")}
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {e.health.replace(/_/g, " ")}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
