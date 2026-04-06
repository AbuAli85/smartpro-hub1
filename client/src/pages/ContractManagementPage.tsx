/**
 * ContractManagementPage — /hr/contracts
 *
 * The canonical entry point for the Promoter Contract Management System.
 *
 * Reads from and writes to `trpc.contractManagement.*` (CMS APIs) exclusively.
 * The old `/hr/promoter-assignments` route still renders this same page for
 * backward compatibility.
 *
 * Columns: Promoter · Your role · First Party (Client) · Second Party (Employer) ·
 *          Location · Period · Ref # · Status · Actions
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import {
  usePromoterAssignmentForm,
} from "@/components/contracts/usePromoterAssignmentForm";
import { PromoterAssignmentFormSection } from "@/components/contracts/PromoterAssignmentFormSection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  FileWarning,
  Filter,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const s = typeof d === "string" ? d : (d as Date).toISOString();
  return s.slice(0, 10);
}

function daysUntil(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const s = typeof d === "string" ? d : (d as Date).toISOString();
  const target = new Date(s.slice(0, 10));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function ExpiryIndicator({ days, label }: { days: number | null; label: string }) {
  if (days === null) return null;
  if (days < 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
            <AlertCircle className="h-3 w-3" /> Expired
          </span>
        </TooltipTrigger>
        <TooltipContent>{label} expired {Math.abs(days)}d ago</TooltipContent>
      </Tooltip>
    );
  }
  if (days <= 30) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
            <AlertTriangle className="h-3 w-3" /> {days}d
          </span>
        </TooltipTrigger>
        <TooltipContent>{label} expires in {days} day{days !== 1 ? "s" : ""}</TooltipContent>
      </Tooltip>
    );
  }
  return null;
}

// ─── STATUS META ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  draft:      "bg-zinc-100    text-zinc-600    border-zinc-300",
  active:     "bg-emerald-50  text-emerald-700 border-emerald-200",
  expired:    "bg-red-50      text-red-600     border-red-200",
  terminated: "bg-gray-100   text-gray-500    border-gray-300",
  renewed:    "bg-blue-50     text-blue-600    border-blue-200",
  suspended:  "bg-amber-50    text-amber-600   border-amber-200",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  expired: "Expired",
  terminated: "Terminated",
  renewed: "Renewed",
  suspended: "Suspended",
};

const ROLE_BADGE: Record<string, string> = {
  first_party:  "bg-blue-500/10  text-blue-600  border-blue-500/20  text-[11px]",
  second_party: "bg-violet-500/10 text-violet-600 border-violet-500/20 text-[11px]",
  both:         "bg-teal-500/10   text-teal-600   border-teal-500/20  text-[11px]",
};

const ROLE_LABEL: Record<string, string> = {
  first_party: "Client",
  second_party: "Employer",
  both: "Both",
};

function googleDocsReadinessDiagnosis(issue: string | undefined): string | null {
  if (!issue) return null;
  const map: Record<string, string> = {
    unset: "GOOGLE_DOCS_SERVICE_ACCOUNT_JSON is not set. Add it in your host's environment/secrets and redeploy.",
    invalid_json: "The value is not valid JSON. Paste the full service account key file.",
    missing_client_email_or_private_key: "JSON parsed but client_email or private_key is missing.",
    private_key_unreadable: "private_key cannot be loaded (truncation or encoding issue).",
  };
  return map[issue] ?? null;
}

// ─── CREATE DIALOG ────────────────────────────────────────────────────────────

function CreateContractDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const form = usePromoterAssignmentForm({ enabled: open });
  const utils = trpc.useUtils();

  const createMutation = trpc.contractManagement.createPromoterAssignment.useMutation({
    onSuccess: (data) => {
      toast.success("Contract created", {
        description: `Draft saved — ref ${data.contractNumber ?? data.id.slice(0, 8)}`,
      });
      setOpen(false);
      form.reset();
      void utils.contractManagement.kpis.invalidate();
      onSuccess();
    },
    onError: (e) => toast.error("Create failed", { description: e.message }),
  });

  function handleSave() {
    if (!form.canSubmit) {
      toast.error("Please fill in all required fields");
      return;
    }
    const s = form.state;
    createMutation.mutate({
      clientCompanyId: s.clientCompanyId as number,
      employerCompanyId: s.employerCompanyId as number,
      promoterEmployeeId: s.promoterEmployeeId as number,
      locationEn: s.locationEn.trim(),
      locationAr: s.locationAr.trim(),
      effectiveDate: s.effectiveDate,
      expiryDate: s.expiryDate,
      contractNumber: s.contractNumber.trim() || undefined,
      issueDate: s.issueDate || undefined,
      clientSiteId: typeof s.clientSiteId === "number" ? s.clientSiteId : undefined,
      civilId: s.civilId.trim() || undefined,
      passportNumber: s.passportNumber.trim() || undefined,
      passportExpiry: s.passportExpiry || undefined,
      nationality: s.nationality.trim() || undefined,
      jobTitleEn: s.jobTitleEn.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) form.reset(); }}>
      <Button onClick={() => setOpen(true)} className="gap-2 shrink-0 self-start">
        <Plus className="h-4 w-4" /> New Contract
      </Button>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto gap-0 p-0">
        <div className="p-6 pb-0">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Plus className="h-5 w-5" /> New Promoter Assignment Contract
            </DialogTitle>
            <DialogDescription>
              First party = client (hosts the work site). Second party = employer (supplies the promoter).
              The contract starts as a <strong>draft</strong> — activate it after review.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="px-6 py-4">
          <PromoterAssignmentFormSection form={form} showStatus={false} />
        </div>
        <DialogFooter className="p-6 pt-2 border-t bg-muted/20 flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => { setOpen(false); form.reset(); }}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={createMutation.isPending || !form.canSubmit}
            className="gap-2 min-w-[160px]"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {createMutation.isPending ? "Saving…" : "Save as Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

type ContractRow = NonNullable<ReturnType<typeof trpc.contractManagement.list.useQuery>["data"]>[number];

export default function ContractManagementPage() {
  const { activeCompany } = useActiveCompany();
  const activeCompanyId = activeCompany?.id ?? null;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  // ─── DATA ──────────────────────────────────────────────────────────────────

  const {
    data: rawContracts = [],
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = trpc.contractManagement.list.useQuery(
    statusFilter !== "all" ? { status: statusFilter as any } : undefined,
    { retry: 1 }
  );

  const { data: kpis, isLoading: kpisLoading } = trpc.contractManagement.kpis.useQuery(
    undefined,
    { refetchOnWindowFocus: false, staleTime: 60_000 }
  );

  const { data: docGenReadiness } = trpc.documentGeneration.readiness.useQuery();
  const pdfAvailable = docGenReadiness?.googleDocsConfigured ?? false;
  const googleDocsIssue =
    docGenReadiness && !docGenReadiness.googleDocsConfigured && "googleDocsIssue" in docGenReadiness
      ? (docGenReadiness as { googleDocsIssue?: string }).googleDocsIssue
      : undefined;

  // ─── MUTATIONS ─────────────────────────────────────────────────────────────

  const kpisUtils = trpc.useUtils();

  const generateMutation = trpc.documentGeneration.generate.useMutation({
    onSuccess: (result) => {
      toast.success("Contract PDF ready", { description: "Opening in new tab…" });
      window.open(result.fileUrl, "_blank");
      setGeneratingId(null);
      refetch();
      void kpisUtils.contractManagement.kpis.invalidate();
    },
    onError: (e) => {
      toast.error("PDF generation failed", { description: e.message });
      setGeneratingId(null);
    },
  });

  // ─── DERIVED DATA ──────────────────────────────────────────────────────────

  /** Determine active company's role for each row. */
  const contracts: Array<ContractRow & { activeCompanyRole: string }> = useMemo(() => {
    return rawContracts.map((row) => {
      let role = "observer";
      if (activeCompanyId !== null) {
        const isFirst = row.firstPartyCompanyId === activeCompanyId;
        const isSecond = row.secondPartyCompanyId === activeCompanyId;
        if (isFirst && isSecond) role = "both";
        else if (isFirst)  role = "first_party";
        else if (isSecond) role = "second_party";
        // Also covers legacy companyId (owner field)
        else if (row.companyId === activeCompanyId) role = "first_party";
      }
      return { ...row, activeCompanyRole: role };
    });
  }, [rawContracts, activeCompanyId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return contracts;
    const q = search.toLowerCase();
    return contracts.filter(
      (r) =>
        (r.promoterName ?? "").toLowerCase().includes(q) ||
        (r.firstPartyName ?? "").toLowerCase().includes(q) ||
        (r.secondPartyName ?? "").toLowerCase().includes(q) ||
        (r.locationEn ?? "").toLowerCase().includes(q) ||
        (r.contractNumber ?? "").toLowerCase().includes(q)
    );
  }, [contracts, search]);

  // ─── HANDLERS ──────────────────────────────────────────────────────────────

  function handleGenerate(row: ContractRow) {
    setGeneratingId(row.id);
    generateMutation.mutate({
      templateKey: "outsourcing_contract_promoter_bilingual",
      entityId: row.id,
      outputFormat: "pdf",
    });
  }

  // ─── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-border/60 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Promoter Contracts
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Outsourcing contracts where the{" "}
              <strong className="text-foreground">first party (client)</strong> hosts the work site and the{" "}
              <strong className="text-foreground">second party (employer)</strong> supplies the promoter.
              Visible to both parties.
            </p>
          </div>
          <CreateContractDialog onSuccess={refetch} />
        </div>

        {/* Alerts */}
        {isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <span>{error?.message ?? "Could not load contracts."}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {docGenReadiness && !pdfAvailable && (
          <Alert className="border-amber-500/40 bg-amber-500/5">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle>Contract PDF generation unavailable</AlertTitle>
            <AlertDescription className="text-sm space-y-1">
              <p>
                Set{" "}
                <code className="bg-muted px-1 rounded text-xs">
                  GOOGLE_DOCS_SERVICE_ACCOUNT_JSON
                </code>{" "}
                on the server and redeploy.
              </p>
              {googleDocsReadinessDiagnosis(googleDocsIssue) && (
                <p className="border-l-2 border-amber-500/60 pl-3 text-amber-900 dark:text-amber-100/90">
                  {googleDocsReadinessDiagnosis(googleDocsIssue)}
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* ── KPI Stats Bar ──────────────────────────────────────────────────── */}
        <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 ${kpisLoading ? "opacity-60 animate-pulse" : ""}`}>
          {[
            {
              label: "Total Contracts",
              value: kpis?.totals.total ?? "—",
              icon: <FileText className="h-4 w-4" />,
              bg: "bg-muted/60",
            },
            {
              label: "Active",
              value: kpis?.totals.active ?? "—",
              icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
              bg: kpis && kpis.totals.active > 0 ? "bg-emerald-500/8" : "bg-muted/60",
            },
            {
              label: "Draft",
              value: kpis?.totals.draft ?? "—",
              icon: <Building2 className="h-4 w-4 text-zinc-400" />,
              bg: "bg-muted/60",
            },
            {
              label: "Expiring ≤30d",
              value: kpis?.totals.expiringIn30Days ?? "—",
              icon: <Clock className="h-4 w-4 text-amber-500" />,
              bg: kpis && kpis.totals.expiringIn30Days > 0 ? "bg-amber-500/8" : "bg-muted/60",
              highlight: kpis && kpis.totals.expiringIn30Days > 0,
            },
            {
              label: "Expired",
              value: kpis?.totals.expired ?? "—",
              icon: <AlertCircle className="h-4 w-4 text-red-500" />,
              bg: kpis && kpis.totals.expired > 0 ? "bg-red-500/8" : "bg-muted/60",
            },
            {
              label: "Promoters Deployed",
              value: kpis?.promotersDeployed ?? "—",
              icon: <UserCheck className="h-4 w-4 text-blue-500" />,
              bg: "bg-blue-500/8",
            },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-xl border shadow-sm p-4 flex items-center gap-3 ${s.bg} ${
                (s as any).highlight ? "border-amber-300 dark:border-amber-700" : ""
              }`}
            >
              <div className="p-2 rounded-lg bg-background/60">{s.icon}</div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground leading-snug">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Risk Panel — shown only when there are actionable risk items ──── */}
        {kpis && (kpis.expiringSoon.length > 0 || kpis.missingDocuments.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Expiring Soon */}
            {kpis.expiringSoon.length > 0 && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200 dark:border-amber-800 bg-amber-100/60 dark:bg-amber-900/20">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span className="font-semibold text-sm text-amber-800 dark:text-amber-300">
                    Expiring Soon
                  </span>
                  <Badge variant="outline" className="ml-auto text-[11px] border-amber-300 text-amber-700 bg-amber-100">
                    {kpis.expiringSoon.length}
                  </Badge>
                </div>
                <ul className="divide-y divide-amber-100 dark:divide-amber-900/50">
                  {kpis.expiringSoon.map((item) => (
                    <li key={item.id} className="flex items-center justify-between px-4 py-2.5 text-sm gap-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/hr/contracts/${item.id}`}>
                          <span className="font-medium hover:underline cursor-pointer text-foreground truncate block">
                            {item.promoterName}
                          </span>
                        </Link>
                        <span className="text-xs text-muted-foreground truncate block">
                          {item.firstPartyName}
                          {item.contractNumber ? ` · ${item.contractNumber}` : ""}
                        </span>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5 ${
                            item.daysLeft <= 7
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          <Calendar className="h-3 w-3" />
                          {item.daysLeft}d
                        </span>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{item.expiryDate}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Missing Documents */}
            {kpis.missingDocuments.length > 0 && (
              <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-950/20 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-red-200 dark:border-red-800 bg-red-100/60 dark:bg-red-900/20">
                  <FileWarning className="h-4 w-4 text-red-600" />
                  <span className="font-semibold text-sm text-red-800 dark:text-red-300">
                    Missing Documents
                  </span>
                  <Badge variant="outline" className="ml-auto text-[11px] border-red-300 text-red-700 bg-red-100">
                    {kpis.missingDocuments.length}
                  </Badge>
                </div>
                <ul className="divide-y divide-red-100 dark:divide-red-900/50">
                  {kpis.missingDocuments.slice(0, 8).map((item) => (
                    <li key={item.id} className="flex items-center justify-between px-4 py-2.5 text-sm gap-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/hr/contracts/${item.id}`}>
                          <span className="font-medium hover:underline cursor-pointer text-foreground truncate block">
                            {item.promoterName}
                          </span>
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {item.contractNumber ?? "No ref#"}
                        </span>
                      </div>
                      <div className="shrink-0 flex flex-wrap gap-1 justify-end max-w-[140px]">
                        {item.missingKinds.map((k) => (
                          <span
                            key={k}
                            className="text-[10px] font-medium bg-red-100 text-red-700 rounded px-1.5 py-0.5 whitespace-nowrap"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                  {kpis.missingDocuments.length > 8 && (
                    <li className="px-4 py-2 text-xs text-muted-foreground italic">
                      +{kpis.missingDocuments.length - 8} more — upload documents from the contract detail page.
                    </li>
                  )}
                </ul>
              </div>
            )}

          </div>
        )}

        {/* ── Contracts by Company (show when >1 distinct first-party) ────── */}
        {kpis && kpis.contractsPerCompany.length > 1 && (
          <div className="rounded-xl border bg-card/80 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Contracts by Client Company</span>
            </div>
            <div className="px-4 py-3">
              <div className="flex flex-wrap gap-3">
                {kpis.contractsPerCompany.map((co) => (
                  <div
                    key={co.companyId ?? co.companyName}
                    className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                  >
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate max-w-[180px]">{co.companyName}</span>
                    <span className="text-muted-foreground tabular-nums">{co.total}</span>
                    {co.active > 0 && (
                      <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0">
                        {co.active} active
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Input
              placeholder="Search by promoter, company, location, or ref#…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-4"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
              <SelectItem value="renewed">Renewed</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-xl border bg-card shadow-sm overflow-x-auto">
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="font-semibold w-[11rem]">Promoter</TableHead>
                <TableHead className="font-semibold w-[5.5rem]">Your role</TableHead>
                <TableHead className="font-semibold">First Party (Client)</TableHead>
                <TableHead className="font-semibold">Second Party (Employer)</TableHead>
                <TableHead className="font-semibold">Location</TableHead>
                <TableHead className="font-semibold whitespace-nowrap">Period</TableHead>
                <TableHead className="font-semibold whitespace-nowrap">Ref #</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="text-right font-semibold sticky right-0 z-10 bg-muted/95 border-l border-border/60 min-w-[9rem]">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-16 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3" />
                    Loading contracts…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground max-w-sm mx-auto">
                      <FileText className="h-12 w-12 opacity-25" />
                      <p className="font-medium text-foreground">
                        {search.trim() || statusFilter !== "all" ? "No results" : "No contracts yet"}
                      </p>
                      <p className="text-sm text-center">
                        {search.trim() || statusFilter !== "all"
                          ? "Clear the filters or try different keywords."
                          : "Create a promoter assignment contract to get started."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const contractDays = daysUntil(row.expiryDate);
                  return (
                    <TableRow key={row.id} className="hover:bg-muted/30 group">

                      {/* Promoter */}
                      <TableCell className="align-top">
                        <div className="flex items-start gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0 mt-0.5">
                            {(row.promoterName || "?").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm leading-snug break-words">
                              {row.promoterName}
                            </p>
                            {row.nationality && (
                              <p className="text-xs text-muted-foreground">{row.nationality}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Active company role */}
                      <TableCell className="align-top">
                        <Badge
                          variant="outline"
                          className={ROLE_BADGE[row.activeCompanyRole] ?? "text-[11px]"}
                        >
                          {ROLE_LABEL[row.activeCompanyRole] ?? row.activeCompanyRole}
                        </Badge>
                      </TableCell>

                      {/* First party */}
                      <TableCell className="text-sm align-top max-w-[13rem] break-words">
                        <div className="flex items-start gap-1.5">
                          <Building2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                          <span>{row.firstPartyName}</span>
                        </div>
                      </TableCell>

                      {/* Second party */}
                      <TableCell className="text-sm align-top max-w-[13rem] break-words">
                        <div className="flex items-start gap-1.5">
                          <Users className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                          <span>{row.secondPartyName}</span>
                        </div>
                      </TableCell>

                      {/* Location */}
                      <TableCell className="align-top max-w-[15rem]">
                        <div className="flex items-start gap-1.5 text-muted-foreground text-sm">
                          <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span className="line-clamp-2 break-words">{row.locationEn ?? "—"}</span>
                        </div>
                      </TableCell>

                      {/* Period + expiry indicator */}
                      <TableCell className="align-top whitespace-nowrap">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            {fmtDate(row.effectiveDate)} → {fmtDate(row.expiryDate)}
                          </span>
                        </div>
                        <div className="mt-1">
                          <ExpiryIndicator days={contractDays} label="Contract" />
                        </div>
                      </TableCell>

                      {/* Ref # */}
                      <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap align-top max-w-[7rem] truncate">
                        {row.contractNumber ?? "—"}
                      </TableCell>

                      {/* Status */}
                      <TableCell className="align-top whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={`text-xs ${STATUS_STYLES[row.status ?? "draft"] ?? ""}`}
                        >
                          {STATUS_LABELS[row.status ?? "draft"] ?? row.status}
                        </Badge>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="sticky right-0 z-10 bg-card group-hover:bg-muted/40 border-l border-border/50 align-top shadow-[-6px_0_12px_-6px_rgba(0,0,0,0.06)]">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* View detail */}
                          <Link href={`/hr/contracts/${row.id}`}>
                            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8">
                              <ExternalLink className="h-3.5 w-3.5" />
                              View
                            </Button>
                          </Link>

                          {/* Generate PDF */}
                          <Button
                            size="sm"
                            variant="default"
                            className="gap-1.5 text-xs h-8"
                            disabled={generatingId === row.id || !pdfAvailable}
                            onClick={() => handleGenerate(row)}
                            title={pdfAvailable ? "Generate bilingual PDF" : "PDF generation not configured"}
                          >
                            {generatingId === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                            {generatingId === row.id ? "…" : "PDF"}
                          </Button>
                        </div>
                      </TableCell>

                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

      </div>
    </div>
  );
}
