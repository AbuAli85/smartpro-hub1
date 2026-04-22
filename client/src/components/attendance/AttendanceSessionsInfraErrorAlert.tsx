import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Shown when the server marks the error with `data.reason === ATTENDANCE_SESSIONS_TABLE_REQUIRED`. */
export function AttendanceSessionsInfraErrorAlert({ className }: { className?: string }) {
  return (
    <Alert variant="warning" className={className}>
      <AlertTriangle />
      <AlertTitle>Attendance session infrastructure is not available</AlertTitle>
      <AlertDescription className="space-y-2 text-amber-950/90 dark:text-amber-100/90 [&_p]:text-sm">
        <p>
          Apply migration{" "}
          <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-xs">drizzle/0034_attendance_sessions.sql</code>{" "}
          (or your deployment equivalent), then restart.
        </p>
        <p>Until then, clock-in/out, session repair, and payroll preflight cannot complete in strict mode.</p>
        <p className="text-xs text-amber-900/85 dark:text-amber-100/80">
          Temporary brownfield only:{" "}
          <code className="rounded bg-background/60 px-1 py-0.5 font-mono">ALLOW_MISSING_ATTENDANCE_SESSIONS_TABLE=1</code>{" "}
          — not recommended for production payroll; remove after migration.
        </p>
      </AlertDescription>
    </Alert>
  );
}
