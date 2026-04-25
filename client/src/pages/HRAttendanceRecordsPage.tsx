import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { useMyCapabilities } from "@/hooks/useMyCapabilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import * as ExcelJS from "exceljs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  CheckCircle2, XCircle, AlertCircle, Calendar, TrendingUp,
  Clock, Users, Download, Pencil, Trash2,
} from "lucide-react";
import { fmtDateLong } from "@/lib/dateUtils";
import { muscatCalendarYmdNow, muscatCalendarYmdFromUtcInstant } from "@shared/attendanceMuscatTime";

type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "remote";

const statusColors: Record<string, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  late: "bg-amber-100 text-amber-700",
  half_day: "bg-blue-100 text-blue-700",
  remote: "bg-purple-100 text-purple-700",
};

function EditAttendanceDialog({ record, onSuccess }: { record: { id: number; status: string; notes: string | null }; onSuccess: () => void }) {
  const { t } = useTranslation("hr");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(record.status as AttendanceStatus);
  const [notes, setNotes] = useState(record.notes ?? "");
  const [auditNote, setAuditNote] = useState("");

  useEffect(() => {
    setStatus(record.status as AttendanceStatus);
    setNotes(record.notes ?? "");
    setAuditNote("");
  }, [record.id, record.status, record.notes]);

  const statusChanged = status !== record.status;
  const notesChanged = notes.trim() !== (record.notes ?? "").trim();
  const materialChange = statusChanged || notesChanged;
  const auditOk = !materialChange || auditNote.trim().length >= 10;

  const utils = trpc.useUtils();
  const updateMutation = trpc.hr.updateAttendance.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.editDialog.updated"));
      setOpen(false);
      setAuditNote("");
      utils.hr.listAttendance.invalidate();
      utils.hr.attendanceStats.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
      void utils.scheduling.getTodayBoard.invalidate();
      void utils.scheduling.getOverdueCheckouts.invalidate();
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setAuditNote(""); }}>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors"
        aria-label="Edit attendance record"
      >
        <Pencil size={12} />
      </button>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t("attendance.editDialog.title")}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>{t("attendance.editDialog.statusLabel")}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AttendanceStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="present">{t("attendance.clockInDialog.present")}</SelectItem>
                <SelectItem value="absent">{t("attendance.clockInDialog.absent")}</SelectItem>
                <SelectItem value="late">{t("attendance.clockInDialog.late")}</SelectItem>
                <SelectItem value="half_day">{t("attendance.clockInDialog.halfDay")}</SelectItem>
                <SelectItem value="remote">{t("attendance.clockInDialog.remote")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("attendance.editDialog.notesOnRecord")}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="text-sm" />
          </div>
          {materialChange ? (
            <div className="space-y-1.5">
              <Label>{t("attendance.editDialog.auditNote")}</Label>
              <Textarea
                placeholder={t("attendance.editDialog.auditNotePlaceholder")}
                value={auditNote}
                onChange={(e) => setAuditNote(e.target.value)}
                className="text-sm min-h-[72px]"
              />
              <p className="text-[11px] text-muted-foreground">{t("attendance.editDialog.auditNoteHint")}</p>
            </div>
          ) : null}
          <Button
            className="w-full"
            disabled={updateMutation.isPending || !auditOk}
            onClick={() => updateMutation.mutate({ id: record.id, status, notes: notes || undefined, changeAuditNote: materialChange ? auditNote.trim() : undefined })}
          >
            {updateMutation.isPending ? t("attendance.editDialog.saving") : t("attendance.editDialog.saveChanges")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function HRAttendanceRecordsPage() {
  const { t } = useTranslation("hr");
  const { activeCompanyId } = useActiveCompany();
  const { caps } = useMyCapabilities();

  const [monthFilter, setMonthFilter] = useState(() => muscatCalendarYmdNow().slice(0, 7));
  const [deptFilter, setDeptFilter] = useState("all");
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const utils = trpc.useUtils();

  const { data: employees } = trpc.hr.listEmployees.useQuery(
    { department: deptFilter !== "all" ? deptFilter : undefined, status: "active", companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: attendance, refetch } = trpc.hr.listAttendance.useQuery(
    { month: monthFilter, companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: stats } = trpc.hr.attendanceStats.useQuery(
    { month: monthFilter, companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );

  const deleteMutation = trpc.hr.deleteAttendance.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.recordDeleted"));
      setDeleteTargetId(null);
      void utils.hr.listAttendance.invalidate();
      void utils.hr.attendanceStats.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
      void utils.scheduling.getTodayBoard.invalidate();
      void utils.scheduling.getOverdueCheckouts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const departments = useMemo(() => {
    const depts = new Set((employees ?? []).map((e) => e.department).filter(Boolean));
    return Array.from(depts) as string[];
  }, [employees]);

  const empById = useMemo(() => {
    const m = new Map<number, { firstName: string; lastName: string }>();
    for (const e of employees ?? []) m.set(e.id, { firstName: e.firstName, lastName: e.lastName });
    return m;
  }, [employees]);

  const total = (stats?.present ?? 0) + (stats?.absent ?? 0) + (stats?.late ?? 0) + (stats?.half_day ?? 0) + (stats?.remote ?? 0);
  const rate =
    stats?.attendanceRatePercent != null && !Number.isNaN(stats.attendanceRatePercent)
      ? stats.attendanceRatePercent
      : total > 0
        ? Math.round(((stats?.present ?? 0) / total) * 100)
        : 0;

  const today = muscatCalendarYmdNow();
  const todayRecords = (attendance ?? []).filter((r) => {
    if (!r.date) return false;
    return muscatCalendarYmdFromUtcInstant(new Date(r.date)) === today;
  });

  const handleAttendanceExport = useCallback(async () => {
    if (activeCompanyId == null) return;
    setExporting(true);
    try {
      const result = await utils.hr.exportMonthlyAttendance.fetch({ companyId: activeCompanyId, month: monthFilter });
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`Attendance ${monthFilter}`);
      ws.columns = [
        { header: "Employee", key: "employee", width: 28 },
        { header: "Site", key: "site", width: 20 },
        { header: "Client / Brand", key: "client", width: 24 },
        { header: "Days Present", key: "present", width: 14 },
        { header: "Days Absent", key: "absent", width: 14 },
        { header: "Days Late", key: "late", width: 12 },
        { header: "Worked Hours", key: "worked", width: 14 },
        { header: "Billable Hours", key: "billable", width: 14 },
        { header: "Scheduled Hours", key: "scheduled", width: 14 },
        { header: "Attendance Rate", key: "rate", width: 16 },
      ];
      for (const r of result.rows) {
        ws.addRow({
          employee: r.employeeName,
          site: r.siteName ?? "—",
          client: r.clientName ?? "—",
          present: r.daysPresent,
          absent: r.daysAbsent,
          late: r.daysLate,
          worked: (r.totalWorkedMinutes / 60).toFixed(1),
          billable: r.billableHours.toFixed(1),
          scheduled: (r.scheduledMinutes / 60).toFixed(1),
          rate: `${r.attendanceRate}%`,
        });
      }
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `attendance-${monthFilter}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(t("attendance.exportDownloaded"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("attendance.exportFailed"));
    } finally {
      setExporting(false);
    }
  }, [activeCompanyId, monthFilter, utils, t]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: t("attendance.records.stats.present"), value: stats?.present ?? 0, icon: <CheckCircle2 size={18} />, color: "text-green-600 bg-green-50" },
          { label: t("attendance.records.stats.absent"), value: stats?.absent ?? 0, icon: <XCircle size={18} />, color: "text-red-600 bg-red-50" },
          { label: t("attendance.records.stats.late"), value: stats?.late ?? 0, icon: <AlertCircle size={18} />, color: "text-amber-600 bg-amber-50" },
          { label: t("attendance.records.stats.remote"), value: stats?.remote ?? 0, icon: <Calendar size={18} />, color: "text-purple-600 bg-purple-50" },
          { label: t("attendance.records.stats.attendanceRate"), value: `${rate}%`, icon: <TrendingUp size={18} />, color: "text-blue-600 bg-blue-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>{s.icon}</div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("attendance.records.filters.month")}</Label>
          <Input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="h-8 text-sm w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("attendance.records.filters.department")}</Label>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-8 text-sm w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("attendance.records.filters.allDepartments")}</SelectItem>
              {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {caps.canExportAttendanceReports && (
          <div className="space-y-1 flex items-end">
            <Button type="button" size="sm" variant="outline" className="gap-2 h-8" disabled={exporting || activeCompanyId == null} onClick={() => void handleAttendanceExport()}>
              <Download size={14} /> {exporting ? t("attendance.records.filters.exporting") : t("attendance.records.filters.exportExcel")}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{t("attendance.records.chart.title", { month: monthFilter })}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.byDay && stats.byDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.byDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="present" fill="#22c55e" name={t("attendance.records.stats.present")} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="late" fill="#f59e0b" name={t("attendance.records.stats.late")} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="absent" fill="#ef4444" name={t("attendance.records.stats.absent")} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Calendar size={32} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">{t("attendance.records.chart.noData")}</p>
                  <p className="text-xs mt-1">{t("attendance.records.chart.noDataHint")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock size={14} /> {t("attendance.records.todaySummary.title")}
              <Badge variant="outline" className="text-xs ml-auto">{t("attendance.records.todaySummary.records", { count: todayRecords.length })}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
              {t("attendance.records.todaySummary.legacyNote")}
            </p>
            {todayRecords.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t("attendance.records.todaySummary.noRows")}</p>
                <p className="text-xs mt-1">{t("attendance.records.todaySummary.noRowsHint")}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {todayRecords.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                        {(empById.get(r.employeeId ?? 0)?.firstName ?? "?").slice(0, 1)}
                      </div>
                      <span className="text-sm font-medium">
                        {(() => {
                          const e = empById.get(r.employeeId ?? 0);
                          return e ? `${e.firstName} ${e.lastName}`.trim() : t("attendance.records.employeeFallback", { id: r.employeeId });
                        })()}
                      </span>
                    </div>
                    <Badge className={`text-xs ${statusColors[r.status ?? "present"] ?? ""}`}>{r.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full Attendance Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users size={14} /> {t("attendance.records.table.title", { month: monthFilter })}
            <span className="ml-auto text-xs text-muted-foreground font-normal">{t("attendance.records.table.records", { count: (attendance ?? []).length })}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!attendance || attendance.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock size={40} className="mx-auto mb-3 opacity-20" />
              <p className="font-medium">{t("attendance.records.table.noRecords")}</p>
              <p className="text-sm mt-1">{t("attendance.records.table.noRecordsHint")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th scope="col" className="text-left py-2 px-3 font-medium">{t("attendance.records.table.employee")}</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">{t("attendance.records.table.date")}</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">{t("attendance.records.table.checkIn")}</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">{t("attendance.records.table.checkOut")}</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">{t("attendance.records.table.hours")}</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">{t("attendance.records.table.status")}</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">{t("attendance.records.table.notes")}</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">{t("attendance.records.table.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((r) => {
                    const checkIn = r.checkIn ? new Date(r.checkIn) : null;
                    const checkOut = r.checkOut ? new Date(r.checkOut) : null;
                    const hours = checkIn && checkOut
                      ? ((checkOut.getTime() - checkIn.getTime()) / 3600000).toFixed(1)
                      : "—";
                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-3 font-medium">
                          {(() => {
                            const e = empById.get(r.employeeId ?? 0);
                            return e ? `${e.firstName} ${e.lastName}`.trim() : t("attendance.records.employeeFallback", { id: r.employeeId });
                          })()}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">{r.date ? fmtDateLong(r.date) : "—"}</td>
                        <td className="py-2 px-3">{checkIn ? checkIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="py-2 px-3">{checkOut ? checkOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="py-2 px-3">{hours !== "—" ? `${hours}h` : "—"}</td>
                        <td className="py-2 px-3">
                          <Badge className={`text-xs ${statusColors[r.status ?? "present"] ?? ""}`}>{r.status ?? "present"}</Badge>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs max-w-[120px] truncate">{r.notes ?? "—"}</td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1">
                            <EditAttendanceDialog
                              record={{ id: r.id, status: r.status ?? "present", notes: r.notes ?? null }}
                              onSuccess={refetch}
                            />
                            <button
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                              disabled={deleteMutation.isPending}
                              onClick={() => setDeleteTargetId(r.id)}
                              aria-label="Delete attendance record"
                            >
                              <Trash2 size={12} />
                            </button>
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

      <AlertDialog open={deleteTargetId != null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("attendance.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("attendance.deleteDialog.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("attendance.deleteDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              onClick={() => { if (deleteTargetId != null) deleteMutation.mutate({ id: deleteTargetId }); }}
            >
              {t("attendance.deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
