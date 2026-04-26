/**
 * db.ts — backward-compatible barrel export.
 *
 * All data-access logic now lives in domain-specific repository modules under
 * `server/repositories/`.  This file re-exports everything so that existing
 * callers (`import { X } from "../db"`) continue to work without changes.
 *
 * New code should import directly from the relevant repository, e.g.:
 *   import { getEmployees } from "./repositories/hr.repository"
 */

// ── Connection helpers ────────────────────────────────────────────────────────
export { getDb, requireDb } from "./db.client";

// ── Domain repositories ───────────────────────────────────────────────────────
export * from "./repositories/users.repository";
export * from "./repositories/platformRoles.repository";
export * from "./repositories/companies.repository";
export * from "./repositories/subscriptions.repository";
export * from "./repositories/sanad.repository";
export * from "./repositories/proServices.repository";
export * from "./repositories/marketplace.repository";
export * from "./repositories/contracts.repository";
export * from "./repositories/hr.repository";
export * from "./repositories/crm.repository";
export * from "./repositories/clientCompanies.repository";
export * from "./repositories/notifications.repository";
export * from "./repositories/audit.repository";
export * from "./repositories/analytics.repository";
export * from "./repositories/settings.repository";
export * from "./repositories/attendance.repository";
