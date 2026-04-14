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
import { AlertTriangle, ArrowRight, ClipboardList, Inbox, ListTodo } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const RISK_BADGE: Record<string, string> = {
  critical: "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200",
  warning: "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/25 dark:text-amber-200",
  normal: "border-border bg-muted/50 text-foreground",
};

const RES_STATUS_BADGE: Record<string, string> = {
  open: "border-slate-300 bg-slate-50 text-slate-800",
  acknowledged: "border-blue-300 bg-blue-50 text-blue-900",
  resolved: "border-emerald-300 bg-emerald-50 text-emerald-900",
};

const ACTION_LABEL: Partial<Record<AttendanceActionId, string>> = {
  [ATTENDANCE_ACTION.VIEW_TODAY_BOARD]: "Live board",
  [ATTENDANCE_ACTION.OPEN_CORRECTIONS]: "Corrections",
  [ATTENDANCE_ACTION.OPEN_MANUAL_CHECKINS]: "Manual",
  [ATTENDANCE_ACTION.SEND_OVERDUE_REMINDER]: "Remind",
  [ATTENDANCE_ACTION.FORCE_CHECKOUT_OPEN]: "Force checkout",
  [ATTENDANCE_ACTION.ACKNOWLEDGE_OPERATIONAL_ISSUE]: "Acknowledge",
  [ATTENDANCE_ACTION.RESOLVE_OPERATIONAL_ISSUE]: "Resolve",
  [ATTENDANCE_ACTION.ASSIGN_OPERATIONAL_ISSUE]: "Assign",
};

function actionButtonLabel(act: AttendanceActionId): string {
  return ACTION_LABEL[act] ?? act.replace(/_/g, " ");
}

const FILTER_OPTIONS: { value: OperationalQueueFilter; label: string }[] = [
  { value: "all", label: "All issues" },
  { value: "unresolved", label: "Unresolved" },
  { value: "assigned_to_me", label: "Assigned to me" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
];

export function AttendanceActionQueue({
  items,
  onAction,
  filter = "unresolved",
  onFilterChange,
  assigneeNameByUserId,
  className,
}: {
  items: OperationalExceptionItem[];
  onAction: (action: AttendanceActionId, item: OperationalExceptionItem) => void;
  filter?: OperationalQueueFilter;
  onFilterChange?: (f: OperationalQueueFilter) => void;
  assigneeNameByUserId?: Record<number, string>;
  className?: string;
}) {
  return (
    <Card className={cn("border-primary/20", className)}>
      <CardHeader className="pb-2 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-primary" />
            Action queue
            {items.length > 0 ? (
              <Badge variant="secondary" className="text-[10px] font-semibold">
                {items.length}
              </Badge>
            ) : null}
          </CardTitle>
          {onFilterChange ? (
            <div className="flex flex-col gap-1 min-w-[10rem]">
              <Label className="text-[10px] text-muted-foreground">Filter</Label>
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
        <p className="text-[11px] text-muted-foreground font-normal leading-snug">
          Triage and resolve: force checkout for open punches past shift end, acknowledge and assign operational issues,
          and route approvals from here.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground border border-dashed rounded-lg">
            <Inbox className="h-9 w-9 opacity-35" />
            <p className="text-sm font-medium">Nothing in this filter</p>
            <p className="text-xs text-center max-w-sm">
              Try &quot;All issues&quot; or switch filters when you expect resolved or assigned rows.
            </p>
          </div>
        ) : (
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
                      <Badge variant="outline" className={cn("text-[10px] font-normal", RISK_BADGE[item.riskLevel])}>
                        {item.riskLevel}
                      </Badge>
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
                      {actionButtonLabel(act)}
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
      </CardContent>
    </Card>
  );
}
