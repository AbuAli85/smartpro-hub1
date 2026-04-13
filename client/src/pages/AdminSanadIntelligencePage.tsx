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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  resolveSanadLifecycleStage,
  SANAD_LIFECYCLE_STAGES,
  sanadLifecycleBadge,
  type SanadLifecycleOpsInput,
} from "@shared/sanadLifecycle";
import { parseSanadDirectoryPipeline } from "@shared/sanadDirectoryPipeline";
import {
  SANAD_CENTRE_PIPELINE_STATUSES,
  SANAD_NEXT_ACTION_TYPES,
  type SanadCentrePipelineStatus,
  type SanadNextActionType,
} from "@shared/sanadCentresPipeline";
import { canAccessSanadIntelligenceUi, canAccessSanadIntelFull } from "@shared/sanadRoles";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileText,
  Info,
  LayoutDashboard,
  Link2,
  Loader2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Network,
  Phone,
  Search,
  Shield,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime } from "@/lib/dateUtils";
import { buildWhatsAppMessageHref, toWhatsAppPhoneDigits } from "@/lib/whatsappClickToChat";
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

function formatDirectoryLocation(c: {
  governorateLabelRaw: string | null;
  wilayat: string | null;
  village: string | null;
}): string {
  const parts = [c.governorateLabelRaw?.trim(), c.wilayat?.trim(), c.village?.trim()].filter(
    (p): p is string => Boolean(p && p.length > 0),
  );
  return parts.join(" · ");
}

function directoryLifecycleBadge(ops: SanadLifecycleOpsInput | null | undefined) {
  const stage = resolveSanadLifecycleStage(ops ?? {}, null);
  const b = sanadLifecycleBadge(stage);
  return (
    <Badge
      variant={b.style === "outline" ? "outline" : "secondary"}
      className={`max-w-full whitespace-normal text-start font-normal leading-snug ${b.className}`}
      title={b.description}
    >
      {b.label}
    </Badge>
  );
}

const PIPELINE_BADGE_CLASS: Record<SanadCentrePipelineStatus, string> = {
  imported: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  contacted: "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
  prospect: "bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200",
  invited: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  registered: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  active: "bg-green-100 text-green-900 dark:bg-green-950/40 dark:text-green-200",
};

function pipelineStatusBadge(status: SanadCentrePipelineStatus | string | null | undefined) {
  const s = (status ?? "imported") as SanadCentrePipelineStatus;
  const label = s.replace(/_/g, " ");
  return (
    <Badge variant="outline" className={`max-w-full whitespace-normal text-start font-normal capitalize ${PIPELINE_BADGE_CLASS[s] ?? PIPELINE_BADGE_CLASS.imported}`}>
      {label}
    </Badge>
  );
}

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDatetimeLocal(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nextActionDueCue(due: Date | string | null | undefined): { text: string; className: string } | null {
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const dueDay = new Date(d);
  dueDay.setHours(0, 0, 0, 0);
  if (dueDay < todayStart) return { text: "Overdue", className: "text-destructive font-medium" };
  if (dueDay.getTime() === todayStart.getTime()) return { text: "Due today", className: "text-amber-700 dark:text-amber-300 font-medium" };
  return { text: fmtDate(due), className: "text-muted-foreground" };
}

function sanadActivityLabel(activityType: string): string {
  const m: Record<string, string> = {
    note_added: "Note added",
    contacted: "Contacted",
    owner_assigned: "Owner assigned",
    status_changed: "Stage changed",
    invite_sent: "Invite sent",
    next_action_set: "Follow-up set",
    marked_contacted: "Marked contacted",
    outreach_reply_email_set: "Survey reply email saved",
  };
  return m[activityType] ?? activityType.replace(/_/g, " ");
}

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
  const { data, isLoading, error } = trpc.sanad.intelligence.overviewSummary.useQuery();
  const { data: netOps } = trpc.sanad.intelligence.networkOperationsMetrics.useQuery();

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

      {netOps && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Partner lifecycle funnel</CardTitle>
            <CardDescription>
              Centres by canonical stage · conversion: outreach+ {netOps.lifecycle.conversion.outreachOrLater}% · live{" "}
              {netOps.lifecycle.conversion.liveShare}%
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {SANAD_LIFECYCLE_STAGES.map((stage) => (
                <span key={stage} className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-xs">
                  <span className="text-muted-foreground capitalize">{stage.replace(/_/g, " ")}</span>
                  <span className="font-semibold tabular-nums">{netOps.lifecycle.funnel[stage]}</span>
                </span>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {(
                [
                  { label: "Active work orders", value: netOps.operational.activeWorkOrders },
                  { label: "Avg partner rating", value: netOps.operational.averagePartnerRating.toFixed(2) },
                  { label: "No active catalogue", value: netOps.operational.officesWithNoActiveCatalogue },
                  { label: "Not public listed", value: netOps.operational.officesNotPublicListed },
                  { label: "Overdue follow-ups", value: netOps.operational.overdueFollowUps },
                ] as const
              ).map((k) => (
                <div
                  key={k.label}
                  className="rounded-md border border-border/70 bg-muted/20 px-2.5 py-2 text-xs"
                >
                  <p className="text-muted-foreground leading-snug">{k.label}</p>
                  <p className="font-semibold tabular-nums text-foreground mt-0.5">{k.value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-1 border-t border-border/60">
              {(
                [
                  {
                    label: "Stuck in onboarding",
                    pipeline: "stuck_onboarding" as const,
                    value: netOps.bottlenecks.stuckInOnboarding,
                  },
                  {
                    label: "Licensed, not activated",
                    pipeline: "licensed_no_office" as const,
                    value: netOps.bottlenecks.licensedNotYetActivated,
                  },
                  {
                    label: "Invited, no account yet",
                    pipeline: "invited_never_linked" as const,
                    value: netOps.bottlenecks.invitedNeverLinked ?? 0,
                  },
                  {
                    label: "Linked, not activated",
                    pipeline: "linked_not_activated" as const,
                    value: netOps.bottlenecks.linkedAccountNotActivated ?? 0,
                  },
                  {
                    label: "Activated, not public-listed",
                    pipeline: "activated_unlisted" as const,
                    value: netOps.bottlenecks.activatedLinkedNotPublicListed ?? 0,
                  },
                  {
                    label: "Public-listed, no active cat.",
                    pipeline: "public_listed_no_active_catalogue" as const,
                    value: netOps.bottlenecks.publicListedWithoutActiveCatalogue ?? 0,
                  },
                  {
                    label: "Solo owner roster only",
                    pipeline: "solo_owner_roster_only" as const,
                    value: netOps.bottlenecks.officesWithSoloOwnerRosterOnly ?? 0,
                  },
                ] as const
              ).map((k) => (
                <Link
                  key={k.label}
                  href={`/admin/sanad/directory?pipeline=${encodeURIComponent(k.pipeline)}`}
                  className="block rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-2.5 py-2 text-xs transition-colors hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <p className="text-muted-foreground leading-snug">{k.label}</p>
                  <p className="font-semibold tabular-nums text-foreground mt-0.5">{k.value}</p>
                  <p className="text-[10px] text-muted-foreground/80 mt-1">Open in directory →</p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
  const { user } = useAuth();
  const fullSanadOps = Boolean(user && canAccessSanadIntelFull(user));
  const [search, setSearch] = useState("");
  const [gov, setGov] = useState<string>("");
  const [wil, setWil] = useState("");
  const [partner, setPartner] = useState<string>("");
  const [pipeStage, setPipeStage] = useState<string>("");
  const [pipeOwnerFilter, setPipeOwnerFilter] = useState<string>("__all");
  const [pipeQueue, setPipeQueue] = useState<undefined | "due_today" | "overdue">(undefined);
  const [assignCenterId, setAssignCenterId] = useState<number | null>(null);
  const [assignSearch, setAssignSearch] = useState("");
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [crmDraft, setCrmDraft] = useState({ nextAction: "", nextActionType: "__none", dueLocal: "" });
  const [crmNoteBody, setCrmNoteBody] = useState("");
  const [pageSize, setPageSize] = useState<100 | 200 | 500>(100);
  const [page, setPage] = useState(0);
  const [, navigate] = useLocation();

  const pipelineFilter =
    typeof window !== "undefined"
      ? parseSanadDirectoryPipeline(new URLSearchParams(window.location.search).get("pipeline"))
      : undefined;

  const pipelineDrilldownLabel = useMemo(() => {
    if (!pipelineFilter) return null;
    const labels: Record<NonNullable<typeof pipelineFilter>, string> = {
      stuck_onboarding: "Stuck in onboarding",
      licensed_no_office: "Licensed, not yet activated",
      invited_never_linked: "Invited, no account yet",
      linked_not_activated: "Linked account, not activated",
      activated_unlisted: "Activated, not public-listed",
      public_listed_no_active_catalogue: "Public-listed, no active catalogue",
      solo_owner_roster_only: "Solo owner roster only",
    };
    return labels[pipelineFilter];
  }, [pipelineFilter]);

  const { data: filters } = trpc.sanad.intelligence.filterOptions.useQuery();
  const { data: wilayatList } = trpc.sanad.intelligence.wilayatForGovernorate.useQuery(
    { governorateKey: gov },
    { enabled: Boolean(gov) },
  );
  const { data: pipeKpis } = trpc.sanad.intelligence.centrePipelineKpis.useQuery();
  const { data: pipeOwnerOptions } = trpc.sanad.intelligence.centrePipelineOwnerOptions.useQuery();

  const partnerFilter =
    partner === "" ? undefined : (partner as "unknown" | "prospect" | "active" | "suspended" | "churned");

  const utils = trpc.useUtils();

  const offset = page * pageSize;

  const listQuery = trpc.sanad.intelligence.listCenters.useQuery({
    search: search || undefined,
    governorateKey: gov || undefined,
    wilayat: wil || undefined,
    partnerStatus: partnerFilter,
    pipeline: pipelineFilter,
    pipelineStatus: pipeStage ? (pipeStage as SanadCentrePipelineStatus) : undefined,
    pipelineQueue: pipeQueue,
    ownerUnassignedOnly: pipeOwnerFilter === "__unassigned" ? true : undefined,
    ownerUserId:
      pipeOwnerFilter !== "__all" && pipeOwnerFilter !== "__unassigned" && pipeOwnerFilter
        ? Number(pipeOwnerFilter)
        : undefined,
    limit: pageSize,
    offset,
  });

  useEffect(() => {
    setPage(0);
  }, [search, gov, wil, partner, pageSize, pipelineFilter, pipeStage, pipeOwnerFilter, pipeQueue]);

  const filtersActive = Boolean(
    search.trim() ||
      gov ||
      wil ||
      partner ||
      pipelineFilter ||
      pipeStage ||
      pipeOwnerFilter !== "__all" ||
      pipeQueue != null,
  );
  const total = listQuery.data?.total ?? 0;
  const rows = listQuery.data?.rows ?? [];
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = offset + rows.length;
  const canPrev = page > 0;
  const canNext = offset + rows.length < total;

  const detail = trpc.sanad.intelligence.getCenter.useQuery(
    { id: drawerId ?? 0 },
    { enabled: drawerId != null },
  );

  const readiness = trpc.sanad.intelligence.centerActivationReadiness.useQuery(
    { centerId: drawerId ?? 0 },
    { enabled: drawerId != null },
  );

  const centreActivityLog = trpc.sanad.intelligence.centreActivityLog.useQuery(
    { centerId: drawerId ?? 0, limit: 80 },
    { enabled: drawerId != null },
  );
  const centreNotes = trpc.sanad.intelligence.centreNotes.useQuery(
    { centerId: drawerId ?? 0, limit: 40 },
    { enabled: drawerId != null },
  );

  useEffect(() => {
    if (drawerId == null || !detail.data) return;
    const pl = detail.data.pipeline;
    if (!pl) {
      setCrmDraft({ nextAction: "", nextActionType: "__none", dueLocal: "" });
      return;
    }
    setCrmDraft({
      nextAction: pl.nextAction?.trim() ?? "",
      nextActionType: pl.nextActionType ?? "__none",
      dueLocal: pl.nextActionDueAt ? toDatetimeLocalValue(new Date(pl.nextActionDueAt)) : "",
    });
  }, [drawerId, detail.data?.center.id, detail.data?.pipeline]);

  const updateOps = trpc.sanad.intelligence.updateCenterOperations.useMutation({
    onSuccess: () => {
      toast.success("Partner record updated");
      listQuery.refetch();
      detail.refetch();
      readiness.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const markPipelineContacted = trpc.sanad.intelligence.markSanadCentrePipelineContacted.useMutation({
    onSuccess: (_, variables) => {
      toast.success("Marked as contacted");
      void listQuery.refetch();
      void utils.sanad.intelligence.centrePipelineKpis.invalidate();
      void utils.sanad.intelligence.centrePipelineOwnerOptions.invalidate();
      void utils.sanad.intelligence.centreActivityLog.invalidate({ centerId: variables.centerId });
      if (drawerId === variables.centerId) void detail.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const updatePipeline = trpc.sanad.intelligence.updateSanadCentrePipeline.useMutation({
    onSuccess: (_, variables) => {
      toast.success("Pipeline updated");
      void listQuery.refetch();
      void utils.sanad.intelligence.centrePipelineKpis.invalidate();
      void utils.sanad.intelligence.centrePipelineOwnerOptions.invalidate();
      void utils.sanad.intelligence.centreActivityLog.invalidate({ centerId: variables.centerId });
      void utils.sanad.intelligence.centreNotes.invalidate({ centerId: variables.centerId });
      if (drawerId === variables.centerId) void detail.refetch();
      setAssignCenterId(null);
      setAssignSearch("");
    },
    onError: (e) => toast.error(e.message),
  });

  const addCentreNote = trpc.sanad.intelligence.addCentreNote.useMutation({
    onSuccess: (_, variables) => {
      toast.success("Note added");
      setCrmNoteBody("");
      void listQuery.refetch();
      void utils.sanad.intelligence.centrePipelineKpis.invalidate();
      void utils.sanad.intelligence.centreActivityLog.invalidate({ centerId: variables.centerId });
      void utils.sanad.intelligence.centreNotes.invalidate({ centerId: variables.centerId });
      void detail.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const assignUserSearch = trpc.sanad.searchUsersForSanadRoster.useQuery(
    { query: assignSearch.trim(), officeId: undefined },
    { enabled: assignCenterId != null && assignSearch.trim().length >= 2 },
  );

  const genInvite = trpc.sanad.intelligence.generateCenterInvite.useMutation({
    onSuccess: async (data, variables) => {
      listQuery.refetch();
      detail.refetch();
      readiness.refetch();
      void utils.sanad.intelligence.centrePipelineKpis.invalidate();
      void utils.sanad.intelligence.centreActivityLog.invalidate({ centerId: variables.centerId });
      const url =
        typeof window !== "undefined" ? `${window.location.origin}${data.invitePath}` : data.invitePath;
      let waNote: string | undefined;
      if (data.whatsappAutoSent) {
        waNote = "WhatsApp (Arabic template) sent to the centre contact.";
      } else if (data.whatsappAutoError) {
        waNote = `WhatsApp auto-send failed: ${data.whatsappAutoError}`;
      } else if (data.whatsappAutoSkippedReason === "invalid_phone") {
        waNote = "WhatsApp skipped: no valid centre phone on file.";
      } else if (data.whatsappAutoSkippedReason === "no_public_base_url") {
        waNote = "WhatsApp skipped: set PUBLIC_APP_URL for absolute invite links.";
      }
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Invite link generated and copied", waNote ? { description: waNote } : undefined);
      } catch {
        toast.success("Invite link generated", { description: [url, waNote].filter(Boolean).join("\n") });
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const outreachMut = trpc.sanad.intelligence.updateCenterOutreach.useMutation({
    onSuccess: () => {
      toast.success("Outreach updated");
      detail.refetch();
      readiness.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const activateOffice = trpc.sanad.intelligence.activateCenterAsOffice.useMutation({
    onSuccess: (data) => {
      toast.success(data.alreadyLinked ? "Office already linked" : "SANAD office created and linked");
      listQuery.refetch();
      detail.refetch();
      readiness.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const officeRosterId = detail.data?.ops?.linkedSanadOfficeId ?? null;
  const rosterQuery = trpc.sanad.listSanadOfficeMembers.useQuery(
    { officeId: officeRosterId ?? 0 },
    { enabled: officeRosterId != null },
  );
  const addRosterMember = trpc.sanad.addSanadOfficeMember.useMutation({
    onSuccess: () => {
      toast.success("Member added");
      setRosterNewUserId("");
      setRosterUserSearch("");
      void rosterQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateRosterRole = trpc.sanad.updateSanadOfficeMemberRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      void rosterQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeRosterMember = trpc.sanad.removeSanadOfficeMember.useMutation({
    onSuccess: () => {
      toast.success("Access removed");
      void rosterQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const [followUpInput, setFollowUpInput] = useState("");
  const [outreachNote, setOutreachNote] = useState("");
  const [contactMethodDraft, setContactMethodDraft] = useState("call");
  const [rosterNewUserId, setRosterNewUserId] = useState("");
  const [rosterNewRole, setRosterNewRole] = useState<"owner" | "manager" | "staff">("staff");
  const [rosterUserSearch, setRosterUserSearch] = useState("");
  const rosterUserPickQuery = trpc.sanad.searchUsersForSanadRoster.useQuery(
    {
      query: rosterUserSearch.trim(),
      officeId: detail.data?.ops?.linkedSanadOfficeId ?? undefined,
    },
    {
      enabled:
        Boolean(detail.data?.ops?.linkedSanadOfficeId) && rosterUserSearch.trim().length >= 2,
    },
  );

  const ops = detail.data?.ops;
  const inviteFullUrl = useMemo(() => {
    const t = ops?.inviteToken;
    if (!t || typeof window === "undefined") return "";
    return `${window.location.origin}/sanad/join?token=${encodeURIComponent(t)}`;
  }, [ops?.inviteToken]);

  const inviteWhatsAppHref = useMemo(() => {
    const url = inviteFullUrl;
    const phone = detail.data?.center.contactNumber;
    const name = detail.data?.center.centerName?.trim() ?? "your centre";
    if (!url) return null;
    const digits = toWhatsAppPhoneDigits(phone ?? null);
    if (!digits) return null;
    const body = `Hello,\n\nPlease complete your SmartPRO Sanad onboarding using this link:\n${url}\n\nCentre: ${name}\n\nThank you.`;
    return buildWhatsAppMessageHref(digits, body);
  }, [inviteFullUrl, detail.data?.center.contactNumber, detail.data?.center.centerName]);

  /** Radix Select rejects `value=""` on SelectItem; skip empty keys from API data. */
  const governorateOptions = (filters?.governorates ?? []).filter((g) => g.key.length > 0);
  const wilayatOptions = (wilayatList ?? []).filter((w) => w.length > 0);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">Filters</p>
            <p className="text-xs text-muted-foreground">Search and narrow the partner directory</p>
          </div>
          {filtersActive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => {
                setSearch("");
                setGov("");
                setWil("");
                setPartner("");
                setPipeStage("");
                setPipeOwnerFilter("__all");
                setPipeQueue(undefined);
                setPage(0);
                navigate("/admin/sanad/directory");
              }}
            >
              Clear all
            </Button>
          ) : null}
        </div>
        <div className="flex flex-col gap-4">
          <div className="w-full space-y-1.5">
            <Label className="text-xs font-medium text-foreground">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                className="h-10 w-full pl-9 text-sm"
                placeholder="Centre name, contact, village, manager…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search directory"
              />
            </div>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="min-w-0 space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Governorate</Label>
              <Select value={gov || "__all"} onValueChange={(v) => { setGov(v === "__all" ? "" : v); setWil(""); }}>
                <SelectTrigger className="h-10 w-full text-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All</SelectItem>
                  {governorateOptions.map((g) => (
                    <SelectItem key={g.key} value={g.key}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Wilayat</Label>
              <Select value={wil || "__all"} onValueChange={(v) => setWil(v === "__all" ? "" : v)} disabled={!gov}>
                <SelectTrigger className="h-10 w-full text-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All</SelectItem>
                  {wilayatOptions.map((w) => (
                    <SelectItem key={w} value={w}>
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Partner status</Label>
              <Select value={partner || "__all"} onValueChange={(v) => setPartner(v === "__all" ? "" : v)}>
                <SelectTrigger className="h-10 w-full text-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All</SelectItem>
                  <SelectItem value="unknown">Registry (default)</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="churned">Churned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Pipeline stage</Label>
              <Select value={pipeStage || "__all"} onValueChange={(v) => setPipeStage(v === "__all" ? "" : v)}>
                <SelectTrigger className="h-10 w-full text-sm">
                  <SelectValue placeholder="All stages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All stages</SelectItem>
                  {SANAD_CENTRE_PIPELINE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Owner</Label>
              <Select value={pipeOwnerFilter} onValueChange={setPipeOwnerFilter}>
                <SelectTrigger className="h-10 w-full text-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All owners</SelectItem>
                  <SelectItem value="__unassigned">Unassigned</SelectItem>
                  {(pipeOwnerOptions ?? []).map((o) =>
                    o.userId != null ? (
                      <SelectItem key={o.userId} value={String(o.userId)}>
                        {(o.name ?? o.email ?? `User ${o.userId}`).trim()}
                      </SelectItem>
                    ) : null,
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <span className="text-xs font-medium text-muted-foreground">Follow-up queue</span>
            <Button
              type="button"
              size="sm"
              variant={pipeQueue === undefined ? "secondary" : "outline"}
              className="h-8"
              onClick={() => setPipeQueue(undefined)}
            >
              All
            </Button>
            <Button
              type="button"
              size="sm"
              variant={pipeQueue === "due_today" ? "secondary" : "outline"}
              className="h-8"
              onClick={() => setPipeQueue("due_today")}
            >
              Due today
            </Button>
            <Button
              type="button"
              size="sm"
              variant={pipeQueue === "overdue" ? "secondary" : "outline"}
              className="h-8"
              onClick={() => setPipeQueue("overdue")}
            >
              Overdue
            </Button>
          </div>
        </div>
      </div>

      {pipelineDrilldownLabel ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <span>
              <span className="font-medium text-foreground">Bottleneck drilldown:</span>{" "}
              <span className="text-muted-foreground">{pipelineDrilldownLabel}</span>
            </span>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Same cohort definitions as the Network overview bottleneck tiles — open a centre row to act (invite, activate, roster).
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 text-xs" asChild>
            <Link href="/admin/sanad/directory">Clear drilldown</Link>
          </Button>
        </div>
      ) : null}

      {pipeKpis ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Total centres (directory)</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{pipeKpis.totalCentres.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Contacted or later</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{pipeKpis.contactedPct}%</CardTitle>
            </CardHeader>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Conversion (registered + active)</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{pipeKpis.conversionPct}%</CardTitle>
            </CardHeader>
          </Card>
        </div>
      ) : null}

      <div className="flex gap-3 rounded-lg border border-border/80 bg-muted/20 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 space-y-2 leading-relaxed">
          <p className="font-medium text-foreground">Onboarding imported centres (923 registry rows)</p>
          <p>
            Official directory import fills <span className="text-foreground">Centre / contact / location</span> only.
            <span className="text-foreground"> Partner status</span> starts as <strong className="font-medium">Registry</strong> until
            your team classifies the relationship.
          </p>
          <p>
            Suggested flow: outreach → set <strong className="font-medium text-foreground">Prospect</strong> → move{" "}
            <strong className="font-medium text-foreground">Onboarding</strong> through Intake → Documentation → Licensing review →
            Licensed. Use <strong className="font-medium text-foreground">Licensing &amp; compliance</strong> for the checklist per
            centre. Bulk SQL (optional):{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
              UPDATE sanad_intel_center_operations SET partner_status = &apos;prospect&apos; WHERE partner_status =
              &apos;unknown&apos;
            </code>{" "}
            to queue everyone as prospects after a campaign.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-muted/30 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-base">Partner centres</CardTitle>
              <CardDescription className="mt-1">
                {listQuery.isLoading
                  ? "Loading directory…"
                  : listQuery.error
                    ? "Could not load counts — see message below."
                    : listQuery.data
                      ? `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${total.toLocaleString()}`
                      : null}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</Label>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v) as 100 | 200 | 500);
                  }}
                >
                  <SelectTrigger className="h-9 w-[4.5rem] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                    <SelectItem value="500">500</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  disabled={!canPrev || listQuery.isLoading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  disabled={!canNext || listQuery.isLoading}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
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
            <div className="max-h-[min(70vh,640px)] overflow-auto border-t border-border/60">
              <table className="w-full min-w-[1180px] table-fixed border-collapse text-sm">
                <caption className="sr-only">
                  SANAD partner centres: directory fields, onboarding pipeline, owner, and actions
                </caption>
                <colgroup>
                  <col className="w-[17%]" />
                  <col className="w-[13%]" />
                  <col className="w-[6.5rem]" />
                  <col className="w-[17%]" />
                  <col className="w-[8%]" />
                  <col className="w-[9%]" />
                  <col className="w-[7%]" />
                  <col className="w-[10%]" />
                  <col className="w-[5.5rem]" />
                  <col className="w-[5.5rem]" />
                </colgroup>
                <TableHeader>
                  <TableRow className="border-b-2 border-border hover:bg-transparent">
                    <TableHead className="sticky top-0 z-30 h-12 border-b border-border bg-card px-3 py-2 text-start align-bottom text-xs font-bold uppercase tracking-wide text-foreground shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                      Centre
                    </TableHead>
                    <TableHead className="sticky top-0 z-30 h-12 border-b border-border bg-card px-3 py-2 text-start align-bottom text-xs font-bold uppercase tracking-wide text-foreground shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                      Responsible
                    </TableHead>
                    <TableHead
                      className="sticky top-0 z-30 h-12 border-b border-border bg-card px-2 py-2 text-center align-bottom text-xs font-bold uppercase tracking-wide text-foreground shadow-[inset_0_-1px_0_0_hsl(var(--border))]"
                      title="From directory import (CSV / JSON)"
                    >
                      Phone
                    </TableHead>
                    <TableHead
                      className="sticky top-0 z-30 h-12 border-b border-border bg-card px-3 py-2 text-start align-bottom text-xs font-bold uppercase tracking-wide text-foreground shadow-[inset_0_-1px_0_0_hsl(var(--border))]"
                      title="Governorate · wilayat · village when present"
                    >
                      Location
                    </TableHead>
                    <TableHead className="sticky top-0 z-30 h-12 border-b border-border bg-card px-2 py-2 text-start align-bottom text-xs font-bold uppercase tracking-wide text-foreground shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                      Stage
                    </TableHead>
                    <TableHead className="sticky top-0 z-30 h-12 border-b border-border bg-card px-2 py-2 text-start align-bottom text-xs font-bold uppercase tracking-wide text-foreground shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                      Owner
                    </TableHead>
                    <TableHead className="sticky top-0 z-30 h-12 border-b border-border bg-card px-2 py-2 text-start align-bottom text-xs font-bold uppercase tracking-wide text-foreground shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                      Last contact
                    </TableHead>
                    <TableHead className="sticky top-0 z-30 h-12 border-b border-border bg-card px-2 py-2 text-start align-bottom text-xs font-bold uppercase tracking-wide text-foreground shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                      Next action
                    </TableHead>
                    <TableHead
                      className="sticky top-0 z-30 h-12 border-b border-border bg-card px-2 py-2 text-start align-bottom text-xs font-bold uppercase tracking-wide text-foreground shadow-[inset_0_-1px_0_0_hsl(var(--border))]"
                      title="Scheduled follow-up (next_action_due_at)"
                    >
                      Due
                    </TableHead>
                    <TableHead className="sticky top-0 z-30 h-12 border-b border-border bg-card px-2 py-2 text-end align-bottom text-xs font-bold uppercase tracking-wide text-foreground shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data.rows.map(({ center, pipeline, pipelineOwnerName, pipelineOwnerEmail }) => (
                    <TableRow
                      key={center.id}
                      className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/50"
                      onClick={() => setDrawerId(center.id)}
                    >
                      <TableCell className="whitespace-normal px-3 py-2.5 align-top">
                        <div dir="auto" className="min-w-0 text-start">
                          <p className="text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">
                            {center.centerName}
                          </p>
                          <p className="mt-1 font-mono text-[11px] font-medium tabular-nums text-muted-foreground">
                            ID {center.id}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell
                        dir="auto"
                        className="whitespace-normal px-3 py-2.5 align-top text-start text-sm leading-snug [overflow-wrap:anywhere]"
                      >
                        {center.responsiblePerson?.trim() ? (
                          center.responsiblePerson
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        dir="ltr"
                        className="px-2 py-2.5 align-top text-center text-sm tabular-nums"
                        title={center.contactNumber?.trim() ? undefined : "No phone in source file for this row"}
                      >
                        {center.contactNumber?.trim() ? (
                          <span className="text-foreground">{center.contactNumber}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        dir="auto"
                        className="whitespace-normal px-3 py-2.5 align-top text-start text-sm leading-snug [overflow-wrap:anywhere]"
                      >
                        {(() => {
                          const loc = formatDirectoryLocation(center);
                          return loc ? (
                            <span className="text-foreground/90">{loc}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="px-2 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                        {pipelineStatusBadge(pipeline?.pipelineStatus)}
                      </TableCell>
                      <TableCell
                        className="px-2 py-2.5 align-top text-xs text-foreground"
                        title={pipelineOwnerEmail ?? undefined}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {pipelineOwnerName?.trim() ? (
                          <span className="line-clamp-2 [overflow-wrap:anywhere]">{pipelineOwnerName}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-2 py-2.5 align-top text-xs tabular-nums text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                        {pipeline?.lastContactedAt ? fmtDateTime(pipeline.lastContactedAt) : "—"}
                      </TableCell>
                      <TableCell
                        className="px-2 py-2.5 align-top text-xs text-muted-foreground"
                        title={pipeline?.nextAction ?? undefined}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {pipeline?.nextAction?.trim() ? (
                          <span className="line-clamp-2 [overflow-wrap:anywhere]">{pipeline.nextAction}</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell
                        className="px-2 py-2.5 align-top text-xs tabular-nums"
                        title={pipeline?.nextActionDueAt ? fmtDateTime(pipeline.nextActionDueAt) : undefined}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(() => {
                          const cue = nextActionDueCue(pipeline?.nextActionDueAt ?? null);
                          return cue ? (
                            <span className={cn("block leading-snug", cue.className)}>{cue.text}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          );
                        })()}
                      </TableCell>
                      <TableCell
                        className="px-2 py-2.5 align-middle text-end whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Centre actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>Outreach</DropdownMenuLabel>
                            {(() => {
                              const digits = toWhatsAppPhoneDigits(center.contactNumber);
                              const waHref = digits
                                ? buildWhatsAppMessageHref(
                                    digits,
                                    `مرحباً،\nنُسجّل اهتمامكم بالانضمام إلى SmartPRO.\nالمركز: ${center.centerName}`,
                                  )
                                : null;
                              return (
                                <>
                                  <DropdownMenuItem
                                    disabled={!waHref}
                                    onSelect={() => {
                                      if (waHref) window.open(waHref, "_blank", "noopener,noreferrer");
                                    }}
                                  >
                                    <MessageCircle className="mr-2 h-4 w-4 text-[#25D366]" />
                                    WhatsApp (draft)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={!digits}
                                    onSelect={() => {
                                      if (digits) window.open(`tel:${digits}`, "_self");
                                    }}
                                  >
                                    <Phone className="mr-2 h-4 w-4" />
                                    Call
                                  </DropdownMenuItem>
                                </>
                              );
                            })()}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => {
                                void genInvite.mutateAsync({ centerId: center.id });
                              }}
                            >
                              <Link2 className="mr-2 h-4 w-4" />
                              Invite to SmartPRO
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                markPipelineContacted.mutate({ centerId: center.id });
                              }}
                            >
                              <Check className="mr-2 h-4 w-4" />
                              Mark as contacted
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                setAssignCenterId(center.id);
                                setAssignSearch("");
                              }}
                            >
                              <UserPlus className="mr-2 h-4 w-4" />
                              Assign owner
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => setDrawerId(center.id)}>
                              <ArrowRight className="mr-2 h-4 w-4" />
                              Open details
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={drawerId != null} onOpenChange={(o) => !o && setDrawerId(null)}>
        <SheetContent className="flex h-full min-h-0 w-full flex-col gap-0 border-l sm:max-w-xl">
          <SheetHeader className="space-y-1 border-b pb-4 text-left">
            <SheetTitle className="text-lg">Centre detail</SheetTitle>
            <SheetDescription>Directory record, contact, and partner operations for this centre.</SheetDescription>
          </SheetHeader>
          {detail.isLoading ? (
            <div className="flex flex-1 items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : detail.error ? (
            <div className="mt-4 flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p className="font-medium">Could not load this centre</p>
                <p className="mt-1 text-destructive/90">{detail.error.message}</p>
              </div>
            </div>
          ) : detail.data ? (
            <div className="flex-1 space-y-5 overflow-y-auto py-5 pr-1">
              <div className="rounded-lg border bg-muted/25 p-4" dir="auto">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Centre</p>
                <h3 className="mt-1.5 text-lg font-semibold leading-snug text-foreground">
                  {detail.data.center.centerName}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {detail.data.center.governorateLabelRaw}
                  {detail.data.center.wilayat ? ` · ${detail.data.center.wilayat}` : ""}
                  {detail.data.center.village ? ` · ${detail.data.center.village}` : ""}
                </p>
              </div>

              <div className="rounded-lg border bg-muted/25 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</p>
                <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
                  <div dir="auto">
                    <span className="text-xs font-medium text-muted-foreground">Responsible person</span>
                    <p className="mt-1 font-medium leading-snug text-foreground">
                      {detail.data.center.responsiblePerson?.trim() ? (
                        detail.data.center.responsiblePerson
                      ) : (
                        <span className="font-normal text-muted-foreground">Not provided</span>
                      )}
                    </p>
                  </div>
                  <div dir="ltr">
                    <span className="text-xs font-medium text-muted-foreground">Phone</span>
                    <p className="mt-1 tabular-nums text-foreground">
                      {detail.data.center.contactNumber?.trim() ? (
                        detail.data.center.contactNumber
                      ) : (
                        <span className="font-sans font-normal text-muted-foreground">
                          Not in directory import — update CSV/JSON and re-run import if needed
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="sm:col-span-2" dir="ltr">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Survey reply email (e.g. WhatsApp text reply)
                    </Label>
                    <Input
                      className="mt-1.5 h-9 text-sm"
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      defaultValue={detail.data.ops?.surveyOutreachReplyEmail ?? ""}
                      key={`reply-email-${detail.data.center.id}-${detail.data.ops?.surveyOutreachReplyEmail ?? ""}`}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        const prev = (detail.data!.ops?.surveyOutreachReplyEmail ?? "").trim();
                        if (v === prev) return;
                        if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
                          toast.error("Enter a valid email or leave empty");
                          return;
                        }
                        updateOps.mutate({
                          centerId: detail.data!.center.id,
                          surveyOutreachReplyEmail: v === "" ? null : v,
                        });
                      }}
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                      Save when a centre replies with an email only so you can send the dedicated survey link from this address later.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-primary/15 bg-primary/[0.03] p-4 shadow-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Pipeline &amp; follow-up
                </p>
                <div className="space-y-4 text-sm">
                  <div className="flex flex-wrap gap-4">
                    <div>
                      <span className="text-xs text-muted-foreground">Stage</span>
                      <div className="mt-1">{pipelineStatusBadge(detail.data.pipeline?.pipelineStatus)}</div>
                    </div>
                    <div className="min-w-[10rem]">
                      <span className="text-xs text-muted-foreground">Owner</span>
                      <p className="mt-1 font-medium text-foreground">
                        {(() => {
                          const label = (
                            detail.data.pipelineOwnerUser?.name ??
                            detail.data.pipelineOwnerUser?.email ??
                            ""
                          ).trim();
                          if (label) return label;
                          if (detail.data.pipeline?.ownerUserId == null) {
                            return <span className="font-normal text-muted-foreground">Unassigned</span>;
                          }
                          return `User #${detail.data.pipeline!.ownerUserId}`;
                        })()}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Last pipeline contact</span>
                      <p className="mt-1 tabular-nums text-muted-foreground">
                        {detail.data.pipeline?.lastContactedAt
                          ? fmtDateTime(detail.data.pipeline.lastContactedAt)
                          : "—"}
                      </p>
                    </div>
                  </div>
                  {detail.data.pipeline?.latestNotePreview?.trim() ? (
                    <div className="rounded-md border bg-background/80 p-2.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Latest note:</span>{" "}
                      {detail.data.pipeline.latestNotePreview}
                    </div>
                  ) : null}

                  {fullSanadOps ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Pipeline stage (override)</Label>
                        <Select
                          value={(detail.data.pipeline?.pipelineStatus ?? "imported") as string}
                          onValueChange={(v) =>
                            updatePipeline.mutate({
                              centerId: detail.data!.center.id,
                              pipelineStatus: v as SanadCentrePipelineStatus,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SANAD_CENTRE_PIPELINE_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s.replace(/_/g, " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAssignCenterId(detail.data!.center.id);
                            setAssignSearch("");
                          }}
                        >
                          <UserPlus className="mr-2 h-4 w-4" />
                          Assign owner
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <p className="text-xs font-medium text-muted-foreground">Follow-up</p>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Next action</Label>
                      <Textarea
                        className="min-h-[72px] text-sm"
                        value={crmDraft.nextAction}
                        onChange={(e) => setCrmDraft((d) => ({ ...d, nextAction: e.target.value }))}
                        placeholder="What happens next?"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Type</Label>
                        <Select
                          value={crmDraft.nextActionType}
                          onValueChange={(v) => setCrmDraft((d) => ({ ...d, nextActionType: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Optional" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">Not set</SelectItem>
                            {SANAD_NEXT_ACTION_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t.replace(/_/g, " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Due</Label>
                        <Input
                          type="datetime-local"
                          value={crmDraft.dueLocal}
                          onChange={(e) => setCrmDraft((d) => ({ ...d, dueLocal: e.target.value }))}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={updatePipeline.isPending}
                      onClick={() => {
                        updatePipeline.mutate({
                          centerId: detail.data!.center.id,
                          nextAction: crmDraft.nextAction.trim() || null,
                          nextActionType:
                            crmDraft.nextActionType === "__none"
                              ? null
                              : (crmDraft.nextActionType as SanadNextActionType),
                          nextActionDueAt: parseDatetimeLocal(crmDraft.dueLocal),
                        });
                      }}
                    >
                      Save follow-up
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-4 shadow-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</p>
                {centreActivityLog.isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (centreActivityLog.data?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">No activity yet.</p>
                ) : (
                  <ScrollArea className="max-h-48 pr-3">
                    <ul className="space-y-3 text-sm">
                      {(centreActivityLog.data ?? []).map((a) => (
                        <li key={a.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                          <div className="flex flex-wrap justify-between gap-1">
                            <span className="font-medium text-foreground">{sanadActivityLabel(a.activityType)}</span>
                            <span className="tabular-nums text-xs text-muted-foreground">
                              {fmtDateTime(a.occurredAt)}
                            </span>
                          </div>
                          {a.actorName?.trim() || a.actorEmail ? (
                            <p className="text-xs text-muted-foreground">
                              {a.actorName?.trim() || a.actorEmail}
                            </p>
                          ) : null}
                          {a.note?.trim() ? (
                            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{a.note}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </div>

              <div className="rounded-lg border bg-card p-4 shadow-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
                {centreNotes.isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (centreNotes.data?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">No notes yet.</p>
                ) : (
                  <ScrollArea className="mb-3 max-h-40 pr-3">
                    <ul className="space-y-3 text-sm">
                      {(centreNotes.data ?? []).map((n) => (
                        <li key={n.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                          <div className="flex flex-wrap justify-between gap-1 text-xs text-muted-foreground">
                            <span>{n.authorName?.trim() || n.authorEmail}</span>
                            <span className="tabular-nums">{fmtDateTime(n.createdAt)}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{n.body}</p>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
                <div className="space-y-2">
                  <Label className="text-xs">Add note</Label>
                  <Textarea
                    className="min-h-[80px] text-sm"
                    value={crmNoteBody}
                    onChange={(e) => setCrmNoteBody(e.target.value)}
                    placeholder="Visible to operators with access to this centre…"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={addCentreNote.isPending || !crmNoteBody.trim()}
                    onClick={() =>
                      addCentreNote.mutate({ centerId: detail.data!.center.id, body: crmNoteBody.trim() })
                    }
                  >
                    Add note
                  </Button>
                </div>
              </div>

              {detail.data.companyMatches && detail.data.companyMatches.length > 0 ? (
                <div className="rounded-lg border border-amber-500/35 bg-amber-500/[0.06] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-950 dark:text-amber-100">
                    Possible SmartPRO company match
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Link the centre to a platform office when you confirm it is the same entity.
                  </p>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {detail.data.companyMatches.map((m) => (
                      <li key={m.id} className="font-medium text-foreground">
                        {m.name}
                        {m.nameAr ? <span className="text-muted-foreground"> · {m.nameAr}</span> : null}
                        <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">#{m.id}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-lg border bg-card p-4 shadow-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Partner operations
                </p>
                <div className="space-y-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Use these fields to track commercial onboarding. Registry means the row exists only from the government
                  directory import — it is not an active SmartPRO partner until you promote the status.
                </p>
                <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Partner status</Label>
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
                    <SelectItem value="unknown">Registry (not classified)</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="churned">Churned</SelectItem>
                  </SelectContent>
                </Select>
                </div>
                <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Onboarding</Label>
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
                </div>
                <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Compliance (overall)</Label>
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
                </div>
                <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Internal notes</Label>
                <Textarea
                  defaultValue={detail.data.ops?.notes ?? ""}
                  onBlur={(e) =>
                    updateOps.mutate({ centerId: detail.data!.center.id, notes: e.target.value })
                  }
                />
                </div>
                <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Internal tags (comma-separated)</Label>
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
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-4 shadow-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Activation readiness
                </p>
                {readiness.isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : readiness.error ? (
                  <p className="text-sm text-destructive">{readiness.error.message}</p>
                ) : readiness.data ? (
                  <ul className="space-y-1.5 text-sm text-foreground/90">
                    <li className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Compliance seeded</span>
                      <span className="font-medium">
                        {readiness.data.compliance.complianceSeeded ? "Yes" : "No"}
                      </span>
                    </li>
                    <li className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Checklist progress</span>
                      <span className="font-medium tabular-nums">
                        {readiness.data.compliance.complianceCompleted} /{" "}
                        {readiness.data.compliance.complianceItemsTotal || "—"} complete
                      </span>
                    </li>
                    <li className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Registered user (invite)</span>
                      <span className="font-medium">
                        {readiness.data.flags.registeredUserExists ? "Yes" : "No"}
                      </span>
                    </li>
                    <li className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Linked SANAD office</span>
                      <span className="font-medium">
                        {readiness.data.flags.linkedOfficeExists ? "Yes" : "No"}
                      </span>
                    </li>
                    <li className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Server policy: can create office</span>
                      <span
                        className={
                          readiness.data.flags.serverActivationAllowed
                            ? "font-semibold text-emerald-700"
                            : "font-medium text-amber-800"
                        }
                      >
                        {readiness.data.flags.serverActivationAllowed ? "Yes" : "No"}
                      </span>
                    </li>
                    <li className="flex justify-between gap-2 border-t border-border/60 pt-2 mt-2">
                      <span className="text-muted-foreground">Activation ready (CRM hint)</span>
                      <span
                        className={
                          readiness.data.flags.activationReady ? "font-semibold text-emerald-700" : "font-medium text-amber-800"
                        }
                      >
                        {readiness.data.flags.activationReady ? "Yes" : "No"}
                      </span>
                    </li>
                  </ul>
                ) : null}
              </div>

              <div className="rounded-lg border bg-card p-4 shadow-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Invite, outreach &amp; office activation
                </p>
                <div className="space-y-3 text-sm">
                  <div className="rounded-md bg-muted/40 px-3 py-2 space-y-1">
                    <p>
                      <span className="text-muted-foreground">Invite: </span>
                      {ops?.inviteToken ? (
                        <span className="font-medium">
                          {ops.inviteExpiresAt && new Date(ops.inviteExpiresAt) > new Date()
                            ? "Active"
                            : "Expired or no expiry"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not generated</span>
                      )}
                    </p>
                    {ops?.inviteSentAt ? (
                      <p className="text-xs text-muted-foreground">
                        Sent {fmtDateTime(ops.inviteSentAt)}
                        {ops.inviteExpiresAt ? ` · Expires ${fmtDateTime(ops.inviteExpiresAt)}` : ""}
                      </p>
                    ) : null}
                    {ops?.inviteAcceptAt ? (
                      <p className="text-xs text-muted-foreground">
                        Lead captured {fmtDateTime(ops.inviteAcceptAt)}
                        {ops.inviteAcceptName ? ` · ${ops.inviteAcceptName}` : ""}
                      </p>
                    ) : null}
                    <p>
                      <span className="text-muted-foreground">Linked office ID: </span>
                      {ops?.linkedSanadOfficeId ?? "—"}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Last contacted: </span>
                      {ops?.lastContactedAt ? fmtDateTime(ops.lastContactedAt) : "—"}
                      {ops?.contactMethod ? ` (${ops.contactMethod})` : ""}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Follow-up due: </span>
                      {ops?.followUpDueAt ? fmtDateTime(ops.followUpDueAt) : "—"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={genInvite.isPending || Boolean(ops?.linkedSanadOfficeId)}
                      title={
                        ops?.linkedSanadOfficeId
                          ? "Remove the linked SANAD office before issuing an open invite."
                          : undefined
                      }
                      onClick={() => genInvite.mutate({ centerId: detail.data!.center.id })}
                    >
                      {genInvite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Generate invite
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!inviteFullUrl}
                      onClick={() => {
                        if (!inviteFullUrl) return;
                        void navigator.clipboard.writeText(inviteFullUrl).then(
                          () => toast.success("Invite URL copied"),
                          () => toast.error("Could not copy"),
                        );
                      }}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Copy invite link
                    </Button>
                    {inviteWhatsAppHref ? (
                      <Button
                        type="button"
                        size="sm"
                        className="border-0 bg-[#25D366] text-white hover:bg-[#20bd5a]"
                        asChild
                        title="Open WhatsApp with this number and a draft onboarding message (tap Send in WhatsApp)"
                      >
                        <a
                          href={inviteWhatsAppHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1"
                          aria-label="WhatsApp invite link"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          WhatsApp invite
                        </a>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!inviteWhatsAppHref}
                        title={
                          !inviteFullUrl
                            ? "Generate an invite first"
                            : !detail.data?.center.contactNumber?.trim()
                              ? "Add a contact phone on this centre record for WhatsApp"
                              : "Phone number could not be normalized (e.g. use +968… or 8-digit local)"
                        }
                      >
                        <MessageCircle className="h-3.5 w-3.5 mr-1" />
                        WhatsApp invite
                      </Button>
                    )}
                    {ops?.linkedSanadOfficeId ? (
                      <Button type="button" size="sm" variant="outline" asChild>
                        <a
                          href={`/sanad/centre/${ops.linkedSanadOfficeId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open office profile
                        </a>
                      </Button>
                    ) : (
                      <Button type="button" size="sm" variant="outline" disabled>
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        Open office profile
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        activateOffice.isPending ||
                        readiness.isLoading ||
                        !readiness.data?.flags.serverActivationAllowed
                      }
                      title={
                        !readiness.data?.flags.serverActivationAllowed
                          ? "Requires seeded compliance checklist, centre name, and no linked office (enforced on server)."
                          : undefined
                      }
                      onClick={() => activateOffice.mutate({ centerId: detail.data!.center.id })}
                    >
                      {activateOffice.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Activate as office
                    </Button>
                  </div>

                  {ops?.linkedSanadOfficeId ? (
                    <div className="rounded-lg border bg-muted/15 p-3 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        Office access (roster)
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Owner and manager roles can self-serve in the partner app. Assign owner only for trusted leads — requires
                        network admin on the server when choosing <strong className="text-foreground">owner</strong>.
                      </p>
                      {rosterQuery.isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : rosterQuery.error ? (
                        <p className="text-xs text-destructive">{rosterQuery.error.message}</p>
                      ) : (
                        <div className="space-y-2">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="text-xs h-8">User</TableHead>
                                <TableHead className="text-xs h-8 w-[7.5rem]">Role</TableHead>
                                <TableHead className="text-xs h-8 w-20 text-end">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(rosterQuery.data ?? []).map((m) => (
                                <TableRow key={m.userId}>
                                  <TableCell className="text-xs py-2 align-top">
                                    <span className="font-medium text-foreground block">{m.name ?? "—"}</span>
                                    <span className="text-muted-foreground break-all">{m.email ?? ""}</span>
                                    <span className="text-[10px] text-muted-foreground tabular-nums">ID {m.userId}</span>
                                  </TableCell>
                                  <TableCell className="py-2 align-top">
                                    <Select
                                      value={m.role}
                                      onValueChange={(v) =>
                                        updateRosterRole.mutate({
                                          officeId: ops.linkedSanadOfficeId!,
                                          userId: m.userId,
                                          role: v as "owner" | "manager" | "staff",
                                        })
                                      }
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="owner">Owner</SelectItem>
                                        <SelectItem value="manager">Manager</SelectItem>
                                        <SelectItem value="staff">Staff</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell className="text-end py-2 align-top">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      title="Remove access"
                                      disabled={removeRosterMember.isPending}
                                      onClick={() =>
                                        removeRosterMember.mutate({
                                          officeId: ops.linkedSanadOfficeId!,
                                          userId: m.userId,
                                        })
                                      }
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-border/60">
                            <div className="space-y-1 min-w-[min(100%,14rem)] flex-1">
                              <Label className="text-xs">Find user (name or email)</Label>
                              <Input
                                className="h-8 text-xs"
                                placeholder="Type 2+ characters…"
                                value={rosterUserSearch}
                                onChange={(e) => setRosterUserSearch(e.target.value)}
                              />
                              {rosterUserPickQuery.data && rosterUserPickQuery.data.length > 0 ? (
                                <ul className="max-h-28 overflow-auto rounded border border-border/80 bg-background text-xs mt-1">
                                  {rosterUserPickQuery.data.map((u) => (
                                    <li key={u.id}>
                                      <button
                                        type="button"
                                        className="w-full text-left px-2 py-1.5 hover:bg-muted/80"
                                        onClick={() => {
                                          setRosterNewUserId(String(u.id));
                                          setRosterUserSearch("");
                                        }}
                                      >
                                        <span className="font-medium">{u.name ?? "—"}</span>{" "}
                                        <span className="text-muted-foreground break-all">{u.email ?? ""}</span>{" "}
                                        <span className="tabular-nums text-muted-foreground">#{u.id}</span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Or user ID</Label>
                              <Input
                                className="h-8 text-xs w-[7rem] tabular-nums"
                                inputMode="numeric"
                                placeholder="e.g. 42"
                                value={rosterNewUserId}
                                onChange={(e) => setRosterNewUserId(e.target.value.replace(/\D/g, ""))}
                              />
                            </div>
                            <div className="space-y-1 min-w-[6.5rem]">
                              <Label className="text-xs">Role</Label>
                              <Select
                                value={rosterNewRole}
                                onValueChange={(v) => setRosterNewRole(v as "owner" | "manager" | "staff")}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="owner">Owner</SelectItem>
                                  <SelectItem value="manager">Manager</SelectItem>
                                  <SelectItem value="staff">Staff</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              className="h-8"
                              disabled={
                                addRosterMember.isPending ||
                                !rosterNewUserId.trim() ||
                                !ops.linkedSanadOfficeId
                              }
                              onClick={() =>
                                addRosterMember.mutate({
                                  officeId: ops.linkedSanadOfficeId!,
                                  userId: Number(rosterNewUserId),
                                  role: rosterNewRole,
                                })
                              }
                            >
                              Add member
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}

                  <div className="rounded-md border border-dashed border-border/80 p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Outreach
                    </p>
                    <div className="flex flex-wrap gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Follow-up due</Label>
                        <Input
                          type="datetime-local"
                          className="h-9 w-[11.5rem] text-xs"
                          value={followUpInput}
                          onChange={(e) => setFollowUpInput(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1 min-w-[6rem]">
                        <Label className="text-xs">Method</Label>
                        <Input
                          className="h-9 text-xs"
                          placeholder="call, email, visit…"
                          value={contactMethodDraft}
                          onChange={(e) => setContactMethodDraft(e.target.value)}
                        />
                      </div>
                    </div>
                    <Textarea
                      className="text-xs min-h-[52px]"
                      placeholder="Optional note (appended with timestamp)"
                      value={outreachNote}
                      onChange={(e) => setOutreachNote(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={outreachMut.isPending}
                        onClick={() =>
                          outreachMut.mutate({
                            centerId: detail.data!.center.id,
                            lastContactedAt: new Date(),
                            contactMethod: contactMethodDraft.trim() || undefined,
                          })
                        }
                      >
                        Mark contacted (now)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={outreachMut.isPending || !followUpInput}
                        onClick={() =>
                          outreachMut.mutate({
                            centerId: detail.data!.center.id,
                            followUpDueAt: new Date(followUpInput),
                            notesAppend: outreachNote.trim() || undefined,
                          })
                        }
                      >
                        Save follow-up
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog
        open={assignCenterId != null}
        onOpenChange={(o) => {
          if (!o) {
            setAssignCenterId(null);
            setAssignSearch("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign pipeline owner</DialogTitle>
            <DialogDescription>Search platform users by name or email (min. 2 characters).</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
              placeholder="Search users…"
              autoFocus
            />
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border bg-muted/20 p-1">
              {(assignUserSearch.data ?? []).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="flex w-full flex-col items-start rounded-sm px-2 py-2 text-start text-sm hover:bg-muted"
                  onClick={() => {
                    if (assignCenterId == null) return;
                    updatePipeline.mutate({ centerId: assignCenterId, ownerUserId: u.id });
                  }}
                >
                  <span className="font-medium">{u.name ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">{u.email ?? ""}</span>
                </button>
              ))}
              {assignSearch.trim().length >= 2 && (assignUserSearch.data?.length ?? 0) === 0 && !assignUserSearch.isLoading ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">No users found.</p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAssignCenterId(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DemandSurface() {
  const { data: y0 } = trpc.sanad.intelligence.latestMetricYear.useQuery();
  const year = y0?.year ?? new Date().getFullYear();
  const [sel, setSel] = useState<number | null>(null);
  const activeYear = sel ?? year ?? new Date().getFullYear();

  const { data, isLoading, error } = trpc.sanad.intelligence.serviceDemandInsights.useQuery(
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
  const { data: y0 } = trpc.sanad.intelligence.latestMetricYear.useQuery();
  const [year, setYear] = useState<number | null>(null);
  const active = year ?? y0?.year ?? new Date().getFullYear();

  const { data, isLoading, error } = trpc.sanad.intelligence.regionalOpportunity.useQuery(
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

  const { data: reqs } = trpc.sanad.intelligence.listLicenseRequirements.useQuery();
  const { data: centers } = trpc.sanad.intelligence.listCenters.useQuery({ limit: 500, offset: 0 });
  const { data: items, refetch } = trpc.sanad.intelligence.listCenterCompliance.useQuery(
    { centerId: cid },
    { enabled: cid > 0 },
  );

  const seed = trpc.sanad.intelligence.seedComplianceForCenter.useMutation({
    onSuccess: (r) => {
      toast.success(`Seeded ${r.created} checklist rows`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const upsert = trpc.sanad.intelligence.upsertCenterComplianceItem.useMutation({
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

  if (!user || !canAccessSanadIntelligenceUi(user)) {
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
