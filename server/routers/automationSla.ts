import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { checkSLAs, DEFAULT_SLA_THRESHOLDS } from "../engine";

async function requireCompanyId(userId: number): Promise<number> {
  const mysql = require("mysql2/promise");
  const conn = mysql.createPool(process.env.DATABASE_URL);
  const [[row]] = await conn.query(
    `SELECT company_id FROM company_members WHERE user_id = ? AND is_active = 1 LIMIT 1`,
    [userId]
  );
  conn.end();
  if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "No active company" });
  return (row as any).company_id as number;
}

export const automationSlaRouter = router({
  // ─── Live SLA Check ────────────────────────────────────────────────────────
  checkSLAs: protectedProcedure
    .input(
      z.object({
        ruleFailureRatePercent: z.number().min(1).max(100).optional(),
        eventBacklogCount: z.number().min(1).optional(),
        processingDelaySeconds: z.number().min(1).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const companyId = await requireCompanyId(ctx.user.id);
      const thresholds = {
        ruleFailureRatePercent: input?.ruleFailureRatePercent ?? DEFAULT_SLA_THRESHOLDS.ruleFailureRatePercent,
        eventBacklogCount: input?.eventBacklogCount ?? DEFAULT_SLA_THRESHOLDS.eventBacklogCount,
        processingDelaySeconds: input?.processingDelaySeconds ?? DEFAULT_SLA_THRESHOLDS.processingDelaySeconds,
      };
      return checkSLAs(companyId, thresholds);
    }),

  // ─── List Stored SLA Alerts ────────────────────────────────────────────────
  listAlerts: protectedProcedure
    .input(z.object({ includeAcknowledged: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireCompanyId(ctx.user.id);
      const mysql = require("mysql2/promise");
      const conn = mysql.createPool(process.env.DATABASE_URL);
      const [rows] = await conn.query(
        `SELECT * FROM sla_alerts WHERE company_id = ?${input?.includeAcknowledged ? "" : " AND acknowledged = 0"} ORDER BY created_at DESC LIMIT 100`,
        [companyId]
      );
      conn.end();
      return rows as any[];
    }),

  // ─── Acknowledge Alert ─────────────────────────────────────────────────────
  acknowledgeAlert: protectedProcedure
    .input(z.object({ alertId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireCompanyId(ctx.user.id);
      const mysql = require("mysql2/promise");
      const conn = mysql.createPool(process.env.DATABASE_URL);
      await conn.query(
        `UPDATE sla_alerts SET acknowledged = 1, acknowledged_at = NOW() WHERE id = ? AND company_id = ?`,
        [input.alertId, companyId]
      );
      conn.end();
      return { success: true };
    }),

  // ─── List Platform Tasks ───────────────────────────────────────────────────
  listTasks: protectedProcedure
    .input(
      z.object({
        status: z.enum(["open", "in_progress", "done", "dismissed", "all"]).optional(),
        priority: z.enum(["low", "medium", "high", "critical", "all"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const companyId = await requireCompanyId(ctx.user.id);
      const mysql = require("mysql2/promise");
      const conn = mysql.createPool(process.env.DATABASE_URL);

      let where = "WHERE pt.company_id = ?";
      const params: unknown[] = [companyId];

      if (input?.status && input.status !== "all") {
        where += " AND pt.status = ?";
        params.push(input.status);
      }
      if (input?.priority && input.priority !== "all") {
        where += " AND pt.priority = ?";
        params.push(input.priority);
      }

      const [rows] = await conn.query(
        `SELECT pt.*,
           CONCAT(e.first_name, ' ', e.last_name) as entityName,
           ar.name as ruleName
         FROM platform_tasks pt
         LEFT JOIN employees e ON e.id = pt.entity_id AND pt.entity_type = 'employee'
         LEFT JOIN automation_rules ar ON ar.id = pt.source_rule_id
         ${where}
         ORDER BY
           CASE pt.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
           pt.created_at DESC
         LIMIT 200`,
        params
      );
      conn.end();
      return rows as any[];
    }),

  // ─── Update Task ───────────────────────────────────────────────────────────
  updateTask: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        status: z.enum(["open", "in_progress", "done", "dismissed"]).optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireCompanyId(ctx.user.id);
      const mysql = require("mysql2/promise");
      const conn = mysql.createPool(process.env.DATABASE_URL);

      const updates: string[] = [];
      const params: unknown[] = [];

      if (input.status !== undefined) {
        updates.push("status = ?");
        params.push(input.status);
        if (input.status === "done") updates.push("completed_at = NOW()");
      }
      if (input.priority !== undefined) {
        updates.push("priority = ?");
        params.push(input.priority);
      }

      if (updates.length === 0) return { success: true };
      params.push(input.taskId, companyId);
      await conn.query(
        `UPDATE platform_tasks SET ${updates.join(", ")}, updated_at = NOW() WHERE id = ? AND company_id = ?`,
        params
      );
      conn.end();
      return { success: true };
    }),

  // ─── Executive Summary ─────────────────────────────────────────────────────
  getExecutiveSummary: protectedProcedure.query(async ({ ctx }) => {
    const companyId = await requireCompanyId(ctx.user.id);
    const mysql = require("mysql2/promise");
    const conn = mysql.createPool(process.env.DATABASE_URL);
    const startTime = Date.now();

    const [
      [empRows],
      [ruleRows],
      [logRows],
      [notifRows],
      [taskRows],
      [eventRows],
      [slaRows],
      [deptRows],
    ] = await Promise.all([
      conn.query(`SELECT COUNT(*) as total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active FROM employees WHERE company_id = ?`, [companyId]),
      conn.query(`SELECT COUNT(*) as total, SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) as active, SUM(CASE WHEN is_muted=1 THEN 1 ELSE 0 END) as muted FROM automation_rules WHERE company_id = ?`, [companyId]),
      conn.query(`SELECT COUNT(*) as total, SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as successes, SUM(CASE WHEN status='failure' THEN 1 ELSE 0 END) as failures, AVG(duration_ms) as avgDuration FROM automation_logs WHERE company_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)`, [companyId]),
      conn.query(`SELECT COUNT(*) as total, SUM(CASE WHEN is_read=0 THEN 1 ELSE 0 END) as unread FROM notifications WHERE company_id = ?`, [companyId]),
      conn.query(`SELECT COUNT(*) as total, SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open, SUM(CASE WHEN priority='critical' THEN 1 ELSE 0 END) as critical FROM platform_tasks WHERE company_id = ?`, [companyId]),
      conn.query(`SELECT COUNT(*) as total, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed FROM automation_events WHERE company_id = ?`, [companyId]),
      conn.query(`SELECT COUNT(*) as total, SUM(CASE WHEN acknowledged=0 THEN 1 ELSE 0 END) as unacknowledged FROM sla_alerts WHERE company_id = ?`, [companyId]),
      conn.query(`SELECT (SELECT COUNT(*) FROM employees WHERE company_id = ? AND department IS NULL) as unassigned`, [companyId]),
    ]);

    const totalEmp = Number((empRows as any)[0]?.total ?? 0);
    const activeEmp = Number((empRows as any)[0]?.active ?? 0);
    const unassignedEmp = Number((deptRows as any)[0]?.unassigned ?? 0);
    const totalRules = Number((ruleRows as any)[0]?.total ?? 0);
    const activeRules = Number((ruleRows as any)[0]?.active ?? 0);
    const mutedRules = Number((ruleRows as any)[0]?.muted ?? 0);
    const totalLogs = Number((logRows as any)[0]?.total ?? 0);
    const successLogs = Number((logRows as any)[0]?.successes ?? 0);
    const failureLogs = Number((logRows as any)[0]?.failures ?? 0);
    const avgDuration = Number((logRows as any)[0]?.avgDuration ?? 0);
    const unreadNotifs = Number((notifRows as any)[0]?.unread ?? 0);
    const openTasks = Number((taskRows as any)[0]?.open ?? 0);
    const criticalTasks = Number((taskRows as any)[0]?.critical ?? 0);
    const pendingEvents = Number((eventRows as any)[0]?.pending ?? 0);
    const failedEvents = Number((eventRows as any)[0]?.failed ?? 0);
    const unacknowledgedSLAs = Number((slaRows as any)[0]?.unacknowledged ?? 0);

    const automationSuccessRate = totalLogs > 0 ? (successLogs / totalLogs) * 100 : 100;
    const employeeActivityRate = totalEmp > 0 ? (activeEmp / totalEmp) * 100 : 100;
    const departmentCoverage = totalEmp > 0 ? ((totalEmp - unassignedEmp) / totalEmp) * 100 : 100;

    const healthScore = Math.round(
      automationSuccessRate * 0.3 +
      employeeActivityRate * 0.2 +
      departmentCoverage * 0.2 +
      (unacknowledgedSLAs === 0 ? 100 : Math.max(0, 100 - unacknowledgedSLAs * 10)) * 0.15 +
      (openTasks === 0 ? 100 : Math.max(0, 100 - openTasks * 2)) * 0.15
    );

    const [trendRows] = await conn.query(
      `SELECT DATE(created_at) as day,
         COUNT(*) as total,
         SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as successes,
         SUM(CASE WHEN status='failure' THEN 1 ELSE 0 END) as failures
       FROM automation_logs
       WHERE company_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      [companyId]
    );

    conn.end();

    return {
      queryTimeMs: Date.now() - startTime,
      healthScore,
      employees: { total: totalEmp, active: activeEmp, unassigned: unassignedEmp },
      automation: { totalRules, activeRules, mutedRules, totalLogs, successLogs, failureLogs, successRate: automationSuccessRate, avgDurationMs: avgDuration },
      notifications: { total: Number((notifRows as any)[0]?.total ?? 0), unread: unreadNotifs },
      tasks: { total: Number((taskRows as any)[0]?.total ?? 0), open: openTasks, critical: criticalTasks },
      events: { total: Number((eventRows as any)[0]?.total ?? 0), pending: pendingEvents, failed: failedEvents },
      sla: { total: Number((slaRows as any)[0]?.total ?? 0), unacknowledged: unacknowledgedSLAs },
      trend: (trendRows as any[]).map((r) => ({ day: r.day, total: Number(r.total), successes: Number(r.successes), failures: Number(r.failures) })),
    };
  }),
});
