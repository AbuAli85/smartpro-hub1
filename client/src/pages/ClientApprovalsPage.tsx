import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Link2,
  ExternalLink,
  Send,
  FileText,
  AlertCircle,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useMyCapabilities } from "@/hooks/useMyCapabilities";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// ── Types ─────────────────────────────────────────────────────────────────────

type BatchStatus = "draft" | "submitted" | "approved" | "rejected" | "cancelled";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTs(ts: string | Date | null | undefined): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return d;
}

function fmtTime(ts: string | Date | null | undefined): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, t }: { status: BatchStatus; t: (k: string) => string }) {
  const map: Record<BatchStatus, string> = {
    draft: "bg-slate-50 text-slate-700 border-slate-200",
    submitted: "bg-blue-50 text-blue-700 border-blue-200",
    approved: "bg-green-50 text-green-700 border-green-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    cancelled: "bg-slate-50 text-slate-400 border-slate-200",
  };
  const icons: Partial<Record<BatchStatus, React.ReactNode>> = {
    approved: <CheckCircle2 size={11} className="mr-1" />,
    rejected: <XCircle size={11} className="mr-1" />,
    submitted: <Clock size={11} className="mr-1" />,
  };
  return (
    <Badge variant="outline" className={map[status] ?? ""}>
      {icons[status]}
      {t(`attendance.clientApproval.status.${status}`)}
    </Badge>
  );
}

function ItemStatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
    approved: "bg-green-50 text-green-700 border-green-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    disputed: "bg-orange-50 text-orange-700 border-orange-200",
  };
  return (
    <Badge variant="outline" className={map[status] ?? ""}>
      {t(`attendance.clientApproval.itemStatus.${status}`)}
    </Badge>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClientApprovalsPage() {
  const { t } = useTranslation("hr");
  const { caps } = useMyCapabilities();
  const { activeCompanyId } = useActiveCompany();

  // Filters
  const [statusFilter, setStatusFilter] = useState<BatchStatus | "all">("all");
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");

  // Detail panel
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);

  // Reject dialog
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectBatchId, setRejectBatchId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionReasonError, setRejectionReasonError] = useState("");

  // Approve dialog
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveBatchId, setApproveBatchId] = useState<number | null>(null);

  // Queries
  const utils = trpc.useUtils();

  const { data: sites = [] } = trpc.attendance.listSites.useQuery(
    { companyId: activeCompanyId ?? 0 },
    { enabled: !!activeCompanyId },
  );

  const listQuery = trpc.attendance.listClientApprovalBatches.useQuery(
    {
      status: statusFilter === "all" ? undefined : statusFilter,
      siteId: siteFilter !== "all" ? Number(siteFilter) : undefined,
      periodStart: periodFrom || undefined,
      periodEnd: periodTo || undefined,
    },
    { enabled: !!caps.canViewAttendanceClientApproval },
  );

  const detailQuery = trpc.attendance.getClientApprovalBatch.useQuery(
    { batchId: selectedBatchId ?? 0 },
    { enabled: selectedBatchId != null },
  );

  // Mutations
  const submitMut = trpc.attendance.submitClientApprovalBatch.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.clientApprovalsPage.toast.submitted"));
      utils.attendance.listClientApprovalBatches.invalidate();
      if (selectedBatchId) utils.attendance.getClientApprovalBatch.invalidate({ batchId: selectedBatchId });
    },
    onError: () => toast.error(t("attendance.clientApprovalsPage.toast.error")),
  });

  const approveMut = trpc.attendance.approveClientApprovalBatch.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.clientApprovalsPage.toast.approved"));
      setApproveDialogOpen(false);
      setApproveBatchId(null);
      utils.attendance.listClientApprovalBatches.invalidate();
      if (selectedBatchId) utils.attendance.getClientApprovalBatch.invalidate({ batchId: selectedBatchId });
    },
    onError: () => toast.error(t("attendance.clientApprovalsPage.toast.error")),
  });

  const rejectMut = trpc.attendance.rejectClientApprovalBatch.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.clientApprovalsPage.toast.rejected"));
      setRejectDialogOpen(false);
      setRejectBatchId(null);
      setRejectionReason("");
      utils.attendance.listClientApprovalBatches.invalidate();
      if (selectedBatchId) utils.attendance.getClientApprovalBatch.invalidate({ batchId: selectedBatchId });
    },
    onError: () => toast.error(t("attendance.clientApprovalsPage.toast.error")),
  });

  const generateTokenMut = trpc.attendance.generateClientApprovalToken.useMutation({
    onError: () => toast.error(t("attendance.clientApprovalsPage.toast.tokenError")),
  });

  // Handlers
  const handleSubmit = (batchId: number) => {
    submitMut.mutate({ batchId });
  };

  const handleOpenReject = (batchId: number) => {
    setRejectBatchId(batchId);
    setRejectionReason("");
    setRejectionReasonError("");
    setRejectDialogOpen(true);
  };

  const handleConfirmReject = () => {
    if (!rejectionReason.trim()) {
      setRejectionReasonError(t("attendance.clientApproval.validation.rejectionReasonRequired"));
      return;
    }
    if (!rejectBatchId) return;
    rejectMut.mutate({ batchId: rejectBatchId, rejectionReason });
  };

  const handleOpenApprove = (batchId: number) => {
    setApproveBatchId(batchId);
    setApproveDialogOpen(true);
  };

  const handleConfirmApprove = () => {
    if (!approveBatchId) return;
    approveMut.mutate({ batchId: approveBatchId });
  };

  const handleCopyLink = async (batchId: number) => {
    try {
      const result = await generateTokenMut.mutateAsync({ batchId });
      const url = result.approvalUrl.startsWith("http")
        ? result.approvalUrl
        : `${window.location.origin}${result.approvalUrl}`;
      await navigator.clipboard.writeText(url);
      toast.success(t("attendance.clientApprovalsPage.toast.linkCopied"));
    } catch {
      // onError handles the toast
    }
  };

  const handleViewPublic = async (batchId: number) => {
    try {
      const result = await generateTokenMut.mutateAsync({ batchId });
      const url = result.approvalUrl.startsWith("http")
        ? result.approvalUrl
        : `${window.location.origin}${result.approvalUrl}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // onError handles the toast
    }
  };

  const handleCopyReminderText = async (
    batchId: number,
    batch: { periodStart: string; periodEnd: string; siteId: number | null },
  ) => {
    try {
      const result = await generateTokenMut.mutateAsync({ batchId });
      const url = result.approvalUrl.startsWith("http")
        ? result.approvalUrl
        : `${window.location.origin}${result.approvalUrl}`;
      const siteName = sites.find((s) => s.id === batch.siteId)?.name ?? null;
      const lines = [
        t("attendance.clientApprovalsPage.reminder.reminderTextHeader"),
        "",
        `${t("attendance.clientApproval.batchId", { id: batchId })}`,
        `${t("attendance.clientApproval.period", { start: batch.periodStart, end: batch.periodEnd })}`,
        ...(siteName ? [`${t("attendance.clientApproval.site")}: ${siteName}`] : []),
        "",
        url,
        "",
        t("attendance.clientApprovalsPage.reminder.reminderTextFooter"),
      ];
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success(t("attendance.clientApprovalsPage.reminder.reminderCopied"));
    } catch {
      // onError handles the toast
    }
  };

  // Guard
  if (!caps.canViewAttendanceClientApproval) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle size={18} />
          <span className="text-sm">Access denied.</span>
        </div>
      </div>
    );
  }

  const batches = listQuery.data ?? [];
  const selectedDetail = detailQuery.data;

  // Build sheet URL with period/site filters
  const sheetUrl = (() => {
    const params = new URLSearchParams();
    const detail = selectedDetail?.batch;
    if (detail?.periodStart) params.set("from", detail.periodStart);
    if (detail?.periodEnd) params.set("to", detail.periodEnd);
    if (detail?.siteId) params.set("siteId", String(detail.siteId));
    const qs = params.toString();
    return qs ? `/hr/reports/client-attendance?${qs}` : "/hr/reports/client-attendance";
  })();

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <ClipboardCheck size={24} className="text-[var(--smartpro-orange)]" />
          <div>
            <h1 className="text-2xl font-bold">{t("attendance.clientApprovalsPage.title")}</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {t("attendance.clientApprovalsPage.subtitle")}
            </p>
          </div>
        </div>
        {caps.canCreateAttendanceClientApproval && (
          <Link href="/hr/reports/client-attendance">
            <Button variant="outline" size="sm" className="gap-2">
              <FileText size={15} />
              {t("attendance.clientApprovalsPage.createCta")}
            </Button>
          </Link>
        )}
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Status filter */}
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-xs text-muted-foreground font-medium">
                {t("attendance.clientApprovalsPage.filters.status")}
              </label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as BatchStatus | "all")}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("attendance.clientApprovalsPage.filters.allStatuses")}
                  </SelectItem>
                  {(["draft", "submitted", "approved", "rejected", "cancelled"] as BatchStatus[]).map(
                    (s) => (
                      <SelectItem key={s} value={s}>
                        {t(`attendance.clientApproval.status.${s}`)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Site filter */}
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-xs text-muted-foreground font-medium">
                {t("attendance.clientApprovalsPage.filters.site")}
              </label>
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("attendance.clientApprovalsPage.filters.allSites")}
                  </SelectItem>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date range */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">
                {t("attendance.clientApprovalsPage.filters.periodFrom")}
              </label>
              <Input
                type="date"
                className="h-9 text-sm w-36"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">
                {t("attendance.clientApprovalsPage.filters.periodTo")}
              </label>
              <Input
                type="date"
                className="h-9 text-sm w-36"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
              />
            </div>

            {(periodFrom || periodTo) && (
              <Button
                variant="ghost"
                size="sm"
                className="self-end text-xs"
                onClick={() => { setPeriodFrom(""); setPeriodTo(""); }}
              >
                {t("attendance.clientApprovalsPage.filters.clearDates")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Batch list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock size={16} className="text-muted-foreground" />
            {t("attendance.clientApprovalsPage.batchListTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : batches.length === 0 ? (
            <EmptyState t={t} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="batch-list-table">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      {t("attendance.clientApprovalsPage.columns.batchRef")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      {t("attendance.clientApprovalsPage.columns.period")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      {t("attendance.clientApprovalsPage.columns.site")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      {t("attendance.clientApprovalsPage.columns.status")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      {t("attendance.clientApprovalsPage.columns.items")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      {t("attendance.clientApprovalsPage.columns.submittedAt")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      {t("attendance.clientApprovalsPage.columns.resolvedAt")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      {t("attendance.clientApprovalsPage.columns.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => {
                    const siteName = sites.find((s) => s.id === batch.siteId)?.name ?? null;
                    const resolvedAt = batch.approvedAt ?? batch.rejectedAt ?? null;
                    const isSubmitting =
                      submitMut.isPending && submitMut.variables?.batchId === batch.id;

                    return (
                      <tr
                        key={batch.id}
                        className="border-b last:border-0 hover:bg-muted/20 cursor-pointer"
                        onClick={() => setSelectedBatchId(batch.id)}
                      >
                        <td className="px-4 py-3 font-mono text-xs">
                          {t("attendance.clientApproval.batchId", { id: batch.id })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {t("attendance.clientApproval.period", {
                            start: batch.periodStart,
                            end: batch.periodEnd,
                          })}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {siteName ?? t("attendance.clientApprovalsPage.noSite")}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={batch.status as BatchStatus} t={t} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          <span title={t("attendance.clientApproval.itemCounts", {
                            approved: batch.itemCounts.approved,
                            rejected: batch.itemCounts.rejected,
                            pending: batch.itemCounts.pending,
                          })}>
                            {t("attendance.clientApproval.items", { count: batch.itemCounts.total })}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {fmtTs(batch.submittedAt)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {fmtTs(resolvedAt)}
                        </td>
                        <td
                          className="px-4 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setSelectedBatchId(batch.id)}
                            >
                              {t("attendance.clientApprovalsPage.actions.view")}
                            </Button>
                            {batch.status === "draft" && caps.canSubmitAttendanceClientApproval && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                disabled={isSubmitting}
                                onClick={() => handleSubmit(batch.id)}
                              >
                                <Send size={11} />
                                {isSubmitting
                                  ? t("attendance.clientApprovalsPage.actions.submitting")
                                  : t("attendance.clientApprovalsPage.actions.submit")}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batch detail sheet */}
      <Sheet open={selectedBatchId != null} onOpenChange={(open) => { if (!open) setSelectedBatchId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          {selectedDetail ? (
            <BatchDetailPanel
              batch={selectedDetail.batch}
              items={selectedDetail.items}
              sites={sites}
              caps={caps}
              t={t}
              sheetUrl={sheetUrl}
              isSubmitting={submitMut.isPending}
              isGeneratingToken={generateTokenMut.isPending}
              onSubmit={handleSubmit}
              onCopyLink={handleCopyLink}
              onViewPublic={handleViewPublic}
              onCopyReminderText={handleCopyReminderText}
              onApprove={handleOpenApprove}
              onReject={handleOpenReject}
            />
          ) : (
            <div className="p-6 flex items-center justify-center h-full">
              <span className="text-sm text-muted-foreground">Loading…</span>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={(open) => { if (!open) setRejectDialogOpen(false); }}>
        <DialogContent className="max-w-md" data-testid="reject-dialog">
          <DialogHeader>
            <DialogTitle>{t("attendance.clientApprovalsPage.rejectDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("attendance.clientApprovalsPage.rejectDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium">
              {t("attendance.clientApproval.rejectionReasonLabel")}
            </label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={t("attendance.clientApproval.rejectionReasonPlaceholder")}
              value={rejectionReason}
              onChange={(e) => { setRejectionReason(e.target.value); setRejectionReasonError(""); }}
            />
            {rejectionReasonError && (
              <p className="text-xs text-destructive">{rejectionReasonError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              {t("attendance.clientApprovalsPage.rejectDialog.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={rejectMut.isPending}
              onClick={handleConfirmReject}
            >
              {rejectMut.isPending
                ? t("attendance.clientApprovalsPage.actions.rejecting")
                : t("attendance.clientApprovalsPage.rejectDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={(open) => { if (!open) setApproveDialogOpen(false); }}>
        <DialogContent className="max-w-md" data-testid="approve-dialog">
          <DialogHeader>
            <DialogTitle>{t("attendance.clientApprovalsPage.approveDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("attendance.clientApprovalsPage.approveDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
              {t("attendance.clientApprovalsPage.approveDialog.cancel")}
            </Button>
            <Button
              disabled={approveMut.isPending}
              onClick={handleConfirmApprove}
            >
              {approveMut.isPending
                ? t("attendance.clientApprovalsPage.actions.approving")
                : t("attendance.clientApprovalsPage.approveDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ t }: { t: (k: string) => string }) {
  return (
    <div className="py-12 text-center space-y-4 px-6">
      <ClipboardCheck size={40} className="mx-auto text-muted-foreground opacity-25" />
      <p className="text-sm font-medium text-muted-foreground">
        {t("attendance.clientApprovalsPage.emptyState")}
      </p>
      <p className="text-xs text-muted-foreground max-w-xs mx-auto">
        {t("attendance.clientApprovalsPage.emptyStateHint")}
      </p>
      <Link href="/hr/reports/client-attendance">
        <Button variant="outline" size="sm" className="gap-2" data-testid="empty-state-cta">
          <FileText size={14} />
          {t("attendance.clientApprovalsPage.createCta")}
        </Button>
      </Link>
    </div>
  );
}

// ── Batch detail panel ────────────────────────────────────────────────────────

type BatchDetailPanelProps = {
  batch: {
    id: number;
    status: string;
    periodStart: string;
    periodEnd: string;
    siteId: number | null;
    submittedAt: Date | null;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    rejectionReason: string | null;
    clientComment: string | null;
  };
  items: Array<{
    id: number;
    employeeId: number;
    attendanceDate: string;
    status: string;
    clientComment: string | null;
    employeeDisplayName: string;
    checkInAt: Date | null;
    checkOutAt: Date | null;
  }>;
  sites: Array<{ id: number; name: string }>;
  caps: {
    canSubmitAttendanceClientApproval: boolean;
    canApproveAttendanceClientApproval: boolean;
  };
  t: (k: string, opts?: Record<string, unknown>) => string;
  sheetUrl: string;
  isSubmitting: boolean;
  isGeneratingToken: boolean;
  onSubmit: (id: number) => void;
  onCopyLink: (id: number) => void;
  onViewPublic: (id: number) => void;
  onCopyReminderText: (id: number, batch: { periodStart: string; periodEnd: string; siteId: number | null }) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
};

function BatchDetailPanel({
  batch,
  items,
  sites,
  caps,
  t,
  sheetUrl,
  isSubmitting,
  isGeneratingToken,
  onSubmit,
  onCopyLink,
  onViewPublic,
  onCopyReminderText,
  onApprove,
  onReject,
}: BatchDetailPanelProps) {
  const status = batch.status as BatchStatus;
  const siteName = sites.find((s) => s.id === batch.siteId)?.name ?? null;

  return (
    <div className="flex flex-col h-full">
      <SheetHeader className="px-6 pt-6 pb-4 border-b">
        <SheetTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck size={18} className="text-[var(--smartpro-orange)]" />
          {t("attendance.clientApproval.batchId", { id: batch.id })}
          <StatusBadge status={status} t={t} />
        </SheetTitle>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <MetaRow label={t("attendance.clientApprovalsPage.detail.period")}>
            {t("attendance.clientApproval.period", {
              start: batch.periodStart,
              end: batch.periodEnd,
            })}
          </MetaRow>
          <MetaRow label={t("attendance.clientApprovalsPage.detail.site")}>
            {siteName ?? t("attendance.clientApprovalsPage.detail.noSite")}
          </MetaRow>
          {batch.submittedAt && (
            <MetaRow label={t("attendance.clientApprovalsPage.detail.submittedAt")}>
              {fmtTs(batch.submittedAt)}
            </MetaRow>
          )}
          {batch.approvedAt && (
            <MetaRow label={t("attendance.clientApprovalsPage.detail.approvedAt")}>
              <span className="text-green-700 font-medium">{fmtTs(batch.approvedAt)}</span>
            </MetaRow>
          )}
          {batch.rejectedAt && (
            <MetaRow label={t("attendance.clientApprovalsPage.detail.rejectedAt")}>
              <span className="text-red-700 font-medium">{fmtTs(batch.rejectedAt)}</span>
            </MetaRow>
          )}
        </div>

        {/* Rejection reason */}
        {batch.rejectionReason && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-red-800">
              {t("attendance.clientApprovalsPage.detail.rejectionReason")}
            </p>
            <p className="text-sm text-red-700" data-testid="rejection-reason">
              {batch.rejectionReason}
            </p>
          </div>
        )}

        {/* Client comment */}
        {batch.clientComment && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-blue-800">
              {t("attendance.clientApprovalsPage.detail.clientComment")}
            </p>
            <p className="text-sm text-blue-700">{batch.clientComment}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {status === "draft" && caps.canSubmitAttendanceClientApproval && (
            <Button
              size="sm"
              className="gap-2"
              disabled={isSubmitting}
              onClick={() => onSubmit(batch.id)}
            >
              <Send size={14} />
              {isSubmitting
                ? t("attendance.clientApprovalsPage.actions.submitting")
                : t("attendance.clientApprovalsPage.actions.submit")}
            </Button>
          )}

          {status === "submitted" && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={isGeneratingToken}
                onClick={() => onCopyLink(batch.id)}
                data-testid="copy-link-btn"
              >
                <Link2 size={14} />
                {t("attendance.clientApprovalsPage.actions.copyLink")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={isGeneratingToken}
                onClick={() => onViewPublic(batch.id)}
              >
                <ExternalLink size={14} />
                {t("attendance.clientApprovalsPage.actions.viewPublic")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={isGeneratingToken}
                onClick={() => onCopyReminderText(batch.id, batch)}
                data-testid="copy-reminder-btn"
              >
                <MessageSquare size={14} />
                {isGeneratingToken
                  ? t("attendance.clientApprovalsPage.reminder.reminderGenerating")
                  : t("attendance.clientApprovalsPage.reminder.copyReminderText")}
              </Button>
            </>
          )}

          {status === "submitted" && caps.canApproveAttendanceClientApproval && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-green-300 text-green-700 hover:bg-green-50"
                onClick={() => onApprove(batch.id)}
              >
                <CheckCircle2 size={14} />
                {t("attendance.clientApprovalsPage.actions.approve")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => onReject(batch.id)}
              >
                <XCircle size={14} />
                {t("attendance.clientApprovalsPage.actions.reject")}
              </Button>
            </>
          )}

          {(status === "rejected") && (
            <Link href={sheetUrl}>
              <Button variant="outline" size="sm" className="gap-2">
                <FileText size={14} />
                {t("attendance.clientApprovalsPage.actions.goToSheet")}
              </Button>
            </Link>
          )}
        </div>

        {/* Items table */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">
            {t("attendance.clientApprovalsPage.detail.itemsTitle")}
          </h3>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("attendance.clientApprovalsPage.detail.noItems")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs" data-testid="items-table">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      {t("attendance.clientApprovalsPage.detail.employee")}
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      {t("attendance.clientApprovalsPage.detail.date")}
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      {t("attendance.clientApprovalsPage.detail.checkIn")}
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      {t("attendance.clientApprovalsPage.detail.checkOut")}
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      {t("attendance.clientApprovalsPage.detail.itemStatus")}
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      {t("attendance.clientApprovalsPage.detail.comment")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/10">
                      <td className="px-3 py-2">{item.employeeDisplayName}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(item.attendanceDate)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtTime(item.checkInAt)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtTime(item.checkOutAt)}</td>
                      <td className="px-3 py-2">
                        <ItemStatusBadge status={item.status} t={t} />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate">
                        {item.clientComment ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="font-medium">{children}</p>
    </div>
  );
}
