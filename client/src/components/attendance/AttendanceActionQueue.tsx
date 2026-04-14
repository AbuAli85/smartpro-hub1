import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ATTENDANCE_ACTION,
  type AttendanceActionId,
  type OperationalExceptionItem,
} from "@shared/attendanceIntelligence";
import { AlertTriangle, ArrowRight, ClipboardList, Inbox, ListTodo } from "lucide-react";

const RISK_BADGE: Record<string, string> = {
  critical: "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200",
  warning: "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/25 dark:text-amber-200",
  normal: "border-border bg-muted/50 text-foreground",
};

const ACTION_LABEL: Partial<Record<AttendanceActionId, string>> = {
  [ATTENDANCE_ACTION.VIEW_TODAY_BOARD]: "Open live board",
  [ATTENDANCE_ACTION.OPEN_CORRECTIONS]: "Review corrections",
  [ATTENDANCE_ACTION.OPEN_MANUAL_CHECKINS]: "Review manual",
  [ATTENDANCE_ACTION.SEND_OVERDUE_REMINDER]: "Remind (below)",
};

function primaryActionLabel(actions: AttendanceActionId[]): string {
  const a = actions[0];
  if (!a) return "View";
  return ACTION_LABEL[a] ?? "View";
}

export function AttendanceActionQueue({
  items,
  onAction,
  className,
}: {
  items: OperationalExceptionItem[];
  onAction: (action: AttendanceActionId, item: OperationalExceptionItem) => void;
  className?: string;
}) {
  return (
    <Card className={cn("border-primary/20", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-primary" />
          Action queue
          {items.length > 0 ? (
            <Badge variant="secondary" className="text-[10px] font-semibold">
              {items.length}
            </Badge>
          ) : null}
        </CardTitle>
        <p className="text-[11px] text-muted-foreground font-normal leading-snug">
          Prioritized exceptions and approvals. Resolved by reviewing corrections, manual check-ins, or addressing live
          board rows.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground border border-dashed rounded-lg">
            <Inbox className="h-9 w-9 opacity-35" />
            <p className="text-sm font-medium">Nothing needs action right now</p>
            <p className="text-xs text-center max-w-sm">
              When shifts are missed, check-outs run late, or requests pile up, they will appear here with a next step.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item, idx) => (
              <li
                key={`${item.kind}-${item.title}-${idx}`}
                className="flex flex-col sm:flex-row sm:items-start gap-2 rounded-lg border bg-background/80 px-3 py-2.5"
              >
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <AlertTriangle
                    className={cn(
                      "h-4 w-4 shrink-0 mt-0.5",
                      item.riskLevel === "critical" ? "text-red-600" : "text-amber-600",
                    )}
                  />
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium leading-tight">{item.title}</span>
                      <Badge variant="outline" className={cn("text-[10px] font-normal", RISK_BADGE[item.riskLevel])}>
                        {item.riskLevel}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{item.detail}</p>
                    {item.employeeLabel !== "—" ? (
                      <p className="text-[11px] text-foreground/90">
                        <span className="text-muted-foreground">Employee:</span> {item.employeeLabel}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0 sm:justify-end">
                  {item.actions.slice(0, 2).map((act) => (
                    <Button
                      key={act}
                      type="button"
                      size="sm"
                      variant={act === item.actions[0] ? "default" : "outline"}
                      className="h-8 text-[11px] gap-1"
                      onClick={() => onAction(act, item)}
                    >
                      {act === ATTENDANCE_ACTION.SEND_OVERDUE_REMINDER ? (
                        <>
                          <ClipboardList className="h-3 w-3" />
                          {primaryActionLabel([act])}
                        </>
                      ) : (
                        <>
                          {primaryActionLabel([act])}
                          <ArrowRight className="h-3 w-3 opacity-70" />
                        </>
                      )}
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
