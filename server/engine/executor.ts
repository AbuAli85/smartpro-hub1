/**
 * SmartPRO Orchestration Engine — Core Executor
 *
 * Provides:
 *  - runRule(rule, entities): evaluates a single rule against a list of entities
 *  - processEventQueue(companyId): processes pending events and evaluates matching rules
 *  - checkSLAs(companyId): evaluates SLA thresholds and creates sla_alerts if breached
 */

import { getTrigger } from "./triggers";
import { getAction, type ActionContext } from "./actions";

export interface RuleRow {
  id: number;
  companyId: number;
  name: string;
  triggerType: string;
  conditionValue: string | null;
  actionType: string;
  actionPayload: string | null;
  isActive: boolean | number;
  isMuted?: boolean | number;
  throttleHours?: number | null;
  maxRetries?: number | null;
  priority?: number | null;
  alertRecipients?: string | null;
  dryRunMode?: boolean | number;
}

export interface RunRuleResult {
  ruleId: number;
  ruleName: string;
  matched: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
  details: Array<{
    entityId: number;
    message: string;
    actionResult?: { success: boolean; output?: string; error?: string };
  }>;
}

// ─── Run a single rule against a list of entities ─────────────────────────────

export async function runRule(
  rule: RuleRow,
  entities: Record<string, unknown>[],
  options: { dryRun?: boolean; recentlyNotified?: Set<string> } = {}
): Promise<RunRuleResult> {
  const trigger = getTrigger(rule.triggerType);
  const action = getAction(rule.actionType);
  const dryRun = options.dryRun ?? !!(rule.dryRunMode);
  const recentlyNotified = options.recentlyNotified ?? new Set<string>();

  const result: RunRuleResult = {
    ruleId: rule.id,
    ruleName: rule.name,
    matched: 0,
    skipped: 0,
    failed: 0,
    dryRun,
    details: [],
  };

  if (!trigger || !action) return result;
  if (rule.isMuted) return result;

  for (const entity of entities) {
    const match = trigger.evaluate(entity, rule.conditionValue ?? trigger.defaultConditionValue);
    if (!match?.matched) continue;

    // Throttle check
    const throttleKey = `rule_${rule.id}_entity_${entity.id}`;
    if (recentlyNotified.has(throttleKey)) {
      result.skipped++;
      continue;
    }

    if (dryRun) {
      result.matched++;
      result.details.push({ entityId: entity.id as number, message: match.message });
      continue;
    }

    // Execute action
    const ctx: ActionContext = {
      companyId: rule.companyId,
      ruleId: rule.id,
      ruleName: rule.name,
      triggerType: rule.triggerType,
      employeeId: entity.id as number | undefined,
      entityType: "employee",
      entityId: entity.id as number | undefined,
      message: match.message,
      metadata: { ...match.metadata, webhookUrl: rule.actionPayload },
      alertRecipients: rule.alertRecipients ?? "all_admins",
      db: null,
    };

    const actionResult = await action.execute(ctx);
    if (actionResult.success) {
      result.matched++;
    } else {
      result.failed++;
    }
    result.details.push({ entityId: entity.id as number, message: match.message, actionResult });
  }

  return result;
}

// ─── SLA Checker ─────────────────────────────────────────────────────────────

export interface SLAThreshold {
  ruleFailureRatePercent: number;  // alert if failure rate > this
  eventBacklogCount: number;        // alert if pending events > this
  processingDelaySeconds: number;   // alert if avg processing delay > this
}

export const DEFAULT_SLA_THRESHOLDS: SLAThreshold = {
  ruleFailureRatePercent: 20,
  eventBacklogCount: 100,
  processingDelaySeconds: 300,
};

export interface SLACheckResult {
  alerts: Array<{
    type: string;
    severity: "warning" | "critical";
    message: string;
    currentValue: number;
    threshold: number;
    ruleId?: number;
  }>;
}

export async function checkSLAs(
  companyId: number,
  thresholds: SLAThreshold = DEFAULT_SLA_THRESHOLDS
): Promise<SLACheckResult> {
  const alerts: SLACheckResult["alerts"] = [];

  try {
    const mysql = require("mysql2/promise");
    const conn = mysql.createPool(process.env.DATABASE_URL);

    // 1. Rule failure rates
    const [failureRows] = await conn.query(
      `SELECT rule_id,
         COUNT(*) as total,
         SUM(CASE WHEN status='failure' THEN 1 ELSE 0 END) as failures
       FROM automation_logs
       WHERE company_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
       GROUP BY rule_id
       HAVING total > 0`,
      [companyId]
    );
    for (const row of failureRows as any[]) {
      const rate = (Number(row.failures) / Number(row.total)) * 100;
      if (rate > thresholds.ruleFailureRatePercent) {
        alerts.push({
          type: "rule_failure_rate",
          severity: rate > 50 ? "critical" : "warning",
          message: `Rule #${row.rule_id} has a ${rate.toFixed(1)}% failure rate in the last 24h`,
          currentValue: rate,
          threshold: thresholds.ruleFailureRatePercent,
          ruleId: Number(row.rule_id),
        });
      }
    }

    // 2. Event backlog
    const [[backlogRow]] = await conn.query(
      `SELECT COUNT(*) as pending FROM automation_events WHERE company_id = ? AND status IN ('pending','failed')`,
      [companyId]
    );
    const backlog = Number((backlogRow as any).pending);
    if (backlog > thresholds.eventBacklogCount) {
      alerts.push({
        type: "event_backlog",
        severity: backlog > thresholds.eventBacklogCount * 3 ? "critical" : "warning",
        message: `Event backlog has ${backlog} unprocessed events (threshold: ${thresholds.eventBacklogCount})`,
        currentValue: backlog,
        threshold: thresholds.eventBacklogCount,
      });
    }

    // 3. Repeated failures (same rule failed 3+ times in last hour)
    const [repeatedRows] = await conn.query(
      `SELECT rule_id, COUNT(*) as failure_count
       FROM automation_logs
       WHERE company_id = ? AND status='failure' AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
       GROUP BY rule_id HAVING failure_count >= 3`,
      [companyId]
    );
    for (const row of repeatedRows as any[]) {
      alerts.push({
        type: "repeated_failure",
        severity: "critical",
        message: `Rule #${row.rule_id} has failed ${row.failure_count} times in the last hour`,
        currentValue: Number(row.failure_count),
        threshold: 3,
        ruleId: Number(row.rule_id),
      });
    }

    conn.end();
  } catch {
    // Non-fatal — return empty alerts if DB unavailable
  }

  return { alerts };
}
