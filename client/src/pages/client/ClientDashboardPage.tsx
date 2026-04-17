import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { fmtDateTimeShort } from "@/lib/dateUtils";
import { useWorkspaceCompanyTrpc } from "@/hooks/useWorkspaceCompanyTrpc";

function kpiHref(kind: string): string {
  switch (kind) {
    case "overdue":
      return "/client/engagements?filter=overdue";
    case "at_risk":
      return "/client/engagements?filter=at_risk";
    case "awaiting_your_action":
      return "/client/engagements?filter=awaiting_your_action";
    case "pending_invoices":
      return "/client/invoices";
    case "contracts_to_sign":
      return "/client/engagements?filter=awaiting_signature";
    default:
      return "/client/engagements";
  }
}

export default function ClientDashboardPage() {
  const { t } = useTranslation("engagements");
  const { workspaceReady, companyId } = useWorkspaceCompanyTrpc();
  const { data, isLoading } = trpc.clientWorkspace.getHomeSummary.useQuery(
    { companyId: companyId! },
    { enabled: workspaceReady },
  );

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t("clientWorkspace.dashboardTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("clientWorkspace.dashboardSubtitle")}</p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(
              [
                { k: "overdue", label: "Overdue", n: data.kpis.overdue },
                { k: "at_risk", label: "At risk", n: data.kpis.at_risk },
                { k: "awaiting_your_action", label: "Awaiting you", n: data.kpis.awaiting_your_action },
                { k: "pending_invoices", label: "Invoices", n: data.kpis.pending_invoices },
                { k: "contracts_to_sign", label: "To sign", n: data.kpis.contracts_to_sign },
              ] as const
            ).map((tile) => (
              <Link
                key={tile.k}
                href={kpiHref(tile.k)}
                className="rounded-lg border bg-muted/30 px-3 py-3 text-center hover:bg-muted/55 transition-colors"
              >
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{tile.label}</p>
                <p className="text-xl font-bold tabular-nums mt-1">{tile.n}</p>
              </Link>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">{t("clientWorkspace.yourWork")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {data.yourWork.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  data.yourWork.map((e) => (
                    <Link key={e.id} href={`/client/engagements/${e.id}`} className="block rounded-md border p-3 hover:bg-muted/40">
                      <p className="font-medium text-sm truncate">{e.title}</p>
                      <p className="text-xs text-muted-foreground capitalize mt-1">
                        {e.status.replace(/_/g, " ")} · {e.health.replace(/_/g, " ")}
                      </p>
                      {e.topActionLabel && (
                        <p className="text-xs mt-1 line-clamp-2">
                          <span className="text-muted-foreground">{t("topAction")}:</span> {e.topActionLabel}
                        </p>
                      )}
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">{t("clientWorkspace.recentUpdates")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0 max-h-72 overflow-y-auto">
                {data.recentUpdates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  data.recentUpdates.map((u) => (
                    <Link
                      key={u.id}
                      href={`/client/engagements/${u.engagementId}`}
                      className="block text-xs border-b border-border/50 pb-2 hover:underline"
                    >
                      <span className="font-medium">{u.title}</span>
                      <span className="text-muted-foreground"> · {u.action}</span>
                      <p className="text-muted-foreground mt-0.5">{fmtDateTimeShort(u.createdAt)}</p>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">{t("clientWorkspace.quickActions")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 pt-0">
              <Button variant="secondary" size="sm" asChild>
                <Link href="/client/engagements?filter=awaiting_your_action">{t("clientWorkspace.goEngagements")}</Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link href="/client/invoices">{t("clientWorkspace.goInvoices")}</Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link href="/client/messages">{t("clientWorkspace.goMessages")}</Link>
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
