import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ATTENDANCE_ACTION,
  type AttendanceActionId,
  type OperationalExceptionItem,
  type OperationalQueueFilter,
} from "@shared/attendanceIntelligence";
import type {
  AttendanceActionQueueItem,
  AttendanceActionQueueCategory,
} from "@shared/attendanceActionQueue";
import { AlertTriangle, ArrowRight, ClipboardList, Inbox, ListTodo, ShieldAlert } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const RISK_BADGE: Record<string, string> = {
  // Legacy 3-level (OperationalExceptionItem)
  critical: "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200",
  warning: "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/25 dark:text-amber-200",
  normal: "border-border bg-muted/50 text-foreground",
  // Canonical 5-level (AttendanceActionQueueItem)
  none: "border-border bg-muted/50 text-foreground",
  low: "border-slate-300 bg-slate-50 text-slate-700",
  medium: "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/25 dark:text-amber-200",
  high: "border-orange-300 bg-orange-50 text-orange-800 dark:bg-orange-950/25 dark:text-orange-200",
};

// Maps legacy 3-level codes to i18n keys used for canonical 5-level
const LEGACY_RISK_TO_I18N: Record<string, string> = {
  critical: "critical",
  warning: "medium",
  normal: "low",
};

const RES_STATUS_BADGE: Record<string, string> = {
  open: "border-slate-300 bg-slate-50 text-slate-800",
  acknowledged: "border-blue-300 bg-blue-50 text-blue-900",
  resolved: "border-emerald-300 bg-emerald-50 text-emerald-900",
};

const ACTION_LABEL_KEY: Partial<Record<AttendanceActionId, string>> = {
  [ATTENDANCE_ACTION.VIEW_TODAY_BOARD]: "attendance.actionQueue.cta.viewLiveBoard",
  [ATTENDANCE_ACTION.OPEN_CORRECTIONS]: "attendance.actionQueue.cta.openCorrections",
  [ATTENDANCE_ACTION.OPEN_MANUAL_CHECKINS]: "attendance.actionQueue.cta.openManualCheckins",
  [ATTENDANCE_ACTION.SEND_OVERDUE_REMINDER]: "attendance.actionQueue.cta.viewLiveBoard",
  [ATTENDANCE_ACTION.FORCE_CHECKOUT_OPEN]: "attendance.forceCheckoutDialog.title",
  [ATTENDANCE_ACTION.ACKNOWLEDGE_OPERATIONAL_ISSUE]: "attendance.acknowledgeDialog.confirm",
  [ATTENDANCE_ACTION.RESOLVE_OPERATIONAL_ISSUE]: "attendance.resolveDialog.confirm",
  [ATTENDANCE_ACTION.ASSIGN_OPERATIONAL_ISSUE]: "attendance.assignDialog.confirm",
};

export function AttendanceActionQueue({
  items,
  onAction,
  canonicalItems,
  onCanonicalCta,
  filter = "unresolved",
  onFilterChange,
  assigneeNameByUserId,
  className,
}: {
  items: OperationalExceptionItem[];
  onAction: (action: AttendanceActionId, item: OperationalExceptionItem) => void;
  canonicalItems?: AttendanceActionQueueItem[];
  onCanonicalCta?: (category: AttendanceActionQueueCategory, item: AttendanceActionQueueItem) => void;
  filter?: OperationalQueueFilter;
  onFilterChange?: (f: OperationalQueueFilter) => void;
  assigneeNameByUserId?: Record<number, string>;
  className?: string;
}) {
  const { t } = useTranslation("hr");

  const FILTER_OPTIONS: { value: OperationalQueueFilter; label: string }[] = [
    { value: "all", label: t("attendance.actionQueue.filterAll") },
    { value: "unresolved", label: t("attendance.actionQueue.filterUnresolved") },
    { value: "assigned_to_me", label: t("attendance.actionQueue.filterAssignedToMe") },
    { value: "acknowledged", label: t("attendance.actionQueue.filterAcknowledged") },
    { value: "resolved", label: t("attendance.actionQueue.filterResolved") },
  ];

  const totalCount = items.length + (canonicalItems?.length ?? 0);

  return (
    <Card className={cn("border-primary/20", className)}>
      <CardHeader className="pb-2 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-primary" />
              {t("attendance.actionQueue.title")}
              {totalCount > 0 ? (
                <Badge variant="secondary" className="text-[10px] font-semibold">
                  {totalCount}
                </Badge>
              ) : null}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Triage, assign, and resolve exceptions. Use the Today tab for force-checkout and reminders.
            </p>
          </div>
          {onFilterChange ? (
            <div className="flex flex-col gap-1 min-w-[10rem]">
              <Label className="text-[10px] text-muted-foreground">
                {t("attendance.actionQueue.filterLabel")}
              </Label>
              <Select value={filter} onValueChange={(v) => onFilterChange(v as OperationalQueueFilter)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {/* ── Legacy triage items ──────────────────────────────────────── */}
        {items.length === 0 && (!canonicalItems || canonicalItems.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground border border-dashed rounded-lg">
            <Inbox className="h-9 w-9 opacity-35" />
            <p className="text-sm font-medium">{t("attendance.actionQueue.emptyTitle")}</p>
            <p className="text-xs text-center max-w-sm">{t("attendance.actionQueue.emptyHint")}</p>
          </div>
        ) : (
          <>
            {items.length > 0 && (
              <ul className="space-y-2">
                {items.map((item, idx) => (
                  <li
                    key={item.issueKey ?? `${item.kind}-${item.scheduleId ?? "x"}-${item.attendanceRecordId ?? idx}-${idx}`}
                    className="flex flex-col gap-2 rounded-lg border bg-background/80 px-3 py-2.5"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <AlertTriangle
                        className={cn(
                          "h-4 w-4 shrink-0 mt-0.5",
                          item.riskLevel === "critical" ? "text-red-600" : "text-amber-600",
                        )}
                      />
                      <div className="min-w-0 space-y-0.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium leading-tight">{item.title}</span>
                          {item.riskLevel !== "normal" && (
                            <Badge variant="outline" className={cn("text-[10px] font-normal", RISK_BADGE[item.riskLevel])}>
                              {t(`attendance.riskLevel.${LEGACY_RISK_TO_I18N[item.riskLevel] ?? item.riskLevel}`, { defaultValue: item.riskLevel })}
                            </Badge>
                          )}
                          {item.issueResolutionStatus ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] font-normal capitalize",
                                RES_STATUS_BADGE[item.issueResolutionStatus] ?? "border-muted",
                              )}
                            >
                              {item.issueResolutionStatus}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground leading-snug">{item.detail}</p>
                        <p className="text-[11px] text-foreground/90">
                          <span className="text-muted-foreground">Employee:</span> {item.employeeLabel}
                          {item.assignedToUserId != null ? (
                            <span className="text-muted-foreground">
                              {" "}
                              · Assignee:{" "}
                              <Badge variant="outline" className="text-[10px] font-normal ml-0.5 py-0 h-5">
                                {assigneeNameByUserId?.[item.assignedToUserId] ?? `User #${item.assignedToUserId}`}
                              </Badge>
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 justify-end sm:justify-start">
                      {item.actions.map((act) => (
                        <Button
                          key={act}
                          type="button"
                          size="sm"
                          variant={
                            act === ATTENDANCE_ACTION.FORCE_CHECKOUT_OPEN
                              ? "destructive"
                              : act === item.actions[0]
                                ? "default"
                                : "outline"
                          }
                          className="h-8 text-[11px] gap-1"
                          onClick={() => onAction(act, item)}
                        >
                          {act === ATTENDANCE_ACTION.SEND_OVERDUE_REMINDER ? (
                            <ClipboardList className="h-3 w-3" />
                          ) : null}
                          {t(ACTION_LABEL_KEY[act] ?? "", { defaultValue: act.replace(/_/g, " ") })}
                          {act !== ATTENDANCE_ACTION.SEND_OVERDUE_REMINDER ? (
                            <ArrowRight className="h-3 w-3 opacity-60" />
                          ) : null}
                        </Button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* ── Canonical status-signal items ────────────────────────── */}
            {canonicalItems && canonicalItems.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide px-0.5 pt-1">
                  {t("attendance.actionQueue.canonicalSectionTitle")}
                </p>
                <ul className="space-y-2">
                  {canonicalItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-col gap-2 rounded-lg border bg-background/80 px-3 py-2.5"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <AlertTriangle
                          className={cn(
                            "h-4 w-4 shrink-0 mt-0.5",
                            item.severity === "critical"
                              ? "text-red-600"
                              : item.severity === "high"
                                ? "text-orange-600"
                                : "text-amber-600",
                          )}
                        />
                        <div className="min-w-0 space-y-0.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium leading-tight">
                              {t(item.titleKey)}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn("text-[10px] font-normal", RISK_BADGE[item.riskLevel])}
                            >
                              {t(`attendance.riskLevel.${item.riskLevel}`, { defaultValue: item.riskLevel })}
                            </Badge>
                            {item.isPayrollBlocking && (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-normal border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200 gap-1"
                              >
                                <ShieldAlert className="h-2.5 w-2.5" />
                                {t("attendance.actionQueue.payrollBlocking")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground leading-snug">
                            {t(item.descriptionKey)}
                          </p>
                          {item.employeeName && (
                            <p className="text-[11px] text-foreground/90">
                              <span className="text-muted-foreground">Employee:</span>{" "}
                              {item.employeeName}
                            </p>
                          )}
                          {item.recommendedActionKey && (
                            <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
                              {t(item.recommendedActionKey)}
                            </p>
                          )}
                        </div>
                      </div>
                      {item.ctaTarget && item.ctaLabelKey && onCanonicalCta && (
                        <div className="flex flex-wrap gap-1.5 justify-end sm:justify-start">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 text-[11px] gap-1"
                            onClick={() => onCanonicalCta(item.category, item)}
                          >
                            {t(item.ctaLabelKey)}
                            <ArrowRight className="h-3 w-3 opacity-60" />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
