# HR Performance Suite — Hardening Checklist (Next PRs)

This document is the **implementation and QA contract** for moving the HR Performance module from a **workflow shell** to a **production-grade, auditable subsystem**. It complements `docs/ARCHITECTURE.md` and `docs/HARDENING_SUMMARY_2026-03.md`.

**Scope:** procedures and UI under `financeHR` (training, self-reviews), `hr` (formal performance reviews), `kpi` (targets, progress, leaderboard), and `client/src/pages/HRPerformancePage.tsx`.

**Non-goals for this checklist:** new product tabs or unrelated HR features until hardening milestones below are met.

---

## 1. Router ownership (document and enforce in code review)

| Domain | Canonical router | Notes |
|--------|-------------------|--------|
| Training CRUD (admin + employee self-serve) | `financeHR` | Keep mutations co-located; avoid duplicating in `hr`. |
| Self-review employee submit + admin/manager feedback | `financeHR` | Align naming: `admin*` = company-scoped elevated actions. |
| Formal performance reviews (structured record) | `hr` | `listReviews`, `createReview` stay here unless you consolidate later. |
| KPI targets, logs, achievements, leaderboard | `kpi` | Single source for commission math and period keys. |

**Acceptance:** Each new procedure’s docstring or module comment states which table(s) it owns and which router is authoritative.

---

## 2. Permission model (server-authoritative)

**Today:** New `financeHR` admin procedures use `protectedProcedure` + `requireActiveCompanyId` only — **not** role- or permission-gated.

**Target:** For each mutation below, define **who may call it** and enforce in the procedure (not only UI):

| Procedure | Intended actors | Suggested enforcement |
|-----------|-----------------|------------------------|
| `financeHR.adminAssignTraining` | Company HR / admin | `assertCompanyAdmin` or granular permission e.g. `hr.performance.write` (pattern: `server/routers/workforce.ts` `hasPermission`) |
| `financeHR.adminListTraining` | HR / managers / exec read | Read: `company_admin` **or** permission `hr.performance.read`; optionally restrict rows to direct reports for line managers only |
| `financeHR.adminUpdateTraining` | HR / admin | Same write gate as assign |
| `financeHR.adminListSelfReviews` | HR / manager | Manager: only rows where employee is in direct-report graph; HR: all in company |
| `financeHR.adminUpdateSelfReview` | Manager / HR | Manager: only direct reports; HR: broader |
| `hr.createReview` / `hr.listReviews` | Same as formal review policy | Re-check alongside self-review rules |
| `kpi.setTarget` / `kpi.deleteTarget` | Typically HR / sales ops | Align with existing KPI policy |

**References in repo:**

- `canAccessGlobalAdminProcedures` / platform bypass: `shared/rbac.ts`
- Company admin: patterns in `server/routers/companies.ts` (`assertCompanyAdmin`)
- Granular JSON permissions: `server/routers/workforce.ts` (`hasPermission`)

**Acceptance criteria**

- [ ] A **company_member** without the right permission gets **FORBIDDEN**, not silent empty lists on mutations.
- [ ] **Platform** operators behave per existing global-admin rules (explicit, documented).
- [ ] UI hiding is **supplementary**; server always enforces.

---

## 3. Company scoping and row integrity

For **every** mutation touching `training_records`, `employee_self_reviews`, `performance_reviews`, `kpi_targets`:

- [ ] Resolve `companyId` via `requireActiveCompanyId` (or documented platform path with explicit `companyId`).
- [ ] Load the row by **id + companyId** (or join through `employees.companyId`).
- [ ] For targets: ensure `employeeUserId` belongs to an `employees` row with the same `companyId` as the target row (or document why user-id linkage is sufficient).
- [ ] Prefer **NOT_FOUND** for cross-tenant id probes; reserve **FORBIDDEN** where the id is valid but the user lacks permission (per `docs/ARCHITECTURE.md` policy if applicable).

**Acceptance:** Fuzz tests with wrong `companyId` / wrong record `id` never mutate another tenant’s data.

---

## 4. State machines

### 4.1 Training (`training_status`)

Define **allowed transitions** in one module (e.g. `server/performance/trainingStateMachine.ts`):

| From | To | Allowed? |
|------|-----|----------|
| assigned | in_progress | Yes |
| assigned | overdue | Yes (system or scheduled job) |
| in_progress | completed | Yes |
| in_progress | overdue | Yes |
| overdue | in_progress | Yes |
| completed | * | No (unless explicit “reopen” product decision) |

**Acceptance:** `adminUpdateTraining` rejects invalid transitions with **BAD_REQUEST** and a clear message.

### 4.2 Self-review (`review_status`)

Align product vocabulary (draft → submitted → reviewed → acknowledged). If “closed” is required, map it to **acknowledged** or add a migration.

**Acceptance:** Invalid transitions rejected; `reviewed` always sets `reviewedAt` + `reviewedByUserId` when moving into reviewed (already partially implemented).

---

## 5. Audit trail

Use existing **`audit_events`** (`drizzle/schema.ts` — `entityType`, `entityId`, `action`, `beforeState`, `afterState`, `actorUserId`).

**Minimum mutations to audit:**

| Event | entityType (suggested) | action (suggested) |
|-------|------------------------|---------------------|
| Training assigned | `training_record` | `created` |
| Training updated | `training_record` | `updated` |
| Self-review manager update | `employee_self_review` | `updated` |
| KPI target set/updated/deleted | `kpi_target` | `created` / `updated` / `deleted` |
| Formal review created | `performance_review` | `created` |

**Acceptance:** Each listed mutation inserts one `audit_events` row with non-null `actorUserId` (when available) and JSON snapshots sufficient to explain **what changed** in a dispute.

---

## 6. Overview read models (replace client stitching)

**Problem:** Overview tab aggregates multiple queries on the client; easy to drift and expensive.

**Add dedicated queries** (names indicative; place in `kpi` or `financeHR` or a small `performance` router — decide in PR):

| Procedure | Purpose |
|-----------|---------|
| `getPerformanceOverview` | Single payload: KPI health, training counts by status, review backlog counts, period context |
| `getTrainingOverview` | Aggregates for dashboards / widgets |
| `getReviewOverview` | Self-review vs formal counts, pending manager action count |
| `getTargetHealthSummary` | Targets vs achievement rollups for the selected month |

**Contract (example shape — finalize in implementation):**

```ts
// getPerformanceOverview output (illustrative)
{
  companyId: number;
  period: { year: number; month: number };
  kpi: { avgAchievementPct: number; targetCount: number };
  training: { assigned: number; inProgress: number; completed: number; overdue: number };
  reviews: { selfPendingManager: number; formalCount: number };
}
```

**Acceptance:** `HRPerformancePage` Overview tab uses **one** primary query (+ existing leaderboard if still needed), not N parallel approximations.

---

## 7. Endpoint contracts — new / hardened procedures

Document inputs with Zod (already pattern) and **error codes**:

| Procedure | Input highlights | Success | Errors |
|-----------|------------------|---------|--------|
| `adminUpdateTraining` | `id`, optional `trainingStatus`, `score`, `certificateUrl` | `{ success: true }` | NOT_FOUND, FORBIDDEN, BAD_REQUEST (invalid transition) |
| `adminListSelfReviews` | optional `companyId` (platform) | Array of rows + `employeeName` | UNAUTHORIZED |
| `adminUpdateSelfReview` | `id`, optional ratings/feedback/status | `{ success: true }` | NOT_FOUND, FORBIDDEN, BAD_REQUEST |

**Acceptance:** OpenAPI / tRPC router type export remains the single source of truth; no duplicate DTOs on the client.

---

## 8. Test plan

### 8.1 Backend unit tests (Vitest)

File suggestion: `server/performance-hr.test.ts` (or extend `server/smartpro.test.ts` with focused suites).

| # | Case | Expect |
|---|------|--------|
| T1 | `adminUpdateTraining` with wrong `companyId` / wrong record id | NOT_FOUND or no row updated |
| T2 | `adminUpdateTraining` sets `completed` | `completedAt` set |
| T3 | `adminUpdateTraining` invalid transition | BAD_REQUEST |
| T4 | `adminUpdateSelfReview` marks reviewed | `reviewedAt`, `reviewedByUserId` set |
| T5 | User without HR permission calls `adminAssignTraining` | FORBIDDEN |

Mock DB per existing `server/smartpro.test.ts` patterns where full DB is unavailable.

### 8.2 Integration tests (full DB if present in CI)

| # | Flow |
|---|------|
| I1 | Assign training → appears in `adminListTraining` → update to completed + score → overview aggregates reflect counts (once read models exist) |
| I2 | Submit self-review (employee) → appears in `adminListSelfReviews` → `adminUpdateSelfReview` → status reviewed |

### 8.3 Frontend (optional, if test stack allows)

| # | Case |
|---|------|
| U1 | `/hr/performance?tab=training` opens Training tab |
| U2 | Empty states render without crash |
| U3 | Loading states for main queries |

---

## 9. Recommended PR order

1. **Permissions + row checks** on all `financeHR` admin mutations and sensitive `hr` / `kpi` mutations touching performance.
2. **Audit events** for mutations in §5.
3. **State machines** for training (+ self-review if needed).
4. **Overview read model(s)** + simplify `HRPerformancePage` Overview.
5. **Tests** §8.1–8.2.
6. **Target admin lifecycle** enhancements (archive, weighting, commission rules) — only after 1–5.

---

## 10. Definition of Done (subsystem)

- [ ] All §2 procedures enforce server-side roles/permissions.
- [ ] All §3 row + tenant checks in place.
- [ ] §4 transition rules enforced for training (minimum).
- [ ] §5 audit coverage for listed mutations.
- [ ] §6 at least `getPerformanceOverview` (or equivalent) drives Overview.
- [ ] §8.1 tests green in CI.

---

*Last updated: 2026-04-05 — aligned with `HRPerformancePage` and `financeHR` admin training/self-review procedures.*
