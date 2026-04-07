import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpen,
  Building2,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  Loader2,
  MapPin,
  Network,
  Search,
  Shield,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Section = "overview" | "directory" | "demand" | "opportunity" | "compliance";

function useSection(): Section {
  const [loc] = useLocation();
  if (loc.startsWith("/admin/sanad/directory")) return "directory";
  if (loc.startsWith("/admin/sanad/demand")) return "demand";
  if (loc.startsWith("/admin/sanad/opportunity")) return "opportunity";
  if (loc.startsWith("/admin/sanad/compliance")) return "compliance";
  return "overview";
}

const tabs: { id: Section; label: string; href: string; icon: ReactNode }[] = [
  { id: "overview", label: "Network overview", href: "/admin/sanad", icon: <LayoutDashboard size={16} /> },
  { id: "directory", label: "SANAD directory", href: "/admin/sanad/directory", icon: <Building2 size={16} /> },
  { id: "demand", label: "Demand & services", href: "/admin/sanad/demand", icon: <Activity size={16} /> },
  { id: "opportunity", label: "Regional opportunity", href: "/admin/sanad/opportunity", icon: <MapPin size={16} /> },
  { id: "compliance", label: "Licensing & compliance", href: "/admin/sanad/compliance", icon: <Shield size={16} /> },
];

function AccessDenied() {
  return (
    <div className="p-6 flex items-center justify-center min-h-[50vh]">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-2">
          <Shield className="mx-auto text-muted-foreground opacity-40" size={40} />
          <h2 className="font-semibold text-lg">Restricted</h2>
          <p className="text-sm text-muted-foreground">
            SANAD Network Intelligence is available to platform super admins and administrators only.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SectionNav() {
  const section = useSection();
  return (
    <div className="flex flex-wrap gap-2 border-b pb-4 mb-6">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href}>
          <Button variant={section === t.id ? "default" : "outline"} size="sm" className="gap-2">
            {t.icon}
            {t.label}
          </Button>
        </Link>
      ))}
    </div>
  );
}

function OverviewSurface() {
  const { data, isLoading, error } = trpc.sanadIntelligence.overviewSummary.useQuery();

  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  if (error)
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-destructive">
          <AlertCircle size={18} /> {error.message}
        </CardContent>
      </Card>
    );
  if (!data) return null;

  const txData = data.trends.transactions.map((r) => ({ year: String(r.year), total: r.total }));
  const incData = data.trends.income.map((r) => ({ year: String(r.year), total: r.total }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "SANAD centres", value: data.totals.centers },
          { label: "Owners (agg.)", value: data.totals.owners },
          { label: "Staff (agg.)", value: data.totals.staff },
          { label: "Workforce", value: data.totals.workforce },
          {
            label: data.latestYear ? `Transactions (${data.latestYear})` : "Transactions",
            value: data.totals.latestYearTransactions.toLocaleString(),
          },
          {
            label: data.latestYear ? `Income (${data.latestYear})` : "Income",
            value: data.totals.latestYearIncome.toLocaleString(undefined, { maximumFractionDigits: 0 }),
          },
        ].map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">{k.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{k.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {data.interpretation.length > 0 && (
        <Card className="border-[var(--smartpro-orange)]/25 bg-orange-50/40 dark:bg-orange-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp size={18} className="text-[var(--smartpro-orange)]" />
              Executive readout
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            {data.interpretation.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transactions by year</CardTitle>
            <CardDescription>2016–2025 series after import</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {txData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transaction time series yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={txData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Income by year</CardTitle>
            <CardDescription>Units as provided in source export</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {incData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No income time series yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={incData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="total" stroke="#ea580c" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {(
          [
            ["Top governorates — centres", data.topGovernorates.byCenters],
            ["Top governorates — transactions", data.topGovernorates.byTransactions],
            ["Top governorates — income", data.topGovernorates.byIncome],
            ["Top governorates — workforce", data.topGovernorates.byWorkforce],
          ] as const
        ).map(([title, rows]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No rows yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Governorate</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 8).map((r) => (
                      <TableRow key={r.key + title}>
                        <TableCell>{r.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.value.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Geographic concentration</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            Share of centres in top three governorates:{" "}
            <span className="font-semibold">{(data.geography.top3CenterShare * 100).toFixed(1)}%</span>
          </p>
          <p className="text-muted-foreground">{data.geography.concentrationNote}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function DirectorySurface() {
  const [search, setSearch] = useState("");
  const [gov, setGov] = useState<string>("");
  const [wil, setWil] = useState("");
  const [partner, setPartner] = useState<string>("");
  const [drawerId, setDrawerId] = useState<number | null>(null);

  const { data: filters } = trpc.sanadIntelligence.filterOptions.useQuery();
  const { data: wilayatList } = trpc.sanadIntelligence.wilayatForGovernorate.useQuery(
    { governorateKey: gov },
    { enabled: Boolean(gov) },
  );

  const partnerFilter =
    partner === "" ? undefined : (partner as "unknown" | "prospect" | "active" | "suspended" | "churned");

  const listQuery = trpc.sanadIntelligence.listCenters.useQuery({
    search: search || undefined,
    governorateKey: gov || undefined,
    wilayat: wil || undefined,
    partnerStatus: partnerFilter,
    limit: 75,
    offset: 0,
  });

  const detail = trpc.sanadIntelligence.getCenter.useQuery(
    { id: drawerId ?? 0 },
    { enabled: drawerId != null },
  );

  const updateOps = trpc.sanadIntelligence.updateCenterOperations.useMutation({
    onSuccess: () => {
      toast.success("Partner record updated");
      listQuery.refetch();
      detail.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
        <div className="flex-1 space-y-1.5">
          <Label>Search</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Centre name, contact, village, manager…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="w-full lg:w-48 space-y-1.5">
          <Label>Governorate</Label>
          <Select value={gov || "__all"} onValueChange={(v) => { setGov(v === "__all" ? "" : v); setWil(""); }}>
            <SelectTrigger>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All</SelectItem>
              {(filters?.governorates ?? []).map((g) => (
                <SelectItem key={g.key} value={g.key}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full lg:w-48 space-y-1.5">
          <Label>Wilayat</Label>
          <Select value={wil || "__all"} onValueChange={(v) => setWil(v === "__all" ? "" : v)} disabled={!gov}>
            <SelectTrigger>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All</SelectItem>
              {(wilayatList ?? []).map((w) => (
                <SelectItem key={w} value={w}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full lg:w-48 space-y-1.5">
          <Label>Partner status</Label>
          <Select value={partner || "__all"} onValueChange={(v) => setPartner(v === "__all" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
              <SelectItem value="prospect">Prospect</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="churned">Churned</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {listQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin" />
            </div>
          ) : listQuery.error ? (
            <div className="p-6 text-destructive text-sm">{listQuery.error.message}</div>
          ) : !listQuery.data?.rows.length ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No centres match your filters. Run <code className="text-xs bg-muted px-1 rounded">pnpm sanad-intel:import</code>{" "}
              after placing source files under <code className="text-xs bg-muted px-1 rounded">data/sanad-intelligence/import</code>.
            </div>
          ) : (
            <ScrollArea className="h-[min(60vh,520px)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Centre</TableHead>
                    <TableHead>Responsible</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data.rows.map(({ center, ops }) => (
                    <TableRow key={center.id}>
                      <TableCell className="font-medium max-w-[200px]">{center.centerName}</TableCell>
                      <TableCell>{center.responsiblePerson ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{center.contactNumber ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {center.governorateLabelRaw}
                        {center.wilayat ? ` · ${center.wilayat}` : ""}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{ops?.partnerStatus ?? "unknown"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setDrawerId(center.id)}>
                          Open
                          <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Sheet open={drawerId != null} onOpenChange={(o) => !o && setDrawerId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Centre detail</SheetTitle>
          </SheetHeader>
          {detail.isLoading ? (
            <Loader2 className="animate-spin m-8" />
          ) : detail.data ? (
            <div className="space-y-4 mt-4">
              <div>
                <h3 className="font-semibold text-lg">{detail.data.center.centerName}</h3>
                <p className="text-sm text-muted-foreground">
                  {detail.data.center.governorateLabelRaw}
                  {detail.data.center.wilayat ? ` · ${detail.data.center.wilayat}` : ""}
                  {detail.data.center.village ? ` · ${detail.data.center.village}` : ""}
                </p>
              </div>
              <Separator />
              <div className="grid gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Responsible</span>
                  <p>{detail.data.center.responsiblePerson ?? "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Contact</span>
                  <p className="tabular-nums">{detail.data.center.contactNumber ?? "—"}</p>
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <Label>Partner status</Label>
                <Select
                  value={detail.data.ops?.partnerStatus ?? "unknown"}
                  onValueChange={(v) =>
                    updateOps.mutate({
                      centerId: detail.data!.center.id,
                      partnerStatus: v as "unknown" | "prospect" | "active" | "suspended" | "churned",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">Unknown</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="churned">Churned</SelectItem>
                  </SelectContent>
                </Select>
                <Label>Onboarding</Label>
                <Select
                  value={detail.data.ops?.onboardingStatus ?? "not_started"}
                  onValueChange={(v) =>
                    updateOps.mutate({
                      centerId: detail.data!.center.id,
                      onboardingStatus: v as
                        | "not_started"
                        | "intake"
                        | "documentation"
                        | "licensing_review"
                        | "licensed"
                        | "blocked",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">Not started</SelectItem>
                    <SelectItem value="intake">Intake</SelectItem>
                    <SelectItem value="documentation">Documentation</SelectItem>
                    <SelectItem value="licensing_review">Licensing review</SelectItem>
                    <SelectItem value="licensed">Licensed</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
                <Label>Compliance (overall)</Label>
                <Select
                  value={detail.data.ops?.complianceOverall ?? "not_assessed"}
                  onValueChange={(v) =>
                    updateOps.mutate({
                      centerId: detail.data!.center.id,
                      complianceOverall: v as "not_assessed" | "partial" | "complete" | "at_risk",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_assessed">Not assessed</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="complete">Complete</SelectItem>
                    <SelectItem value="at_risk">At risk</SelectItem>
                  </SelectContent>
                </Select>
                <Label>Internal notes</Label>
                <Textarea
                  defaultValue={detail.data.ops?.notes ?? ""}
                  onBlur={(e) =>
                    updateOps.mutate({ centerId: detail.data!.center.id, notes: e.target.value })
                  }
                />
                <Label>Internal tags (comma-separated)</Label>
                <Input
                  defaultValue={(detail.data.ops?.internalTags ?? []).join(", ")}
                  onBlur={(e) =>
                    updateOps.mutate({
                      centerId: detail.data!.center.id,
                      internalTags: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DemandSurface() {
  const { data: y0 } = trpc.sanadIntelligence.latestMetricYear.useQuery();
  const year = y0?.year ?? new Date().getFullYear();
  const [sel, setSel] = useState<number | null>(null);
  const activeYear = sel ?? year ?? new Date().getFullYear();

  const { data, isLoading, error } = trpc.sanadIntelligence.serviceDemandInsights.useQuery(
    { year: activeYear },
    { enabled: activeYear > 0 },
  );

  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (error) return <p className="text-destructive text-sm">{error.message}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Year</Label>
          <Input
            type="number"
            className="w-32"
            value={activeYear}
            onChange={(e) => setSel(parseInt(e.target.value, 10) || null)}
          />
        </div>
        <p className="text-sm text-muted-foreground pb-2">
          Compare ranks with prior year inside the dataset; use recommendations for digitisation and partner routing.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Digitise first</CardTitle>
            <CardDescription>High-volume government workflows with clear online potential</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {data.recommendations.digitizeFirst.length === 0 ? (
              <p className="text-muted-foreground">No matches — import MostUsedServices.json.</p>
            ) : (
              <ul className="list-disc pl-4 space-y-1">
                {data.recommendations.digitizeFirst.map((r) => (
                  <li key={r.id}>
                    <span className="font-medium">{r.serviceNameEn ?? r.serviceNameAr ?? "Service"}</span>
                    {r.authorityNameEn ? <span className="text-muted-foreground"> — {r.authorityNameEn}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bundle candidates</CardTitle>
            <CardDescription>Top co-travelled demand to package for SANAD partners</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <ul className="list-disc pl-4 space-y-1">
              {data.recommendations.bundleTogether.map((r) => (
                <li key={r.id}>{r.serviceNameEn ?? r.serviceNameAr ?? "Service"}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Year-over-year rank shifts (sample)</CardTitle>
          <CardDescription>Negative delta means the service moved up in rank (lower rank number is better)</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[360px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Authority</TableHead>
                  <TableHead className="text-right">Prev rank</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.shifts.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.rankOrder}</TableCell>
                    <TableCell>{r.serviceNameEn ?? r.serviceNameAr ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {r.authorityNameEn ?? r.authorityNameAr ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">{r.previousRank ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.rankDelta != null ? r.rankDelta : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function OpportunitySurface() {
  const { data: y0 } = trpc.sanadIntelligence.latestMetricYear.useQuery();
  const [year, setYear] = useState<number | null>(null);
  const active = year ?? y0?.year ?? new Date().getFullYear();

  const { data, isLoading, error } = trpc.sanadIntelligence.regionalOpportunity.useQuery(
    { year: active },
    { enabled: active > 0 },
  );

  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (error) return <p className="text-destructive text-sm">{error.message}</p>;
  if (!data?.year)
    return <p className="text-sm text-muted-foreground">Import governorate metrics to compute opportunity scores.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label>Metric year</Label>
          <Input type="number" className="w-32" value={active} onChange={(e) => setYear(parseInt(e.target.value, 10))} />
        </div>
        <p className="text-sm text-muted-foreground pb-2">
          Scoring blends demand, yield per centre, workforce intensity, and a light coverage-gap term (see server comments).
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[min(70vh,640px)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Governorate</TableHead>
                  <TableHead className="text-right">Centres</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Workforce</TableHead>
                  <TableHead className="text-right">Tx/centre</TableHead>
                  <TableHead className="text-right">Income/centre</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Recommendation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.governorateKey}>
                    <TableCell className="font-medium">{r.governorateLabel}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.centers}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.transactions.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.income.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.workforce.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(r.transactionsPerCenter).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.incomePerCenter.toFixed(1)}</TableCell>
                    <TableCell className="text-right font-semibold">{r.opportunityScore}</TableCell>
                    <TableCell className="text-sm max-w-[220px]">{r.recommendation}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function ComplianceSurface() {
  const [centerId, setCenterId] = useState<string>("");
  const cid = parseInt(centerId, 10);

  const { data: reqs } = trpc.sanadIntelligence.listLicenseRequirements.useQuery();
  const { data: centers } = trpc.sanadIntelligence.listCenters.useQuery({ limit: 500, offset: 0 });
  const { data: items, refetch } = trpc.sanadIntelligence.listCenterCompliance.useQuery(
    { centerId: cid },
    { enabled: cid > 0 },
  );

  const seed = trpc.sanadIntelligence.seedComplianceForCenter.useMutation({
    onSuccess: (r) => {
      toast.success(`Seeded ${r.created} checklist rows`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const upsert = trpc.sanadIntelligence.upsertCenterComplianceItem.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => toast.error(e.message),
  });

  const stages = useMemo(() => {
    const s = new Set((reqs ?? []).map((r) => r.onboardingStage));
    return Array.from(s).sort();
  }, [reqs]);

  return (
    <div className="space-y-6">
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen size={18} />
            Reference document
          </CardTitle>
          <CardDescription>
            Place the official Arabic licensing PDF at{" "}
            <code className="text-xs bg-muted px-1 rounded">client/public/docs/SanadServicesCenterlicense-Ar.pdf</code> then
            open{" "}
            <a className="text-primary underline" href="/docs/SanadServicesCenterlicense-Ar.pdf" target="_blank" rel="noreferrer">
              /docs/SanadServicesCenterlicense-Ar.pdf
            </a>
            . Structured requirements below are maintained in-code and should be reconciled with that reference.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requirement catalogue</CardTitle>
            <CardDescription>Onboarding stages scaffold (seeded on import)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {stages.map((st) => (
              <div key={st}>
                <p className="font-semibold capitalize mb-1">{st.replace(/_/g, " ")}</p>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                  {(reqs ?? [])
                    .filter((r) => r.onboardingStage === st)
                    .map((r) => (
                      <li key={r.id}>
                        <span className="text-foreground">{r.titleEn}</span>
                        {r.titleAr ? <span> — {r.titleAr}</span> : null}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
            {!reqs?.length ? (
              <p className="text-muted-foreground">Run import script once to seed licence requirements.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck size={18} />
              Centre compliance workspace
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Centre</Label>
              <Select value={centerId || "__"} onValueChange={(v) => setCenterId(v === "__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select centre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__">Select…</SelectItem>
                  {(centers?.rows ?? []).map(({ center }) => (
                    <SelectItem key={center.id} value={String(center.id)}>
                      {center.centerName} — {center.governorateLabelRaw}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {cid > 0 ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => seed.mutate({ centerId: cid })}>
                Initialise checklist for this centre
              </Button>
            ) : null}
            {cid > 0 && items ? (
              <ScrollArea className="h-[400px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Requirement</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-sm text-muted-foreground p-4">
                          No rows yet — click “Initialise checklist”.
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map(({ item, req }) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-sm max-w-[200px]">{req.titleEn}</TableCell>
                          <TableCell>
                            <Select
                              value={item.status}
                              onValueChange={(v) =>
                                upsert.mutate({
                                  centerId: cid,
                                  requirementId: req.id,
                                  status: v as "pending" | "submitted" | "verified" | "rejected" | "waived" | "not_applicable",
                                })
                              }
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="submitted">Submitted</SelectItem>
                                <SelectItem value="verified">Verified</SelectItem>
                                <SelectItem value="rejected">Rejected</SelectItem>
                                <SelectItem value="waived">Waived</SelectItem>
                                <SelectItem value="not_applicable">N/A</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 text-xs"
                              placeholder="Evidence / reviewer note"
                              defaultValue={item.evidenceNote ?? ""}
                              onBlur={(e) =>
                                upsert.mutate({
                                  centerId: cid,
                                  requirementId: req.id,
                                  status: item.status,
                                  evidenceNote: e.target.value,
                                })
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AdminSanadIntelligencePage() {
  const { user } = useAuth();
  const section = useSection();

  if (!user || !canAccessGlobalAdminProcedures(user)) {
    return <AccessDenied />;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Network className="text-[var(--smartpro-orange)]" size={26} />
            SANAD Network Intelligence
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Operational partner registry, demand analytics, regional opportunity, and licensing workflows.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin">
            <FileText className="mr-2 h-4 w-4" />
            Admin panel
          </Link>
        </Button>
      </div>

      <SectionNav />

      {section === "overview" && <OverviewSurface />}
      {section === "directory" && <DirectorySurface />}
      {section === "demand" && <DemandSurface />}
      {section === "opportunity" && <OpportunitySurface />}
      {section === "compliance" && <ComplianceSurface />}
    </div>
  );
}
