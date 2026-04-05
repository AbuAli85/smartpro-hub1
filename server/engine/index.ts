/**
 * SmartPRO Orchestration Engine
 *
 * Public API for the platform-wide automation engine.
 * Import from this file to use the engine in any router.
 */

export { TRIGGER_REGISTRY, getTrigger, listTriggers } from "./triggers";
export type { TriggerDefinition, TriggerDomain } from "./triggers";

export { ACTION_REGISTRY, getAction, listActions } from "./actions";
export type { ActionDefinition, ActionContext, ActionResult } from "./actions";

export { runRule, checkSLAs, DEFAULT_SLA_THRESHOLDS } from "./executor";
export type { RuleRow, RunRuleResult, SLAThreshold, SLACheckResult } from "./executor";
