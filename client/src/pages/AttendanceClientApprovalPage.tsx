/**
 * AttendanceClientApprovalPage — Public client-facing batch approval page.
 *
 * Route: /attendance-approval/:token
 * Access: Public (no login required). Authorization is via a signed JWT in the URL.
 *
 * The page allows an external client contact to view attendance records and
 * approve or reject the batch. Once a decision is made, the page becomes read-only.
 */
import { useState } from "react";
import { useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  ClipboardCheck,
  CalendarRange,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString([], { dateStyle: "medium" });
}

const BATCH_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  submitted: {
    label: "Awaiting Your Approval",
    color: "bg-blue-100 text-blue-800",
    icon: <Clock className="h-4 w-4" />,
  },
  approved: {
    label: "Approved",
    color: "bg-green-100 text-green-800",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  rejected: {
    label: "Rejected",
    color: "bg-red-100 text-red-800",
    icon: <XCircle className="h-4 w-4" />,
  },
  draft: {
    label: "Not Yet Submitted",
    color: "bg-gray-100 text-gray-700",
    icon: <Clock className="h-4 w-4" />,
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-gray-100 text-gray-500",
    icon: <XCircle className="h-4 w-4" />,
  },
};

const ITEM_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  pending:  { color: "bg-yellow-100 text-yellow-800", label: "Pending" },
  approved: { color: "bg-green-100 text-green-800",  label: "Approved" },
  rejected: { color: "bg-red-100 text-red-800",      label: "Rejected" },
  disputed: { color: "bg-purple-100 text-purple-800", label: "Disputed" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AttendanceClientApprovalPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation("hr");

  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [clientComment, setClientComment] = useState("");
  const [reasonError, setReasonError] = useState("");

  const { data, isLoading, error, refetch } =
    trpc.attendance.getClientApprovalBatchByToken.useQuery(
      { token: token ?? "" },
      { enabled: !!token, retry: false },
    );

  const approveUtils = trpc.attendance.clientApproveByToken.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.clientApproval.publicView.approveSuccess"));
      void refetch();
    },
    onError: (err) => {
      toast.error(err.message || t("attendance.clientApproval.publicView.error"));
    },
  });

  const rejectUtils = trpc.attendance.clientRejectByToken.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.clientApproval.publicView.rejectSuccess"));
      setShowRejectForm(false);
      void refetch();
    },
    onError: (err) => {
      toast.error(err.message || t("attendance.clientApproval.publicView.error"));
    },
  });

  function handleApprove() {
    if (!token) return;
    approveUtils.mutate({ token, clientComment: clientComment || undefined });
  }

  function handleRejectSubmit() {
    if (!rejectionReason.trim()) {
      setReasonError(t("attendance.clientApproval.publicView.rejectReasonRequired"));
      return;
    }
    setReasonError("");
    if (!token) return;
    rejectUtils.mutate({
      token,
      rejectionReason: rejectionReason.trim(),
      clientComment: clientComment || undefined,
    });
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // ── Error / invalid token ───────────────────────────────────────────────────
  if (error || !data) {
    const isUnauthorized =
      error?.data?.code === "UNAUTHORIZED" || error?.data?.code === "NOT_FOUND";
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border p-8 text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
          <h1 className="text-xl font-semibold text-gray-800">
            {isUnauthorized
              ? t("attendance.clientApproval.publicView.invalidToken")
              : t("attendance.clientApproval.publicView.notFound")}
          </h1>
          <p className="text-sm text-gray-500">
            {t("attendance.clientApproval.publicView.error")}
          </p>
        </div>
      </div>
    );
  }

  const { batch, items } = data;
  const statusCfg = BATCH_STATUS_CONFIG[batch.status] ?? BATCH_STATUS_CONFIG.draft;
  const isDecided = batch.status === "approved" || batch.status === "rejected";
  const isSubmitted = batch.status === "submitted";
  const isBusy = approveUtils.isPending || rejectUtils.isPending;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header card */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-4">
          <div className="flex items-start gap-3">
            <ClipboardCheck className="h-7 w-7 text-blue-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900">
                {t("attendance.clientApproval.publicView.title")}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {t("attendance.clientApproval.publicView.subtitle")}
              </p>
            </div>
          </div>

          {/* Status badge */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${statusCfg.color}`}
          >
            {statusCfg.icon}
            {statusCfg.label}
          </span>

          {/* Period + metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-gray-700">
              <CalendarRange className="h-4 w-4 text-gray-400 shrink-0" />
              <span>
                {t("attendance.clientApproval.publicView.period", {
                  start: fmtDate(batch.periodStart),
                  end: fmtDate(batch.periodEnd),
                })}
              </span>
            </div>
            {batch.submittedAt && (
              <div className="text-gray-500">
                {t("attendance.clientApproval.publicView.submittedAt", {
                  date: fmtDate(batch.submittedAt),
                })}
              </div>
            )}
            {batch.approvedAt && (
              <div className="text-green-700 font-medium">
                {t("attendance.clientApproval.publicView.approvedAt", {
                  date: fmtDate(batch.approvedAt),
                })}
              </div>
            )}
            {batch.rejectedAt && (
              <div className="text-red-700 font-medium">
                {t("attendance.clientApproval.publicView.rejectedAt", {
                  date: fmtDate(batch.rejectedAt),
                })}
              </div>
            )}
          </div>

          {/* Rejection reason (read-only after decision) */}
          {batch.rejectionReason && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              <span className="font-medium">
                {t("attendance.clientApproval.publicView.rejectReasonLabel")}:{" "}
              </span>
              {batch.rejectionReason}
            </div>
          )}

          {/* Client comment (read-only after decision) */}
          {batch.clientComment && (
            <div className="rounded-lg bg-gray-50 border p-3 text-sm text-gray-700">
              <span className="font-medium">
                {t("attendance.clientApproval.publicView.clientCommentLabel")}:{" "}
              </span>
              {batch.clientComment}
            </div>
          )}

          {/* Already decided notice */}
          {isDecided && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
              {t("attendance.clientApproval.publicView.alreadyDecided")}
            </div>
          )}
        </div>

        {/* Attendance items table */}
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  {t("attendance.clientApproval.publicView.tableHeader.employee")}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  {t("attendance.clientApproval.publicView.tableHeader.date")}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  {t("attendance.clientApproval.publicView.tableHeader.status")}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  {t("attendance.clientApproval.publicView.tableHeader.comment")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-gray-400"
                  >
                    {t("attendance.clientApproval.publicView.emptyItems")}
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const itemCfg = ITEM_STATUS_CONFIG[item.status] ?? ITEM_STATUS_CONFIG.pending;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {item.employeeDisplayName}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {fmtDate(item.attendanceDate)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${itemCfg.color}`}
                        >
                          {itemCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {item.clientComment ?? "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Action area — only visible for submitted batches */}
        {isSubmitted && (
          <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-5">

            {/* Shared comment field */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">
                {t("attendance.clientApproval.publicView.clientCommentLabel")}
              </label>
              <Textarea
                value={clientComment}
                onChange={(e) => setClientComment(e.target.value)}
                placeholder={t(
                  "attendance.clientApproval.publicView.clientCommentPlaceholder",
                )}
                rows={2}
                disabled={isBusy}
                className="resize-none"
              />
            </div>

            {/* Reject form */}
            {showRejectForm ? (
              <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
                <label className="text-sm font-medium text-red-800">
                  {t("attendance.clientApproval.publicView.rejectReasonLabel")}
                  <span className="text-red-600"> *</span>
                </label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => {
                    setRejectionReason(e.target.value);
                    setReasonError("");
                  }}
                  placeholder={t(
                    "attendance.clientApproval.publicView.rejectReasonPlaceholder",
                  )}
                  rows={3}
                  disabled={isBusy}
                  className="resize-none bg-white"
                />
                {reasonError && (
                  <p className="text-xs text-red-600">{reasonError}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    onClick={handleRejectSubmit}
                    disabled={isBusy}
                    className="flex-1"
                  >
                    {rejectUtils.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t("attendance.clientApproval.publicView.confirmReject")
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowRejectForm(false);
                      setRejectionReason("");
                      setReasonError("");
                    }}
                    disabled={isBusy}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleApprove}
                  disabled={isBusy}
                >
                  {approveUtils.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      {t("attendance.clientApproval.publicView.approveButton")}
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => setShowRejectForm(true)}
                  disabled={isBusy}
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  {t("attendance.clientApproval.publicView.rejectButton")}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-4">
          SmartPRO — Powered by Attendance Client Approval
        </p>
      </div>
    </div>
  );
}
