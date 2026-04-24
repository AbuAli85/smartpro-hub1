import { trpc } from "@/lib/trpc";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { OverdueCheckoutsPanel } from "@/components/attendance/OverdueCheckoutsPanel";
import { AttendanceActionQueue } from "@/components/attendance/AttendanceActionQueue";
import { AttendanceSetupHealthBanner } from "@/components/attendance/AttendanceSetupHealthBanner";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import {
  Clock, Users, CheckCircle2, XCircle, AlertCircle, Calendar,
  TrendingUp, Download, Pencil, Trash2, CheckCircle, RefreshCw,
  ClipboardList, CalendarDays, ScrollText, MapPin,
} from "lucide-react";
import * as ExcelJS from "exceljs";
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
import { OPERATIONAL_TRIAGE_AUDIT_LABELS } from "@shared/attendanceOperationalAuditPresentation";
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
import { isWeakAuditReason } from "@shared/attendanceManualValidation";
import { DUPLICATE_MANUAL_ATTENDANCE, INVALID_ATTENDANCE_TIME_RANGE, WEAK_AUDIT_REASON } from "@shared/attendanceTrpcReasons";
import { useAttendanceOperationalMutations } from "@/hooks/useAttendanceOperationalMutations";
import { useMyCapabilities } from "@/hooks/useMyCapabilities";
import { useAuth } from "@/_core/hooks/useAuth";
import { operationalIssueKey } from "@shared/attendanceOperationalIssueKeys";
import { buildAttendanceActionItems, sortAttendanceActionItems } from "@shared/attendanceActionQueue";
import type { AttendanceActionQueueCategory, AttendanceActionQueueItem } from "@shared/attendanceActionQueue";
import { OperationalIssueMetaStrip } from "@/components/attendance/OperationalIssueMetaStrip";
import { OperationalIssueHistorySheet } from "@/components/attendance/OperationalIssueHistorySheet";
// Audit action labels are resolved with t() at render time via attendanceAuditActionLabel()
// Keeping static fallback map for non-i18n contexts (e.g. data exports)
const AUDIT_ACTION_LABELS_STATIC: Record<string, string> = {
  ...OPERATIONAL_TRIAGE_AUDIT_LABELS,
  [ATTENDANCE_AUDIT_ACTION.HR_ATTENDANCE_CREATE]: "HR attendance ? created",
  [ATTENDANCE_AUDIT_ACTION.HR_ATTENDANCE_UPDATE]: "HR attendance ? updated",
  [ATTENDANCE_AUDIT_ACTION.HR_ATTENDANCE_DELETE]: "HR attendance ? deleted",
  [ATTENDANCE_AUDIT_ACTION.CORRECTION_APPROVE]: "Correction ? approved",
  [ATTENDANCE_AUDIT_ACTION.CORRECTION_REJECT]: "Correction ? rejected",
  [ATTENDANCE_AUDIT_ACTION.CORRECTION_SUBMITTED]: "Correction ? submitted",
  [ATTENDANCE_AUDIT_ACTION.MANUAL_CHECKIN_APPROVE]: "Manual check-in ? approved",
  [ATTENDANCE_AUDIT_ACTION.MANUAL_CHECKIN_REJECT]: "Manual check-in ? rejected",
  [ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_ALLOWED]: "Self check-in ? allowed",
  [ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_DENIED]: "Self check-in ? denied",
  [ATTENDANCE_AUDIT_ACTION.SELF_CHECKOUT]: "Self check-out",
  [ATTENDANCE_AUDIT_ACTION.MANUAL_CHECKIN_SUBMIT]: "Manual check-in ? submitted",
  [ATTENDANCE_AUDIT_ACTION.FORCE_CHECKOUT]: "Force checkout (HR)",
};

const AUDIT_ACTION_TO_I18N_KEY: Record<string, string> = {
  [ATTENDANCE_AUDIT_ACTION.HR_ATTENDANCE_CREATE]: "attendance.auditActions.hrAttendanceCreate",
  [ATTENDANCE_AUDIT_ACTION.HR_ATTENDANCE_UPDATE]: "attendance.auditActions.hrAttendanceUpdate",
  [ATTENDANCE_AUDIT_ACTION.HR_ATTENDANCE_DELETE]: "attendance.auditActions.hrAttendanceDelete",
  [ATTENDANCE_AUDIT_ACTION.CORRECTION_APPROVE]: "attendance.auditActions.correctionApprove",
  [ATTENDANCE_AUDIT_ACTION.CORRECTION_REJECT]: "attendance.auditActions.correctionReject",
  [ATTENDANCE_AUDIT_ACTION.CORRECTION_SUBMITTED]: "attendance.auditActions.correctionSubmitted",
  [ATTENDANCE_AUDIT_ACTION.MANUAL_CHECKIN_APPROVE]: "attendance.auditActions.manualCheckinApprove",
  [ATTENDANCE_AUDIT_ACTION.MANUAL_CHECKIN_REJECT]: "attendance.auditActions.manualCheckinReject",
  [ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_ALLOWED]: "attendance.auditActions.selfCheckinAllowed",
  [ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_DENIED]: "attendance.auditActions.selfCheckinDenied",
  [ATTENDANCE_AUDIT_ACTION.SELF_CHECKOUT]: "attendance.auditActions.selfCheckout",
  [ATTENDANCE_AUDIT_ACTION.MANUAL_CHECKIN_SUBMIT]: "attendance.auditActions.manualCheckinSubmit",
  [ATTENDANCE_AUDIT_ACTION.FORCE_CHECKOUT]: "attendance.auditActions.forceCheckout",
};

const AUDIT_SOURCE_TO_I18N_KEY: Record<string, string> = {
  [ATTENDANCE_AUDIT_SOURCE.HR_PANEL]: "attendance.auditSources.hrPanel",
  [ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL]: "attendance.auditSources.employeePortal",
  [ATTENDANCE_AUDIT_SOURCE.ADMIN_PANEL]: "attendance.auditSources.adminPanel",
  [ATTENDANCE_AUDIT_SOURCE.SYSTEM]: "attendance.auditSources.system",
};

function auditActionLabel(actionType: string) {
  return AUDIT_ACTION_LABELS_STATIC[actionType] ?? actionType.replace(/_/g, " ");
}

function auditSourceLabel(source: string | null | undefined) {
  if (!source) return "?";
  const AUDIT_SOURCE_LABELS_STATIC: Record<string, string> = {
    [ATTENDANCE_AUDIT_SOURCE.HR_PANEL]: "HR panel",
    [ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL]: "Employee portal",
    [ATTENDANCE_AUDIT_SOURCE.ADMIN_PANEL]: "Admin / HR",
    [ATTENDANCE_AUDIT_SOURCE.SYSTEM]: "System",
  };
  return AUDIT_SOURCE_LABELS_STATIC[source] ?? source;
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
  assigneeFilterOptions,
  persistQueryString,
}: {
  enabled: boolean;
  companyId: number | null;
  employees: { id: number; firstName: string; lastName: string; userId: number | null }[];
  /** Same eligible company members as triage assignment; overrides employee-based assignee list when set. */
  assigneeFilterOptions?: { userId: number; label: string }[];
  /** Persist operational lens + issue-kind filters in the page URL (same pattern as HR Performance tab). */
  persistQueryString?: boolean;
}) {
  const { t } = useTranslation("hr");
  const defaultTo = muscatCalendarYmdNow();
  const defaultFrom = muscatCalendarYmdFromUtcInstant(new Date(Date.now() - 7 * 86400_000));
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [employeeId, setEmployeeId] = useState<string>("all");
  const [actionType, setActionType] = useState<string>("all");
  const [auditLens, setAuditLens] = useState<"all" | "operational">("all");
  const [operationalAction, setOperationalAction] = useState<"all" | "acknowledge" | "resolve" | "assign">("all");
  const [operationalIssueKind, setOperationalIssueKind] = useState<
    "all" | "overdue_checkout" | "missed_shift" | "correction_pending" | "manual_pending"
  >("all");
  const [operationalIssueStatus, setOperationalIssueStatus] = useState<
    "all" | "open" | "acknowledged" | "resolved"
  >("all");
  const [operationalAssigneeUserId, setOperationalAssigneeUserId] = useState<string>("all");
  const [detail, setDetail] = useState<AuditRow | null>(null);

  const actionOptions = useMemo(
    () =>
      Object.entries(ATTENDANCE_AUDIT_ACTION).map(([, v]) => ({
        value: v,
        label: auditActionLabel(v),
      })),
    [],
  );

  const assigneeOptions = useMemo(
    () => employees.filter((e) => e.userId != null) as { id: number; firstName: string; lastName: string; userId: number }[],
    [employees],
  );
  const assigneeSelectOptions =
    assigneeFilterOptions && assigneeFilterOptions.length > 0
      ? assigneeFilterOptions
      : assigneeOptions.map((e) => ({
          userId: e.userId,
          label: `${e.firstName} ${e.lastName}`,
        }));

  const [auditUrlReady, setAuditUrlReady] = useState(() => !persistQueryString);
  useEffect(() => {
    if (!persistQueryString) {
      setAuditUrlReady(true);
      return;
    }
    if (typeof window === "undefined") {
      setAuditUrlReady(true);
      return;
    }
    const p = new URLSearchParams(window.location.search);
    const lens = p.get("auditLens");
    if (lens === "operational" || lens === "all") setAuditLens(lens);
    const kind = p.get("opIssueKind");
    if (
      kind === "overdue_checkout" ||
      kind === "missed_shift" ||
      kind === "correction_pending" ||
      kind === "manual_pending" ||
      kind === "all"
    ) {
      setOperationalIssueKind(kind);
    }
    setAuditUrlReady(true);
  }, [persistQueryString]);

  useEffect(() => {
    if (!persistQueryString || !auditUrlReady || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("auditLens", auditLens);
    if (auditLens === "operational" && operationalIssueKind !== "all") {
      url.searchParams.set("opIssueKind", operationalIssueKind);
    } else {
      url.searchParams.delete("opIssueKind");
    }
    window.history.replaceState({}, "", url.toString());
  }, [persistQueryString, auditUrlReady, auditLens, operationalIssueKind]);

  const auditQuery = useMemo(
    () => ({
      companyId: companyId ?? undefined,
      createdOnOrAfter: from,
      createdOnOrBefore: to,
      employeeId: employeeId !== "all" ? Number(employeeId) : undefined,
      actionType: auditLens === "all" && actionType !== "all" ? actionType : undefined,
      auditLens,
      operationalAction: auditLens === "operational" ? operationalAction : undefined,
      operationalIssueKind: auditLens === "operational" ? operationalIssueKind : "all",
      operationalIssueStatus:
        auditLens === "operational" && operationalIssueStatus !== "all" ? operationalIssueStatus : undefined,
      operationalAssigneeUserId:
        auditLens === "operational" && operationalAssigneeUserId !== "all"
          ? Number(operationalAssigneeUserId)
          : undefined,
      limit: auditLens === "operational" ? 100 : 50,
    }),
    [
      companyId,
      from,
      to,
      employeeId,
      actionType,
      auditLens,
      operationalAction,
      operationalIssueKind,
      operationalIssueStatus,
      operationalAssigneeUserId,
    ],
  );

  const { data, isLoading, refetch, isFetching } = trpc.attendance.listAttendanceAudit.useQuery(auditQuery, {
    enabled: enabled && companyId != null,
  });

  const empName = (id: number | null | undefined) => {
    if (id == null) return "?";
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
    return parts.length ? parts.join(" ? ") : "?";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("attendance.filters.from")}</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-sm w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("attendance.filters.to")}</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-sm w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("attendance.filters.employee")}</Label>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="h-8 text-sm w-[200px]">
              <SelectValue placeholder={t("attendance.filters.allEmployees")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("attendance.filters.allEmployees")}</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.firstName} {e.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("attendance.filters.view")}</Label>
          <Select
            value={auditLens}
            onValueChange={(v) => {
              setAuditLens(v as "all" | "operational");
              if (v === "operational") setActionType("all");
            }}
          >
            <SelectTrigger className="h-8 text-sm w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("attendance.filters.allAuditTypes")}</SelectItem>
              <SelectItem value="operational">{t("attendance.filters.operationalOnly")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {auditLens === "all" ? (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("attendance.filters.action")}</Label>
            <Select value={actionType} onValueChange={setActionType}>
              <SelectTrigger className="h-8 text-sm w-[220px]">
                <SelectValue placeholder={t("attendance.filters.allActions")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">{t("attendance.filters.allActions")}</SelectItem>
                {actionOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("attendance.filters.opAction")}</Label>
              <Select value={operationalAction} onValueChange={(v) => setOperationalAction(v as typeof operationalAction)}>
                <SelectTrigger className="h-8 text-sm w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("attendance.filters.allOpActions")}</SelectItem>
                  <SelectItem value="acknowledge">{t("attendance.filters.acknowledge")}</SelectItem>
                  <SelectItem value="resolve">{t("attendance.filters.resolve")}</SelectItem>
                  <SelectItem value="assign">{t("attendance.filters.assign")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("attendance.filters.issueKind")}</Label>
              <Select
                value={operationalIssueKind}
                onValueChange={(v) =>
                  setOperationalIssueKind(v as typeof operationalIssueKind)
                }
              >
                <SelectTrigger className="h-8 text-sm w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("attendance.filters.allKinds")}</SelectItem>
                  <SelectItem value="overdue_checkout">{t("attendance.filters.overdueCheckout")}</SelectItem>
                  <SelectItem value="missed_shift">{t("attendance.filters.missedShift")}</SelectItem>
                  <SelectItem value="correction_pending">{t("attendance.filters.correctionPending")}</SelectItem>
                  <SelectItem value="manual_pending">{t("attendance.filters.manualPending")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("attendance.filters.issueStatus")}</Label>
              <Select
                value={operationalIssueStatus}
                onValueChange={(v) => setOperationalIssueStatus(v as typeof operationalIssueStatus)}
              >
                <SelectTrigger className="h-8 text-sm w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("attendance.filters.anyStatus")}</SelectItem>
                  <SelectItem value="open">{t("attendance.filters.open")}</SelectItem>
                  <SelectItem value="acknowledged">{t("attendance.filters.acknowledged")}</SelectItem>
                  <SelectItem value="resolved">{t("attendance.filters.resolved")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("attendance.filters.assignedTo")}</Label>
              <Select value={operationalAssigneeUserId} onValueChange={setOperationalAssigneeUserId}>
                <SelectTrigger className="h-8 text-sm w-[200px]">
                  <SelectValue placeholder={t("attendance.filters.anyone")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("attendance.filters.anyone")}</SelectItem>
                  {assigneeSelectOptions.map((e) => (
                    <SelectItem key={e.userId} value={String(e.userId)}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          onClick={() => refetch()}
          disabled={!enabled || isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {t("attendance.filters.refresh")}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("attendance.auditTrailDesc", { count: auditLens === "operational" ? 100 : 50 })}
        {auditLens === "operational" ? (
          <span className="block mt-1">
            {t("attendance.operationalTriageDesc")}
          </span>
        ) : null}
      </p>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">{t("attendance.table.loadingAuditLog")}</div>
      ) : !data?.length ? (
        <div className="py-12 text-center text-muted-foreground">{t("attendance.table.noAuditEntries")}</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th scope="col" className="text-left py-2 px-3 font-medium">
                  {t("attendance.table.time")}
                </th>
                <th scope="col" className="text-left py-2 px-3 font-medium">
                  {t("attendance.table.employee")}
                </th>
                <th scope="col" className="text-left py-2 px-3 font-medium">
                  {t("attendance.table.action")}
                </th>
                <th scope="col" className="text-left py-2 px-3 font-medium">
                  {t("attendance.table.source")}
                </th>
                <th scope="col" className="text-left py-2 px-3 font-medium">
                  {t("attendance.table.actor")}
                </th>
                <th scope="col" className="text-left py-2 px-3 font-medium">
                  {t("attendance.table.reason")}
                </th>
                <th scope="col" className="text-left py-2 px-3 font-medium">
                  {t("attendance.table.entity")}
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
                    {row.reason ?? "?"}
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
            <SheetTitle>{t("attendance.auditEntry")}</SheetTitle>
            <SheetDescription className="text-left">
              {detail ? (
                <span className="text-xs">
                  #{detail.id} ? {auditActionLabel(detail.actionType)} ? {fmtDateTime(detail.createdAt)}
                </span>
              ) : null}
            </SheetDescription>
          </SheetHeader>
          {detail && (
            <div className="space-y-4 px-4 pb-6 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">{t("attendance.table.employee")}</span>
                  <p className="font-medium">{empName(detail.employeeId)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("attendance.table.source")}</span>
                  <p>{t(AUDIT_SOURCE_TO_I18N_KEY[detail.source] ?? "", { defaultValue: detail.source ?? "?" })}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("attendance.table.actor")}</span>
                  <p>
                    {t("attendance.table.user", { id: detail.actorUserId })}
                    {detail.actorRole ? ` ? ${detail.actorRole}` : ""}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("attendance.table.entity")}</span>
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
                <Label className="text-xs text-muted-foreground">{t("attendance.detailPanel.reason")}</Label>
                <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/40 p-2">{detail.reason}</p>
              </div>
            ) : null}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("attendance.detailPanel.beforePayload")}</Label>
              <pre className="text-[11px] bg-muted/50 p-2 rounded-md max-h-52 overflow-auto whitespace-pre-wrap break-all">
                {detail.beforePayload == null ? "?" : JSON.stringify(detail.beforePayload, null, 2)}
              </pre>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("attendance.detailPanel.afterPayload")}</Label>
              <pre className="text-[11px] bg-muted/50 p-2 rounded-md max-h-52 overflow-auto whitespace-pre-wrap break-all">
                {detail.afterPayload == null ? "?" : JSON.stringify(detail.afterPayload, null, 2)}
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
  const { t } = useTranslation("hr");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    employeeId: "",
    status: "present" as AttendanceStatus,
    notes: "",
    date: muscatCalendarYmdNow(),
  });
  const [serverError, setServerError] = useState<string | null>(null);

  const reasonTrimmed = form.notes.trim();
  const reasonOk = reasonTrimmed.length >= 10;
  const reasonWeak = reasonOk && isWeakAuditReason(reasonTrimmed);
  const canSubmit = !!form.employeeId && reasonOk && !reasonWeak;

  const utils = trpc.useUtils();
  const createMutation = trpc.hr.createAttendance.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.clockInDialog.recorded"));
      setOpen(false);
      setServerError(null);
      utils.hr.listAttendance.invalidate();
      utils.hr.attendanceStats.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
      void utils.scheduling.getTodayBoard.invalidate();
      void utils.scheduling.getOverdueCheckouts.invalidate();
      onSuccess();
    },
    onError: (e) => {
      const reason = (e.data as { reason?: string } | undefined)?.reason;
      if (reason === DUPLICATE_MANUAL_ATTENDANCE) {
        setServerError(t("attendance.clockInDialog.duplicateError"));
        toast.error(t("attendance.clockInDialog.duplicateError"));
      } else if (reason === WEAK_AUDIT_REASON) {
        setServerError(t("attendance.clockInDialog.weakReasonHint"));
        toast.error(t("attendance.clockInDialog.weakReasonHint"));
      } else if (reason === INVALID_ATTENDANCE_TIME_RANGE) {
        setServerError(t("attendance.clockInDialog.invalidTimeRange"));
        toast.error(t("attendance.clockInDialog.invalidTimeRange"));
      } else {
        setServerError(e.message);
        toast.error(e.message);
      }
    },
  });

  const noEligibleEmployees = employees.length === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setServerError(null); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" disabled={noEligibleEmployees} title={noEligibleEmployees ? t("attendance.clockInDialog.noEmployeesTooltip") : undefined}>
          <Clock size={14} /> {t("attendance.clockInDialog.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("attendance.clockInDialog.title")}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t("attendance.clockInDialog.description")}</p>
        </DialogHeader>
        {noEligibleEmployees ? (
          <div className="py-6 text-center space-y-2">
            <Users className="mx-auto h-8 w-8 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">{t("attendance.clockInDialog.noEmployeesHint")}</p>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>{t("attendance.clockInDialog.employeeLabel")}</Label>
              <Select value={form.employeeId} onValueChange={(v) => { setForm({ ...form, employeeId: v }); setServerError(null); }}>
                <SelectTrigger><SelectValue placeholder={t("attendance.clockInDialog.selectEmployee")} /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.firstName} {e.lastName}{e.department ? ` · ${e.department}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("attendance.clockInDialog.dateLabel")}</Label>
              <DateInput value={form.date} onChange={(e) => { setForm({ ...form, date: e.target.value }); setServerError(null); }} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("attendance.clockInDialog.statusLabel")}</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as AttendanceStatus })}>
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
              <Label>{t("attendance.clockInDialog.reasonNote")}</Label>
              <Textarea
                placeholder={t("attendance.clockInDialog.reasonPlaceholder")}
                value={form.notes}
                onChange={(e) => { setForm({ ...form, notes: e.target.value }); setServerError(null); }}
                className="text-sm min-h-[88px]"
              />
              {reasonWeak && (
                <p className="text-[11px] text-destructive">{t("attendance.clockInDialog.weakReasonHint")}</p>
              )}
              {!reasonWeak && <p className="text-[11px] text-muted-foreground">{t("attendance.clockInDialog.reasonHint")}</p>}
            </div>
            <p className="text-[11px] text-amber-600">{t("attendance.clockInDialog.payrollReviewNote")}</p>
            {serverError && (
              <p className="text-[12px] text-destructive">{serverError}</p>
            )}
            <Button className="w-full" disabled={!canSubmit || createMutation.isPending}
              onClick={() => createMutation.mutate({ employeeId: Number(form.employeeId), status: form.status, notes: reasonTrimmed, date: form.date, companyId: companyId ?? undefined })}>
              {createMutation.isPending ? t("attendance.clockInDialog.recording") : t("attendance.clockInDialog.save")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

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
            onClick={() =>
              updateMutation.mutate({
                id: record.id,
                status,
                notes: notes || undefined,
                changeAuditNote: materialChange ? auditNote.trim() : undefined,
              })}
          >
            {updateMutation.isPending ? t("attendance.editDialog.saving") : t("attendance.editDialog.saveChanges")}
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
  const { t } = useTranslation("hr");
  if (companyId == null) return null;
  const items = [
    { label: t("attendance.signals.criticalExceptions"), value: criticalExceptions, warn: (criticalExceptions ?? 0) > 0 },
    { label: t("attendance.signals.needsAttention"), value: needsAttention, warn: (needsAttention ?? 0) > 0 },
    { label: t("attendance.signals.pendingCorrections"), value: pendingCorrCount, warn: pendingCorrCount > 0 },
    { label: t("attendance.signals.pendingManualCheckins"), value: pendingManualCount, warn: pendingManualCount > 0 },
    { label: t("attendance.signals.openCheckouts"), value: overdueCheckoutCount, warn: overdueCheckoutCount > 0 },
    { label: t("attendance.signals.missedShifts"), value: missedShiftsCount, warn: missedShiftsCount > 0 },
    { label: t("attendance.signals.scheduledToday"), value: scheduledShiftsToday, warn: false },
  ];
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-3 sm:px-4">
      <p className="text-xs font-semibold text-foreground mb-2">{t("attendance.signals.workforceSignals")}</p>
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
        {t("attendance.signals.openCheckoutsNote")}
      </p>
    </div>
  );
}

// --- Today's Live Board ------------------------------------------------------
function TodayBoard({ companyId }: { companyId: number | null }) {
  const { t } = useTranslation("hr");
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
        {t("attendance.todayBoard.selectCompany")}
      </div>
    );
  }
  if (isLoading) return <div className="py-12 text-center text-muted-foreground">{t("attendance.todayBoard.loading")}</div>;
  if (!data) return <div className="py-12 text-center text-muted-foreground">{t("attendance.todayBoard.noData")}</div>;
  const s = data.summary;
  const stats = [
    { label: t("attendance.todayBoard.critical"), count: s.criticalExceptions ?? 0, color: "text-red-800", bg: "bg-red-50" },
    { label: t("attendance.todayBoard.needsAttention"), count: s.needsAttention ?? 0, color: "text-amber-900", bg: "bg-amber-50" },
    { label: t("attendance.todayBoard.openPastShiftEnd"), count: s.overdueOpenCheckoutCount, color: "text-orange-800", bg: "bg-orange-50/90" },
    { label: t("attendance.todayBoard.scheduled"), count: s.total, color: "text-slate-700", bg: "bg-slate-50" },
    { label: t("attendance.todayBoard.upcoming"), count: s.upcoming, color: "text-slate-600", bg: "bg-slate-50/80" },
    { label: t("attendance.todayBoard.awaitingCheckin"), count: s.notCheckedIn, color: "text-amber-700", bg: "bg-amber-50" },
    { label: t("attendance.todayBoard.checkedInActive"), count: s.checkedInActive, color: "text-emerald-700", bg: "bg-emerald-50" },
    { label: t("attendance.todayBoard.lateNoArrival"), count: s.lateNoCheckin, color: "text-orange-700", bg: "bg-orange-50" },
    { label: t("attendance.todayBoard.completed"), count: s.checkedOut, color: "text-gray-700", bg: "bg-gray-50" },
    { label: t("attendance.todayBoard.absentConfirmed"), count: s.absent, color: "text-red-600", bg: "bg-red-50" },
    { label: t("attendance.todayBoard.holiday"), count: s.holiday, color: "text-blue-600", bg: "bg-blue-50" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm text-muted-foreground">
            {new Date(data.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xl">
            {t("attendance.todayBoard.absentNote")}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[11px] text-muted-foreground">
            {dataUpdatedAt > 0 ? (
              <span>
                {t("attendance.todayBoard.lastUpdated")}{" "}
                <time dateTime={new Date(dataUpdatedAt).toISOString()}>
                  {new Date(dataUpdatedAt).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </time>
              </span>
            ) : null}
            {dataUpdatedAt > 0 ? <span className="hidden sm:inline" aria-hidden>?</span> : null}
            <span>{t("attendance.todayBoard.autoRefresh")}</span>
            {isFetching && !isLoading ? (
              <span className="inline-flex items-center gap-1 text-primary font-medium">
                <RefreshCw className="h-3 w-3 animate-spin shrink-0" aria-hidden />
                {t("attendance.todayBoard.syncing")}
              </span>
            ) : null}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          {t("attendance.todayBoard.refresh")}
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
          <p className="text-xs font-semibold text-foreground">{t("attendance.todayBoard.fullDayTitle")}</p>
          <ul className="space-y-2 text-sm">
            {(data.fullDaySummaries ?? []).map((fd) => (
              <li key={fd.employeeId} className="rounded-md bg-background/80 border px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{fd.employeeDisplayName}</span>
                  <span className="text-xs text-muted-foreground">({t("attendance.todayBoard.shifts", { count: fd.shiftCount })})</span>
                  {fd.dayFullyComplete ? (
                    <Badge variant="outline" className="border-emerald-300 text-emerald-800 bg-emerald-50 text-[10px]">
                      {t("attendance.todayBoard.dayComplete")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-300 text-amber-900 bg-amber-50 text-[10px]">
                      {t("attendance.todayBoard.inProgress")}
                    </Badge>
                  )}
                  <span className="w-full basis-full text-xs text-muted-foreground leading-snug">
                    {t("attendance.todayBoard.shiftsCompleted", { done: fd.shiftsCheckedOutCount, total: fd.shiftCount })}
                    {fd.totalAttributedMinutes > 0 ? (
                      <> {t("attendance.todayBoard.minutesAttributed", { minutes: fd.totalAttributedMinutes })}</>
                    ) : null}
                    {fd.shiftsCheckedOutCount < fd.shiftCount ? (
                      <> {t("attendance.todayBoard.openShiftsNote")}</>
                    ) : null}
                  </span>
                </div>
                <ol className="mt-1.5 space-y-2 text-xs text-foreground/90 list-decimal list-outside ml-4 pl-1">
                  {fd.segments.map((seg) => {
                    const st = getAdminBoardRowStatusPresentation(seg.status);
                    return (
                      <li key={seg.scheduleId}>
                        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span className="font-medium">{seg.shiftName ?? t("attendance.todayBoard.headers.shift")}</span>
                          <span className="text-muted-foreground">({seg.expectedStart}?{seg.expectedEnd})</span>
                          <Badge variant="outline" className={`text-[10px] py-0 h-5 shrink-0 ${st.className}`}>
                            {st.label}
                          </Badge>
                        </span>
                        <span className="block mt-0.5 text-foreground/90">
                          <span className="text-muted-foreground">{t("attendance.todayBoard.inOut")} </span>
                          <span>{seg.checkInAt ? fmtTime(seg.checkInAt) : "?"}</span>
                          <span> ? </span>
                          <span>{seg.checkOutAt ? fmtTime(seg.checkOutAt) : "?"}</span>
                          {!seg.checkOutAt && seg.punchCheckOutAt ? (
                            <span className="text-muted-foreground">
                              {" "}
                              ({t("attendance.todayBoard.openSession", { time: fmtTime(seg.punchCheckOutAt) })})
                            </span>
                          ) : seg.checkOutAt &&
                            seg.punchCheckOutAt &&
                            new Date(seg.punchCheckOutAt).getTime() !== new Date(seg.checkOutAt).getTime() ? (
                            <span className="text-muted-foreground">
                              {" "}
                              ({t("attendance.todayBoard.sessionTo", { time: fmtTime(seg.punchCheckOutAt) })})
                            </span>
                          ) : null}
                          {seg.durationMinutes != null && seg.checkInAt ? (
                            <span className="text-muted-foreground"> ({seg.durationMinutes}m)</span>
                          ) : null}
                          {seg.methodLabel ? (
                            <span className="text-muted-foreground"> ? {seg.methodLabel}</span>
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
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.employee")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.site")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.shift")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.checkIn")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.checkOut")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.delay")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.worked")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.source")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.risk")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.payroll")}</th>
              <th className="text-left px-3 py-2.5 font-medium">{t("attendance.todayBoard.headers.status")}</th>
            </tr>
          </thead>
          <tbody>
            {data.board.map((row: any) => (
              <tr key={row.scheduleId} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2.5">
                  <div className="font-medium">{row.employeeDisplayName ?? row.employee?.name ?? `Schedule #${row.scheduleId}`}</div>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[140px] truncate" title={row.siteName ?? ""}>
                  {row.siteName ?? "?"}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground text-xs">
                  {row.shift ? (row.shift as { name?: string | null }).name ?? "?" : "?"}
                  {row.expectedStart && row.expectedEnd ? (
                    <div className="text-[11px]">{row.expectedStart}?{row.expectedEnd}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{row.checkInAt ? fmtTime(row.checkInAt) : "?"}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {row.checkOutAt ? fmtTime(row.checkOutAt) : "?"}
                  {!row.checkOutAt && row.punchCheckOutAt ? (
                    <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      {t("attendance.todayBoard.openSession", { time: fmtTime(row.punchCheckOutAt) })}
                    </div>
                  ) : row.checkOutAt &&
                    row.punchCheckOutAt &&
                    new Date(row.punchCheckOutAt).getTime() !== new Date(row.checkOutAt).getTime() ? (
                    <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      {t("attendance.todayBoard.sessionTo", { time: fmtTime(row.punchCheckOutAt) })}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  {row.delayMinutes != null && row.delayMinutes > 0 ? `${row.delayMinutes}m` : "?"}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  {row.durationMinutes != null && row.checkInAt ? `${row.durationMinutes}m` : "?"}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.methodLabel ?? "?"}</td>
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
                    "?"
                  )}
                </td>
                <td className="px-3 py-2.5 text-[11px] text-muted-foreground capitalize">
                  {row.payrollHints?.payrollImpact
                    ? String(row.payrollHints.payrollImpact).replace(/_/g, " ")
                    : "?"}
                </td>
                <td className="px-3 py-2.5">{boardStatusBadge(row.status)}</td>
              </tr>
            ))}
            {data.board.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                  {t("attendance.todayBoard.noEmployeesScheduled")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Correction Requests ------------------------------------------------------
function CorrectionRequests({ companyId }: { companyId: number | null }) {
  const { t } = useTranslation("hr");
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [reviewTarget, setReviewTarget] = useState<{ id: number; action: "approve" | "reject" } | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [issueHistoryKey, setIssueHistoryKey] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data, isLoading, refetch } = trpc.attendance.listCorrections.useQuery(
    { companyId: companyId ?? undefined, status: statusFilter },
    { enabled: companyId != null },
  );
  const approveMut = trpc.attendance.approveCorrection.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.corrections.approvedToast"));
      setReviewTarget(null);
      void refetch();
      void utils.attendance.listCorrections.invalidate();
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
  const rejectMut = trpc.attendance.rejectCorrection.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.corrections.rejectedToast"));
      setReviewTarget(null);
      void refetch();
      void utils.attendance.listCorrections.invalidate();
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
      approveMut.mutate({ companyId, correctionId: reviewTarget.id, adminNote: adminNote || undefined });
    } else {
      if (!adminNote.trim() || adminNote.trim().length < 5) { toast.error(t("attendance.corrections.provideRejectionReason")); return; }
      rejectMut.mutate({ companyId, correctionId: reviewTarget.id, adminNote });
    }
  };
  return (
    <div className="space-y-4">
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
        <div className="py-12 text-center text-muted-foreground">{t("attendance.corrections.selectCompany")}</div>
      ) : isLoading ? <div className="py-12 text-center text-muted-foreground">{t("attendance.manualCheckins.loading")}</div> : (
        <div className="space-y-3">
          {(data ?? []).map(({ correction, employee, operationalIssue }) => (
            <Card key={correction.id}><CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{employee ? `${employee.firstName} ${employee.lastName}` : "?"}</span>
                    {employee?.position && <span className="text-xs text-muted-foreground">{employee.position}</span>}
                    {correction.status === "pending" ? <Badge variant="outline" className="border-yellow-300 text-yellow-700 bg-yellow-50">{t("attendance.corrections.pending")}</Badge>
                      : correction.status === "approved" ? <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50">{t("attendance.corrections.approved")}</Badge>
                      : <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">{t("attendance.corrections.rejected")}</Badge>}
                  </div>
                  <div className="mt-1.5 text-sm text-muted-foreground space-y-0.5">
                    <div><span className="font-medium text-foreground">{t("attendance.corrections.dateLabel")}</span> {correction.requestedDate}{correction.requestedCheckIn && <span className="ml-3"><span className="font-medium text-foreground">{t("attendance.corrections.inLabel")}</span> {correction.requestedCheckIn.slice(0, 5)}</span>}{correction.requestedCheckOut && <span className="ml-3"><span className="font-medium text-foreground">{t("attendance.corrections.outLabel")}</span> {correction.requestedCheckOut.slice(0, 5)}</span>}</div>
                    <div><span className="font-medium text-foreground">{t("attendance.corrections.reasonLabel")}</span> {correction.reason}</div>
                    {correction.adminNote && <div><span className="font-medium text-foreground">{t("attendance.corrections.noteLabel")}</span> {correction.adminNote}</div>}
                  </div>
                  <OperationalIssueMetaStrip
                    operationalIssue={operationalIssue}
                    pendingHint={correction.status === "pending" && operationalIssue == null}
                    onOpenHistory={() =>
                      setIssueHistoryKey(
                        operationalIssue?.issueKey ??
                          operationalIssueKey({ kind: "correction_pending", correctionId: correction.id }),
                      )
                    }
                  />
                </div>
                {correction.status === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50" onClick={() => { setReviewTarget({ id: correction.id, action: "approve" }); setAdminNote(""); }}><CheckCircle className="h-3.5 w-3.5 mr-1" /> {t("attendance.corrections.approve")}</Button>
                    <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => { setReviewTarget({ id: correction.id, action: "reject" }); setAdminNote(""); }}><XCircle className="h-3.5 w-3.5 mr-1" /> {t("attendance.corrections.reject")}</Button>
                  </div>
                )}
              </div>
            </CardContent></Card>
          ))}
          {(data ?? []).length === 0 && <div className="py-12 text-center text-muted-foreground">{statusFilter === "all" ? t("attendance.corrections.noCorrectionRequestsAll") : t("attendance.corrections.noCorrectionRequests", { status: t("attendance.corrections." + statusFilter) })}</div>}
        </div>
      )}
      <Dialog open={!!reviewTarget} onOpenChange={() => setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{reviewTarget?.action === "approve" ? t("attendance.corrections.dialogTitleApprove") : t("attendance.corrections.dialogTitleReject")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="adminNoteCorr">{reviewTarget?.action === "approve" ? t("attendance.manualCheckins.adminNoteOptional") : t("attendance.manualCheckins.reasonRequired")}</Label>
            <Textarea id="adminNoteCorr" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder={reviewTarget?.action === "approve" ? "Optional note?" : "Explain why?"} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)}>{t("attendance.corrections.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={approveMut.isPending || rejectMut.isPending} className={reviewTarget?.action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}>{reviewTarget?.action === "approve" ? t("attendance.corrections.approve") : t("attendance.corrections.reject")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OperationalIssueHistorySheet
        open={issueHistoryKey != null}
        onOpenChange={(o) => {
          if (!o) setIssueHistoryKey(null);
        }}
        companyId={companyId}
        issueKey={issueHistoryKey}
      />
    </div>
  );
}

// --- Manual Check-in Requests -------------------------------------------------
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
                    <div><span className="font-medium text-foreground">{t("attendance.manualCheckins.justificationLabel")}</span> {req.justification}</div>
                    {req.adminNote && <div><span className="font-medium text-foreground">{t("attendance.manualCheckins.adminNoteLabel")}</span> {req.adminNote}</div>}
                    <div className="text-xs">{req.requestedAt ? new Date(req.requestedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : ""}</div>
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
          {(data ?? []).length === 0 && <div className="py-12 text-center text-muted-foreground">{statusFilter === "all" ? t("attendance.manualCheckins.noRequestsAll") : t("attendance.manualCheckins.noRequests", { status: t("attendance.manualCheckins." + statusFilter) })}</div>}
        </div>
      )}
      <Dialog open={!!reviewTarget} onOpenChange={() => setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{reviewTarget?.action === "approve" ? t("attendance.manualCheckins.dialogTitleApprove") : t("attendance.manualCheckins.dialogTitleReject")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="adminNoteManual">{reviewTarget?.action === "approve" ? t("attendance.manualCheckins.adminNoteOptional") : t("attendance.manualCheckins.reasonRequired")}</Label>
            <Textarea id="adminNoteManual" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder={reviewTarget?.action === "approve" ? "Optional note?" : "Explain why?"} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)}>{t("attendance.corrections.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={approveMut.isPending || rejectMut.isPending} className={reviewTarget?.action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}>{reviewTarget?.action === "approve" ? t("attendance.corrections.approve") : t("attendance.corrections.reject")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OperationalIssueHistorySheet
        open={issueHistoryKey != null}
        onOpenChange={(o) => {
          if (!o) setIssueHistoryKey(null);
        }}
        companyId={companyId}
        issueKey={issueHistoryKey}
      />
    </div>
  );
}

/** QR / clock punches (`attendance_records`) for a Muscat calendar day ? complements the legacy HR grid. */
function SitePunchesSection({ companyId }: { companyId: number | null }) {
  const { t } = useTranslation("hr");
  const [punchDate, setPunchDate] = useState(() => muscatCalendarYmdNow());
  const { data = [], isLoading } = trpc.attendance.adminBoard.useQuery(
    { companyId: companyId ?? undefined, date: punchDate },
    { enabled: companyId != null },
  );

  if (companyId == null) {
    return (
      <div className="py-12 text-center text-muted-foreground border border-dashed rounded-lg">
        {t("attendance.sitePunches.selectCompany")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("attendance.sitePunches.dateLabel")}</Label>
          <Input
            type="date"
            value={punchDate}
            onChange={(e) => setPunchDate(e.target.value)}
            className="h-9 w-44 text-sm"
          />
        </div>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {t("attendance.sitePunches.clockPunches", { date: punchDate })}
            <Badge variant="outline" className="text-xs font-normal">{t("attendance.sitePunches.rows", { count: data.length })}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t("attendance.sitePunches.loading")}</p>
          ) : data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t("attendance.sitePunches.noPunches")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">{t("attendance.sitePunches.employee")}</th>
                    <th className="text-left py-2 px-2 font-medium">{t("attendance.sitePunches.checkIn")}</th>
                    <th className="text-left py-2 px-2 font-medium">{t("attendance.sitePunches.checkOut")}</th>
                    <th className="text-left py-2 px-2 font-medium">{t("attendance.sitePunches.duration")}</th>
                    <th className="text-left py-2 px-2 font-medium">{t("attendance.sitePunches.source")}</th>
                    <th className="text-left py-2 px-2 font-medium">{t("attendance.sitePunches.geo")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.record.id} className="border-t hover:bg-muted/40">
                      <td className="py-2 px-2">
                        <span className="font-medium">
                          {row.employee.firstName} {row.employee.lastName}
                        </span>
                        {row.employee.department ? (
                          <span className="text-xs text-muted-foreground ml-1">? {row.employee.department}</span>
                        ) : null}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">{fmtTime(row.record.checkIn)}</td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        {row.record.checkOut ? fmtTime(row.record.checkOut) : "?"}
                      </td>
                      <td className="py-2 px-2">{row.durationMinutes}m</td>
                      <td className="py-2 px-2 text-muted-foreground text-xs">{row.methodLabel}</td>
                      <td className="py-2 px-2">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {row.hasCheckInGeo || row.hasCheckOutGeo ? t("attendance.sitePunches.inOutGps") : t("attendance.sitePunches.noGps")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function HRAttendancePage() {
  const { t } = useTranslation("hr");
  const { caps } = useMyCapabilities();
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
  const [exporting, setExporting] = useState(false);

  const { data: employees } = trpc.hr.listEmployees.useQuery({ department: deptFilter !== "all" ? deptFilter : undefined, status: "active", companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: companyMembers } = trpc.companies.members.useQuery(
    { companyId: activeCompanyId ?? undefined },
    {
      enabled:
        activeCompanyId != null && (attendanceTab === "audit" || triageAssignItem != null),
    },
  );
  const assignableCompanyMembers = useMemo(() => {
    const eligible = new Set(["company_admin", "hr_admin", "finance_admin", "reviewer"]);
    return (companyMembers ?? []).filter((m) => m.isActive !== false && eligible.has(m.role));
  }, [companyMembers]);
  const eligibleAuditAssigneeOptions = useMemo(
    () =>
      assignableCompanyMembers.map((m) => ({
        userId: m.userId,
        label: (m.name ?? "").trim() || `User #${m.userId}`,
      })),
    [assignableCompanyMembers],
  );
  const { data: attendance, refetch } = trpc.hr.listAttendance.useQuery({ month: monthFilter, companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: stats } = trpc.hr.attendanceStats.useQuery({ month: monthFilter, companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });

  const handleAttendanceExport = useCallback(async () => {
    if (activeCompanyId == null) return;
    setExporting(true);
    try {
      const result = await utils.hr.exportMonthlyAttendance.fetch({
        companyId: activeCompanyId,
        month: monthFilter,
      });
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
          site: r.siteName ?? "?",
          client: r.clientName ?? "?",
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
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `attendance-${monthFilter}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(t("attendance.exportDownloaded"));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("attendance.exportFailed");
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  }, [activeCompanyId, monthFilter, utils, t]);

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
  const rate =
    stats?.attendanceRatePercent != null && !Number.isNaN(stats.attendanceRatePercent)
      ? stats.attendanceRatePercent
      : total > 0
        ? Math.round(((stats?.present ?? 0) / total) * 100)
        : 0;

  const businessYmd = muscatCalendarYmdNow();
  const today = businessYmd;
  const todayRecords = (attendance ?? []).filter((r) => {
    if (!r.date) return false;
    const d = muscatCalendarYmdFromUtcInstant(new Date(r.date));
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

  const canonicalActionItems = useMemo<AttendanceActionQueueItem[]>(() => {
    const allItems: AttendanceActionQueueItem[] = [];
    for (const row of (todayBoardData?.board ?? [])) {
      if (!row.canonicalStatus || !row.payrollReadiness || !row.canonicalRiskLevel) continue;
      const items = buildAttendanceActionItems({
        resolvedState: {
          status: row.canonicalStatus,
          payrollReadiness: row.payrollReadiness,
          riskLevel: row.canonicalRiskLevel,
          reasonCodes: row.reasonCodes ?? [],
        },
        attendanceDate: businessYmd,
        employeeId: row.employeeId ?? undefined,
        employeeName: row.employeeDisplayName ?? undefined,
        attendanceRecordId: row.attendanceRecordId ?? undefined,
        scheduleId: row.scheduleId ?? undefined,
      });
      allItems.push(...items);
    }
    return sortAttendanceActionItems(allItems);
  }, [todayBoardData?.board, businessYmd]);

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
            {t("attendance.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("attendance.operationalControlDesc")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {caps.canRecordManualAttendance && (
            <ClockInDialog employees={(employees ?? []).map(e => ({ ...e, department: e.department ?? null }))} onSuccess={refetch} companyId={activeCompanyId} />
          )}
        </div>
      </div>

      <AttendanceSetupHealthBanner companyId={activeCompanyId} caps={caps} />

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
          canonicalItems={canonicalActionItems}
          onCanonicalCta={(category: AttendanceActionQueueCategory) => {
            if (category === "pending_correction") setAttendanceTab("corrections");
            else if (category === "pending_manual_checkin" || category === "absent_pending") setAttendanceTab("manual");
            else if (category === "holiday_attendance" || category === "leave_attendance" || category === "unscheduled_attendance") setAttendanceTab("records");
            else setAttendanceTab("today");
          }}
        />
      ) : null}

      {/* Tabs: Live today | HR Records | Site Punches | Corrections | Manual Check-ins | Audit Log */}
      <Tabs value={attendanceTab} onValueChange={setAttendanceTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="today" className="gap-1.5"><Users className="h-3.5 w-3.5" /> {t("attendance.tabs.liveToday")}</TabsTrigger>
          <TabsTrigger value="records" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> {t("attendance.tabs.hrRecords")}</TabsTrigger>
          <TabsTrigger value="site-punches" className="gap-1.5"><MapPin className="h-3.5 w-3.5" /> {t("attendance.tabs.sitePunches")}</TabsTrigger>
          <TabsTrigger value="corrections" className="gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> {t("attendance.tabs.corrections")}{pendingCorrDot && <span className="ml-1 h-2 w-2 rounded-full bg-red-500 inline-block" />}</TabsTrigger>
          <TabsTrigger value="manual" className="gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> {t("attendance.tabs.manualCheckins")}{pendingManualDot && <span className="ml-1 h-2 w-2 rounded-full bg-red-500 inline-block" />}</TabsTrigger>
          {caps.canViewAttendanceAudit && (
            <TabsTrigger value="audit" className="gap-1.5"><ScrollText className="h-3.5 w-3.5" /> {t("attendance.tabs.auditLog")}</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="today" className="mt-4"><TodayBoard companyId={activeCompanyId} /></TabsContent>
        <TabsContent value="site-punches" className="mt-4">
          <SitePunchesSection companyId={activeCompanyId} />
        </TabsContent>
        <TabsContent value="corrections" className="mt-4"><CorrectionRequests companyId={activeCompanyId} /></TabsContent>
        <TabsContent value="manual" className="mt-4"><ManualCheckInRequests companyId={activeCompanyId} /></TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AttendanceAuditLog
            enabled={attendanceTab === "audit" && activeCompanyId != null}
            companyId={activeCompanyId}
            employees={(employees ?? []).map((e) => ({
              id: e.id,
              firstName: e.firstName,
              lastName: e.lastName,
              userId: e.userId ?? null,
            }))}
            assigneeFilterOptions={eligibleAuditAssigneeOptions}
            persistQueryString={attendanceTab === "audit"}
          />
        </TabsContent>
        <TabsContent value="records" className="mt-4">

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
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2 h-8"
              disabled={exporting || activeCompanyId == null}
              onClick={() => void handleAttendanceExport()}
            >
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
                      : "?";
                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-3 font-medium">
                          {(() => {
                            const e = empById.get(r.employeeId ?? 0);
                            return e ? `${e.firstName} ${e.lastName}`.trim() : t("attendance.records.employeeFallback", { id: r.employeeId });
                          })()}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {r.date ? fmtDateLong(r.date) : "?"}
                        </td>
                        <td className="py-2 px-3">{checkIn ? checkIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "?"}</td>
                        <td className="py-2 px-3">{checkOut ? checkOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "?"}</td>
                        <td className="py-2 px-3">{hours !== "?" ? `${hours}h` : "?"}</td>
                        <td className="py-2 px-3">
                          <Badge className={`text-xs ${statusColors[r.status ?? "present"] ?? ""}`}>
                            {r.status ?? "present"}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs max-w-[120px] truncate">{r.notes ?? "?"}</td>
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
            <DialogTitle>{t("attendance.forceCheckoutDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("attendance.forceCheckoutDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="force-reason">{t("attendance.forceCheckoutDialog.reason")}</Label>
            <Textarea
              id="force-reason"
              value={forceDialogReason}
              onChange={(e) => setForceDialogReason(e.target.value)}
              rows={4}
              placeholder={t("attendance.forceCheckoutDialog.reasonPlaceholder")}
              className="text-sm"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setForceDialogRecordId(null)}>
              {t("attendance.forceCheckoutDialog.cancel")}
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
              {t("attendance.forceCheckoutDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={triageAckItem != null} onOpenChange={(o) => !o && setTriageAckItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("attendance.acknowledgeDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("attendance.acknowledgeDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ack-note">{t("attendance.acknowledgeDialog.note")}</Label>
            <Textarea
              id="ack-note"
              value={triageAckNote}
              onChange={(e) => setTriageAckNote(e.target.value)}
              rows={3}
              className="text-sm"
              placeholder={t("attendance.acknowledgeDialog.placeholder")}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setTriageAckItem(null)}>
              {t("attendance.acknowledgeDialog.cancel")}
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
              {t("attendance.acknowledgeDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={triageResolveItem != null} onOpenChange={(o) => !o && setTriageResolveItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("attendance.resolveDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("attendance.resolveDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="resolve-note">{t("attendance.resolveDialog.note")}</Label>
            <Textarea
              id="resolve-note"
              value={triageResolveNote}
              onChange={(e) => setTriageResolveNote(e.target.value)}
              rows={4}
              className="text-sm"
              placeholder={t("attendance.resolveDialog.placeholder")}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setTriageResolveItem(null)}>
              {t("attendance.resolveDialog.cancel")}
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
              {t("attendance.resolveDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={triageAssignItem != null} onOpenChange={(o) => !o && setTriageAssignItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("attendance.assignDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("attendance.assignDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("attendance.assignDialog.assignee")}</Label>
              <Select value={triageAssignUserId} onValueChange={setTriageAssignUserId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("attendance.assignDialog.selectUser")} />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {authUser?.id != null ? (
                    <SelectItem value={String(authUser.id)}>{t("attendance.assignDialog.me", { name: authUser.name ?? `User #${authUser.id}` })}</SelectItem>
                  ) : null}
                  {assignableCompanyMembers
                    .filter((m) => m.userId !== authUser?.id)
                    .map((m) => (
                      <SelectItem key={m.memberId} value={String(m.userId)}>
                        {(m.name ?? "").trim() || `User #${m.userId}`} ({String(m.role).replace(/_/g, " ")})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground leading-snug">
                {t("attendance.assignDialog.assigneeHint")}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="assign-note">{t("attendance.assignDialog.note")}</Label>
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
              {t("attendance.assignDialog.cancel")}
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
              {t("attendance.assignDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTargetId != null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("attendance.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("attendance.deleteDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("attendance.deleteDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              onClick={() => {
                if (deleteTargetId != null) deleteMutation.mutate({ id: deleteTargetId });
              }}
            >
              {t("attendance.deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
