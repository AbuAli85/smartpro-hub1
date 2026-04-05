import { and, eq, inArray, sql } from "drizzle-orm";
import { employeeTasks } from "../../drizzle/schema";
import { getDb } from "../db";
import { sendEmployeeNotification } from "../routers/employeePortal";

/**
 * One-shot: notify task assigners (assigned_by user) for open tasks past due_date,
 * then set notified_overdue to avoid duplicate alerts. Resets when due date changes or assignee changes.
 */
export async function runEmployeeTaskOverdueNotifications(): Promise<{ notified: number }> {
  const db = await getDb();
  if (!db) return { notified: 0 };

  const rows = await db
    .select()
    .from(employeeTasks)
    .where(
      and(
        inArray(employeeTasks.status, ["pending", "in_progress", "blocked"]),
        eq(employeeTasks.notifiedOverdue, false),
        sql`${employeeTasks.dueDate} IS NOT NULL AND ${employeeTasks.dueDate} < CURDATE()`,
      ),
    );

  let notified = 0;
  for (const task of rows) {
    await sendEmployeeNotification({
      toUserId: task.assignedByUserId,
      companyId: task.companyId,
      type: "task_overdue",
      title: "Task overdue",
      message: `"${task.title}" is past due and still open.`,
      link: "/hr/tasks",
    });
    await db.update(employeeTasks).set({ notifiedOverdue: true }).where(eq(employeeTasks.id, task.id));
    notified++;
  }

  return { notified };
}
