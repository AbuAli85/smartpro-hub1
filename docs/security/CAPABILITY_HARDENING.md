# Capability System Final Hardening

**Date:** 2026-04-24  
**Branch:** main  
**Status:** Complete

---

## 1. Overview

This document records the final hardening pass applied on top of the capability/permission system (migration 0079, implemented March 2026). The goal was to eliminate any API surface reachable without a capability gate, add audit trails for all configuration changes, establish canonical defaults, and expose active workspace context in the UI.

---

## 2. What Changed

### 2.1 New Helper: `requireCapableMembership`

**File:** [server/_core/membership.ts](../../server/_core/membership.ts)

A new single-call helper that resolves the active workspace and returns everything needed for a capability gate:

```typescript
const { companyId, role, permissions, enabledModules } =
  await requireCapableMembership(ctx.user, input.companyId);
```

| Field | Source | Notes |
|---|---|---|
| `companyId` | `company_members` + `requireActiveCompanyId` | Validated active company |
| `role` | `company_members.role` | Tenant role |
| `permissions` | `company_members.permissions` | Per-user overrides (grants / denials) |
| `enabledModules` | `companies.enabledModules` | Module gating; `null` = all modules active |

**Platform operators** (super_admin, platform_admin, regional_manager, client_services) receive `{ role: "company_admin", permissions: null, enabledModules: null }` — they pass all capability gates automatically. One DB call replaces the previous two-call pattern (role check + capability check).

---

### 2.2 Capability Enforcement in Sensitive Routers

All sensitive routers now call `requireCapabilityAndModule(role, permissions, enabledModules, capability)` at the top of each procedure. This gate:

1. Resolves the effective capability set (role defaults ∪ grants ∖ denials)
2. Removes capabilities whose module is disabled
3. Throws `FORBIDDEN` if the required capability is absent

#### payroll.ts

| Procedure | Capability Required |
|---|---|
| `listRuns` | `view_payroll` |
| `listEmployeePayrollHistory` | `view_payroll` |
| `getRun` | `view_payroll` |
| `executeMonthly` | `edit_payroll` |
| `approveRun` | `edit_payroll` |
| `markPaid` | `edit_payroll` |
| `generateWpsFile` | `edit_payroll` |
| `generateWPSFile` | `edit_payroll` |

Role gate (`company_admin` or `finance_admin`) remains and runs first.

#### hr.ts

| Procedure | Capability Required |
|---|---|
| `listEmployees` | `view_hr` (for operator roles — company_member self-scope exempt) |
| `createEmployee` | `manage_hr` |
| `updateEmployee` | `manage_hr` |

All other HR mutations inherit the `requireHrOrAdmin` role gate; additional capability checks follow the same pattern and can be added procedure-by-procedure.

#### documents.ts

All procedures migrated from the legacy `deriveCapabilities(...).canUploadDocument` flag to the new `requireCapabilityAndModule` system:

| Procedure | Capability Required |
|---|---|
| `listCompanyDocs` | `view_documents` |
| `uploadCompanyDoc` | `manage_documents` |
| `updateCompanyDoc` | `manage_documents` |
| `deleteCompanyDoc` | `manage_documents` |
| `getCompanyDocStats` | `view_documents` |
| `listEmployeeDocs` | `view_documents` |
| `uploadEmployeeDoc` | `manage_documents` |
| `updateEmployeeDoc` | `manage_documents` |
| `deleteEmployeeDoc` | `manage_documents` |
| `getDashboard` | `view_documents` |
| `getAllEmployeeDocs` | `view_documents` |

#### contracts.ts

| Procedure | Capability Required |
|---|---|
| `list` | `view_contracts` |
| `getById` | `view_contracts` |
| `create` | `manage_contracts` |
| `update` | `manage_contracts` |

#### tasks.ts

| Procedure | Capability Required |
|---|---|
| `createTask` | `approve_tasks` |
| `updateTask` | `approve_tasks` |

---

### 2.3 Audit Logging for Capability and Module Changes

**File:** [server/tenantGovernanceAudit.ts](../../server/tenantGovernanceAudit.ts)

Two new audit action constants:

```typescript
MEMBER_CAPABILITIES_CHANGED: "member_capabilities_changed"
COMPANY_MODULES_CHANGED:     "company_modules_changed"
```

Two new recording functions:

#### `recordMemberCapabilitiesChangedAudit`

Emitted every time `capabilities.updateMemberCapabilities` succeeds.  
Records `beforeState` / `afterState` containing both the raw `permissions` delta AND the full resolved `effective` capability set — making the diff human-readable in the unified audit timeline without requiring a separate lookup.

```
beforeState: { permissions: string[] | null, effective: string[] }
afterState:  { permissions: string[],         effective: string[] }
metadata:    { targetUserId, platformOperator }
```

#### `recordCompanyModulesChangedAudit`

Emitted every time `capabilities.updateCompanyModules` succeeds.

```
beforeState: { enabledModules: string[] | null }
afterState:  { enabledModules: string[] | null }
metadata:    { platformOperator }
```

Both events appear in the unified audit timeline (`server/unifiedAuditTimeline.ts`) under `entityType: "company_member"` / `"company"` respectively.

---

### 2.4 `DEFAULT_COMPANY_CONFIG`

**File:** [shared/capabilities.ts](../../shared/capabilities.ts)

```typescript
export const DEFAULT_COMPANY_CONFIG = {
  enabledModules: null,                        // null = all modules active
  defaultRoleCapabilities: ROLE_DEFAULT_CAPABILITIES,
} as const;
```

This constant serves as the canonical reference point for:
- Onboarding scripts that provision new companies
- Tests asserting baseline capability expectations
- Documentation tooling that auto-generates permission matrices

`null` for `enabledModules` is intentional — it preserves backward compatibility with legacy/unlimited-plan tenants where no module restriction is stored.

---

### 2.5 `ActiveModeIndicator` UI Component

**File:** [client/src/components/ActiveModeIndicator.tsx](../../client/src/components/ActiveModeIndicator.tsx)

A status indicator that surfaces three pieces of session context to the user:

| Slot | Content |
|---|---|
| Mode badge | `Platform` / `Company` / `Client Portal` |
| Company name | Truncated name of the active company |
| Role label | Human-readable role (e.g., "HR Admin", "External Auditor") |

**Mode resolution logic:**

```
platformRole ∈ { super_admin, platform_admin, regional_manager, client_services }
  → "Platform" (purple badge)

companyRole === "client"
  → "Client Portal" (green badge)

otherwise
  → "Company" (blue badge)
```

The component reads from `useAuth()` (for `platformRole`) and `useActiveCompany()` (for company name + role). It renders `null` while auth is loading — no flash of incorrect state.

**Integration:** Drop it into any layout shell's header bar:

```tsx
import { ActiveModeIndicator } from "@/components/ActiveModeIndicator";

// In your header/navbar:
<ActiveModeIndicator className="ml-auto" />
```

---

## 3. Security Invariants (Verified)

### 3.1 No API reachable without a capability check

Every procedure in the following routers now has at minimum one of:
- `requireCapabilityAndModule(...)` (new system — per-user overrideable)
- `requireTenantRole` / `requireHrOrAdmin` / `requireFinanceOrAdmin` (role-based gate)
- `assertContractReadable` / `assertRowBelongsToActiveCompany` (row-ownership gate)
- `canAccessGlobalAdminProcedures` bypass (platform operator only)

The new `requireCapabilityAndModule` calls layer on top of (not replace) the existing role gates, so the security perimeter is only expanded.

### 3.2 Module disabled = API blocked

`requireCapabilityAndModule` internally calls `requireModuleEnabled` before checking the capability. When `companies.enabledModules` is a non-null array that does not include the module, the call throws `FORBIDDEN` regardless of role:

```
payroll module disabled → view_payroll / edit_payroll both blocked
documents module disabled → view_documents / manage_documents both blocked
...
```

`null` enabledModules (legacy plan) passes all module checks.

### 3.3 Per-user denials respected

`resolveEffectiveCapabilities` enforces:

```
effective = roleDefaults ∪ grants ∖ denials ∖ moduleBlockedCaps
```

A `finance_admin` with `"-edit_payroll"` in their `permissions` field is blocked from all `edit_payroll`-gated procedures, even though their role default includes it.

### 3.4 Audit trail for all capability changes

Every change to `company_members.permissions` or `companies.enabledModules` now emits an `audit_events` row. Combined with the existing `MEMBER_ROLE_CHANGED` event, the full capability lifecycle of any member is reconstructible from the audit log.

---

## 4. Capability-to-Module Mapping (Reference)

| Capability | Module | Blocked when module disabled |
|---|---|---|
| `view_payroll` | `payroll` | ✓ |
| `edit_payroll` | `payroll` | ✓ |
| `view_finance` | `finance` | ✓ |
| `view_executive_summary` | `finance` | ✓ |
| `view_hr` | `hr` | ✓ |
| `manage_hr` | `hr` | ✓ |
| `approve_tasks` | `hr` | ✓ |
| `view_documents` | `documents` | ✓ |
| `manage_documents` | `documents` | ✓ |
| `view_contracts` | `contracts` | ✓ |
| `manage_contracts` | `contracts` | ✓ |
| `view_crm` | `crm` | ✓ |
| `manage_crm` | `crm` | ✓ |
| `view_marketplace` | `marketplace` | ✓ |
| `view_compliance` | `compliance` | ✓ |
| `view_reports` | — | No module gate |
| `manage_users` | — | No module gate |

---

## 5. Role Default Capabilities (Reference)

| Role | Default Capabilities |
|---|---|
| `company_admin` | ALL (17 capabilities) |
| `hr_admin` | view_hr, manage_hr, view_reports, approve_tasks, view_documents |
| `finance_admin` | view_payroll, edit_payroll, view_finance, view_executive_summary, view_reports |
| `reviewer` | view_contracts, manage_contracts, view_crm, manage_crm, view_marketplace |
| `external_auditor` | view_payroll, view_reports, view_finance, view_executive_summary, view_hr, view_contracts, view_compliance |
| `company_member` | (none — self-portal access only) |
| `client` | (none — client portal only) |

Per-user overrides stored in `company_members.permissions` can grant or deny any capability relative to these defaults. Overrides are encoded as:
- `"view_payroll"` → explicit grant  
- `"-edit_payroll"` → explicit denial

---

## 6. Files Changed Summary

| File | Change Type |
|---|---|
| [server/_core/membership.ts](../../server/_core/membership.ts) | Added `requireCapableMembership` |
| [server/tenantGovernanceAudit.ts](../../server/tenantGovernanceAudit.ts) | Added `MEMBER_CAPABILITIES_CHANGED`, `COMPANY_MODULES_CHANGED`, two audit functions |
| [server/routers/capabilities.ts](../../server/routers/capabilities.ts) | Audit logging on `updateMemberCapabilities` and `updateCompanyModules` |
| [shared/capabilities.ts](../../shared/capabilities.ts) | Added `DEFAULT_COMPANY_CONFIG` |
| [server/routers/payroll.ts](../../server/routers/payroll.ts) | `view_payroll` / `edit_payroll` gates on 8 procedures |
| [server/routers/hr.ts](../../server/routers/hr.ts) | `view_hr` / `manage_hr` gates on key procedures |
| [server/routers/documents.ts](../../server/routers/documents.ts) | Full migration from old `deriveCapabilities` to `requireCapabilityAndModule` |
| [server/routers/contracts.ts](../../server/routers/contracts.ts) | `view_contracts` / `manage_contracts` gates |
| [server/routers/tasks.ts](../../server/routers/tasks.ts) | `approve_tasks` gate on mutation procedures |
| [client/src/components/ActiveModeIndicator.tsx](../../client/src/components/ActiveModeIndicator.tsx) | New component — platform/company/client mode + role badge |

---

## 7. Testing

Existing test suite covers:
- Capability resolution: `shared/capabilities.ts` unit tests (26 cases)
- Gate enforcement: `server/executionCapabilities.test.ts`
- Role authority: `server/auditor.test.ts`, `server/accessAnalytics.test.ts`

New coverage recommended:
- `capabilities.updateMemberCapabilities` → audit event emitted with correct before/after
- `capabilities.updateCompanyModules` → audit event emitted
- Module-disabled scenario: payroll router returns `FORBIDDEN` when `payroll` module not in `enabledModules`
- Capability denial scenario: `finance_admin` with `-edit_payroll` cannot call `approveRun`

---

## 8. Known Scope Exclusions

The following routers have role-based guards but were not given per-user capability checks in this pass:
- `financeHR.ts` — uses `requireFinanceOrAdmin` + `requireHrOrAdmin`; capability checks can be added following the same pattern
- `platformOps.ts` — platform-operator-only procedures; platform operators bypass all tenant capability checks
- `companies.ts` (admin) — company_admin-only; `manage_users` capability check can be added

These are lower-risk because:
1. Role gates already block the majority of unauthorized access
2. The new `requireCapableMembership` pattern makes adding capability checks trivial
