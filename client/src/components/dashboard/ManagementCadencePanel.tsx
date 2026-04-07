import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RouterOutputs } from "@/lib/trpc";
import { CalendarRange, CalendarClock, LineChart, ArrowUpRight } from "lucide-react";
import { Link } from "wouter";

type Bundle = NonNullable<RouterOutputs["operations"]["getOwnerBusinessPulse"]>["managementCadence"];
type Window = Bundle["windows"][keyof Bundle["windows"]];

function fmtOmr(n: number) {
  return n.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function CadenceWindowBody({ w }: { w: Window }) {
  return (
    <div className="space-y-3 text-xs">
      <p className="text-sm font-semibold text-foreground leading-snug">{w.headline}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="rounded-lg border border-border/60 p-2 bg-muted/20">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Cash ({w.cashPeriodLabel})</p>
          <p className="font-bold tabular-nums text-foreground">OMR {fmtOmr(w.cashReceivedOmr)}</p>
        </div>
        <div className="rounded-lg border border-border/60 p-2 bg-muted/20">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">AR at risk</p>
          <p className="font-bold tabular-nums text-red-800 dark:text-red-200">OMR {fmtOmr(w.receivablesAtRiskOmr)}</p>
        </div>
        <div className="rounded-lg border border-border/60 p-2 bg-muted/20">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Decisions (open)</p>
          <p className="font-bold tabular-nums">{w.decisionsOpenCount}</p>
        </div>
        <div className="rounded-lg border border-border/60 p-2 bg-muted/20">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Overdue invoices</p>
          <p className="font-bold tabular-nums">{w.overdueInvoiceCount}</p>
        </div>
        <div className="rounded-lg border border-border/60 p-2 bg-muted/20">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">SLA breaches</p>
          <p className={`font-bold tabular-nums ${w.slaOpenBreaches > 0 ? "text-amber-800" : ""}`}>{w.slaOpenBreaches}</p>
        </div>
        <div className="rounded-lg border border-border/60 p-2 bg-muted/20">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Client spotlight</p>
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

export function ManagementCadencePanel({ bundle }: { bundle: Bundle }) {
  return (
    <Card className="border-border/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarRange size={14} className="text-[var(--smartpro-orange)]" />
          Management cadence
        </CardTitle>
        <p className="text-[10px] text-muted-foreground font-normal">{bundle.basis}</p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="today" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-9">
            <TabsTrigger value="today" className="text-[10px] gap-1">
              <CalendarClock size={12} /> Daily
            </TabsTrigger>
            <TabsTrigger value="this_week" className="text-[10px] gap-1">
              <LineChart size={12} /> Weekly
            </TabsTrigger>
            <TabsTrigger value="this_month" className="text-[10px] gap-1">
              <LineChart size={12} /> Monthly
            </TabsTrigger>
          </TabsList>
          <TabsContent value="today" className="mt-3">
            <CadenceWindowBody w={bundle.windows.today} />
          </TabsContent>
          <TabsContent value="this_week" className="mt-3">
            <CadenceWindowBody w={bundle.windows.this_week} />
          </TabsContent>
          <TabsContent value="this_month" className="mt-3">
            <CadenceWindowBody w={bundle.windows.this_month} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
