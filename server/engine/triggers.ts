/**
 * SmartPRO Orchestration Engine — Trigger Registry
 *
 * Each trigger defines:
 *  - key: unique identifier used in automation_rules.trigger_type
 *  - label: human-readable name
 *  - domain: which module owns this trigger
 *  - description: what condition fires it
 *  - conditionLabel: label for the threshold/condition value field
 *  - defaultConditionValue: sensible default
 *  - evaluate: pure function that tests an entity row against the rule condition
 */

export type TriggerDomain = "hr" | "contracts" | "bookings" | "payments" | "clients" | "platform";

export interface TriggerDefinition<T = Record<string, unknown>> {
  key: string;
  label: string;
  domain: TriggerDomain;
  description: string;
  conditionLabel: string;
  defaultConditionValue: string;
  evaluate: (
    entity: T,
    conditionValue: string
  ) => { matched: boolean; message: string; metadata: Record<string, unknown> } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysUntil(dateVal: Date | string | null | undefined): number | null {
  if (!dateVal) return null;
  const expiry = new Date(dateVal);
  const now = new Date();
  return Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function empName(emp: Record<string, unknown>): string {
  return [emp.firstName, emp.lastName].filter(Boolean).join(" ") || `Employee #${emp.id}`;
}

// ─── HR Triggers ─────────────────────────────────────────────────────────────

export const visaExpiryTrigger: TriggerDefinition = {
  key: "visa_expiry",
  label: "Visa Expiry",
  domain: "hr",
  description: "Fires when an employee's visa expires within N days",
  conditionLabel: "Days before expiry",
  defaultConditionValue: "30",
  evaluate(entity, conditionValue) {
    const days = daysUntil(entity.visaExpiryDate as string | null);
    const threshold = parseInt(conditionValue, 10);
    if (days !== null && days >= 0 && days <= threshold) {
      return {
        matched: true,
        message: `${empName(entity)}'s visa expires in ${days} day(s)`,
        metadata: { daysUntilExpiry: days, field: "visaExpiryDate", expiryDate: entity.visaExpiryDate },
      };
    }
    return null;
  },
};

export const workPermitExpiryTrigger: TriggerDefinition = {
  key: "work_permit_expiry",
  label: "Work Permit Expiry",
  domain: "hr",
  description: "Fires when a work permit expires within N days",
  conditionLabel: "Days before expiry",
  defaultConditionValue: "15",
  evaluate(entity, conditionValue) {
    const days = daysUntil(entity.workPermitExpiryDate as string | null);
    const threshold = parseInt(conditionValue, 10);
    if (days !== null && days >= 0 && days <= threshold) {
      return {
        matched: true,
        message: `${empName(entity)}'s work permit expires in ${days} day(s)`,
        metadata: { daysUntilExpiry: days, field: "workPermitExpiryDate", expiryDate: entity.workPermitExpiryDate },
      };
    }
    return null;
  },
};

export const passportExpiryTrigger: TriggerDefinition = {
  key: "passport_expiry",
  label: "Passport Expiry",
  domain: "hr",
  description: "Fires when a passport expires within N days",
  conditionLabel: "Days before expiry",
  defaultConditionValue: "60",
  evaluate(entity, conditionValue) {
    const days = daysUntil((entity.passportExpiry ?? entity.passportExpiryDate) as string | null);
    const threshold = parseInt(conditionValue, 10);
    if (days !== null && days >= 0 && days <= threshold) {
      return {
        matched: true,
        message: `${empName(entity)}'s passport expires in ${days} day(s)`,
        metadata: { daysUntilExpiry: days, field: "passportExpiry" },
      };
    }
    return null;
  },
};

export const completenessBelow: TriggerDefinition = {
  key: "completeness_below",
  label: "Profile Completeness Below",
  domain: "hr",
  description: "Fires when an employee's profile completeness falls below N%",
  conditionLabel: "Completeness threshold (%)",
  defaultConditionValue: "60",
  evaluate(entity, conditionValue) {
    const score = entity._completenessScore as number | undefined;
    if (score === undefined) return null;
    const threshold = parseInt(conditionValue, 10);
    if (score < threshold) {
      return {
        matched: true,
        message: `${empName(entity)}'s profile completeness is ${score}% (below ${threshold}%)`,
        metadata: { completenessScore: score, threshold },
      };
    }
    return null;
  },
};

export const noDepartmentTrigger: TriggerDefinition = {
  key: "no_department",
  label: "No Department Assigned",
  domain: "hr",
  description: "Fires when an employee has no department",
  conditionLabel: "N/A",
  defaultConditionValue: "0",
  evaluate(entity) {
    if (!entity.department) {
      return {
        matched: true,
        message: `${empName(entity)} has no department assigned`,
        metadata: { field: "department" },
      };
    }
    return null;
  },
};

// ─── Contract Triggers ────────────────────────────────────────────────────────

export const contractExpiryTrigger: TriggerDefinition = {
  key: "contract_expiry",
  label: "Contract Expiry",
  domain: "contracts",
  description: "Fires when a contract expires within N days",
  conditionLabel: "Days before expiry",
  defaultConditionValue: "30",
  evaluate(entity, conditionValue) {
    const days = daysUntil(entity.endDate as string | null);
    const threshold = parseInt(conditionValue, 10);
    if (days !== null && days >= 0 && days <= threshold) {
      return {
        matched: true,
        message: `Contract "${entity.title ?? entity.id}" expires in ${days} day(s)`,
        metadata: { daysUntilExpiry: days, contractId: entity.id },
      };
    }
    return null;
  },
};

// ─── Booking / Payment / Client Triggers ─────────────────────────────────────

export const bookingOverdueTrigger: TriggerDefinition = {
  key: "booking_overdue",
  label: "Booking Overdue",
  domain: "bookings",
  description: "Fires when a booking is overdue by N days",
  conditionLabel: "Days overdue",
  defaultConditionValue: "1",
  evaluate(entity, conditionValue) {
    const days = daysUntil(entity.dueDate as string | null);
    const threshold = parseInt(conditionValue, 10);
    if (days !== null && days < 0 && Math.abs(days) >= threshold) {
      return {
        matched: true,
        message: `Booking #${entity.id} is ${Math.abs(days)} day(s) overdue`,
        metadata: { daysOverdue: Math.abs(days), bookingId: entity.id },
      };
    }
    return null;
  },
};

export const paymentOverdueTrigger: TriggerDefinition = {
  key: "payment_overdue",
  label: "Payment Overdue",
  domain: "payments",
  description: "Fires when a payment is overdue by N days",
  conditionLabel: "Days overdue",
  defaultConditionValue: "1",
  evaluate(entity, conditionValue) {
    const days = daysUntil(entity.dueDate as string | null);
    const threshold = parseInt(conditionValue, 10);
    if (days !== null && days < 0 && Math.abs(days) >= threshold) {
      return {
        matched: true,
        message: `Payment #${entity.id} is ${Math.abs(days)} day(s) overdue`,
        metadata: { daysOverdue: Math.abs(days), paymentId: entity.id },
      };
    }
    return null;
  },
};

export const clientInactiveTrigger: TriggerDefinition = {
  key: "client_inactive",
  label: "Client Inactive",
  domain: "clients",
  description: "Fires when a client has had no activity for N days",
  conditionLabel: "Days of inactivity",
  defaultConditionValue: "30",
  evaluate(entity, conditionValue) {
    const days = daysUntil(entity.lastActivityAt as string | null);
    const threshold = parseInt(conditionValue, 10);
    // days will be negative (last activity in the past)
    if (days !== null && Math.abs(days) >= threshold) {
      return {
        matched: true,
        message: `Client "${entity.name ?? entity.id}" has been inactive for ${Math.abs(days)} day(s)`,
        metadata: { daysInactive: Math.abs(days), clientId: entity.id },
      };
    }
    return null;
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const TRIGGER_REGISTRY: Map<string, TriggerDefinition> = new Map([
  [visaExpiryTrigger.key, visaExpiryTrigger],
  [workPermitExpiryTrigger.key, workPermitExpiryTrigger],
  [passportExpiryTrigger.key, passportExpiryTrigger],
  [completenessBelow.key, completenessBelow],
  [noDepartmentTrigger.key, noDepartmentTrigger],
  [contractExpiryTrigger.key, contractExpiryTrigger],
  [bookingOverdueTrigger.key, bookingOverdueTrigger],
  [paymentOverdueTrigger.key, paymentOverdueTrigger],
  [clientInactiveTrigger.key, clientInactiveTrigger],
]);

export function getTrigger(key: string): TriggerDefinition | undefined {
  return TRIGGER_REGISTRY.get(key);
}

export function listTriggers(): TriggerDefinition[] {
  return Array.from(TRIGGER_REGISTRY.values());
}
