/**
 * Default **portal balance caps** (calendar year) until per-company HR policy is stored in DB.
 *
 * **Oman context (non-exhaustive — verify with qualified counsel / MOL updates):**
 * - **Annual leave:** commonly **30 working days** after qualifying service (widely cited under current Omani labour rules).
 * - **Emergency / urgent personal leave:** commonly cited as **6 days per year** with full pay for unforeseen personal needs (sources vary slightly; 6 is a typical HR figure).
 * - **Sick leave:** statute often allows **longer** medically justified sick leave with **tiered pay** over many weeks/months — **not** the same as a 15-day cap. Here **`sick: 15`** means a **company-style “full-pay sick pool”** for **balance display** and simple self-service limits until you add configurable policies.
 *
 * This module is **not legal advice**. Replace defaults with company-specific rules when the product supports them.
 */
export const OMAN_LEAVE_PORTAL_DEFAULTS = {
  annual: 30,
  sick: 15,
  emergency: 6,
} as const;

export type OmanLeavePortalDefaultKey = keyof typeof OMAN_LEAVE_PORTAL_DEFAULTS;
