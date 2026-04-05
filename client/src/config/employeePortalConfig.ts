/**
 * Employee portal defaults — UI copy thresholds and future policy hooks.
 * Server entitlements remain authoritative; this layer drives UX signals only.
 */
export const employeePortalConfig = {
  leave: {
    /** Low-balance warning: days remaining at or below this (any type) */
    criticalDays: 2,
    /** Amber band uses ratio in UI; this caps “warn” for very small entitlements */
    warnRatio: 0.2,
  },
  attendance: {
    /** Minutes after shift start we still treat “check in now” as primary CTA */
    lateWindowMinutes: 120,
  },
  productivity: {
    /** Weight of attendance rate vs task completion (must sum to 1) */
    attendanceWeight: 0.55,
    taskWeight: 0.45,
    /** Neutral substitute when no attendance rows exist yet */
    neutralAttendanceFallback: 62,
    /** Neutral substitute when employee has no tasks yet */
    neutralTaskFallback: 72,
    /** Card title — avoid “performance rating” framing */
    uiCardTitle: "Work activity snapshot",
  },
  compliance: {
    /** Placeholder roadmap — no backend yet */
    governmentFeaturesEnabled: false,
  },
} as const;

export type EmployeePortalConfig = typeof employeePortalConfig;
