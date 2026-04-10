import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RouterOutputs } from "@/lib/trpc";
import { CalendarRange, CalendarClock, LineChart, ArrowUpRight, CircleDollarSign } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

type Pulse = NonNullable<RouterOutputs["operations"]["getOwnerBusinessPulse"]>;
type Bundle = Pulse["managementCadence"];
type Window = Bundle["windows"][keyof Bundle["windows"]];
type RevenueSnap = NonNullable<Pulse["revenue"]>;

function fmtOmr(n: number) {
  return n.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function CadenceWindowBody({
  w,
  hideCashReceivedTile,
}: {
  w: Window;
  /** When the parent already shows today / week / MTD cash above the tabs */
  hideCashReceivedTile?: boolean;
}) {
  const { t } = useTranslation("executive");
  return (
    <div className="space-y-3 text-xs">
      <p className="text-sm font-semibold text-foreground leading-snug">{w.headline}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {!hideCashReceivedTile && (
          <div className="rounded-lg border border-border/60 p-2 bg-muted/20">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
              {t("cashReceived")} ({w.cashPeriodLabel})
            </p>
            <p className="font-bold tabular-nums text-foreground">OMR {fmtOmr(w.cashReceivedOmr)}</p>
          </div>
        )}
        <div className="rounded-lg border border-border/60 p-2 bg-muted/20">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("arAtRisk")}</p>
          <p
            className={
              w.receivablesAtRiskOmr > 0
                ? "font-bold tabular-nums text-red-800 dark:text-red-200"
                : "font-bold tabular-nums text-foreground"
            }
          >
            OMR {fmtOmr(w.receivablesAtRiskOmr)}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 p-2 bg-muted/20">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("decisions")}</p>
          <p className="font-bold tabular-nums">{w.decisionsOpenCount}</p>
        </div>
        <div className="rounded-lg border border-border/60 p-2 bg-muted/20">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("overdueInvoices")}</p>
          <p className="font-bold tabular-nums">{w.overdueInvoiceCount}</p>
        </div>
        <div className="rounded-lg border border-border/60 p-2 bg-muted/20">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("slaBreaches")}</p>
          <p className={`font-bold tabular-nums ${w.slaOpenBreaches > 0 ? "text-amber-800" : ""}`}>{w.slaOpenBreaches}</p>
        </div>
        <div className="rounded-lg border border-border/60 p-2 bg-muted/20">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("clientSpotlight")}</p>
          <p className="font-bold tabular-nums">{w.clientRiskAccountsCount}</p>
        </div>
      </div>
      <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
        {w.reviewBullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
      {w.topActions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {w.topActions.map((a, i) => (
            <Link
              key={i}
              href={a.href}
              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--smartpro-orange)] hover:underline"
            >
              {a.label}
              <ArrowUpRight size={10} />
            </Link>
          ))}
        </div>
      )}
      <p className="text-[9px] text-muted-foreground border-t border-border/40 pt-2">{w.receivablesBasis}</p>
    </div>
  );
}

export function ManagementCadencePanel({
  bundle,
  revenue,
  showFinanceOverviewLink = true,
}: {
  bundle: Bundle;
  /** When set, paid cash summary is shown once here (avoids a duplicate block on the dashboard). */
  revenue?: RevenueSnap;
  showFinanceOverviewLink?: boolean;
}) {
  const { t } = useTranslation("executive");
  return (
    <Card className="border-border/80">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarRange size={14} className="text-[var(--smartpro-orange)]" />
            {t("managementCadence")}
          </CardTitle>
          {revenue && showFinanceOverviewLink && (
            <Link href="/finance/overview" className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--smartpro-orange)] hover:underline shrink-0 self-start sm:mt-0.5">
              {t("financeOverview")}
              <ArrowUpRight size={10} />
            </Link>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground font-normal">{bundle.basis}</p>
      </CardHeader>
      <CardContent>
        {revenue && (
          <div className="space-y-2 mb-4 pb-4 border-b border-border/60">
            <div className="flex items-center gap-2">
              <CircleDollarSign size={14} className="text-emerald-600 shrink-0" />
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                {t("cashReceived")}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-lg border border-border/60 p-2 bg-muted/15">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("today")}</p>
                <p className="font-bold tabular-nums text-foreground">
                  OMR {fmtOmr(revenue.combinedPaid.todayOmr)}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  PRO {fmtOmr(revenue.officerProPaid.todayOmr)} · Sub {fmtOmr(revenue.platformSubscriptionPaid.todayOmr)}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 p-2 bg-muted/15">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("thisWeek")}</p>
                <p className="font-bold tabular-nums text-foreground">
                  OMR {fmtOmr(revenue.combinedPaid.weekOmr)}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  PRO {fmtOmr(revenue.officerProPaid.weekOmr)} · Sub {fmtOmr(revenue.platformSubscriptionPaid.weekOmr)}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 p-2 bg-muted/15">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("monthToDate")}</p>
                <p className="font-bold tabular-nums text-foreground">
                  OMR {fmtOmr(revenue.combinedPaid.monthToDateOmr)}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  PRO {fmtOmr(revenue.officerProPaid.monthToDateOmr)} · Sub{" "}
                  {fmtOmr(revenue.platformSubscriptionPaid.monthToDateOmr)}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug w-full min-w-0 break-words">{revenue.basis}</p>
          </div>
        )}
        <Tabs defaultValue="today" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-9">
            <TabsTrigger value="today" className="text-[10px] gap-1">
              <CalendarClock size={12} /> {t("daily")}
            </TabsTrigger>
            <TabsTrigger value="this_week" className="text-[10px] gap-1">
              <LineChart size={12} /> {t("weekly")}
            </TabsTrigger>
            <TabsTrigger value="this_month" className="text-[10px] gap-1">
              <LineChart size={12} /> {t("monthly")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="today" className="mt-3">
            <CadenceWindowBody w={bundle.windows.today} hideCashReceivedTile={Boolean(revenue)} />
          </TabsContent>
          <TabsContent value="this_week" className="mt-3">
            <CadenceWindowBody w={bundle.windows.this_week} hideCashReceivedTile={Boolean(revenue)} />
          </TabsContent>
          <TabsContent value="this_month" className="mt-3">
            <CadenceWindowBody w={bundle.windows.this_month} hideCashReceivedTile={Boolean(revenue)} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
