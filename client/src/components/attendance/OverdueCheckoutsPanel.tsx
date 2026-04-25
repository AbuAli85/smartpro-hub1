/**
 * OverdueCheckoutsPanel
 * Manager / HR summary of employees who are still clocked in after their shift ended.
 * Refreshes automatically every 60 seconds. Each row has a "Send Reminder" button
 * that opens a dialog where the manager can write a custom message before sending
 * an in-app notification to the employee.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { useAttendanceOperationalMutations } from "@/hooks/useAttendanceOperationalMutations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Bell, BellRing, Check, Clock, LogOut, MapPin, RefreshCw, Send, UserCheck } from "lucide-react";
import { fmtTime } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { operationalIssueKey } from "@shared/attendanceOperationalIssueKeys";
import { OperationalIssueHistorySheet } from "@/components/attendance/OperationalIssueHistorySheet";
import { OperationalIssueHistoryTrigger } from "@/components/attendance/OperationalIssueHistoryTrigger";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function overdueLabel(minutes: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (minutes < 60) return t("attendance.overdueCheckouts.minutesOverdue", { minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0
    ? t("attendance.overdueCheckouts.hoursMinutesOverdue", { hours: h, minutes: m })
    : t("attendance.overdueCheckouts.hoursOverdue", { hours: h });
}

function overdueSeverity(minutes: number): "low" | "medium" | "high" {
  if (minutes >= 60) return "high";
  if (minutes >= 20) return "medium";
  return "low";
}

function buildDefaultMessage(
  shiftName: string | null,
  expectedEnd: string,
  minutesOverdue: number
): string {
  const overdueStr =
    minutesOverdue >= 60
      ? `${Math.floor(minutesOverdue / 60)}h ${minutesOverdue % 60}m`
      : `${minutesOverdue}m`;
  const shiftLabel = shiftName ? ` (${shiftName})` : "";
  return `Your shift${shiftLabel} ended at ${expectedEnd} — you are ${overdueStr} past the scheduled end time. Please check out when you are done.`;
}

const SEVERITY_BADGE: Record<string, string> = {
  low: "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  medium: "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300",
  high: "border-red-300 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300",
};

const SEVERITY_AVATAR: Record<string, string> = {
  low: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  medium: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

/** Per-employee reminder button — opens a dialog for custom message before sending. */
function ReminderButton({
  employeeUserId,
  employeeDisplayName,
  shiftName,
  expectedEnd,
  minutesOverdue,
  companyId,
}: {
  employeeUserId: number;
  employeeDisplayName: string;
  shiftName: string | null;
  expectedEnd: string;
  minutesOverdue: number;
  companyId: number | undefined;
}) {
  const { t } = useTranslation("hr");
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");

  const defaultMessage = buildDefaultMessage(shiftName, expectedEnd, minutesOverdue);

  const remind = trpc.scheduling.sendOverdueCheckoutReminder.useMutation({
    onSuccess: () => {
      setSent(true);
      setOpen(false);
      toast.success(t("attendance.overdueCheckouts.toast.reminderSent", { name: employeeDisplayName }));
    },
    onError: (err) => {
      toast.error(t("attendance.overdueCheckouts.toast.reminderError", { error: err.message }));
    },
  });

  function handleOpen() {
    // Pre-fill with default message each time dialog opens (unless already customised)
    setMessage(defaultMessage);
    setOpen(true);
  }

  function handleSend() {
    remind.mutate({
      companyId,
      employeeUserId,
      shiftName,
      expectedEnd,
      minutesOverdue,
      customMessage: message.trim() || undefined,
    });
  }

  if (sent) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled
        className="h-7 px-2.5 text-[11px] gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 shrink-0"
      >
        <Check className="w-3 h-3" />
        {t("attendance.overdueCheckouts.sent")}
      </Button>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={handleOpen}
        className="h-7 px-2.5 text-[11px] gap-1 shrink-0"
        title={`Send check-out reminder to ${employeeDisplayName}`}
      >
        <BellRing className="w-3 h-3" />
        {t("attendance.overdueCheckouts.remind")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Bell className="w-4 h-4 text-orange-500" />
              {t("attendance.overdueCheckouts.reminderDialog.title")}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {t("attendance.overdueCheckouts.reminderDialog.descriptionTo")}{" "}
              <span className="font-semibold text-foreground">{employeeDisplayName}</span>.{" "}
              {t("attendance.overdueCheckouts.reminderDialog.descriptionEdit")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* Employee context strip */}
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="text-[11px] font-semibold bg-orange-100 text-orange-700">
                  {initials(employeeDisplayName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate leading-tight">{employeeDisplayName}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {shiftName ? `${shiftName} · ` : ""}End: {expectedEnd} ·{" "}
                  <span className="text-orange-600 font-medium">{overdueLabel(minutesOverdue, t)}</span>
                </p>
              </div>
            </div>

            {/* Message editor */}
            <div className="space-y-1.5">
              <Label htmlFor="reminder-message" className="text-xs font-medium">
                {t("attendance.overdueCheckouts.reminderDialog.messageLabel")}
                <span className="ml-1 text-muted-foreground font-normal">{t("attendance.overdueCheckouts.reminderDialog.messageHint")}</span>
              </Label>
              <Textarea
                id="reminder-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder={t("attendance.overdueCheckouts.reminderDialog.messagePlaceholder")}
                className="text-sm resize-none"
              />
              <p className="text-[10px] text-muted-foreground text-right">
                {message.length} / 1000
              </p>
            </div>

            {/* Reset to default hint */}
            {message !== defaultMessage && (
              <button
                type="button"
                onClick={() => setMessage(defaultMessage)}
                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                {t("attendance.overdueCheckouts.reminderDialog.resetToDefault")}
              </button>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={remind.isPending}
            >
              {t("attendance.overdueCheckouts.reminderDialog.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={remind.isPending || message.trim().length === 0}
              className="gap-1.5"
            >
              {remind.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {remind.isPending
                ? t("attendance.overdueCheckouts.reminderDialog.sending")
                : t("attendance.overdueCheckouts.reminderDialog.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type OverdueEmp = {
  employeeId: number | null;
  employeeUserId: number;
  employeeDisplayName: string;
  shiftName: string | null;
  siteName: string | null;
  expectedEnd: string;
  checkInAt: Date;
  minutesOverdue: number;
  attendanceRecordId: number;
  operationalIssue?: {
    issueKey: string;
    status: string;
    assignedToUserId?: number | null;
  } | null;
};

export function OverdueCheckoutsPanel({ className }: { className?: string }) {
  const { t } = useTranslation("hr");
  const { activeCompanyId } = useActiveCompany();
  const { acknowledgeOverdueCheckout, forceCheckout, isPending: operationalPending } =
    useAttendanceOperationalMutations(activeCompanyId);
  const [forceTarget, setForceTarget] = useState<OverdueEmp | null>(null);
  const [forceReason, setForceReason] = useState("");
  const [ackTarget, setAckTarget] = useState<OverdueEmp | null>(null);
  const [ackNote, setAckNote] = useState("");
  const [historyIssueKey, setHistoryIssueKey] = useState<string | null>(null);

  const { data, isLoading, isFetching, dataUpdatedAt, refetch } =
    trpc.scheduling.getOverdueCheckouts.useQuery(
      { companyId: activeCompanyId ?? undefined },
      {
        enabled: activeCompanyId != null,
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
      }
    );

  const overdue = (data?.overdueEmployees ?? []) as OverdueEmp[];
  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  if (isLoading) {
    return (
      <Card className={cn("border-orange-200/60", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            {t("attendance.overdueCheckouts.panelTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card
      id="attendance-overdue-checkouts"
      className={cn(
        overdue.length > 0
          ? "border-orange-300/70 bg-orange-50/30 dark:border-orange-700/40 dark:bg-orange-950/10"
          : "border-border",
        className
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle
              className={cn(
                "w-4 h-4",
                overdue.length > 0 ? "text-orange-500" : "text-muted-foreground"
              )}
            />
            {t("attendance.overdueCheckouts.panelTitle")}
            {overdue.length > 0 && (
              <Badge
                variant="outline"
                className="ml-1 border-orange-300 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 text-[10px] px-1.5 py-0 font-bold"
              >
                {overdue.length}
              </Badge>
            )}
          </CardTitle>
          <button
            onClick={() => void refetch()}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
            aria-label="Refresh overdue list"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          </button>
        </div>
        {updatedAt && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {t("attendance.overdueCheckouts.updatedAt", {
              time: updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            })}
            {overdue.length > 0 && (
              <span className="ml-2 text-muted-foreground/70">
                {t("attendance.overdueCheckouts.remindHint")}
              </span>
            )}
          </p>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {overdue.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-muted-foreground">
            <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-sm">{t("attendance.overdueCheckouts.allClear")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {overdue.map((emp) => {
              const sev = overdueSeverity(emp.minutesOverdue);
              const triage = emp.operationalIssue?.status ?? "open";
              return (
                <div
                  key={emp.attendanceRecordId}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-lg border border-border/60 bg-background/70 px-3 py-2.5"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className={cn("text-xs font-semibold", SEVERITY_AVATAR[sev])}>
                      {initials(emp.employeeDisplayName)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate leading-tight">
                      {emp.employeeDisplayName}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                      <Badge variant="outline" className="text-[9px] h-5 capitalize border-slate-300">
                        {t("attendance.overdueCheckouts.issueLabel", { status: triage })}
                      </Badge>
                      {emp.shiftName && (
                        <span className="text-[11px] text-muted-foreground truncate">
                          {emp.shiftName}
                        </span>
                      )}
                      {emp.siteName && (
                        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                          <MapPin className="w-2.5 h-2.5 shrink-0" />
                          {emp.siteName}
                        </span>
                      )}
                      <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                        <Clock className="w-2.5 h-2.5 shrink-0" />
                        {t("attendance.overdueCheckouts.inEnd", {
                          checkIn: fmtTime(emp.checkInAt),
                          end: emp.expectedEnd,
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 justify-end sm:justify-start">
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] font-semibold whitespace-nowrap hidden sm:inline-flex", SEVERITY_BADGE[sev])}
                    >
                      {overdueLabel(emp.minutesOverdue, t)}
                    </Badge>
                    {triage === "open" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] gap-1"
                        onClick={() => {
                          setAckTarget(emp);
                          setAckNote("");
                        }}
                      >
                        <UserCheck className="w-3 h-3" />
                        {t("attendance.overdueCheckouts.ack")}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="h-7 text-[10px] gap-1"
                      onClick={() => {
                        setForceTarget(emp);
                        setForceReason("");
                      }}
                    >
                      <LogOut className="w-3 h-3" />
                      {t("attendance.overdueCheckouts.forceOut")}
                    </Button>
                    <ReminderButton
                      employeeUserId={emp.employeeUserId}
                      employeeDisplayName={emp.employeeDisplayName}
                      shiftName={emp.shiftName}
                      expectedEnd={emp.expectedEnd}
                      minutesOverdue={emp.minutesOverdue}
                      companyId={activeCompanyId ?? undefined}
                    />
                    <OperationalIssueHistoryTrigger
                      onClick={() =>
                        setHistoryIssueKey(
                          emp.operationalIssue?.issueKey ??
                            operationalIssueKey({
                              kind: "overdue_checkout",
                              attendanceRecordId: emp.attendanceRecordId,
                            }),
                        )
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>

    <Dialog open={forceTarget != null} onOpenChange={(o) => !o && setForceTarget(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("attendance.overdueCheckouts.forceCheckoutDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("attendance.overdueCheckouts.forceCheckoutDialog.descriptionFor")}{" "}
            <span className="font-medium text-foreground">{forceTarget?.employeeDisplayName}</span>{" "}
            {t("attendance.overdueCheckouts.forceCheckoutDialog.descriptionAudit")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="ov-force-reason">{t("attendance.overdueCheckouts.forceCheckoutDialog.reasonLabel")}</Label>
          <Textarea
            id="ov-force-reason"
            value={forceReason}
            onChange={(e) => setForceReason(e.target.value)}
            rows={4}
            className="text-sm"
            placeholder={t("attendance.overdueCheckouts.forceCheckoutDialog.reasonPlaceholder")}
          />
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setForceTarget(null)}>
            {t("attendance.overdueCheckouts.forceCheckoutDialog.cancel")}
          </Button>
          <Button
            type="button"
            disabled={
              forceReason.trim().length < 10 || operationalPending || !forceTarget || activeCompanyId == null
            }
            onClick={async () => {
              if (!forceTarget || activeCompanyId == null) return;
              try {
                await forceCheckout.mutateAsync({
                  companyId: activeCompanyId,
                  attendanceRecordId: forceTarget.attendanceRecordId,
                  reason: forceReason.trim(),
                });
                setForceTarget(null);
              } catch {
                /* toast via mutation */
              }
            }}
          >
            {t("attendance.overdueCheckouts.forceCheckoutDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={ackTarget != null} onOpenChange={(o) => !o && setAckTarget(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("attendance.overdueCheckouts.ackDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("attendance.overdueCheckouts.ackDialog.descriptionFor")}{" "}
            {ackTarget?.employeeDisplayName}{" "}
            {t("attendance.overdueCheckouts.ackDialog.descriptionNote")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="ov-ack-note">{t("attendance.overdueCheckouts.ackDialog.noteLabel")}</Label>
          <Textarea id="ov-ack-note" value={ackNote} onChange={(e) => setAckNote(e.target.value)} rows={3} className="text-sm" />
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setAckTarget(null)}>
            {t("attendance.overdueCheckouts.ackDialog.cancel")}
          </Button>
          <Button
            type="button"
            disabled={operationalPending || !ackTarget}
            onClick={async () => {
              if (!ackTarget) return;
              try {
                await acknowledgeOverdueCheckout({ attendanceRecordId: ackTarget.attendanceRecordId, note: ackNote });
                setAckTarget(null);
              } catch {
                /* toast via mutation */
              }
            }}
          >
            {t("attendance.overdueCheckouts.ackDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <OperationalIssueHistorySheet
      open={historyIssueKey != null}
      onOpenChange={(o) => {
        if (!o) setHistoryIssueKey(null);
      }}
      companyId={activeCompanyId}
      issueKey={historyIssueKey}
    />
    </>
  );
}
