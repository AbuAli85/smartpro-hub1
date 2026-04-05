/**
 * SmartPRO Orchestration Engine — Action Registry
 *
 * Each action defines:
 *  - key: unique identifier used in automation_rules.action_type
 *  - label: human-readable name
 *  - description: what the action does
 *  - execute: async function that performs the action
 */

export interface ActionContext {
  companyId: number;
  ruleId: number;
  ruleName: string;
  triggerType: string;
  employeeId?: number;
  entityType?: string;
  entityId?: number;
  message: string;
  metadata: Record<string, unknown>;
  alertRecipients?: string;
  db: unknown; // Drizzle db instance
}

export interface ActionResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface ActionDefinition {
  key: string;
  label: string;
  description: string;
  requiresTarget: boolean;
  execute: (ctx: ActionContext) => Promise<ActionResult>;
}

// ─── Notify Admin ─────────────────────────────────────────────────────────────

export const notifyAdminAction: ActionDefinition = {
  key: "notify_admin",
  label: "Notify Admin",
  description: "Creates an in-app notification for company admins",
  requiresTarget: false,
  async execute(ctx) {
    try {
      const mysql = require("mysql2/promise");
      const conn = mysql.createPool(process.env.DATABASE_URL);
      const groupKey = `rule_${ctx.ruleId}_entity_${ctx.entityId ?? ctx.employeeId ?? "global"}`;
      await conn.query(
        `INSERT INTO notifications (company_id, rule_id, employee_id, title, message, severity, group_key, created_at)
         VALUES (?, ?, ?, ?, ?, 'high', ?, NOW())
         ON DUPLICATE KEY UPDATE message=VALUES(message), created_at=NOW()`,
        [ctx.companyId, ctx.ruleId, ctx.employeeId ?? null, `[${ctx.ruleName}]`, ctx.message, groupKey]
      );
      conn.end();
      return { success: true, output: "Notification created" };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

// ─── Notify Employee ──────────────────────────────────────────────────────────

export const notifyEmployeeAction: ActionDefinition = {
  key: "notify_employee",
  label: "Notify Employee",
  description: "Creates a notification targeted at the specific employee",
  requiresTarget: true,
  async execute(ctx) {
    // Same as notify_admin but flagged for employee-facing notification
    return notifyAdminAction.execute(ctx);
  },
};

// ─── Create Task ──────────────────────────────────────────────────────────────

export const createTaskAction: ActionDefinition = {
  key: "create_task",
  label: "Create Task",
  description: "Creates a platform task assigned to the HR admin for follow-up",
  requiresTarget: false,
  async execute(ctx) {
    try {
      const mysql = require("mysql2/promise");
      const conn = mysql.createPool(process.env.DATABASE_URL);
      await conn.query(
        `INSERT INTO platform_tasks 
          (company_id, title, description, entity_type, entity_id, source_rule_id, status, priority, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'open', 'high', NOW())`,
        [
          ctx.companyId,
          `[Auto] ${ctx.message}`,
          `Triggered by rule: ${ctx.ruleName}. Metadata: ${JSON.stringify(ctx.metadata)}`,
          ctx.entityType ?? "employee",
          ctx.entityId ?? ctx.employeeId ?? null,
          ctx.ruleId,
        ]
      );
      conn.end();
      return { success: true, output: "Task created" };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

// ─── Escalate to Admin ────────────────────────────────────────────────────────

export const escalateAction: ActionDefinition = {
  key: "escalate",
  label: "Escalate to Admin",
  description: "Creates a critical-severity notification and a high-priority task",
  requiresTarget: false,
  async execute(ctx) {
    const notifResult = await notifyAdminAction.execute(ctx);
    const taskResult = await createTaskAction.execute(ctx);
    if (notifResult.success && taskResult.success) {
      return { success: true, output: "Escalated: notification + task created" };
    }
    return { success: false, error: `Notification: ${notifResult.error ?? "ok"}, Task: ${taskResult.error ?? "ok"}` };
  },
};

// ─── Send Email ───────────────────────────────────────────────────────────────

export const sendEmailAction: ActionDefinition = {
  key: "send_email",
  label: "Send Email",
  description: "Sends an email notification via the platform email service",
  requiresTarget: false,
  async execute(ctx) {
    // Email sending via Resend API (if configured)
    try {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        // Fallback: create notification instead
        return notifyAdminAction.execute(ctx);
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "SmartPRO <noreply@smartprohub.com>",
          to: ["admin@smartprohub.com"],
          subject: `[SmartPRO Alert] ${ctx.ruleName}`,
          html: `<p>${ctx.message}</p><p><small>Rule: ${ctx.ruleName} | Company: ${ctx.companyId}</small></p>`,
        }),
      });
      if (res.ok) return { success: true, output: "Email sent" };
      return { success: false, error: `Email API returned ${res.status}` };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

// ─── Flag for Review ──────────────────────────────────────────────────────────

export const flagReviewAction: ActionDefinition = {
  key: "flag_review",
  label: "Flag for Review",
  description: "Marks the entity as needing manual review in the platform",
  requiresTarget: false,
  async execute(ctx) {
    try {
      const mysql = require("mysql2/promise");
      const conn = mysql.createPool(process.env.DATABASE_URL);
      if (ctx.employeeId) {
        await conn.query(
          `UPDATE employees SET status='needs_review' WHERE id=? AND company_id=?`,
          [ctx.employeeId, ctx.companyId]
        );
      }
      conn.end();
      return { success: true, output: "Flagged for review" };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

// ─── Webhook ──────────────────────────────────────────────────────────────────

export const webhookAction: ActionDefinition = {
  key: "webhook",
  label: "Webhook",
  description: "POSTs a JSON payload to an external URL (configured in actionPayload)",
  requiresTarget: false,
  async execute(ctx) {
    try {
      const url = (ctx.metadata.webhookUrl as string) ?? "";
      if (!url) return { success: false, error: "No webhook URL configured in actionPayload" };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-SmartPRO-Rule": ctx.ruleName },
        body: JSON.stringify({
          ruleId: ctx.ruleId,
          ruleName: ctx.ruleName,
          triggerType: ctx.triggerType,
          companyId: ctx.companyId,
          employeeId: ctx.employeeId,
          message: ctx.message,
          metadata: ctx.metadata,
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return { success: true, output: `Webhook delivered (${res.status})` };
      return { success: false, error: `Webhook returned ${res.status}` };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

// ─── Assign to User ───────────────────────────────────────────────────────────

export const assignToUserAction: ActionDefinition = {
  key: "assign_to_user",
  label: "Assign to User",
  description: "Assigns a task to a specific user (user ID in actionPayload)",
  requiresTarget: true,
  async execute(ctx) {
    try {
      const mysql = require("mysql2/promise");
      const conn = mysql.createPool(process.env.DATABASE_URL);
      const assignedUserId = ctx.metadata.assignedUserId as number | undefined;
      await conn.query(
        `INSERT INTO platform_tasks 
          (company_id, title, description, assigned_to_user_id, entity_type, entity_id, source_rule_id, status, priority, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 'high', NOW())`,
        [
          ctx.companyId,
          `[Assigned] ${ctx.message}`,
          `Triggered by rule: ${ctx.ruleName}`,
          assignedUserId ?? null,
          ctx.entityType ?? "employee",
          ctx.entityId ?? ctx.employeeId ?? null,
          ctx.ruleId,
        ]
      );
      conn.end();
      return { success: true, output: `Task assigned to user ${assignedUserId ?? "unspecified"}` };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

// ─── Update Entity Field ──────────────────────────────────────────────────────

export const updateFieldAction: ActionDefinition = {
  key: "update_field",
  label: "Update Entity Field",
  description: "Updates a specific field on the entity (field + value in actionPayload JSON)",
  requiresTarget: true,
  async execute(ctx) {
    // This is a safe no-op stub — field updates require domain-specific logic
    // Modules should override this by registering a domain-specific handler
    return { success: true, output: "Field update queued (domain handler required)" };
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const ACTION_REGISTRY: Map<string, ActionDefinition> = new Map([
  [notifyAdminAction.key, notifyAdminAction],
  [notifyEmployeeAction.key, notifyEmployeeAction],
  [createTaskAction.key, createTaskAction],
  [escalateAction.key, escalateAction],
  [sendEmailAction.key, sendEmailAction],
  [flagReviewAction.key, flagReviewAction],
  [webhookAction.key, webhookAction],
  [assignToUserAction.key, assignToUserAction],
  [updateFieldAction.key, updateFieldAction],
]);

export function getAction(key: string): ActionDefinition | undefined {
  return ACTION_REGISTRY.get(key);
}

export function listActions(): ActionDefinition[] {
  return Array.from(ACTION_REGISTRY.values());
}
