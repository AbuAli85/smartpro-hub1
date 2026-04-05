/** Date-only or datetime due values; compares by local calendar day. */
export type DueUrgency = "none" | "upcoming" | "due_today" | "overdue";

function parseDueLocal(due: Date | string): Date {
  if (typeof due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(due.trim())) {
    const [y, m, d] = due.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const x = new Date(due);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

function startOfTodayLocal(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

export function getDueUrgency(
  dueDate: Date | string | null | undefined,
  status: string,
): DueUrgency {
  if (!dueDate || status === "completed" || status === "cancelled") return "none";
  const due = parseDueLocal(dueDate);
  const today = startOfTodayLocal();
  const dueT = due.getTime();
  const todayT = today.getTime();
  if (dueT < todayT) return "overdue";
  if (dueT === todayT) return "due_today";
  return "upcoming";
}

/** Full days overdue (≥1 when past due date). */
export function overdueCalendarDays(dueDate: Date | string | null | undefined): number | null {
  if (!dueDate) return null;
  const due = parseDueLocal(dueDate);
  const today = startOfTodayLocal();
  const diff = Math.floor((today.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
  return diff > 0 ? diff : null;
}

/** Days until due (≥0); 0 = due today. */
export function daysUntilDueCalendar(dueDate: Date | string | null | undefined): number | null {
  if (!dueDate) return null;
  const due = parseDueLocal(dueDate);
  const today = startOfTodayLocal();
  const diff = Math.floor((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return diff >= 0 ? diff : null;
}

export function slaLabel(
  dueDate: Date | string | null | undefined,
  status: string,
): string | null {
  const u = getDueUrgency(dueDate, status);
  if (u === "none") return null;
  if (u === "overdue") {
    const d = overdueCalendarDays(dueDate);
    return d === 1 ? "1 day overdue" : d != null ? `${d} days overdue` : "Overdue";
  }
  if (u === "due_today") return "Due today";
  const left = daysUntilDueCalendar(dueDate);
  if (left === null) return null;
  if (left === 0) return "Due today";
  if (left === 1) return "Due tomorrow";
  return `Due in ${left} days`;
}
