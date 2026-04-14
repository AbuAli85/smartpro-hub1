import { trpc } from "@/lib/trpc";
import { useState, useMemo, useEffect, useCallback } from "react";
import { OverdueCheckoutsPanel } from "@/components/attendance/OverdueCheckoutsPanel";
import { AttendanceActionQueue } from "@/components/attendance/AttendanceActionQueue";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import {
  Clock, Users, CheckCircle2, XCircle, AlertCircle, Calendar,
  TrendingUp, Download, Pencil, Trash2, CheckCircle, RefreshCw,
  ClipboardList, CalendarDays, ScrollText,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";
import { DateInput } from "@/components/ui/date-input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  ATTENDANCE_AUDIT_ACTION,
  ATTENDANCE_AUDIT_SOURCE,
} from "@shared/attendanceAuditTaxonomy";
import { getAdminBoardRowStatusPresentation } from "@/lib/adminBoardRowStatus";
import {
  buildOperationalActionQueue,
  collectOperationalIssueKeysForQueue,
  filterOperationalQueueItems,
  ATTENDANCE_ACTION,
  type AttendanceActionId,
  type OperationalExceptionItem,
  type OperationalIssueLite,
  type OperationalQueueFilter,
} from "@shared/attendanceIntelligence";
import { muscatCalendarYmdFromUtcInstant, muscatCalendarYmdNow } from "@shared/attendanceMuscatTime";
import { useAttendanceOperationalMutations } from "@/hooks/useAttendanceOperationalMutations";
import { useAuth } from "@/_core/hooks/useAuth";
const AUDIT_ACTION_LABELS: Record<string, string> = {
  [ATTENDANCE_AUDIT_ACTION.HR_ATTENDANCE_CREATE]: "HR attendance · created",
  [ATTENDANCE_AUDIT_ACTION.HR_ATTENDANCE_UPDATE]: "HR attendance · updated",
  [ATTENDANCE_AUDIT_ACTION.HR_ATTENDANCE_DELETE]: "HR attendance · deleted",
  [ATTENDANCE_AUDIT_ACTION.CORRECTION_APPROVE]: "Correction · approved",
  [ATTENDANCE_AUDIT_ACTION.CORRECTION_REJECT]: "Correction · rejected",
  [ATTENDANCE_AUDIT_ACTION.CORRECTION_SUBMITTED]: "Correction · submitted",
  [ATTENDANCE_AUDIT_ACTION.MANUAL_CHECKIN_APPROVE]: "Manual check-in · approved",
  [ATTENDANCE_AUDIT_ACTION.MANUAL_CHECKIN_REJECT]: "Manual check-in · rejected",
  [ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_ALLOWED]: "Self check-in · allowed",
  [ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_DENIED]: "Self check-in · denied",
  [ATTENDANCE_AUDIT_ACTION.SELF_CHECKOUT]: "Self check-out",
  [ATTENDANCE_AUDIT_ACTION.MANUAL_CHECKIN_SUBMIT]: "Manual check-in · submitted",
  [ATTENDANCE_AUDIT_ACTION.FORCE_CHECKOUT]: "Force checkout (HR)",
  [ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ACKNOWLEDGE]: "Operational issue · acknowledged",
  [ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_RESOLVE]: "Operational issue · resolved",
  [ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ASSIGN]: "Operational issue · assigned",
};

const AUDIT_SOURCE_LABELS: Record<string, string> = {
  [ATTENDANCE_AUDIT_SOURCE.HR_PANEL]: "HR panel",
  [ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL]: "Employee portal",
  [ATTENDANCE_AUDIT_SOURCE.ADMIN_PANEL]: "Admin / HR",
  [ATTENDANCE_AUDIT_SOURCE.SYSTEM]: "System",
};

function auditActionLabel(actionType: string) {
  return AUDIT_ACTION_LABELS[actionType] ?? actionType.replace(/_/g, " ");
}

function auditSourceLabel(source: string | null | undefined) {
  if (!source) return "—";
  return AUDIT_SOURCE_LABELS[source] ?? source;
}

type AuditRow = {
  id: number;
  companyId: number;
  employeeId: number | null;
  hrAttendanceId: number | null;
  attendanceRecordId: number | null;
  correctionId: number | null;
  manualCheckinRequestId: number | null;
  actorUserId: number;
  actorRole: string | null;
  actionType: string;
  entityType: string;
  entityId: number | null;
  beforePayload: unknown;
  afterPayload: unknown;
  reason: string | null;
  source: string;
  createdAt: Date | string;
};

function AttendanceAuditLog({
  enabled,
  companyId,
  employees,
}: {
  enabled: boolean;
  companyId: number | null;
  employees: { id: number; firstName: string; lastName: string }[];
}) {
  const defaultTo = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [employeeId, setEmployeeId] = useState<string>("all");
  const [actionType, setActionType] = useState<string>("all");
  const [detail, setDetail] = useState<AuditRow | null>(null);

  const actionOptions = useMemo(
    () =>
      Object.entries(ATTENDANCE_AUDIT_ACTION).map(([, v]) => ({
        value: v,
        label: auditActionLabel(v),
      })),
    [],
  );

  const { data, isLoading, refetch, isFetching } = trpc.attendance.listAttendanceAudit.useQuery(
    {
      companyId: companyId ?? undefined,
      createdOnOrAfter: from,
      createdOnOrBefore: to,
      employeeId: employeeId !== "all" ? Number(employeeId) : undefined,
      actionType: actionType !== "all" ? actionType : undefined,
      limit: 50,
    },
    { enabled: enabled && companyId != null },
  );

  const empName = (id: number | null | undefined) => {
    if (id == null) return "—";
    const e = employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : `Employee #${id}`;
  };

  const entitySummary = (row: AuditRow) => {
    const parts: string[] = [];
    if (row.entityType && row.entityId != null) parts.push(`${row.entityType} #${row.entityId}`);
    if (row.attendanceRecordId) parts.push(`clock #${row.attendanceRecordId}`);
    if (row.hrAttendanceId) parts.push(`HR row #${row.hrAttendanceId}`);
    if (row.correctionId) parts.push(`correction #${row.correctionId}`);
    if (row.manualCheckinRequestId) parts.push(`manual req #${row.manualCheckinRequestId}`);
    return parts.length ? parts.join(" · ") : "—";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-sm w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-sm w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Employee</Label>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="h-8 text-sm w-[200px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employees</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.firstName} {e.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Action</Label>
          <Select value={actionType} onValueChange={setActionType}>
            <SelectTrigger className="h-8 text-sm w-[220px]">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All actions</SelectItem>
              {actionOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          onClick={() => refetch()}
          disabled={!enabled || isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Structural audit trail (last 50 rows for the selected filters). Open a row for before/after payloads and linked IDs.
      </p>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading audit log…</div>
      ) : !data?.length ? (
        <div className="py-12 text-center text-muted-foreground">No audit entries for this range.</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th scope="col" className="text-left py-2 px-3 font-medium">
                  Time
                </th>
                <th scope="col" className="text-left py-2 px-3 font-medium">
                  Employee
                </th>
                <th scope="col" className="text-left py-2 px-3 font-medium">
                  Action
                </th>
                <th scope="col" className="text-left py-2 px-3 font-medium">
                  Source
                </th>
                <th scope="col" className="text-left py-2 px-3 font-medium">
                  Actor
                </th>
                <th scope="col" className="text-left py-2 px-3 font-medium">
                  Reason
                </th>
                <th scope="col" className="text-left py-2 px-3 font-medium">
                  Entity
                </th>
              </tr>
            </thead>
            <tbody>
              {(data as AuditRow[]).map((row) => (
                <tr
                  key={row.id}
                  className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => setDetail(row)}
                >
                  <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">
                    {fmtDateTimeShort(row.createdAt)}
                  </td>
                  <td className="py-2 px-3 font-medium">{empName(row.employeeId)}</td>
                  <td className="py-2 px-3">
                    <Badge variant="outline" className="text-[11px] font-normal max-w-[200px] truncate">
                      {auditActionLabel(row.actionType)}
                    </Badge>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{auditSourceLabel(row.source)}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">
                    User #{row.actorUserId}
                    {row.actorRole ? <span className="block text-[10px] opacity-80">{row.actorRole}</span> : null}
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground max-w-[180px] truncate" title={row.reason ?? ""}>
                    {row.reason ?? "—"}
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground max-w-[220px] truncate" title={entitySummary(row)}>
                    {entitySummary(row)}
                  </td>
              </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Audit entry</SheetTitle>
            <SheetDescription className="text-left">
              {detail ? (
                <span className="text-xs">
                  #{detail.id} · {auditActionLabel(detail.actionType)} · {fmtDateTime(detail.createdAt)}
                </span>
              ) : null}
            </SheetDescription>
          </SheetHeader>
          {detail && (
            <div className="space-y-4 px-4 pb-6 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Employee</span>
                  <p className="font-medium">{empName(detail.employeeId)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Source</span>
                  <p>{auditSourceLabel(detail.source)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Actor</span>
                  <p>
                    User #{detail.actorUserId}
                    {detail.actorRole ? ` · ${detail.actorRole}` : ""}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Entity</span>
                  <p className="break-all">{detail.entityType} {detail.entityId != null ? `#${detail.entityId}` : ""}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {detail.hrAttendanceId != null && (
                  <Badge variant="secondary">HR attendance #{detail.hrAttendanceId}</Badge>
                )}
                {detail.attendanceRecordId != null && (
                  <Badge variant="secondary">Clock record #{detail.attendanceRecordId}</Badge>
                )}
                {detail.correctionId != null && (
                  <Badge variant="secondary">Correction #{detail.correctionId}</Badge>
                )}
                {detail.manualCheckinRequestId != null && (
                  <Badge variant="secondary">Manual request #{detail.manualCheckinRequestId}</Badge>
                )}
              </div>
              {detail.reason ? (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Reason</Label>
                  <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/40 p-2">{detail.reason}</p>
                </div>
              ) : null}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Before payload</Label>
                <pre className="text-[11px] bg-muted/50 p-2 rounded-md max-h-52 overflow-auto whitespace-pre-wrap break-all">
                  {detail.beforePayload == null ? "—" : JSON.stringify(detail.beforePayload, null, 2)}
                </pre>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">After payload</Label>
                <pre className="text-[11px] bg-muted/50 p-2 rounded-md max-h-52 overflow-auto whitespace-pre-wrap break-all">
                  {detail.afterPayload == null ? "—" : JSON.stringify(detail.afterPayload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

const statusColors: Record<string, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  late: "bg-amber-100 text-amber-700",
  half_day: "bg-blue-100 text-blue-700",
  remote: "bg-purple-100 text-purple-700",
};

type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "remote";

function ClockInDialog({ employees, onSuccess, companyId }: { employees: { id: number; firstName: string; lastName: string; department: string | null }[]; onSuccess: () => void; companyId?: number | null }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", status: "present" as AttendanceStatus, notes: "", date: new Date().toISOString().split("T")[0] });
  const reasonOk = form.notes.trim().length >= 10;

  const utils = trpc.useUtils();
  const createMutation = trpc.hr.createAttendance.useMutation({
    onSuccess: () => {
      toast.success("Attendance recorded");
      setOpen(false);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><Clock size={14} /> Record Attendance</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record Attendance</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Employee *</Label>
            <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>{e.firstName} {e.lastName} — {e.department}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date *</Label>
            <DateInput value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label>Status *</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as AttendanceStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="half_day">Half Day</SelectItem>
                <SelectItem value="remote">Remote</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reason / audit note *</Label>
            <Textarea
              placeholder="Required for compliance — who asked for this entry, why, or evidence (min. 10 characters)…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="text-sm min-h-[88px]"
            />
            <p className="text-[11px] text-muted-foreground">Stored on the record for audit. Use clear, factual wording.</p>
          </div>
          <Button className="w-full" disabled={!form.employeeId || !reasonOk || createMutation.isPending}
            onClick={() => createMutation.mutate({ employeeId: Number(form.employeeId), status: form.status, notes: form.notes.trim(), date: form.date, companyId: companyId ?? undefined })}>
            {createMutation.isPending ? "Recording..." : "Record Attendance"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditAttendanceDialog({ record, onSuccess }: { record: { id: number; status: string; notes: string | null }; onSuccess: () => void }) {
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
      toast.success("Record updated");
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
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setAuditNote("");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><Pencil size={12} /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Edit HR attendance record</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AttendanceStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="half_day">Half Day</SelectItem>
                <SelectItem value="remote">Remote</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes on record</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="text-sm" />
          </div>
          {materialChange ? (
            <div className="space-y-1.5">
              <Label>Audit note — why this change is justified *</Label>
              <Textarea
                placeholder="Required when status or notes change (min. 10 characters). Who asked, what evidence, or policy basis…"
                value={auditNote}
                onChange={(e) => setAuditNote(e.target.value)}
                className="text-sm min-h-[72px]"
              />
              <p className="text-[11px] text-muted-foreground">Stored on the audit log with this update.</p>
            </div>
          ) : null}
          <Button
            className="w-full"
            disabled={updateMutation.isPending || !auditOk}
            onClick={() =>
              updateMutation.mutate({
                id: record.id,
                status,
                notes: notes || undefined,
                changeAuditNote: materialChange ? auditNote.trim() : undefined,
              })}
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function boardStatusBadge(status: string) {
  const m = getAdminBoardRowStatusPresentation(status);
  return <Badge variant="outline" className={m.className}>{m.label}</Badge>;
}

function HrAttendanceExceptionStrip({
  companyId,
  pendingCorrCount,
  pendingManualCount,
  scheduledShiftsToday,
  overdueCheckoutCount,
  missedShiftsCount,
  criticalExceptions,
  needsAttention,
}: {
  companyId: number | null;
  pendingCorrCount: number;
  pendingManualCount: number;
  scheduledShiftsToday: number | null;
  overdueCheckoutCount: number;
  missedShiftsCount: number;
  criticalExceptions: number | null;
  needsAttention: number | null;
}) {
  if (companyId == null) return null;
  const items = [
    { label: "Critical exceptions (live)", value: criticalExceptions, warn: (criticalExceptions ?? 0) > 0 },
    { label: "Needs attention (live)", value: needsAttention, warn: (needsAttention ?? 0) > 0 },
    { label: "Pending corrections", value: pendingCorrCount, warn: pendingCorrCount > 0 },
    { label: "Pending manual check-ins", value: pendingManualCount, warn: pendingManualCount > 0 },
    { label: "Open check-outs past shift end", value: overdueCheckoutCount, warn: overdueCheckoutCount > 0 },
    { label: "Missed shifts (absent)", value: missedShiftsCount, warn: missedShiftsCount > 0 },
    { label: "Scheduled shift rows today", value: scheduledShiftsToday, warn: false },
  ];
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-3 sm:px-4">
      <p className="text-xs font-semibold text-foreground mb-2">Workforce signals (Muscat day)</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 text-xs">
        {items.map((it) => (
          <div
            key={it.label}
            className={`rounded-md border px-2 py-2 ${
              it.warn ? "border-amber-300/80 bg-amber-50/80 dark:bg-amber-950/20" : "border-border/80 bg-background/60"
            }`}
          >
            <p className="text-[11px] text-muted-foreground leading-tight">{it.label}</p>
            <p className="text-lg font-semibold tabular-nums mt-0.5">{it.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
        “Open check-outs past shift end” and “Missed shifts” are computed server-side using Muscat wall-clock shift boundaries, consistent with the live board.
      </p>
    </div>
  );
}

// ─── Today's Live Board ──────────────────────────────────────────────────────
function TodayBoard({ companyId }: { companyId: number | null }) {
  const { data, isLoading, isFetching, dataUpdatedAt, refetch } = trpc.scheduling.getTodayBoard.useQuery(
    { companyId: companyId ?? undefined },
    {
      enabled: companyId != null,
      refetchInterval: 60_000,
      refetchIntervalInBackground: true,
    },
  );
  if (companyId == null) {
    return (
      <div className="py-12 text-center text-muted-foreground border border-dashed rounded-lg">
        Select a company in the workspace switcher to load today&apos;s live board.
      </div>
    );
  }
  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Loading today's board…</div>;
  if (!data) return <div className="py-12 text-center text-muted-foreground">No data available</div>;
  const s = data.summary;
  const stats = [
    { label: "Critical (live)", count: s.criticalExceptions ?? 0, color: "text-red-800", bg: "bg-red-50" },
    { label: "Needs attention", count: s.needsAttention ?? 0, color: "text-amber-900", bg: "bg-amber-50" },
    { label: "Open past shift end", count: s.overdueOpenCheckoutCount, color: "text-orange-800", bg: "bg-orange-50/90" },
    { label: "Scheduled", count: s.total, color: "text-slate-700", bg: "bg-slate-50" },
    { label: "Upcoming", count: s.upcoming, color: "text-slate-600", bg: "bg-slate-50/80" },
    { label: "Awaiting check-in", count: s.notCheckedIn, color: "text-amber-700", bg: "bg-amber-50" },
    { label: "Checked in (active)", count: s.checkedInActive, color: "text-emerald-700", bg: "bg-emerald-50" },
    { label: "Late / no arrival", count: s.lateNoCheckin, color: "text-orange-700", bg: "bg-orange-50" },
    { label: "Completed", count: s.checkedOut, color: "text-gray-700", bg: "bg-gray-50" },
    { label: "Absent (confirmed)", count: s.absent, color: "text-red-600", bg: "bg-red-50" },
    { label: "Holiday", count: s.holiday, color: "text-blue-600", bg: "bg-blue-50" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm text-muted-foreground">
            {new Date(data.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xl">
            Absent applies only after the shift ends with no check-in. Before that, you’ll see upcoming, awaiting check-in, or late / no arrival.
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[11px] text-muted-foreground">
            {dataUpdatedAt > 0 ? (
              <span>
                Last updated:{" "}
                <time dateTime={new Date(dataUpdatedAt).toISOString()}>
                  {new Date(dataUpdatedAt).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </time>
              </span>
            ) : null}
            {dataUpdatedAt > 0 ? <span className="hidden sm:inline" aria-hidden>·</span> : null}
            <span>Auto-refresh every 60s</span>
            {isFetching && !isLoading ? (
              <span className="inline-flex items-center gap-1 text-primary font-medium">
                <RefreshCw className="h-3 w-3 animate-spin shrink-0" aria-hidden />
                Syncing…
              </span>
            ) : null}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {stats.map((st) => (
          <div key={st.label} className={`rounded-lg p-3 ${st.bg}`}>
            <div className={`text-xl font-bold ${st.color}`}>{st.count}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{st.label}</div>
          </div>
        ))}
      </div>
      <OverdueCheckoutsPanel className="mt-2" />
      {(data.fullDaySummaries ?? []).length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">Full day — same person, multiple shifts (Asia/Muscat)</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            One calendar day can include a morning block and an evening block. The table below is still <span className="font-medium text-foreground">per shift</span> for status. If one session runs into the next shift without a separate checkout for the first block, that row stays <span className="font-medium text-foreground">open</span> (not “Completed”): status still reflects <span className="font-medium text-foreground">real check‑in punctuality</span>, and duration is minutes <span className="font-medium text-foreground">inside this shift window</span> only (see open session note). Split into two clock rows when possible.
          </p>
          <ul className="space-y-2 text-sm">
            {(data.fullDaySummaries ?? []).map((fd) => (
              <li key={fd.employeeId} className="rounded-md bg-background/80 border px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{fd.employeeDisplayName}</span>
                  <span className="text-xs text-muted-foreground">({fd.shiftCount} shifts)</span>
                  {fd.dayFullyComplete ? (
                    <Badge variant="outline" className="border-emerald-300 text-emerald-800 bg-emerald-50 text-[10px]">
                      Day complete
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-300 text-amber-900 bg-amber-50 text-[10px]">
                      In progress
                    </Badge>
                  )}
                  <span className="w-full basis-full text-xs text-muted-foreground leading-snug">
                    {fd.shiftsCheckedOutCount}/{fd.shiftCount} shifts completed
                    {fd.totalAttributedMinutes > 0 ? (
                      <> · {fd.totalAttributedMinutes}m attributed (minutes clamped to each shift window)</>
                    ) : null}
                    {fd.shiftsCheckedOutCount < fd.shiftCount ? (
                      <> · open or upcoming shifts show 0m until check-in.</>
                    ) : null}
                  </span>
                </div>
                <ol className="mt-1.5 space-y-2 text-xs text-foreground/90 list-decimal list-outside ml-4 pl-1">
                  {fd.segments.map((seg) => {
                    const st = getAdminBoardRowStatusPresentation(seg.status);
                    return (
                      <li key={seg.scheduleId}>
                        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span className="font-medium">{seg.shiftName ?? "Shift"}</span>
                          <span className="text-muted-foreground">({seg.expectedStart}–{seg.expectedEnd})</span>
                          <Badge variant="outline" className={`text-[10px] py-0 h-5 shrink-0 ${st.className}`}>
                            {st.label}
                          </Badge>
                        </span>
                        <span className="block mt-0.5 text-foreground/90">
                          <span className="text-muted-foreground">In → out: </span>
                          <span>{seg.checkInAt ? fmtTime(seg.checkInAt) : "—"}</span>
                          <span> → </span>
                          <span>{seg.checkOutAt ? fmtTime(seg.checkOutAt) : "—"}</span>
                          {!seg.checkOutAt && seg.punchCheckOutAt ? (
                            <span className="text-muted-foreground">
                              {" "}
                              (open session to {fmtTime(seg.punchCheckOutAt)})
                            </span>
                          ) : seg.checkOutAt &&
                            seg.punchCheckOutAt &&
                            new Date(seg.punchCheckOutAt).getTime() !== new Date(seg.checkOutAt).getTime() ? (
                            <span className="text-muted-foreground">
                              {" "}
                              (session to {fmtTime(seg.punchCheckOutAt)})
                            </span>
                          ) : null}
                          {seg.durationMinutes != null && seg.checkInAt ? (
                            <span className="text-muted-foreground"> ({seg.durationMinutes}m)</span>
                          ) : null}
                          {seg.methodLabel ? (
                            <span className="text-muted-foreground"> · {seg.methodLabel}</span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium">Employee</th>
              <th className="text-left px-3 py-2.5 font-medium">Site</th>
              <th className="text-left px-3 py-2.5 font-medium">Shift</th>
              <th className="text-left px-3 py-2.5 font-medium">Check in</th>
              <th className="text-left px-3 py-2.5 font-medium">Check out</th>
              <th className="text-left px-3 py-2.5 font-medium">Delay</th>
              <th className="text-left px-3 py-2.5 font-medium">Worked</th>
              <th className="text-left px-3 py-2.5 font-medium">Source</th>
              <th className="text-left px-3 py-2.5 font-medium">Risk</th>
              <th className="text-left px-3 py-2.5 font-medium">Payroll</th>
              <th className="text-left px-3 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.board.map((row: any) => (
              <tr key={row.scheduleId} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2.5">
                  <div className="font-medium">{row.employeeDisplayName ?? row.employee?.name ?? `Schedule #${row.scheduleId}`}</div>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[140px] truncate" title={row.siteName ?? ""}>
                  {row.siteName ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground text-xs">
                  {row.shift ? (row.shift as { name?: string | null }).name ?? "—" : "—"}
                  {row.expectedStart && row.expectedEnd ? (
                    <div className="text-[11px]">{row.expectedStart}–{row.expectedEnd}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{row.checkInAt ? fmtTime(row.checkInAt) : "—"}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {row.checkOutAt ? fmtTime(row.checkOutAt) : "—"}
                  {!row.checkOutAt && row.punchCheckOutAt ? (
                    <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      Open session to {fmtTime(row.punchCheckOutAt)}
                    </div>
                  ) : row.checkOutAt &&
                    row.punchCheckOutAt &&
                    new Date(row.punchCheckOutAt).getTime() !== new Date(row.checkOutAt).getTime() ? (
                    <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      Session to {fmtTime(row.punchCheckOutAt)}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  {row.delayMinutes != null && row.delayMinutes > 0 ? `${row.delayMinutes}m` : "—"}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  {row.durationMinutes != null && row.checkInAt ? `${row.durationMinutes}m` : "—"}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.methodLabel ?? "—"}</td>
                <td className="px-3 py-2.5">
                  {row.riskLevel ? (
                    <Badge
                      variant="outline"
                      className={
                        row.riskLevel === "critical"
                          ? "text-[10px] border-red-300 bg-red-50 text-red-800"
                          : row.riskLevel === "warning"
                            ? "text-[10px] border-amber-300 bg-amber-50 text-amber-900"
                            : "text-[10px]"
                      }
                    >
                      {row.riskLevel}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2.5 text-[11px] text-muted-foreground capitalize">
                  {row.payrollHints?.payrollImpact
                    ? String(row.payrollHints.payrollImpact).replace(/_/g, " ")
                    : "—"}
                </td>
                <td className="px-3 py-2.5">{boardStatusBadge(row.status)}</td>
              </tr>
            ))}
            {data.board.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                  No employees scheduled today — assign schedules in Employee schedules, then refresh.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Correction Requests ──────────────────────────────────────────────────────
function CorrectionRequests({ companyId }: { companyId: number | null }) {
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [reviewTarget, setReviewTarget] = useState<{ id: number; action: "approve" | "reject" } | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const utils = trpc.useUtils();
  const { data, isLoading, refetch } = trpc.attendance.listCorrections.useQuery(
    { companyId: companyId ?? undefined, status: statusFilter },
    { enabled: companyId != null },
  );
  const approveMut = trpc.attendance.approveCorrection.useMutation({
    onSuccess: () => {
      toast.success("Correction approved");
      setReviewTarget(null);
      void refetch();
      void utils.attendance.listCorrections.invalidate();
      void utils.scheduling.getTodayBoard.invalidate();
      void utils.scheduling.getOverdueCheckouts.invalidate();
      void utils.hr.listAttendance.invalidate();
      void utils.hr.attendanceStats.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const rejectMut = trpc.attendance.rejectCorrection.useMutation({
    onSuccess: () => {
      toast.success("Correction rejected");
      setReviewTarget(null);
      void refetch();
      void utils.attendance.listCorrections.invalidate();
      void utils.scheduling.getTodayBoard.invalidate();
      void utils.scheduling.getOverdueCheckouts.invalidate();
      void utils.hr.listAttendance.invalidate();
      void utils.hr.attendanceStats.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const handleSubmit = () => {
    if (!reviewTarget || companyId == null) return;
    if (reviewTarget.action === "approve") {
      approveMut.mutate({ companyId, correctionId: reviewTarget.id, adminNote: adminNote || undefined });
    } else {
      if (!adminNote.trim() || adminNote.trim().length < 5) { toast.error("Please provide a reason for rejection"); return; }
      rejectMut.mutate({ companyId, correctionId: reviewTarget.id, adminNote });
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh</Button>
      </div>
      {companyId == null ? (
        <div className="py-12 text-center text-muted-foreground">Select a company to review correction requests.</div>
      ) : isLoading ? <div className="py-12 text-center text-muted-foreground">Loading…</div> : (
        <div className="space-y-3">
          {(data ?? []).map(({ correction, employee }) => (
            <Card key={correction.id}><CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{employee ? `${employee.firstName} ${employee.lastName}` : "Unknown"}</span>
                    {employee?.position && <span className="text-xs text-muted-foreground">{employee.position}</span>}
                    {correction.status === "pending" ? <Badge variant="outline" className="border-yellow-300 text-yellow-700 bg-yellow-50">Pending</Badge>
                      : correction.status === "approved" ? <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50">Approved</Badge>
                      : <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">Rejected</Badge>}
                  </div>
                  <div className="mt-1.5 text-sm text-muted-foreground space-y-0.5">
                    <div><span className="font-medium text-foreground">Date:</span> {correction.requestedDate}{correction.requestedCheckIn && <span className="ml-3"><span className="font-medium text-foreground">In:</span> {correction.requestedCheckIn.slice(0, 5)}</span>}{correction.requestedCheckOut && <span className="ml-3"><span className="font-medium text-foreground">Out:</span> {correction.requestedCheckOut.slice(0, 5)}</span>}</div>
                    <div><span className="font-medium text-foreground">Reason:</span> {correction.reason}</div>
                    {correction.adminNote && <div><span className="font-medium text-foreground">Note:</span> {correction.adminNote}</div>}
                  </div>
                </div>
                {correction.status === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50" onClick={() => { setReviewTarget({ id: correction.id, action: "approve" }); setAdminNote(""); }}><CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve</Button>
                    <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => { setReviewTarget({ id: correction.id, action: "reject" }); setAdminNote(""); }}><XCircle className="h-3.5 w-3.5 mr-1" /> Reject</Button>
                  </div>
                )}
              </div>
            </CardContent></Card>
          ))}
          {(data ?? []).length === 0 && <div className="py-12 text-center text-muted-foreground">No {statusFilter === "all" ? "" : statusFilter} correction requests</div>}
        </div>
      )}
      <Dialog open={!!reviewTarget} onOpenChange={() => setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{reviewTarget?.action === "approve" ? "Approve Correction" : "Reject Correction"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="adminNoteCorr">{reviewTarget?.action === "approve" ? "Admin Note (optional)" : "Reason for rejection (required)"}</Label>
            <Textarea id="adminNoteCorr" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder={reviewTarget?.action === "approve" ? "Optional note…" : "Explain why…"} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={approveMut.isPending || rejectMut.isPending} className={reviewTarget?.action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}>{reviewTarget?.action === "approve" ? "Approve" : "Reject"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Manual Check-in Requests ─────────────────────────────────────────────────
function ManualCheckInRequests({ companyId }: { companyId: number | null }) {
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [reviewTarget, setReviewTarget] = useState<{ id: number; action: "approve" | "reject" } | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const utils = trpc.useUtils();
  const { data, isLoading, refetch } = trpc.attendance.listManualCheckIns.useQuery(
    { companyId: companyId ?? undefined, status: statusFilter },
    { enabled: companyId != null },
  );
  const approveMut = trpc.attendance.approveManualCheckIn.useMutation({
    onSuccess: () => {
      toast.success("Check-in approved");
      setReviewTarget(null);
      void refetch();
      void utils.attendance.listManualCheckIns.invalidate();
      void utils.scheduling.getTodayBoard.invalidate();
      void utils.scheduling.getOverdueCheckouts.invalidate();
      void utils.hr.listAttendance.invalidate();
      void utils.hr.attendanceStats.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const rejectMut = trpc.attendance.rejectManualCheckIn.useMutation({
    onSuccess: () => {
      toast.success("Check-in rejected");
      setReviewTarget(null);
      void refetch();
      void utils.attendance.listManualCheckIns.invalidate();
      void utils.scheduling.getTodayBoard.invalidate();
      void utils.scheduling.getOverdueCheckouts.invalidate();
      void utils.hr.listAttendance.invalidate();
      void utils.hr.attendanceStats.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const handleSubmit = () => {
    if (!reviewTarget || companyId == null) return;
    if (reviewTarget.action === "approve") {
      approveMut.mutate({ companyId, requestId: reviewTarget.id, adminNote: adminNote || undefined });
    } else {
      if (!adminNote.trim() || adminNote.trim().length < 5) { toast.error("Please provide a reason"); return; }
      rejectMut.mutate({ companyId, requestId: reviewTarget.id, adminNote });
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh</Button>
      </div>
      {companyId == null ? (
        <div className="py-12 text-center text-muted-foreground">Select a company to review manual check-in requests.</div>
      ) : isLoading ? <div className="py-12 text-center text-muted-foreground">Loading…</div> : (
        <div className="space-y-3">
          {(data ?? []).map(({ req, site, employee }) => (
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
                    {req.status === "pending" ? <Badge variant="outline" className="border-yellow-300 text-yellow-700 bg-yellow-50">Pending</Badge>
                      : req.status === "approved" ? <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50">Approved</Badge>
                      : <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">Rejected</Badge>}
                  </div>
                  <div className="mt-1.5 text-sm text-muted-foreground space-y-0.5">
                    <div><span className="font-medium text-foreground">Justification:</span> {req.justification}</div>
                    {req.adminNote && <div><span className="font-medium text-foreground">Admin Note:</span> {req.adminNote}</div>}
                    <div className="text-xs">{req.requestedAt ? new Date(req.requestedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : ""}</div>
                  </div>
                </div>
                {req.status === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50" onClick={() => { setReviewTarget({ id: req.id, action: "approve" }); setAdminNote(""); }}><CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve</Button>
                    <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => { setReviewTarget({ id: req.id, action: "reject" }); setAdminNote(""); }}><XCircle className="h-3.5 w-3.5 mr-1" /> Reject</Button>
                  </div>
                )}
              </div>
            </CardContent></Card>
          ))}
          {(data ?? []).length === 0 && <div className="py-12 text-center text-muted-foreground">No {statusFilter === "all" ? "" : statusFilter} manual check-in requests</div>}
        </div>
      )}
      <Dialog open={!!reviewTarget} onOpenChange={() => setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{reviewTarget?.action === "approve" ? "Approve Manual Check-in" : "Reject Manual Check-in"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="adminNoteManual">{reviewTarget?.action === "approve" ? "Admin Note (optional)" : "Reason for rejection (required)"}</Label>
            <Textarea id="adminNoteManual" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder={reviewTarget?.action === "approve" ? "Optional note…" : "Explain why…"} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={approveMut.isPending || rejectMut.isPending} className={reviewTarget?.action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}>{reviewTarget?.action === "approve" ? "Approve" : "Reject"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function HRAttendancePage() {
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [attendanceTab, setAttendanceTab] = useState("today");
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [deptFilter, setDeptFilter] = useState("all");

  const utils = trpc.useUtils();
  const { activeCompanyId } = useActiveCompany();
  const { forceCheckout, setIssueStatus, isPending: operationalPending } =
    useAttendanceOperationalMutations(activeCompanyId);
  const { user: authUser } = useAuth();
  const [forceDialogRecordId, setForceDialogRecordId] = useState<number | null>(null);
  const [forceDialogReason, setForceDialogReason] = useState("");
  const [triageAckItem, setTriageAckItem] = useState<OperationalExceptionItem | null>(null);
  const [triageAckNote, setTriageAckNote] = useState("");
  const [triageResolveItem, setTriageResolveItem] = useState<OperationalExceptionItem | null>(null);
  const [triageResolveNote, setTriageResolveNote] = useState("");
  const [triageAssignItem, setTriageAssignItem] = useState<OperationalExceptionItem | null>(null);
  const [triageAssignUserId, setTriageAssignUserId] = useState<string>("");
  const [triageAssignNote, setTriageAssignNote] = useState("");
  const [queueFilter, setQueueFilter] = useState<OperationalQueueFilter>("unresolved");

  const { data: employees } = trpc.hr.listEmployees.useQuery({ department: deptFilter !== "all" ? deptFilter : undefined, status: "active", companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: attendance, refetch } = trpc.hr.listAttendance.useQuery({ month: monthFilter, companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: stats } = trpc.hr.attendanceStats.useQuery({ month: monthFilter, companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });

  const deleteMutation = trpc.hr.deleteAttendance.useMutation({
    onSuccess: () => {
      toast.success("Record deleted");
      setDeleteTargetId(null);
      utils.hr.listAttendance.invalidate();
      utils.hr.attendanceStats.invalidate();
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
    for (const e of employees ?? []) {
      m.set(e.id, { firstName: e.firstName, lastName: e.lastName });
    }
    return m;
  }, [employees]);

  const { data: todayBoardData } = trpc.scheduling.getTodayBoard.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null, refetchInterval: 60_000 },
  );
  const { data: overdueCheckoutData } = trpc.scheduling.getOverdueCheckouts.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null, refetchInterval: 60_000 },
  );
  const overdueCheckoutCount = todayBoardData?.summary?.overdueOpenCheckoutCount ?? 0;

  const total = (stats?.present ?? 0) + (stats?.absent ?? 0) + (stats?.late ?? 0) + (stats?.half_day ?? 0) + (stats?.remote ?? 0);
  const rate = total > 0 ? Math.round(((stats?.present ?? 0) / total) * 100) : 0;

  const businessYmd = muscatCalendarYmdNow();
  const today = businessYmd;
  const todayRecords = (attendance ?? []).filter((r) => {
    const d = r.date ? new Date(r.date).toISOString().split("T")[0] : "";
    return d === today;
  });

  const { data: pendingCorrections } = trpc.attendance.listCorrections.useQuery(
    { companyId: activeCompanyId ?? undefined, status: "pending", limit: 200 },
    { enabled: activeCompanyId != null },
  );
  const { data: pendingManual } = trpc.attendance.listManualCheckIns.useQuery(
    { companyId: activeCompanyId ?? undefined, status: "pending", limit: 200 },
    { enabled: activeCompanyId != null },
  );
  const pendingCorrCount = (pendingCorrections ?? []).length;
  const pendingManualCount = (pendingManual ?? []).length;
  const pendingCorrDot = pendingCorrCount > 0;
  const pendingManualDot = pendingManualCount > 0;

  const issueKeys = useMemo(
    () =>
      collectOperationalIssueKeysForQueue({
        businessDateYmd: businessYmd,
        boardRows: (todayBoardData?.board ?? []).map((b) => ({ status: b.status, scheduleId: b.scheduleId })),
        overdueCheckouts: (overdueCheckoutData?.overdueEmployees ?? []).map((o) => ({
          attendanceRecordId: o.attendanceRecordId,
        })),
        pendingCorrections: (pendingCorrections ?? []).map((r) => ({ id: r.correction.id })),
        pendingManual: (pendingManual ?? []).map((r) => ({ id: r.req.id })),
      }),
    [businessYmd, todayBoardData?.board, overdueCheckoutData?.overdueEmployees, pendingCorrections, pendingManual],
  );

  const { data: issueRows } = trpc.attendance.listOperationalIssuesByIssueKeys.useQuery(
    { companyId: activeCompanyId ?? undefined, issueKeys },
    { enabled: activeCompanyId != null && issueKeys.length > 0 },
  );

  const issuesByKey = useMemo(() => {
    const m: Record<string, OperationalIssueLite> = {};
    for (const r of issueRows ?? []) {
      m[r.issueKey] = {
        status: r.status,
        assignedToUserId: r.assignedToUserId,
        acknowledgedByUserId: r.acknowledgedByUserId,
        reviewedByUserId: r.reviewedByUserId,
        reviewedAt: r.reviewedAt,
        resolutionNote: r.resolutionNote,
      };
    }
    return m;
  }, [issueRows]);

  const assigneeNameByUserId = useMemo(() => {
    const m: Record<number, string> = {};
    for (const e of employees ?? []) {
      if (e.userId != null) {
        m[e.userId] = `${e.firstName} ${e.lastName}`.trim();
      }
    }
    if (authUser?.id != null) {
      m[authUser.id] = authUser.name?.trim() || m[authUser.id] || `User #${authUser.id}`;
    }
    return m;
  }, [employees, authUser]);

  const actionQueueItemsRaw = useMemo(
    () =>
      buildOperationalActionQueue({
        businessDateYmd: businessYmd,
        boardRows: (todayBoardData?.board ?? []).map((b) => ({
          status: b.status,
          scheduleId: b.scheduleId,
          employeeDisplayName: b.employeeDisplayName,
          attendanceRecordId: b.attendanceRecordId,
          expectedStart: b.expectedStart,
          expectedEnd: b.expectedEnd,
          siteName: b.siteName,
        })),
        overdueCheckouts: overdueCheckoutData?.overdueEmployees ?? [],
        pendingCorrections: (pendingCorrections ?? []).map((r) => ({
          id: r.correction.id,
          employeeLabel:
            `${r.employee?.firstName ?? ""} ${r.employee?.lastName ?? ""}`.trim() ||
            `Employee #${r.correction.employeeId}`,
          businessDateYmd: r.correction.requestedDate,
        })),
        pendingManual: (pendingManual ?? []).map((r) => ({
          id: r.req.id,
          employeeLabel:
            `${r.employee?.firstName ?? ""} ${r.employee?.lastName ?? ""}`.trim() || `User #${r.req.employeeUserId}`,
          businessDateYmd:
            r.req.requestedBusinessDate ?? muscatCalendarYmdFromUtcInstant(r.req.requestedAt),
        })),
        issuesByKey,
        limit: 32,
      }),
    [
      businessYmd,
      todayBoardData?.board,
      overdueCheckoutData?.overdueEmployees,
      pendingCorrections,
      pendingManual,
      issuesByKey,
    ],
  );

  const actionQueueItems = useMemo(
    () => filterOperationalQueueItems(actionQueueItemsRaw, queueFilter, authUser?.id ?? null),
    [actionQueueItemsRaw, queueFilter, authUser?.id],
  );

  const handleQueueAction = useCallback((action: AttendanceActionId, item: OperationalExceptionItem) => {
    if (action === ATTENDANCE_ACTION.OPEN_CORRECTIONS) setAttendanceTab("corrections");
    else if (action === ATTENDANCE_ACTION.OPEN_MANUAL_CHECKINS) setAttendanceTab("manual");
    else if (action === ATTENDANCE_ACTION.VIEW_TODAY_BOARD) setAttendanceTab("today");
    else if (action === ATTENDANCE_ACTION.SEND_OVERDUE_REMINDER) {
      document.getElementById("attendance-overdue-checkouts")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (action === ATTENDANCE_ACTION.FORCE_CHECKOUT_OPEN) {
      const id = item.attendanceRecordId;
      if (id != null) {
        setForceDialogRecordId(id);
        setForceDialogReason("");
      }
    } else if (action === ATTENDANCE_ACTION.ACKNOWLEDGE_OPERATIONAL_ISSUE) {
      setTriageAckItem(item);
      setTriageAckNote("");
    } else if (action === ATTENDANCE_ACTION.RESOLVE_OPERATIONAL_ISSUE) {
      setTriageResolveItem(item);
      setTriageResolveNote("");
    } else if (action === ATTENDANCE_ACTION.ASSIGN_OPERATIONAL_ISSUE) {
      setTriageAssignItem(item);
      setTriageAssignUserId(authUser?.id != null ? String(authUser.id) : "");
      setTriageAssignNote("");
    }
  }, [authUser?.id]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock size={24} className="text-[var(--smartpro-orange)]" />
            Attendance Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Operational control center — live workforce state, approvals, and legacy HR grid in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={() => toast.info("Export feature coming soon")}>
            <Download size={14} /> Export
          </Button>
          <ClockInDialog employees={(employees ?? []).map(e => ({ ...e, department: e.department ?? null }))} onSuccess={refetch} companyId={activeCompanyId} />
        </div>
      </div>

      <HrAttendanceExceptionStrip
        companyId={activeCompanyId}
        pendingCorrCount={pendingCorrCount}
        pendingManualCount={pendingManualCount}
        scheduledShiftsToday={todayBoardData?.summary?.total ?? null}
        overdueCheckoutCount={overdueCheckoutCount}
        missedShiftsCount={todayBoardData?.summary?.absent ?? 0}
        criticalExceptions={todayBoardData?.summary?.criticalExceptions ?? null}
        needsAttention={todayBoardData?.summary?.needsAttention ?? null}
      />

      {activeCompanyId != null ? (
        <AttendanceActionQueue
          items={actionQueueItems}
          filter={queueFilter}
          onFilterChange={setQueueFilter}
          assigneeNameByUserId={assigneeNameByUserId}
          onAction={(a, item) => handleQueueAction(a, item)}
        />
      ) : null}

      {/* Tabs: Live today | HR Records | Corrections | Manual Check-ins | Audit Log */}
      <Tabs value={attendanceTab} onValueChange={setAttendanceTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="today" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Live today</TabsTrigger>
          <TabsTrigger value="records" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> HR Records</TabsTrigger>
          <TabsTrigger value="corrections" className="gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Corrections{pendingCorrDot && <span className="ml-1 h-2 w-2 rounded-full bg-red-500 inline-block" />}</TabsTrigger>
          <TabsTrigger value="manual" className="gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Manual Check-ins{pendingManualDot && <span className="ml-1 h-2 w-2 rounded-full bg-red-500 inline-block" />}</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5"><ScrollText className="h-3.5 w-3.5" /> Audit Log</TabsTrigger>
        </TabsList>
        <TabsContent value="today" className="mt-4"><TodayBoard companyId={activeCompanyId} /></TabsContent>
        <TabsContent value="corrections" className="mt-4"><CorrectionRequests companyId={activeCompanyId} /></TabsContent>
        <TabsContent value="manual" className="mt-4"><ManualCheckInRequests companyId={activeCompanyId} /></TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AttendanceAuditLog
            enabled={attendanceTab === "audit" && activeCompanyId != null}
            companyId={activeCompanyId}
            employees={(employees ?? []).map((e) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName }))}
          />
        </TabsContent>
        <TabsContent value="records" className="mt-4">

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Present", value: stats?.present ?? 0, icon: <CheckCircle2 size={18} />, color: "text-green-600 bg-green-50" },
          { label: "Absent", value: stats?.absent ?? 0, icon: <XCircle size={18} />, color: "text-red-600 bg-red-50" },
          { label: "Late", value: stats?.late ?? 0, icon: <AlertCircle size={18} />, color: "text-amber-600 bg-amber-50" },
          { label: "Remote", value: stats?.remote ?? 0, icon: <Calendar size={18} />, color: "text-purple-600 bg-purple-50" },
          { label: "Attendance Rate", value: `${rate}%`, icon: <TrendingUp size={18} />, color: "text-blue-600 bg-blue-50" },
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
          <Label className="text-xs text-muted-foreground">Month</Label>
          <Input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="h-8 text-sm w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Department</Label>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-8 text-sm w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Chart — real DB data */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Weekly Attendance — {monthFilter}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.byDay && stats.byDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.byDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="present" fill="#22c55e" name="Present" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="late" fill="#f59e0b" name="Late" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="absent" fill="#ef4444" name="Absent" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Calendar size={32} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No attendance data for this period</p>
                  <p className="text-xs mt-1">Record attendance to see the chart</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock size={14} /> Today&apos;s HR attendance
              <Badge variant="outline" className="text-xs ml-auto">{todayRecords.length} records</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
              Legacy HR grid for today. Live punches appear on Today&apos;s Board and in employee records.
            </p>
            {todayRecords.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No HR grid rows for today</p>
                <p className="text-xs mt-1">Use Record Attendance to add entries, or rely on self check-in and corrections.</p>
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
                          return e ? `${e.firstName} ${e.lastName}`.trim() : `Employee #${r.employeeId}`;
                        })()}
                      </span>
                    </div>
                    <Badge className={`text-xs ${statusColors[r.status ?? "present"] ?? ""}`}>
                      {r.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full Attendance Table with Edit/Delete */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users size={14} /> Attendance Records — {monthFilter}
            <span className="ml-auto text-xs text-muted-foreground font-normal">{(attendance ?? []).length} records</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!attendance || attendance.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock size={40} className="mx-auto mb-3 opacity-20" />
              <p className="font-medium">No attendance records found</p>
              <p className="text-sm mt-1">Start recording attendance using the button above</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th scope="col" className="text-left py-2 px-3 font-medium">Employee</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Date</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Check In</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Check Out</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Hours</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Status</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Notes</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Actions</th>
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
                            return e ? `${e.firstName} ${e.lastName}`.trim() : `Employee #${r.employeeId}`;
                          })()}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {r.date ? fmtDateLong(r.date) : "—"}
                        </td>
                        <td className="py-2 px-3">{checkIn ? checkIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="py-2 px-3">{checkOut ? checkOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="py-2 px-3">{hours !== "—" ? `${hours}h` : "—"}</td>
                        <td className="py-2 px-3">
                          <Badge className={`text-xs ${statusColors[r.status ?? "present"] ?? ""}`}>
                            {r.status ?? "present"}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs max-w-[120px] truncate">{r.notes ?? "—"}</td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1">
                            <EditAttendanceDialog
                              record={{ id: r.id, status: r.status ?? "present", notes: r.notes ?? null }}
                              onSuccess={refetch}
                            />
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                              disabled={deleteMutation.isPending}
                              onClick={() => setDeleteTargetId(r.id)}
                              aria-label="Delete attendance record">
                              <Trash2 size={12} />
                            </Button>
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

        </TabsContent>
      </Tabs>

      <Dialog open={forceDialogRecordId != null} onOpenChange={(o) => !o && setForceDialogRecordId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Force checkout</DialogTitle>
            <DialogDescription>
              This closes the open attendance punch at the current time (Asia/Muscat wall clock). Checkout-at-shift-end is
              not offered here yet — it needs explicit payroll policy review before we stamp a synthetic end time. The
              employee is notified implicitly via their record; a full audit entry is stored.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="force-reason">Reason (required, min. 10 characters)</Label>
            <Textarea
              id="force-reason"
              value={forceDialogReason}
              onChange={(e) => setForceDialogReason(e.target.value)}
              rows={4}
              placeholder="Why you are closing this session (compliance)…"
              className="text-sm"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setForceDialogRecordId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={forceDialogReason.trim().length < 10 || operationalPending || activeCompanyId == null}
              onClick={async () => {
                if (forceDialogRecordId == null || activeCompanyId == null) return;
                try {
                  await forceCheckout.mutateAsync({
                    companyId: activeCompanyId,
                    attendanceRecordId: forceDialogRecordId,
                    reason: forceDialogReason.trim(),
                  });
                  setForceDialogRecordId(null);
                } catch {
                  /* toast via mutation */
                }
              }}
            >
              Confirm force checkout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={triageAckItem != null} onOpenChange={(o) => !o && setTriageAckItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Acknowledge issue</DialogTitle>
            <DialogDescription>
              Marks this operational issue as acknowledged so the team knows it was triaged (does not approve requests or
              close punches by itself).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ack-note">Note (optional)</Label>
            <Textarea
              id="ack-note"
              value={triageAckNote}
              onChange={(e) => setTriageAckNote(e.target.value)}
              rows={3}
              className="text-sm"
              placeholder="Who is handling this, or context…"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setTriageAckItem(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={operationalPending || triageAckItem?.triage == null || activeCompanyId == null}
              onClick={async () => {
                const item = triageAckItem;
                if (item?.triage == null || activeCompanyId == null) return;
                try {
                  await setIssueStatus.mutateAsync({
                    companyId: activeCompanyId,
                    businessDateYmd: item.triage.businessDateYmd,
                    kind: item.triage.kind,
                    attendanceRecordId: item.triage.attendanceRecordId,
                    scheduleId: item.triage.scheduleId,
                    correctionId: item.triage.correctionId,
                    manualCheckinRequestId: item.triage.manualCheckinRequestId,
                    action: "acknowledge",
                    note: triageAckNote.trim() || undefined,
                  });
                  setTriageAckItem(null);
                } catch {
                  /* toast via mutation */
                }
              }}
            >
              Acknowledge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={triageResolveItem != null} onOpenChange={(o) => !o && setTriageResolveItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve issue</DialogTitle>
            <DialogDescription>
              Records resolution in the operational issue log (min. 3 characters). Use this when no further action is
              needed on the triage row.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="resolve-note">Resolution note</Label>
            <Textarea
              id="resolve-note"
              value={triageResolveNote}
              onChange={(e) => setTriageResolveNote(e.target.value)}
              rows={4}
              className="text-sm"
              placeholder="What was decided or done…"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setTriageResolveItem(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                operationalPending ||
                triageResolveItem?.triage == null ||
                activeCompanyId == null ||
                triageResolveNote.trim().length < 3
              }
              onClick={async () => {
                const item = triageResolveItem;
                if (item?.triage == null || activeCompanyId == null) return;
                try {
                  await setIssueStatus.mutateAsync({
                    companyId: activeCompanyId,
                    businessDateYmd: item.triage.businessDateYmd,
                    kind: item.triage.kind,
                    attendanceRecordId: item.triage.attendanceRecordId,
                    scheduleId: item.triage.scheduleId,
                    correctionId: item.triage.correctionId,
                    manualCheckinRequestId: item.triage.manualCheckinRequestId,
                    action: "resolve",
                    note: triageResolveNote.trim(),
                  });
                  setTriageResolveItem(null);
                } catch {
                  /* toast via mutation */
                }
              }}
            >
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={triageAssignItem != null} onOpenChange={(o) => !o && setTriageAssignItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign issue</DialogTitle>
            <DialogDescription>
              Sends ownership to a user for follow-up. Optional note is stored on the assignment audit entry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Assignee</Label>
              <Select value={triageAssignUserId} onValueChange={setTriageAssignUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {authUser?.id != null ? (
                    <SelectItem value={String(authUser.id)}>Me ({authUser.name ?? `User #${authUser.id}`})</SelectItem>
                  ) : null}
                  {(employees ?? [])
                    .filter((e) => e.userId != null && e.userId !== authUser?.id)
                    .map((e) => (
                      <SelectItem key={e.id} value={String(e.userId)}>
                        {`${e.firstName} ${e.lastName}`.trim()}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="assign-note">Note (optional)</Label>
              <Textarea
                id="assign-note"
                value={triageAssignNote}
                onChange={(e) => setTriageAssignNote(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setTriageAssignItem(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                operationalPending ||
                triageAssignItem?.triage == null ||
                activeCompanyId == null ||
                !triageAssignUserId
              }
              onClick={async () => {
                const item = triageAssignItem;
                const uid = parseInt(triageAssignUserId, 10);
                if (item?.triage == null || activeCompanyId == null || !Number.isFinite(uid) || uid <= 0) return;
                try {
                  await setIssueStatus.mutateAsync({
                    companyId: activeCompanyId,
                    businessDateYmd: item.triage.businessDateYmd,
                    kind: item.triage.kind,
                    attendanceRecordId: item.triage.attendanceRecordId,
                    scheduleId: item.triage.scheduleId,
                    correctionId: item.triage.correctionId,
                    manualCheckinRequestId: item.triage.manualCheckinRequestId,
                    action: "assign",
                    assignedToUserId: uid,
                    note: triageAssignNote.trim() || undefined,
                  });
                  setTriageAssignItem(null);
                } catch {
                  /* toast via mutation */
                }
              }}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTargetId != null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete HR attendance row?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the legacy HR attendance record. Self-service clock rows and audit history are unchanged. This action is logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              onClick={() => {
                if (deleteTargetId != null) deleteMutation.mutate({ id: deleteTargetId });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
