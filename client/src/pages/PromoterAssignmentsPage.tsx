/**
 * @deprecated
 *
 * This file is SUPERSEDED by ContractManagementPage.tsx and is no longer
 * rendered by any application route.
 *
 * Route changes:
 *   /hr/promoter-assignments     → ContractManagementPage  (canonical: /hr/contracts)
 *   /hr/promoter-assignments/:id → ContractDetailPage       (canonical: /hr/contracts/:id)
 *
 * All create / edit / list flows now use trpc.contractManagement.* (CMS APIs).
 * This file is kept temporarily for reference and will be deleted in a future cleanup PR.
 * Do NOT add features here.
 */

import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
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
  Clock,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import {
  usePromoterAssignmentForm,
  type PromoterAssignmentFormState,
} from "@/components/contracts/usePromoterAssignmentForm";
import { PromoterAssignmentFormSection } from "@/components/contracts/PromoterAssignmentFormSection";

// ─── TYPES ────────────────────────────────────────────────────────────────────

type AssignmentRow = {
  id: string;
  companyId: number;
  firstPartyCompanyId: number;
  secondPartyCompanyId: number;
  promoterEmployeeId: number;
  locationAr: string | null;
  locationEn: string | null;
  startDate: Date | string;
  endDate: Date | string;
  status: string;
  contractReferenceNumber: string | null;
  firstPartyName: string;
  secondPartyName: string;
  promoterName: string;
  promoterNationalId: string | null;
  promoterPassportNumber: string | null;
  promoterNationality: string | null;
  activeCompanyRole: "first_party" | "second_party" | "observer";
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 10);
}

function daysUntil(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const s = typeof d === "string" ? d : d.toISOString();
  const target = new Date(s.slice(0, 10));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function ExpiryIndicator({
  days,
  label,
}: {
  days: number | null;
  label: string;
}) {
  if (days === null) return null;
  if (days < 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
            <AlertCircle className="h-3 w-3" />
            Expired
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {label} expired {Math.abs(days)} day{Math.abs(days) !== 1 ? "s" : ""} ago
        </TooltipContent>
      </Tooltip>
    );
  }
  if (days <= 30) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
            <AlertTriangle className="h-3 w-3" />
            {days}d
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {label} expires in {days} day{days !== 1 ? "s" : ""}
        </TooltipContent>
      </Tooltip>
    );
  }
  return null;
}

function googleDocsReadinessDiagnosis(issue: string | undefined): string | null {
  if (!issue) return null;
  const map: Record<string, string> = {
    unset: "GOOGLE_DOCS_SERVICE_ACCOUNT_JSON is not set on the server. Add it in your host's environment/secrets and redeploy.",
    invalid_json: "The value is not valid JSON. Paste the full service account key file without edits.",
    missing_client_email_or_private_key: "JSON parsed but client_email or private_key is missing.",
    private_key_unreadable: "private_key is present but cannot be loaded (truncation or encoding issue).",
  };
  return map[issue] ?? null;
}

// ─── STATUS COLORS ────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  active:   "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  inactive: "bg-zinc-500/15   text-zinc-500   border-zinc-500/30",
  expired:  "bg-red-500/15    text-red-500    border-red-500/30",
};

const ROLE_BADGE: Record<string, string> = {
  first_party:  "bg-blue-500/10  text-blue-600  border-blue-500/20  text-[11px]",
  second_party: "bg-violet-500/10 text-violet-600 border-violet-500/20 text-[11px]",
};

const ROLE_LABEL: Record<string, string> = {
  first_party:  "Client",
  second_party: "Employer",
};

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function PromoterAssignmentsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<AssignmentRow | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // ─── DATA ────────────────────────────────────────────────────────────────

  const {
    data: assignments = [],
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = trpc.promoterAssignments.list.useQuery(undefined, { retry: 1 });

  const { data: docGenReadiness } = trpc.documentGeneration.readiness.useQuery();
  const pdfAvailable = docGenReadiness?.googleDocsConfigured ?? false;
  const googleDocsIssue =
    docGenReadiness && !docGenReadiness.googleDocsConfigured && "googleDocsIssue" in docGenReadiness
      ? (docGenReadiness as { googleDocsIssue?: string }).googleDocsIssue
      : undefined;

  // ─── MUTATIONS ────────────────────────────────────────────────────────────

  const createMutation = trpc.promoterAssignments.create.useMutation({
    onSuccess: () => {
      toast.success("Assignment created");
      refetch();
      setShowCreate(false);
    },
    onError: (e) => toast.error("Create failed", { description: e.message }),
  });

  const updateMutation = trpc.promoterAssignments.update.useMutation({
    onSuccess: () => {
      toast.success("Assignment updated");
      refetch();
      setEditTarget(null);
    },
    onError: (e) => toast.error("Update failed", { description: e.message }),
  });

  const deleteMutation = trpc.promoterAssignments.delete.useMutation({
    onSuccess: () => {
      toast.success("Deleted");
      refetch();
    },
    onError: (e) => toast.error("Delete failed", { description: e.message }),
  });

  const generateMutation = trpc.documentGeneration.generate.useMutation({
    onSuccess: (result) => {
      toast.success("Contract PDF ready", { description: "Opening in new tab…" });
      window.open(result.fileUrl, "_blank");
      setGeneratingId(null);
    },
    onError: (e) => {
      toast.error("PDF generation failed", { description: e.message });
      setGeneratingId(null);
    },
  });

  // ─── FORMS ────────────────────────────────────────────────────────────────

  const createForm = usePromoterAssignmentForm({ enabled: showCreate });

  const editForm = usePromoterAssignmentForm({
    enabled: editTarget !== null,
    initialValues: editTarget
      ? {
          locationEn: editTarget.locationEn ?? "",
          locationAr: editTarget.locationAr ?? "",
          effectiveDate: fmtDate(editTarget.startDate),
          expiryDate: fmtDate(editTarget.endDate),
          contractNumber: editTarget.contractReferenceNumber ?? "",
          status: (editTarget.status as PromoterAssignmentFormState["status"]) ?? "active",
          civilId: editTarget.promoterNationalId ?? "",
          passportNumber: editTarget.promoterPassportNumber ?? "",
          nationality: editTarget.promoterNationality ?? "",
        }
      : undefined,
  });

  // ─── HANDLERS ────────────────────────────────────────────────────────────

  function handleCreate() {
    if (!createForm.canSubmit) {
      toast.error("Missing required fields");
      return;
    }
    const s = createForm.state;
    createMutation.mutate({
      clientCompanyId: s.clientCompanyId as number,
      employerCompanyId: s.employerCompanyId as number,
      promoterEmployeeId: s.promoterEmployeeId as number,
      locationEn: s.locationEn.trim(),
      locationAr: s.locationAr.trim(),
      startDate: s.effectiveDate,
      endDate: s.expiryDate,
      contractReferenceNumber: s.contractNumber.trim() || undefined,
      issueDate: s.issueDate || undefined,
      clientSiteId: typeof s.clientSiteId === "number" ? s.clientSiteId : undefined,
      status: s.status === "inactive" ? undefined : s.status,
      civilId: s.civilId.trim() || undefined,
      passportNumber: s.passportNumber.trim() || undefined,
      passportExpiry: s.passportExpiry || undefined,
      nationality: s.nationality.trim() || undefined,
      jobTitleEn: s.jobTitleEn.trim() || undefined,
    });
  }

  function handleUpdate() {
    if (!editTarget) return;
    const s = editForm.state;
    updateMutation.mutate({
      id: editTarget.id,
      locationEn: s.locationEn.trim() || undefined,
      locationAr: s.locationAr.trim() || undefined,
      startDate: s.effectiveDate || undefined,
      endDate: s.expiryDate || undefined,
      contractReferenceNumber: s.contractNumber.trim() || undefined,
      issueDate: s.issueDate || undefined,
      status: s.status === "inactive" ? undefined : s.status,
      civilId: s.civilId.trim() || undefined,
      passportNumber: s.passportNumber.trim() || undefined,
      passportExpiry: s.passportExpiry || undefined,
      nationality: s.nationality.trim() || undefined,
      jobTitleEn: s.jobTitleEn.trim() || undefined,
    });
  }

  function handleGenerate(row: AssignmentRow) {
    setGeneratingId(row.id);
    generateMutation.mutate({
      templateKey: "promoter_assignment_contract_bilingual",
      entityId: row.id,
      outputFormat: "pdf",
    });
  }

  function handleDelete(row: AssignmentRow) {
    if (!confirm(`Delete assignment for ${row.promoterName}?`)) return;
    deleteMutation.mutate({ id: row.id });
  }

  // ─── DERIVED ──────────────────────────────────────────────────────────────

  const rows = assignments as AssignmentRow[];

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        (r.promoterName ?? "").toLowerCase().includes(q) ||
        (r.firstPartyName ?? "").toLowerCase().includes(q) ||
        (r.secondPartyName ?? "").toLowerCase().includes(q) ||
        (r.locationEn ?? "").toLowerCase().includes(q) ||
        (r.contractReferenceNumber ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    expiring: rows.filter((r) => {
      const d = daysUntil(r.endDate);
      return d !== null && d >= 0 && d <= 30;
    }).length,
    expired: rows.filter((r) => r.status === "expired" || (daysUntil(r.endDate) ?? 1) < 0).length,
  }), [rows]);

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-border/60 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Promoter Assignments
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Outsourcing contracts where the{" "}
              <strong className="text-foreground">first party (client)</strong> hosts the work site and the{" "}
              <strong className="text-foreground">second party (employer)</strong> supplies the promoter.
              Contracts visible for both roles.
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0 self-start">
            <Plus className="h-4 w-4" />
            New Assignment
          </Button>
        </div>

        {/* Alerts */}
        {isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <span>{error?.message ?? "Could not load assignments."}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
            </AlertDescription>
          </Alert>
        )}

        {docGenReadiness && !pdfAvailable && (
          <Alert className="border-amber-500/40 bg-amber-500/5">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle>Contract PDF generation unavailable</AlertTitle>
            <AlertDescription className="text-sm space-y-1">
              <p>Set <code className="bg-muted px-1 rounded text-xs">GOOGLE_DOCS_SERVICE_ACCOUNT_JSON</code> on the server and redeploy.</p>
              {googleDocsReadinessDiagnosis(googleDocsIssue) && (
                <p className="border-l-2 border-amber-500/60 pl-3 text-amber-900 dark:text-amber-100/90">
                  {googleDocsReadinessDiagnosis(googleDocsIssue)}
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 ${isFetching && !isLoading ? "opacity-75" : ""}`}>
          {[
            { label: "Total",    value: stats.total,    icon: <FileText className="h-4 w-4" /> },
            { label: "Active",   value: stats.active,   icon: <Users className="h-4 w-4 text-emerald-500" /> },
            { label: "Expiring soon", value: stats.expiring, icon: <Clock className="h-4 w-4 text-amber-500" /> },
            { label: "Expired",  value: stats.expired,  icon: <AlertCircle className="h-4 w-4 text-red-500" /> },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border bg-card/80 shadow-sm p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted/80">{s.icon}</div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search by promoter, company, or location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
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
                <TableHead className="font-semibold w-[5rem]">Your role</TableHead>
                <TableHead className="font-semibold">First Party</TableHead>
                <TableHead className="font-semibold">Second Party</TableHead>
                <TableHead className="font-semibold">Location</TableHead>
                <TableHead className="font-semibold whitespace-nowrap">Period</TableHead>
                <TableHead className="font-semibold whitespace-nowrap">Ref #</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="text-right font-semibold sticky right-0 z-10 bg-muted/95 border-l border-border/60 min-w-[10rem]">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-16 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3" />
                    Loading assignments…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground max-w-sm mx-auto">
                      <FileText className="h-12 w-12 opacity-25" />
                      <p className="font-medium text-foreground">
                        {search.trim() ? "No results" : "No assignments yet"}
                      </p>
                      <p className="text-sm text-center">
                        {search.trim()
                          ? "Clear the search or try different keywords."
                          : "Create a promoter assignment to get started."}
                      </p>
                      {!search.trim() && (
                        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
                          <Plus className="h-4 w-4" /> New Assignment
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const contractDays = daysUntil(row.endDate);
                  const isFirstParty = row.activeCompanyRole === "first_party";

                  return (
                    <TableRow key={row.id} className="hover:bg-muted/30 group">
                      {/* Promoter */}
                      <TableCell className="align-top">
                        <div className="flex items-start gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0 mt-0.5">
                            {(row.promoterName || "?").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm leading-snug break-words">{row.promoterName}</p>
                            {row.promoterNationality && (
                              <p className="text-xs text-muted-foreground">{row.promoterNationality}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Your role */}
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
                        {row.firstPartyName}
                      </TableCell>

                      {/* Second party */}
                      <TableCell className="text-sm align-top max-w-[13rem] break-words">
                        {row.secondPartyName}
                      </TableCell>

                      {/* Location */}
                      <TableCell className="align-top max-w-[16rem]">
                        <div className="flex items-start gap-1.5 text-muted-foreground text-sm">
                          <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span className="line-clamp-2 break-words">{row.locationEn ?? "—"}</span>
                        </div>
                      </TableCell>

                      {/* Period */}
                      <TableCell className="align-top whitespace-nowrap">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          <span>{fmtDate(row.startDate)} → {fmtDate(row.endDate)}</span>
                        </div>
                        <div className="mt-1">
                          <ExpiryIndicator days={contractDays} label="Contract" />
                        </div>
                      </TableCell>

                      {/* Ref # */}
                      <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap align-top max-w-[7rem] truncate">
                        {row.contractReferenceNumber ?? "—"}
                      </TableCell>

                      {/* Status */}
                      <TableCell className="align-top whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={`text-xs capitalize ${STATUS_COLOR[row.status] ?? ""}`}
                        >
                          {row.status}
                        </Badge>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="sticky right-0 z-10 bg-card group-hover:bg-muted/40 border-l border-border/50 align-top shadow-[-6px_0_12px_-6px_rgba(0,0,0,0.06)]">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* View detail */}
                          <Link href={`/hr/promoter-assignments/${row.id}`}>
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

                          {/* Edit — first party only */}
                          {isFirstParty && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => setEditTarget(row)}
                              title="Edit assignment"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {/* Delete — first party only */}
                          {isFirstParty && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(row)}
                              title="Delete assignment"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
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

      {/* ── Create Dialog ───────────────────────────────────────────────────── */}
      <Dialog
        open={showCreate}
        onOpenChange={(v) => {
          setShowCreate(v);
          if (!v) createForm.reset();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto gap-0 p-0">
          <div className="p-6 pb-0">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Plus className="h-5 w-5" /> New Promoter Assignment
              </DialogTitle>
              <DialogDescription>
                First party = client (hosts the site). Second party = employer (supplies the promoter).
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-6 py-4">
            <PromoterAssignmentFormSection form={createForm} showStatus />
          </div>
          <DialogFooter className="p-6 pt-2 border-t bg-muted/20 flex-row justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => { setShowCreate(false); createForm.reset(); }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !createForm.canSubmit}
              className="gap-2 min-w-[160px]"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ─────────────────────────────────────────────────────── */}
      <Dialog
        open={editTarget !== null}
        onOpenChange={(v) => {
          if (!v) { setEditTarget(null); editForm.reset(); }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto gap-0 p-0">
          <div className="p-6 pb-0">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Pencil className="h-5 w-5" /> Edit Assignment
              </DialogTitle>
              <DialogDescription>
                Update contract details, location, or promoter identity fields.
                Party and promoter selection cannot be changed; create a new assignment instead.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-6 py-4">
            {/* In edit mode: show location, identity, contract details — not party pickers */}
            <PromoterAssignmentFormSection
              form={editForm}
              showStatus
              // Disable party + employee pickers — can't change them on an existing contract
              disabled={false}
            />
          </div>
          <DialogFooter className="p-6 pt-2 border-t bg-muted/20 flex-row justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => { setEditTarget(null); editForm.reset(); }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
              className="gap-2 min-w-[140px]"
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
