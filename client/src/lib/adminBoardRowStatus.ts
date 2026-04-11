/**
 * Labels for scheduling.getTodayBoard row `status` (HR + Today board).
 */
export function getAdminBoardRowStatusPresentation(status: string): {
  label: string;
  className: string;
} {
  const map: Record<string, { label: string; className: string }> = {
    holiday: { label: "Holiday", className: "border-blue-300 text-blue-700 bg-blue-50" },
    upcoming: { label: "Upcoming", className: "border-slate-300 text-slate-700 bg-slate-50" },
    not_checked_in: { label: "Not checked in", className: "border-amber-300 text-amber-800 bg-amber-50" },
    late_no_checkin: { label: "Late · no arrival", className: "border-orange-300 text-orange-800 bg-orange-50" },
    absent: { label: "Absent", className: "border-red-300 text-red-700 bg-red-50" },
    checked_in_on_time: { label: "Checked in", className: "border-emerald-300 text-emerald-800 bg-emerald-50" },
    checked_in_late: { label: "Checked in · late", className: "border-yellow-300 text-yellow-800 bg-yellow-50" },
    checked_out: { label: "Completed", className: "border-gray-300 text-gray-700 bg-gray-50" },
  };
  return map[status] ?? { label: status.replace(/_/g, " "), className: "text-muted-foreground border-muted" };
}
