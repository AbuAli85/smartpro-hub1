import { OMAN_LEAVE_PORTAL_DEFAULTS } from "./omanLeavePolicyDefaults";

export type LeavePolicyCaps = { annual: number; sick: number; emergency: number };

/** Stored on `companies.leavePolicyCaps` — omit keys to inherit Oman portal defaults. */
export type LeavePolicyCapsOverrides = Partial<Record<keyof LeavePolicyCaps, number>>;

export function mergeLeavePolicyCaps(overrides: LeavePolicyCapsOverrides | null | undefined): LeavePolicyCaps {
  return {
    annual: overrides?.annual ?? OMAN_LEAVE_PORTAL_DEFAULTS.annual,
    sick: overrides?.sick ?? OMAN_LEAVE_PORTAL_DEFAULTS.sick,
    emergency: overrides?.emergency ?? OMAN_LEAVE_PORTAL_DEFAULTS.emergency,
  };
}
