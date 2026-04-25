import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle, XCircle, RefreshCw, ClipboardList } from "lucide-react";
import { OperationalIssueMetaStrip } from "@/components/attendance/OperationalIssueMetaStrip";
import { OperationalIssueHistorySheet } from "@/components/attendance/OperationalIssueHistorySheet";
import { operationalIssueKey } from "@shared/attendanceOperationalIssueKeys";
import { muscatCalendarYmdFromUtcInstant } from "@shared/attendanceMuscatTime";

function ManualCheckInRequests({ companyId }: { companyId: number | null }) {
  const { t } = useTranslation("hr");
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [reviewTarget, setReviewTarget] = useState<{ id: number; action: "approve" | "reject" } | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [issueHistoryKey, setIssueHistoryKey] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data, isLoading, refetch } = trpc.attendance.listManualCheckIns.useQuery(
    { companyId: companyId ?? undefined, status: statusFilter },
    { enabled: companyId != null },
  );
  const approveMut = trpc.attendance.approveManualCheckIn.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.manualCheckins.approvedToast"));
      setReviewTarget(null);
      void refetch();
      void utils.attendance.listManualCheckIns.invalidate();
      void utils.scheduling.getTodayBoard.invalidate();
      void utils.scheduling.getOverdueCheckouts.invalidate();
      void utils.hr.listAttendance.invalidate();
      void utils.hr.attendanceStats.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
      void utils.attendance.getOperationalIssueHistory.invalidate();
      void utils.attendance.listOperationalIssuesByIssueKeys.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const rejectMut = trpc.attendance.rejectManualCheckIn.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.manualCheckins.rejectedToast"));
      setReviewTarget(null);
      void refetch();
      void utils.attendance.listManualCheckIns.invalidate();
      void utils.scheduling.getTodayBoard.invalidate();
      void utils.scheduling.getOverdueCheckouts.invalidate();
      void utils.hr.listAttendance.invalidate();
      void utils.hr.attendanceStats.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
      void utils.attendance.getOperationalIssueHistory.invalidate();
      void utils.attendance.listOperationalIssuesByIssueKeys.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const handleSubmit = () => {
    if (!reviewTarget || companyId == null) return;
    if (reviewTarget.action === "approve") {
      approveMut.mutate({ companyId, requestId: reviewTarget.id, adminNote: adminNote || undefined });
    } else {
      if (!adminNote.trim() || adminNote.trim().length < 5) { toast.error(t("attendance.manualCheckins.provideReason")); return; }
      rejectMut.mutate({ companyId, requestId: reviewTarget.id, adminNote });
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Requests submitted when employees could not check in normally.</p>
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">{t("filters.pending")}</SelectItem>
            <SelectItem value="approved">{t("filters.approved")}</SelectItem>
            <SelectItem value="rejected">{t("filters.rejected")}</SelectItem>
            <SelectItem value="all">{t("filters.all")}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> {t("attendance.filters.refresh")}</Button>
      </div>
      {companyId == null ? (
        <div className="py-12 text-center text-muted-foreground">{t("attendance.manualCheckins.selectCompany")}</div>
      ) : isLoading ? <div className="py-12 text-center text-muted-foreground">{t("attendance.manualCheckins.loading")}</div> : (
        <div className="space-y-3">
          {(data ?? []).map(({ req, site, employee, operationalIssue }) => (
            <Card key={req.id}><CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">
                      {employee?.firstName || employee?.lastName
                        ? `${employee.firstName} ${employee.lastName}`.trim()
                        : `User #${req.employeeUserId}`}
                    </span>
                    {site?.name && <span className="text-xs text-muted-foreground">@ {site.name}</span>}
                    {req.status === "pending" ? <Badge variant="outline" className="border-yellow-300 text-yellow-700 bg-yellow-50">{t("filters.pending")}</Badge>
                      : req.status === "approved" ? <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50">{t("filters.approved")}</Badge>
                      : <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">{t("filters.rejected")}</Badge>}
                  </div>
                  <div className="mt-1.5 text-sm text-muted-foreground space-y-0.5">
                    {req.requestedBusinessDate && (
                      <div>
                        <span className="font-medium text-foreground">Attendance date:</span>{" "}
                        <span className="font-semibold text-foreground">{req.requestedBusinessDate}</span>
                      </div>
                    )}
                    <div><span className="font-medium text-foreground">{t("attendance.manualCheckins.justificationLabel")}</span> {req.justification}</div>
                    {req.adminNote && <div><span className="font-medium text-foreground">{t("attendance.manualCheckins.adminNoteLabel")}</span> {req.adminNote}</div>}
                    <div className="text-xs text-muted-foreground/70">
                      Submitted:{" "}
                      {req.requestedAt
                        ? new Date(req.requestedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </div>
                  </div>
                  <OperationalIssueMetaStrip
                    operationalIssue={operationalIssue}
                    pendingHint={req.status === "pending" && operationalIssue == null}
                    onOpenHistory={() =>
                      setIssueHistoryKey(
                        operationalIssue?.issueKey ??
                          operationalIssueKey({ kind: "manual_pending", manualCheckinRequestId: req.id }),
                      )
                    }
                  />
                </div>
                {req.status === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50" onClick={() => { setReviewTarget({ id: req.id, action: "approve" }); setAdminNote(""); }}><CheckCircle className="h-3.5 w-3.5 mr-1" /> {t("attendance.corrections.approve")}</Button>
                    <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => { setReviewTarget({ id: req.id, action: "reject" }); setAdminNote(""); }}><XCircle className="h-3.5 w-3.5 mr-1" /> {t("attendance.corrections.reject")}</Button>
                  </div>
                )}
              </div>
            </CardContent></Card>
          ))}
          {(data ?? []).length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground border border-dashed rounded-lg">
              <ClipboardList className="h-8 w-8 opacity-30" />
              <p className="text-sm font-medium">
                {statusFilter === "all"
                  ? t("attendance.manualCheckins.noRequestsAll")
                  : t("attendance.manualCheckins.noRequests", { status: t("attendance.manualCheckins." + statusFilter) })}
              </p>
            </div>
          )}
        </div>
      )}
      <Dialog open={!!reviewTarget} onOpenChange={() => setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{reviewTarget?.action === "approve" ? t("attendance.manualCheckins.dialogTitleApprove") : t("attendance.manualCheckins.dialogTitleReject")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="adminNoteManual">{reviewTarget?.action === "approve" ? t("attendance.manualCheckins.adminNoteOptional") : t("attendance.manualCheckins.reasonRequired")}</Label>
            <Textarea id="adminNoteManual" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder={reviewTarget?.action === "approve" ? "Optional note…" : "Explain why…"} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)}>{t("attendance.corrections.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={approveMut.isPending || rejectMut.isPending} className={reviewTarget?.action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}>{reviewTarget?.action === "approve" ? t("attendance.corrections.approve") : t("attendance.corrections.reject")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OperationalIssueHistorySheet
        open={issueHistoryKey != null}
        onOpenChange={(o) => { if (!o) setIssueHistoryKey(null); }}
        companyId={companyId}
        issueKey={issueHistoryKey}
      />
    </div>
  );
}

export default function HRAttendanceManualsPage() {
  const { activeCompanyId } = useActiveCompany();
  return <ManualCheckInRequests companyId={activeCompanyId} />;
}
