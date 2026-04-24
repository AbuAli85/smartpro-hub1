# Capability & Permission System

> SmartPRO Hub — configurable per-user capability layer on top of roles.

## Overview

The system extends the existing role-based access control with two orthogonal axes:

| Axis | What it does | Where stored |
|---|---|---|
| **Per-user capability overrides** | Add or remove individual capabilities from a member's role defaults | `company_members.permissions` (existing JSON column) |
| **Company module configuration** | Enable/disable entire feature areas per company | `companies.enabledModules` (JSON column, migration 0079) |

### Layered enforcement

```
Role defaults
  ∪ explicit grants  (+capability in permissions[])
  ∖ explicit denials (-capability in permissions[])
  ∖ disabled modules (companies.enabledModules)
= Effective capability set
```

Both frontend (nav visibility) and backend (API procedures) enforce the same effective set.

---

## Schema

### `company_members.permissions` (existing, extended)

```json
["view_payroll", "-approve_tasks"]
```

- Plain string = explicit **grant** (adds capability on top of role defaults)
- `"-"` prefix = explicit **denial** (removes capability from role defaults)
- Stored as the **minimal delta** — only additions and removals; role defaults are not repeated

### `companies.enabledModules` (new — migration `0079`)

```json
["payroll", "finance", "hr", "crm"]
```

- `null` = all modules active (legacy / unlimited plan — default)
- `string[]` = explicit allowlist; any module not listed is disabled

---

## Capability Catalogue

| Key | Label | Module |
|---|---|---|
| `view_reports` | View Reports | hr |
| `view_payroll` | View Payroll | payroll |
| `edit_payroll` | Edit Payroll | payroll |
| `view_executive_summary` | View Executive Summary | finance |
| `view_finance` | View Finance | finance |
| `view_hr` | View HR | hr |
| `manage_hr` | Manage HR | hr |
| `approve_tasks` | Approve Tasks | hr |
| `manage_users` | Manage Users | _(admin)_ |
| `view_documents` | View Documents | documents |
| `manage_documents` | Manage Documents | documents |
| `view_contracts` | View Contracts | contracts |
| `manage_contracts` | Manage Contracts | contracts |
| `view_crm` | View CRM | crm |
| `manage_crm` | Manage CRM | crm |
| `view_marketplace` | View Marketplace | marketplace |
| `view_compliance` | View Compliance | compliance |

---

## Role Default Capabilities

| Role | Default capabilities |
|---|---|
| `company_admin` | **all** |
| `hr_admin` | view_hr, manage_hr, view_reports, approve_tasks, view_documents |
| `finance_admin` | view_payroll, edit_payroll, view_finance, view_executive_summary, view_reports |
| `reviewer` | view_contracts, manage_contracts, view_crm, manage_crm, view_marketplace |
| `external_auditor` | view_payroll, view_reports, view_finance, view_executive_summary, view_hr, view_contracts, view_compliance |
| `company_member` | _(none)_ |
| `client` | _(none)_ |

---

## Per-User Override Examples

### Example 1: hr_admin who also needs payroll visibility

```
Role:        hr_admin
permissions: ["view_payroll"]

Effective:   hr_admin defaults ∪ {view_payroll}
             = view_hr, manage_hr, view_reports, approve_tasks, view_documents, view_payroll
```

### Example 2: hr_admin restricted from task approval

```
Role:        hr_admin
permissions: ["-approve_tasks"]

Effective:   hr_admin defaults ∖ {approve_tasks}
             = view_hr, manage_hr, view_reports, view_documents
```

### Example 3: company_member with report access

```
Role:        company_member
permissions: ["view_reports", "view_payroll"]

Effective:   {} ∪ {view_reports, view_payroll}
             = view_reports, view_payroll
```

---

## Company Module Examples

### Company A: Payroll only

```json
{ "enabledModules": ["payroll", "hr"] }
```

- `/finance` — hidden (finance module disabled)
- `/payroll` — visible for eligible roles
- `/crm` — hidden (crm module disabled)

### Company B: No payroll (outsourced)

```json
{ "enabledModules": ["finance", "hr", "crm", "compliance", "marketplace", "documents", "contracts"] }
```

- `/payroll` — blocked at nav AND API even for finance_admin

### Company C: Unlimited (legacy)

```json
{ "enabledModules": null }
```

- All modules active; module gating does not apply

---

## Integration Points

### 1. Shared core — `shared/capabilities.ts`

```typescript
// Core functions
resolveEffectiveCapabilities(role, permissions, enabledModules) → Set<Capability>
hasCapability(effective, capability) → boolean
buildPermissionsOverride(role, desiredEffective) → string[]  // for admin save
getDefaultCapabilitiesForRole(role) → Set<Capability>
```

### 2. Nav visibility — `shared/clientNav.ts`

`clientNavItemVisible` now:
- Computes `effectiveCaps` once via `resolveEffectiveCapabilities` (replaces raw `perms.includes()` checks)
- Applies **module gating** when `navMode === "company"` and `enabledModules` is set
- `ClientNavOptions.enabledModules` threads company modules to the nav

### 3. Backend enforcement — `server/_core/capabilityGate.ts`

```typescript
// In any tRPC procedure:
requireCapability(role, permissions, enabledModules, "view_payroll");
requireModuleEnabled(enabledModules, "payroll");
requireCapabilityAndModule(role, permissions, enabledModules, "view_payroll");
```

### 4. tRPC router — `server/routers/capabilities.ts`

| Procedure | Who can call | What it does |
|---|---|---|
| `capabilities.listMemberCapabilities` | company_admin, platform operators | Returns all members with role defaults, grants, denials, effective set |
| `capabilities.updateMemberCapabilities` | company_admin, platform operators | Sets desired effective capability list for a member (encoded as minimal delta) |
| `capabilities.getCompanyModules` | any member | Returns enabled module list |
| `capabilities.updateCompanyModules` | company_admin, platform operators | Sets enabled modules (null = unlimited) |

### 5. Admin UI — `client/src/pages/CapabilitiesPage.tsx`

Route: `/company-admin/capabilities` (add to nav config)

Three sections:
1. **Company Modules** — toggle which features are active
2. **Member Capabilities** — per-user capability editor (expandable rows + edit dialog)
3. **Role Defaults Reference** — read-only capability matrix

---

## Security Properties

| Property | Enforcement |
|---|---|
| Frontend gating | `clientNavItemVisible` checks `effectiveCaps` + `enabledModules` |
| Backend gating | `requireCapability` / `requireModuleEnabled` in procedures |
| No frontend bypass | API gates are independent of nav — disabling nav items does not skip API checks |
| Admin self-edit prevented | Admin cannot edit their own capabilities (platform operators exempt) |
| Backward compatible | Existing `view_reports`, `view_payroll`, `view_executive_summary` in `permissions[]` continue to work as grants |
| Platform operators bypass modules | Module gating only applies in `navMode === "company"` — platform ops are unaffected |

---

## Adding a New Capability

1. Add the key to `CAPABILITY_KEYS` in `shared/capabilities.ts`
2. Add a label to `CAPABILITY_LABELS`
3. Assign it to the relevant `MODULE_CAPABILITIES` entry
4. Update `ROLE_DEFAULT_CAPABILITIES` if any role should have it by default
5. Call `requireCapability(…, "new_key")` in the relevant tRPC procedure
6. Add a `clientNavItemVisible` check if it gates a nav item

---

## Adding a New Module

1. Add to `MODULE_KEYS` and `MODULE_LABELS` in `shared/capabilities.ts`
2. List its capabilities in `MODULE_CAPABILITIES`
3. Add path matching in `navModuleDisabledForPath` in `shared/clientNav.ts`
4. Call `requireModuleEnabled(enabledModules, "new_module")` in protected procedures
