import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { RefreshCw } from "lucide-react";
import { fmtDateTimeShort, fmtDateTime } from "@/lib/dateUtils";
import {
  ATTENDANCE_AUDIT_ACTION,
  ATTENDANCE_AUDIT_SOURCE,
} from "@shared/attendanceAuditTaxonomy";
import { OPERATIONAL_TRIAGE_AUDIT_LABELS } from "@shared/attendanceOperationalAuditPresentation";
import { muscatCalendarYmdFromUtcInstant, muscatCalendarYmdNow } from "@shared/attendanceMuscatTime";

const AUDIT_ACTION_LABELS_STATIC: Record<string, string> = {
  ...OPERATIONAL_TRIAGE_AUDIT_LABELS,
  [ATTENDANCE_AUDIT_ACTION.HR_ATTENDANCE_CREATE]: "HR attendance – created",
  [ATTENDANCE_AUDIT_ACTION.HR_ATTENDANCE_UPDATE]: "HR attendance – updated",
  [ATTENDANCE_AUDIT_ACTION.HR_ATTENDANCE_DELETE]: "HR attendance – deleted",
  [ATTENDANCE_AUDIT_ACTION.CORRECTION_APPROVE]: "Correction – approved",
  [ATTENDANCE_AUDIT_ACTION.CORRECTION_REJECT]: "Correction – rejected",
  [ATTENDANCE_AUDIT_ACTION.CORRECTION_SUBMITTED]: "Correction – submitted",
  [ATTENDANCE_AUDIT_ACTION.MANUAL_CHECKIN_APPROVE]: "Manual check-in – approved",
  [ATTENDANCE_AUDIT_ACTION.MANUAL_CHECKIN_REJECT]: "Manual check-in – rejected",
  [ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_ALLOWED]: "Self check-in – allowed",
  [ATTENDANCE_AUDIT_ACTION.SELF_CHECKIN_DENIED]: "Self check-in – denied",
  [ATTENDANCE_AUDIT_ACTION.SELF_CHECKOUT]: "Self check-out",
  [ATTENDANCE_AUDIT_ACTION.MANUAL_CHECKIN_SUBMIT]: "Manual check-in – submitted",
  [ATTENDANCE_AUDIT_ACTION.FORCE_CHECKOUT]: "Force checkout (HR)",
};

const AUDIT_SOURCE_LABELS_STATIC: Record<string, string> = {
  [ATTENDANCE_AUDIT_SOURCE.HR_PANEL]: "HR panel",
  [ATTENDANCE_AUDIT_SOURCE.EMPLOYEE_PORTAL]: "Employee portal",
  [ATTENDANCE_AUDIT_SOURCE.ADMIN_PANEL]: "Admin / HR",
  [ATTENDANCE_AUDIT_SOURCE.SYSTEM]: "System",
  [ATTENDANCE_AUDIT_SOURCE.CLIENT_PORTAL]: "Client portal",
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
  if (!source) return "—";
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
  companyId,
  employees,
  assigneeFilterOptions,
}: {
  companyId: number | null;
  employees: { id: number; firstName: string; lastName: string; userId: number | null }[];
  assigneeFilterOptions?: { userId: number; label: string }[];
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
  const [operationalIssueStatus, setOperationalIssueStatus] = useState<"all" | "open" | "acknowledged" | "resolved">("all");
  const [operationalAssigneeUserId, setOperationalAssigneeUserId] = useState<string>("all");
  const [detail, setDetail] = useState<AuditRow | null>(null);

  // Sync lens + issue kind with URL search params
  const [urlReady, setUrlReady] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") { setUrlReady(true); return; }
    const p = new URLSearchParams(window.location.search);
    const lens = p.get("auditLens");
    if (lens === "operational" || lens === "all") setAuditLens(lens);
    const kind = p.get("opIssueKind");
    if (kind === "overdue_checkout" || kind === "missed_shift" || kind === "correction_pending" || kind === "manual_pending" || kind === "all") {
      setOperationalIssueKind(kind as typeof operationalIssueKind);
    }
    setUrlReady(true);
  }, []);

  useEffect(() => {
    if (!urlReady || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("auditLens", auditLens);
    if (auditLens === "operational" && operationalIssueKind !== "all") {
      url.searchParams.set("opIssueKind", operationalIssueKind);
    } else {
      url.searchParams.delete("opIssueKind");
    }
    window.history.replaceState({}, "", url.toString());
  }, [urlReady, auditLens, operationalIssueKind]);

  const actionOptions = useMemo(
    () => Object.entries(ATTENDANCE_AUDIT_ACTION).map(([, v]) => ({ value: v, label: auditActionLabel(v) })),
    [],
  );

  const assigneeOptions = useMemo(
    () => employees.filter((e) => e.userId != null) as { id: number; firstName: string; lastName: string; userId: number }[],
    [employees],
  );
  const assigneeSelectOptions =
    assigneeFilterOptions && assigneeFilterOptions.length > 0
      ? assigneeFilterOptions
      : assigneeOptions.map((e) => ({ userId: e.userId, label: `${e.firstName} ${e.lastName}` }));

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
    [companyId, from, to, employeeId, actionType, auditLens, operationalAction, operationalIssueKind, operationalIssueStatus, operationalAssigneeUserId],
  );

  const { data, isLoading, refetch, isFetching } = trpc.attendance.listAttendanceAudit.useQuery(auditQuery, {
    enabled: companyId != null,
  });

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
      <p className="text-xs text-muted-foreground">Structural audit trail for attendance actions and linked records.</p>
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
                <SelectItem key={e.id} value={String(e.id)}>{e.firstName} {e.lastName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("attendance.filters.view")}</Label>
          <Select value={auditLens} onValueChange={(v) => { setAuditLens(v as "all" | "operational"); if (v === "operational") setActionType("all"); }}>
            <SelectTrigger className="h-8 text-sm w-[200px]"><SelectValue /></SelectTrigger>
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
              <SelectTrigger className="h-8 text-sm w-[220px]"><SelectValue placeholder={t("attendance.filters.allActions")} /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">{t("attendance.filters.allActions")}</SelectItem>
                {actionOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("attendance.filters.opAction")}</Label>
              <Select value={operationalAction} onValueChange={(v) => setOperationalAction(v as typeof operationalAction)}>
                <SelectTrigger className="h-8 text-sm w-[180px]"><SelectValue /></SelectTrigger>
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
              <Select value={operationalIssueKind} onValueChange={(v) => setOperationalIssueKind(v as typeof operationalIssueKind)}>
                <SelectTrigger className="h-8 text-sm w-[200px]"><SelectValue /></SelectTrigger>
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
              <Select value={operationalIssueStatus} onValueChange={(v) => setOperationalIssueStatus(v as typeof operationalIssueStatus)}>
                <SelectTrigger className="h-8 text-sm w-[160px]"><SelectValue /></SelectTrigger>
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
                <SelectTrigger className="h-8 text-sm w-[200px]"><SelectValue placeholder={t("attendance.filters.anyone")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("attendance.filters.anyone")}</SelectItem>
                  {assigneeSelectOptions.map((e) => (
                    <SelectItem key={e.userId} value={String(e.userId)}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {t("attendance.filters.refresh")}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("attendance.auditTrailDesc", { count: auditLens === "operational" ? 100 : 50 })}
        {auditLens === "operational" ? (
          <span className="block mt-1">{t("attendance.operationalTriageDesc")}</span>
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
                <th scope="col" className="text-left py-2 px-3 font-medium">{t("attendance.table.time")}</th>
                <th scope="col" className="text-left py-2 px-3 font-medium">{t("attendance.table.employee")}</th>
                <th scope="col" className="text-left py-2 px-3 font-medium">{t("attendance.table.action")}</th>
                <th scope="col" className="text-left py-2 px-3 font-medium">{t("attendance.table.source")}</th>
                <th scope="col" className="text-left py-2 px-3 font-medium">{t("attendance.table.actor")}</th>
                <th scope="col" className="text-left py-2 px-3 font-medium">{t("attendance.table.reason")}</th>
                <th scope="col" className="text-left py-2 px-3 font-medium">{t("attendance.table.entity")}</th>
              </tr>
            </thead>
            <tbody>
              {(data as AuditRow[]).map((row) => (
                <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setDetail(row)}>
                  <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">{fmtDateTimeShort(row.createdAt)}</td>
                  <td className="py-2 px-3 font-medium">{empName(row.employeeId)}</td>
                  <td className="py-2 px-3">
                    <Badge variant="outline" className="text-[11px] font-normal max-w-[200px] truncate">{auditActionLabel(row.actionType)}</Badge>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{auditSourceLabel(row.source)}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">
                    User #{row.actorUserId}
                    {row.actorRole ? <span className="block text-[10px] opacity-80">{row.actorRole}</span> : null}
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground max-w-[180px] truncate" title={row.reason ?? ""}>{row.reason ?? "—"}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground max-w-[220px] truncate" title={entitySummary(row)}>{entitySummary(row)}</td>
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
                <span className="text-xs">#{detail.id} · {auditActionLabel(detail.actionType)} · {fmtDateTime(detail.createdAt)}</span>
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
                  <p>{t(AUDIT_SOURCE_TO_I18N_KEY[detail.source] ?? "", { defaultValue: detail.source ?? "—" })}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("attendance.table.actor")}</span>
                  <p>{t("attendance.table.user", { id: detail.actorUserId })}{detail.actorRole ? ` · ${detail.actorRole}` : ""}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("attendance.table.entity")}</span>
                  <p className="break-all">{detail.entityType} {detail.entityId != null ? `#${detail.entityId}` : ""}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {detail.hrAttendanceId != null && <Badge variant="secondary">HR attendance #{detail.hrAttendanceId}</Badge>}
                {detail.attendanceRecordId != null && <Badge variant="secondary">Clock record #{detail.attendanceRecordId}</Badge>}
                {detail.correctionId != null && <Badge variant="secondary">Correction #{detail.correctionId}</Badge>}
                {detail.manualCheckinRequestId != null && <Badge variant="secondary">Manual request #{detail.manualCheckinRequestId}</Badge>}
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
                  {detail.beforePayload == null ? "—" : JSON.stringify(detail.beforePayload, null, 2)}
                </pre>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("attendance.detailPanel.afterPayload")}</Label>
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

export default function HRAttendanceAuditPage() {
  const { activeCompanyId } = useActiveCompany();
  const { data: employees } = trpc.hr.listEmployees.useQuery(
    { status: "active", companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: companyMembers } = trpc.companies.members.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const assignableMembers = useMemo(() => {
    const eligible = new Set(["company_admin", "hr_admin", "finance_admin", "reviewer"]);
    return (companyMembers ?? []).filter((m) => m.isActive !== false && eligible.has(m.role));
  }, [companyMembers]);
  const assigneeOptions = useMemo(
    () => assignableMembers.map((m) => ({ userId: m.userId, label: (m.name ?? "").trim() || `User #${m.userId}` })),
    [assignableMembers],
  );

  return (
    <AttendanceAuditLog
      companyId={activeCompanyId}
      employees={(employees ?? []).map((e) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName, userId: e.userId ?? null }))}
      assigneeFilterOptions={assigneeOptions}
    />
  );
}
