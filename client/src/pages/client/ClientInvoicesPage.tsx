import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { fmtDateTimeShort } from "@/lib/dateUtils";

export default function ClientInvoicesPage() {
  const { t } = useTranslation("engagements");
  const { data, isLoading } = trpc.clientWorkspace.listInvoices.useQuery({ page: 1, pageSize: 100 });

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t("clientWorkspace.invoicesTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("clientWorkspace.invoicesSubtitle")}</p>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {data?.items.map((inv) => (
        <Card key={`${inv.kind}-${inv.id}`}>
          <CardHeader className="py-3 flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-medium">{inv.invoiceNumber}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1 capitalize">
                {inv.kind.replace(/_/g, " ")} · {inv.status}
              </p>
            </div>
            <div className="flex gap-2">
              {inv.engagementId != null && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/client/engagements/${inv.engagementId}`}>{t("clientWorkspace.openEngagement")}</Link>
                </Button>
              )}
              <Button variant="secondary" size="sm" asChild>
                <Link href="/client/engagements?filter=awaiting_payment">Pay / proof</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="text-sm pt-0">
            <p>
              Amount: OMR {inv.amountOmr}
              {inv.balanceOmr != null ? ` · Balance OMR ${inv.balanceOmr}` : ""}
            </p>
            {inv.dueDate && <p className="text-muted-foreground mt-1">Due: {fmtDateTimeShort(inv.dueDate)}</p>}
          </CardContent>
        </Card>
      ))}

      {data && data.items.length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground text-center py-10">—</p>
      )}
    </div>
  );
}
