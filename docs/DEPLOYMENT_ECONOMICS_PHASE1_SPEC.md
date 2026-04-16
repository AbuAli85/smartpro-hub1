# Phase 1 — precise implementation spec (first PR)

**Purpose:** Stable IDs and normalized relationships for **deployment economics**, with **minimal routers** and **no** invoice-generation, payroll-allocation, or margin-fact changes yet.

**Parent doc:** `docs/DEPLOYMENT_ECONOMICS_BACKLOG.md`

---

## 1. Decisions locked in this spec

| Topic | Decision |
|-------|----------|
| Canonical party | **`business_parties`** is the canonical counterparty. **`billing_customers`** is the **tenant-scoped AR extension** (AR-only columns), with optional **`party_id` → `business_parties.id`**. |
| Uniqueness | **Enforce at most one billing row per party per tenant:** **`UNIQUE (company_id, party_id)`** on `billing_customers` (MySQL allows multiple rows with `party_id` NULL for migration/backfill—only non-null `party_id` rows must be unique per company). |
| Table names | **`customer_deployments`**, **`customer_deployment_assignments`** (avoid bare `deployments` and collision with outsourcing / DevOps language). |
| Billing math in Phase 1 | **Out of scope.** Relational **`billing_rate_rules`** only; **no** changes to `clientBilling.generateMonthlyInvoices`. |
| Promoter assignments | **No dual-write.** Phase 1 creates **`customer_deployment_assignments` only**. One-time migration from `promoter_assignments` is a **separate** task—not ongoing sync. |
| Legacy billing | If `attendance_sites.billing_customer_id` is **NULL**, existing **site text + daily rate + invoice** behavior remains **unchanged**. |
| **Phase 1 delivery** | **API-only first** (schema + guarded tRPC). **No** customer-facing or nav-linked UI in the first PR unless an existing lightweight admin CRUD pattern is trivially reused—UI follows in a later issue once procedures are stable. |

---

## 2. Database (Drizzle + migration)

### 2.1 `billing_customers`

| Column | Type | Notes |
|--------|------|--------|
| `id` | int PK AI | |
| `company_id` | int NOT NULL | Tenant scope; index |
| `party_id` | char(36) NULL FK → `business_parties.id` | Optional canonical link |
| `display_name` | varchar(255) NOT NULL | Shown in UI; may mirror party |
| `legal_name` | varchar(255) NULL | |
| `tax_registration` / `vat_treatment` | varchar / enum | **Optional** in Phase 1—nullable columns OK |
| `payment_terms_days` | int NULL | Default net days |
| `status` | varchar(32) NOT NULL DEFAULT `active` | e.g. active, inactive |
| `created_at`, `updated_at` | timestamp | |

**Indexes:** `(company_id)`, `(company_id, status)`, `(party_id)` if FK exists.

**Unique (locked):** `UNIQUE (company_id, party_id)` — prevents duplicate billing profile for the same canonical party within a tenant. (Nullable `party_id` rows: multiple per company allowed until backfill; new flows should set `party_id` when linking a party.)

---

### 2.2 `attendance_sites` (alter)

| Column | Type | Notes |
|--------|------|--------|
| `billing_customer_id` | int NULL FK → `billing_customers.id` | Nullable; **legacy path when NULL** |

Index: `(company_id, billing_customer_id)` or FK index only.

---

### 2.3 `customer_contracts` (commercial AR shell)

| Column | Type | Notes |
|--------|------|--------|
| `id` | int PK AI | |
| `company_id` | int NOT NULL | |
| `billing_customer_id` | int NOT NULL FK | |
| `reference` | varchar(128) NULL | Human reference |
| `effective_from`, `effective_to` | date | |
| `status` | varchar(32) NOT NULL | draft, active, closed |
| `created_at`, `updated_at` | timestamp | |

**No** JSON blob for commercial terms in Phase 1 beyond what’s above (extend later).

---

### 2.4 `customer_deployments`

| Column | Type | Notes |
|--------|------|--------|
| `id` | int PK AI | |
| `company_id` | int NOT NULL | |
| `billing_customer_id` | int NOT NULL FK | |
| `customer_contract_id` | int NULL FK | Optional link to shell contract |
| `primary_attendance_site_id` | int NULL FK → `attendance_sites.id` | Main work site |
| `outsourcing_contract_id` | char(36) NULL FK → `outsourcing_contracts.id` | Optional legal link |
| `effective_from`, `effective_to` | date | |
| `status` | varchar(32) NOT NULL | e.g. draft, active, closed |
| `notes` | text NULL | Short operational note |
| `created_at`, `updated_at` | timestamp | |

**No** `billing_rule_json` column—rates live in **`billing_rate_rules`**.

---

### 2.5 `customer_deployment_assignments`

| Column | Type | Notes |
|--------|------|--------|
| `id` | int PK AI | |
| `company_id` | int NOT NULL | Denormalized for tenant-safe queries |
| `customer_deployment_id` | int NOT NULL FK | |
| `employee_id` | int NOT NULL FK → `employees.id` | Same company as deployment |
| `role` | varchar(64) NULL | e.g. promoter, guard |
| `start_date`, `end_date` | date | |
| `status` | varchar(32) NOT NULL | active, ended |
| `created_at`, `updated_at` | timestamp | |

**Constraint:** Application or DB check: `employees.companyId` matches deployment’s tenant (enforce in mutation).

---

### 2.6 `billing_rate_rules`

| Column | Type | Notes |
|--------|------|--------|
| `id` | int PK AI | |
| `company_id` | int NOT NULL | |
| `customer_deployment_id` | int NOT NULL FK | |
| `unit` | varchar(32) NOT NULL | `day` \| `hour` \| `month` (enum or varchar) |
| `amount_omr` | decimal(14,3) NOT NULL | |
| `effective_from`, `effective_to` | date | Inclusive semantics documented in code |
| `rule_meta_json` | json NULL | **Only** for edge metadata—not primary structure |
| `created_at`, `updated_at` | timestamp | |

---

## 3. Schema wiring

- Export types in `drizzle/schema.ts` following existing patterns (`$inferSelect`, indexes).
- Add migration under existing Drizzle migration workflow used by the repo.

---

## 4. tRPC routers (minimal)

**Register in** `server/routers` **and** root router (same pattern as other routers).

### 4.1 `billingCustomers`

| Procedure | Type | Behavior |
|-----------|------|----------|
| `list` | query | `company_id` from `requireWorkspaceMembership`; paginate optional |
| `getById` | query | id + tenant check |
| `create` | mutation | Insert; optional link `party_id`; **audit** |
| `update` | mutation | Partial update; **audit** |
| `setStatus` | mutation | inactive/active; **audit** |

**Input:** all payloads include optional `companyId` resolved like `clientBilling`.

### 4.2 `customerDeployments`

| Procedure | Type | Behavior |
|-----------|------|----------|
| `list` | query | By `companyId`, filter `billing_customer_id` optional |
| `getById` | query | Include nested: customer, primary site, assignments (optional flag), rate rules (optional flag) |
| `create` | mutation | **audit** |
| `update` | mutation | **audit** |
| `close` / `setStatus` | mutation | **audit** |

### 4.3 `billingRateRules`

| Procedure | Type | Behavior |
|-----------|------|----------|
| `listForDeployment` | query | `customerDeploymentId` + tenant |
| `create` | mutation | Validate deployment belongs to tenant; **audit** |
| `update` | mutation | **audit** |
| `void` / `delete` | mutation | Prefer soft-delete or `effective_to`—**product pick**; **audit** |

**All mutations:** `requireWorkspaceMembership` + row `company_id` match.

---

## 5. Audit events

Use existing **`audit_events`** where `entityType` / `entityId` fit (ids are **int** today).

Suggested `entityType` strings:

- `billing_customer`
- `customer_deployment`
- `customer_deployment_assignment`
- `billing_rate_rule`

`action`: `created` | `updated` | `status_changed` | `closed`

If `entityId` must be int and composite entities are awkward, store the primary key of the row and put detail in `metadata` / `afterState`.

---

## 6. Explicitly out of scope (Phase 1 PR)

- Changes to **`clientBilling.generateMonthlyInvoices`** or invoice line creation.
- **`billable_quantity_snapshots`**
- **Payroll allocation** or cost facts.
- **`deployment_margin_facts`** or economics dashboard UI.
- **Dual-write** to `promoter_assignments`.
- **Product UI** in nav (per **Decision: API-only first**—add UI in a follow-up issue after API review).

---

## 7. Acceptance checklist (copy into PR description)

- [ ] Migration applies cleanly on empty DB and on DB with existing `attendance_sites` / `business_parties`.
- [ ] `billing_customer_id` on sites is **nullable**; legacy billing paths unchanged when null.
- [ ] All new tables: `company_id`, timestamps, lifecycle `status` where applicable.
- [ ] FK indexes present; list/query plans tenant-scoped.
- [ ] Every procedure uses **membership + row ownership** validation.
- [ ] Audit events for customer, deployment, assignment, rate rule mutations.
- [ ] `business_parties` link optional; no duplicate party per tenant if unique rule chosen.
- [ ] No invoice or payroll behavior changed.

---

## 8. Optional follow-ups (separate PRs)

1. **Seed / fixture:** SQL or `tsx` script: one `billing_customer`, one `customer_deployment`, one rate rule, one site link.
2. **Promoter migration script:** Read `promoter_assignments` → insert `customer_deployment_*` once; mark assignments migrated.
3. **Minimal UI:** Customer list + deployment detail under `/settings` or `/finance` with `platformNav` behind flag.

---

## 9. GitHub issue / PR title suggestion

**Title:** `feat(finance): Phase 1 deployment economics schema — billing customers, customer deployments, rate rules`

**Labels:** `area:finance`, `type:feature`, `migration`

**Description:** Paste sections 2–7 (abbreviated) + acceptance checklist §7.
