# SANAD v2 — implementation closeout

This document describes the **SANAD v2** behaviour that exists in the repository today: network intelligence (imported directory + operations), partner onboarding via invites, operational `sanad_offices` profiles, marketplace discovery, and shared lifecycle/readiness rules. It is derived from the current code paths (`shared/`, `server/routers/sanad.ts`, `server/routers/sanadIntelligence.ts`, `server/sanadAccess.ts`, `client` pages under `/sanad` and `/admin/sanad`).

---

## 1. Purpose and scope

**Purpose**

- Run **Sanad service centres** as operational providers inside SmartPRO: offices (`sanad_offices`), service catalogue, work orders, service requests, ratings, and a **public marketplace** listing.
- Run **network intelligence** over an imported **centre directory** (`sanad_intel_centers` + `sanad_intel_center_operations`): outreach, onboarding state, compliance items, invites, and activation into a live office.

**In scope (implemented)**

- tRPC surface: `sanad` router (including nested `sanad.intelligence`) and root `sanadIntelligence` router (same intelligence router mounted twice for path parity in `server/routers.ts`).
- Client routes under `/sanad/*`, `/sanad/join`, and `/admin/sanad/*` (see `client/src/App.tsx`).
- Shared lifecycle and marketplace readiness helpers under `shared/sanad*.ts`.
- Office membership and capability checks in `server/sanadAccess.ts` and `shared/sanadRoles.ts`.

**Out of scope for this document**

- Non-SANAD product areas (HR, payroll, etc.) except where they share generic RBAC (`shared/rbac.ts`).

---

## 2. Core SANAD lifecycle

Canonical stages are defined in `shared/sanadLifecycle.ts` as `SANAD_LIFECYCLE_STAGES`, from `registry` through `live_partner`.

`resolveSanadLifecycleStage(ops, office, extras)` derives a single stage from:

- **Intel operations** (`SanadLifecycleOpsInput`): partner/onboarding/compliance fields, invite timestamps, `registeredUserId`, `linkedSanadOfficeId`, etc.
- **Linked office** (`SanadLifecycleOfficeInput`): profile fields, `status`, `isPublicListed`, ratings/reviews/verification, etc.
- **Extras**: e.g. `activeCatalogueCount` (active rows in `sanad_service_catalogue`).

Stages such as `live_partner` require a linked office and combine listing, active status, and signals (reviews, verification, rating threshold, or at least one active catalogue item)—see `resolveSanadLifecycleStage` in `shared/sanadLifecycle.ts`.

`listSanadLifecycleBlockers`, `sanadLifecycleBadge`, `sanadPublicProfileCompleteness`, and `recommendedSanadPartnerNextActions` support UX copy and partner guidance (`partnerOnboardingWorkspace` in `server/routers/sanad.ts`).

---

## 3. Shared helpers and rules

| Area | Location | Role |
|------|----------|------|
| Lifecycle resolution & badges | `shared/sanadLifecycle.ts` | Stage derivation, blockers, profile completeness scoring (6 fields). |
| Transition validation | `shared/sanadLifecycleTransitions.ts` | Server rules for invites, linking, **enabling public listing** (`validateEnablePublicListing`), and **keeping listed offices discoverable** (`validateListedOfficeRemainsDiscoverable`). Uses `computeSanadGoLiveReadiness` / `computeSanadMarketplaceReadiness`. |
| Marketplace readiness | `shared/sanadMarketplaceReadiness.ts` | `computeSanadMarketplaceReadiness`, `computeSanadGoLiveReadiness` (hypothetical listed state for go-live). |
| Directory pipeline filters | `shared/sanadDirectoryPipeline.ts` | `SANAD_DIRECTORY_PIPELINE_FILTERS`, `parseSanadDirectoryPipeline` — aligns with intel directory drilldowns / `listCenters` `pipeline` input. |
| Platform roles for intel UI | `shared/sanadRoles.ts` | `canAccessSanadIntelFull`, `canAccessSanadIntelRead`, `canAccessSanadIntelligenceUi`. |
| PATCH-style updates | `shared/objectUtils.ts` | `omitUndefined` — used when partial updates must not wipe columns (e.g. `updatePublicProfile`, `upsertOfficeProfile`). |

Intel integrity warnings for snapshots are available as `listSanadIntelOfficeIntegrityWarnings` in `shared/sanadLifecycleTransitions.ts`.

---

## 4. Office roles and access model

**Platform / global admin**

- `canAccessGlobalAdminProcedures` (`shared/rbac.ts`: legacy `role === "admin"` or `platformRole` in `super_admin` | `platform_admin`) bypasses tenant checks where implemented in SANAD routers.

**SANAD intelligence**

- **Full** (`canAccessSanadIntelFull`): global admins **or** `platformRole === "sanad_network_admin"`.
- **Read** (`canAccessSanadIntelRead`): full **or** `platformRole === "sanad_compliance_reviewer"`.
- Intelligence procedures use `sanadIntelReadProcedure` / `sanadIntelFullProcedure` in `server/routers/sanadIntelligence.ts`.

**Per-office roles** (`server/sanadAccess.ts`)

- Roles stored in `sanad_office_members.role`: **`owner`**, **`manager`**, **`staff`**.
- Users linked only via intel (`sanad_intel_center_operations.registeredUserId` + `linkedSanadOfficeId`) are treated as **`owner`** for access resolution (`getSanadOfficeRoleForUser`).
- **Catalogue** edits: `owner` or `manager` (`assertSanadOfficeCatalogueAccess`).
- **Office profile** edits: `owner` or `manager` (`assertSanadOfficeProfileAccess`).
- **Roster management** (`assertSanadOfficeRosterAdmin`): platform admins, SANAD intel **full**, or office **owner/manager**. Assigning the **owner** role is further restricted in `server/routers/sanad.ts` (`assertCanAssignSanadOfficeOwner`).
- **Sensitive dashboard KPIs**: `owner` or `manager` only (`canViewSensitiveOfficeDashboard`).

---

## 5. Admin SANAD intelligence capabilities

The intelligence router (`server/routers/sanadIntelligence.ts`) includes, among others:

- **Metrics & overview**: `networkOperationsMetrics` (lifecycle, operational, bottleneck KPIs via `server/sanad-intelligence/queries`), `overviewSummary`, `transactionsTrend`, `incomeTrend`.
- **Directory**: `listCenters` (search, governorate, wilayat, `partnerStatus`, **pipeline** filter from `SANAD_DIRECTORY_PIPELINE_FILTERS`), `getCenter`, `filterOptions`, `wilayatForGovernorate`.
- **Centre operations**: `updateCenterOperations` (partner/onboarding/compliance, notes, geo/SLA fields, etc.).
- **Compliance**: `listCenterCompliance`, `upsertCenterComplianceItem`, `seedComplianceForCenter` (full), `listLicenseRequirements`.
- **Insights**: `regionalOpportunity`, `topServicesByYear`, `serviceDemandInsights`, `workforceByGovernorate`, `latestMetricYear`.
- **Invites & onboarding**: `peekCenterInvite` (public), `generateCenterInvite` (full), `getCenterInvite`, `acceptCenterInvite` (public), `linkSanadInviteToAccount` (authenticated), with validation from `shared/sanadLifecycleTransitions.ts`.
- **Activation**: `activateCenterAsOffice` (full) — creates `sanad_offices`, seeds `sanad_office_members` as **owner**, updates intel ops (`linkedSanadOfficeId`, clears invite fields), subject to `evaluateActivationServerGate` / `computeCenterActivationReadiness` path in the implementation.
- **Outreach**: `updateCenterOutreach` (full).
- **Readiness**: `centerActivationReadiness`.

Audit events are written via `server/sanad-intelligence/sanadIntelAudit.ts` for several actions (invite generated, accepted, linked, activated, outreach updated, etc.).

The **Admin UI** is `client/src/pages/AdminSanadIntelligencePage.tsx`, gated by `canAccessSanadIntelligenceUi`, with routes `/admin/sanad`, `/admin/sanad/directory`, `/admin/sanad/compliance`, `/admin/sanad/opportunity`, `/admin/sanad/demand`.

---

## 6. Partner self-service capabilities

**Routes (examples)**

- `/sanad/partner-onboarding` — `SanadPartnerOnboardingPage.tsx`
- `/sanad/catalogue-admin` — `SanadCatalogueAdminPage.tsx` (centre management: profile, catalogue, roster)
- `/sanad/office-dashboard` — `SanadOfficeDashboardPage.tsx`
- `/sanad/marketplace`, `/sanad/centre/:id` — public/marketplace UX

**Server (`server/routers/sanad.ts`)**

- `partnerOnboardingWorkspace` — for the intel row where `registeredUserId` matches the current user: returns lifecycle stage, blockers, compliance counts, marketplace readiness, recommended actions, linked office, ops.
- `getMyOfficeProfile`, `upsertOfficeProfile` — office profile (with go-live / discoverability checks when turning on listing or editing while listed).
- Catalogue: `addCatalogueItem`, `updateCatalogueItem`, `toggleCatalogueItem`, `deleteCatalogueItem`, `getServiceCatalogue`, plus legacy `listServiceCatalogue` / `upsertServiceCatalogue` / `deleteServiceItem`.
- `updatePublicProfile` — partial public fields + `isPublicListed` with `validateEnablePublicListing` / `validateListedOfficeRemainsDiscoverable` as applicable.
- `officeGoLiveReadiness` — exposes `computeSanadGoLiveReadiness`, `computeSanadMarketplaceReadiness`, `sanadPublicProfileCompleteness`.
- Roster: `searchUsersForSanadRoster`, `listSanadOfficeMembers`, `addSanadOfficeMember`, `updateSanadOfficeMemberRole`, `removeSanadOfficeMember`.

**Public invite flow UI**

- `/sanad/join` — `SanadJoinInvitePage.tsx` uses `sanad.intelligence.peekCenterInvite`, `acceptCenterInvite`, and after auth `linkSanadInviteToAccount` (see file).

---

## 7. Marketplace readiness and public listing rules

**Shared rules** (`shared/sanadMarketplaceReadiness.ts`)

- `computeSanadMarketplaceReadiness(office, activeCatalogueCount)` requires: office present, **public-listed**, **`status === "active"`**, non-empty **phone**, **governorate or city**, non-empty **name**, and **at least one active catalogue item**.
- `computeSanadGoLiveReadiness` evaluates the same bar **as if** `isPublicListed` were already enabled (used before turning listing on).

**Public listing query** (`listPublicProviders` in `server/routers/sanad.ts`)

- Default `marketplaceReadyOnly: true` applies SQL filters matching that bar: `status === "active"`, `isPublicListed === 1`, non-empty phone/name, governorate or city, and existence of at least one **active** catalogue row. Inputs can relax `marketplaceReadyOnly` / `publicListedOnly` for callers that pass explicit flags.

**Mutations that enforce consistency**

- `updatePublicProfile`: turning **on** listing runs go-live readiness; if already listed, updates must keep **marketplace** readiness or fail.
- `upsertOfficeProfile`, catalogue create/update/delete paths: use helpers such as `requireGoLiveOkForPublicListing` / `requireListedOfficeRemainsDiscoverableOrThrow` / `assertCatalogueChangeKeepsListedOfficeValid` (see `server/routers/sanad.ts`).

---

## 8. Verified end-to-end flow (as implemented)

1. **Directory & operations** — Centres exist in intel tables; ops row tracks lifecycle, invites, registered user, `linkedSanadOfficeId`.
2. **Invite** — Full intel admin calls `generateCenterInvite`; centre opens `/sanad/join?token=...`, `peekCenterInvite` / `acceptCenterInvite`; user signs in and `linkSanadInviteToAccount`.
3. **Activation** — `activateCenterAsOffice` creates a **`sanad_offices`** row (default not public-listed), links intel, creates **owner** membership when needed.
4. **Partner workspace** — `partnerOnboardingWorkspace` surfaces stage, compliance, catalogue count, marketplace readiness.
5. **Profile & catalogue** — Owner/manager edit via `upsertOfficeProfile` / catalogue mutations; `officeGoLiveReadiness` surfaces gaps.
6. **Go public** — `updatePublicProfile` with `isPublicListed: true` after `computeSanadGoLiveReadiness` passes; further edits must keep `computeSanadMarketplaceReadiness` satisfied if still listed.
7. **Discovery** — `listPublicProviders` (and `getPublicProfile` for detail) serve `/sanad/marketplace` and `/sanad/centre/:id` consumers when defaults are used.

This is a **logical** flow from code paths; production verification still depends on environment, data import, and migrations.

---

## 9. Tests and verification commands

**Automated tests (Vitest)**

- Shared: `shared/sanadLifecycle.test.ts`, `shared/sanadLifecycleTransitions.test.ts`, `shared/sanadMarketplaceReadiness.test.ts`, `shared/sanadDirectoryPipeline.test.ts`, `shared/objectUtils.test.ts`.
- Server intel: `server/sanad-intelligence/sanad-intelligence.test.ts`, `server/sanad-intelligence/sanadActivationBridge.test.ts`, `server/sanad-intelligence/sanadActivationHardening.test.ts`.

**Commands** (from repo root, `package.json`)

- `pnpm run check` — `tsc --noEmit` for the whole project (`client`, `shared`, `server` per `tsconfig.json`).
- `pnpm test` — `vitest run` (entire suite).

**Note:** `tsconfig.json` **excludes** `**/*.test.ts` from typecheck; tests are still executed by Vitest.

**Data import (operational)**

- `pnpm run sanad-intel:import` runs `scripts/import-sanad-intelligence.ts` (see script for behaviour and prerequisites).

---

## 10. Optional future follow-up items

- **Performance**: Full-project `tsc` can be slow on large workspaces; CI may need adequate time/memory (`NODE_OPTIONS` as in `check` script).
- **Environments without intel schema**: Middleware catches missing-schema errors (`throwIfSanadIntelSchemaMissing`); ensure migrations applied before using intelligence routes.
- **Import & data hygiene**: Imported JSON/CSV under `data/sanad-intelligence/` and scripts in `scripts/` are the supported paths for refreshing directory statistics; re-run import procedures after upstream data changes.
- **Broader test coverage**: E2E/browser tests for `/sanad/join` and marketplace flows are not described in this repo’s SANAD test files (unit/integration focused).

---

*Last updated to match the repository layout and files cited above.*
