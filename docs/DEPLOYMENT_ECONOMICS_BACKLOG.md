# Deployment economics — repo-ready implementation backlog

This document turns the **deployment economics** operating model into an actionable backlog for SmartPRO Hub: **commercial ledger**, **operational proof**, **people cost ledger**, connected through **customer, site, assignment, employee, contract, period**—without blurring them into one number.

**Principle:** operational truth → financial rules → allocation logic → reporting facts.

---

## 1. Current codebase anchors (do not ignore)

| Area | Location / tables | Role today |
|------|-------------------|------------|
| **Attendance proof** | `attendance_sites`, `attendance_sessions`, `attendance_records` | Site-scoped work proof; `client_name` + `daily_rate_omr` on sites |
| **Commercial (AR)** | `client_service_invoices`, `client_invoice_line_items`, `invoice_payment_records` | Tenant → external client invoicing; keyed by `client_key` from site name |
| **Payroll / people cost** | `payroll_runs`, `payroll_line_items`, `employees`, salary configs | People cost ledger (separate from AR) |
| **Legal / deployment (partial)** | `outsourcing_contracts`, `outsourcing_contract_parties`, `outsourcing_contract_locations`, `outsourcing_promoter_details` | Contract header, parties, locations, promoter 1:1 |
| **Assignment (partial)** | `promoter_assignments` | Links `promoter_employee_id` ↔ `client_site_id` ↔ company parties, dates |

**Gap:** Invoicing is driven from **attendance + site text**, not yet from a unified **billing customer** + **deployment** row that both **invoice generation** and **payroll allocation** reference. Outsourcing/promoter tables exist but are not fully wired to **client billing** and **margin facts**.

**Integration rule for implementation:** Prefer **extending and linking** these tables before adding parallel “shadow” entities. New tables should FK to `company_id` (tenant) and reuse `attendance_sites.id`, `employees.id`, existing contract IDs where possible.

---

## 2. Target module map

| Module | Responsibility | Suggested package / router |
|--------|----------------|----------------------------|
| **Customer master** | CRUD billing customer, contacts, tax/VAT fields, payment terms | `server/routers/billingCustomers.ts` (or extend `crm` if CRM becomes source of truth) |
| **Deployment** | The spine: customer + site(s) + contract link + employee assignment + effective period + status | `server/routers/deployments.ts` |
| **Rate rules** | Billing rate rules (per deployment, per site, per period) | Part of deployments or `billingRateRules` sub-router |
| **Cost allocation** | Rules + engine output (facts, not payroll itself) | `server/routers/costAllocation.ts` |
| **Billable quantity** | Approved attendance → billable snapshot per deployment/period | Extend attendance pipeline or `server/routers/attendanceBilling.ts` |
| **Margin / facts** | Read-only facts tables + reporting procedures | `server/routers/deploymentEconomics.ts` or `reports` |
| **UI** | Customer list, deployment board, reconciliation, margin dashboard | `client/src/pages/` + `platformNav` entries |

---

## 3. Phased delivery (same sequence as product strategy)

### Phase 1 — Make the data model real (foundation)

**Outcome:** No more “customer = string on site” as the only truth; deployments link customer ↔ site ↔ assignment.

| # | Work item | Schema / code | Notes |
|---|-----------|---------------|--------|
| 1.1 | **Billing customer master** | New: `billing_customers` (or `customer_accounts`) with `company_id`, legal name, display name, tax id, default terms, status | Optionally map to `business_parties` / CRM contact later |
| 1.2 | **Link sites to customer** | `attendance_sites.billing_customer_id` nullable FK → `billing_customers.id` | Keep `client_name` for migration / display until backfill |
| 1.3 | **Customer commercial contract stub** | New: `customer_contracts` with `company_id`, `billing_customer_id`, dates, status, `reference` | Distinct from `outsourcing_contracts` *or* bridge table “this outsourcing contract = commercial AR terms for this customer” — **decision required** |
| 1.4 | **Deployment entity** | New: `deployments` (or rename to match product: `deployment_contracts`) with `company_id`, `billing_customer_id`, `primary_site_id`, optional `outsourcing_contract_id`, `effective_from`, `effective_to`, `status`, `billing_rule_json` or FK to rate table | Links revenue story to one row |
| 1.5 | **Deployment assignment** | New: `deployment_assignments` with `deployment_id`, `employee_id` (or `employees.user_id` per existing pattern), `role`, `start`, `end`, `status` | Align with `promoter_assignments`: migrate or dual-write until cutover |
| 1.6 | **Basic rate rules** | New: `billing_rate_rules` with `deployment_id`, `unit` (day/hour/month), `amount_omr`, `effective_from`, `effective_to` | Invoice gen reads from here instead of only `daily_rate_omr` on site |

**APIs (tRPC):** `billingCustomers.*`, `deployments.*` (list, get, create, update, close), `billingRateRules.*`

**Screens:** Customer list + detail; Deployment list + detail; Site edit: pick billing customer.

**Exit criteria:** Can create a customer, attach sites, define a deployment + rate, assign at least one employee in UI.

---

### Phase 2 — Attendance → billable quantity → trusted revenue

**Outcome:** Invoicing is defensible: approved/billable quantity is explicit.

| # | Work item | Schema / code | Notes |
|---|-----------|---------------|--------|
| 2.1 | **Billable quantity snapshot** | New: `billable_quantity_snapshots` — `company_id`, `deployment_id` (or site + period), `period_year`, `period_month`, `quantity`, `source` (attendance), `status` (draft/locked), `approved_by`, `approved_at` | Idempotent per deployment + month |
| 2.2 | **Attendance approval hook** | Job or procedure: aggregate closed `attendance_sessions` → snapshot | Reuse existing session rules; add exception queue later |
| 2.3 | **Invoice generation** | Change `clientBilling.generateMonthlyInvoices` (or parallel path) to prefer **deployment + rate rules + snapshot** when present; fallback to legacy site name + daily rate | Feature flag per tenant |
| 2.4 | **Reconciliation UI** | Screen: month, deployment, system count vs snapshot, approve/lock | “Uninvoiced approved attendance” alert source |

**APIs:** `billableSnapshots.*`, extend `clientBilling.generate*` inputs with optional `deploymentId`.

**Exit criteria:** For one pilot deployment, invoice line equals locked snapshot × rule; audit trail exists.

---

### Phase 3 — Payroll allocatable (not merged into invoice UI)

**Outcome:** Loaded cost attributed to customer/deployment by rule.

| # | Work item | Schema / code | Notes |
|---|-----------|---------------|--------|
| 3.1 | **Employee cost profile pointer** | Use existing payroll + salary configs; add optional `cost_allocation_profile_id` on employee or deployment assignment | Avoid duplicating payroll math |
| 3.2 | **Allocation rules** | New: `cost_allocation_rules` — `deployment_id` or `company_id`, `method` (full_time_site, attendance_weighted, percent, schedule_based), `config` JSON | **Default:** attendance_weighted when deployment has assignments |
| 3.3 | **Allocation engine (monthly)** | Batch: inputs = payroll line items + assignments + snapshots; outputs = `payroll_cost_allocation_facts` | Version column for reruns |
| 3.4 | **Exceptions queue** | Table or status for rows with missing deployment, 0 allocation, negative margin | Feeds alerts |

**APIs:** `costAllocation.*` (preview run, commit facts, list exceptions).

**Exit criteria:** For one month, every active deployment assignment gets a cost line or explicit exception.

---

### Phase 4 — Margin intelligence (reporting only)

**Outcome:** Owner dashboard; no fake single “mega number” on invoice screen.

| # | Work item | Schema / code | Notes |
|---|-----------|---------------|--------|
| 4.1 | **Facts tables** | New: `revenue_allocation_facts`, `deployment_margin_facts` (materialized monthly) — `company_id`, `deployment_id`, `period`, `revenue_omr`, `direct_labor_omr`, `loaded_labor_omr`, `gross_margin_omr`, `margin_pct` | Populate from AR + allocation facts |
| 4.2 | **Dashboard APIs** | `deploymentEconomics.summary`, `byCustomer`, `byDeployment`, `alerts` | Queries only |
| 4.3 | **UI** | Deployment economics dashboard + drill-down | Matches risk alerts list below |

**Exit criteria:** Gross margin by customer/deployment/month matches spreadsheet for pilot period.

---

## 4. Risk alerts (query-backed; implement after Phase 2–3 data exists)

| Alert | Source |
|-------|--------|
| Attendance approved but not billed | Snapshot locked + no invoice line |
| Billed quantity &gt; approved quantity | Invoice vs snapshot |
| Employee assigned, no active deployment / contract | `deployment_assignments` + `deployments.status` |
| Payroll cost with no allocation | Allocation run + missing FK |
| Negative margin deployment | `deployment_margin_facts` |
| Expired rate card still billing | `billing_rate_rules.effective_to` vs invoice date |

---

## 5. Minimum new schema (first migration slice)

**Suggested first PR (Phase 1 only):**

- `billing_customers`
- `attendance_sites.billing_customer_id` (nullable FK)
- `customer_contracts` (minimal)
- `deployments`
- `deployment_assignments`
- `billing_rate_rules`

Indexes: all scoped by `company_id +` natural keys; unique constraints where needed (e.g. one deployment per customer+site+period if that’s the rule — **product decision**).

**Naming:** Use `snake_case` in DB, Drizzle `camelCase` in TS to match `drizzle/schema.ts` style.

---

## 6. Workflows (sequence diagrams)

### 6.1 Monthly billing (target)

1. Close/approve attendance for period → **billable snapshot** (optional lock).
2. **Generate invoices** from deployment + rate rules + snapshot (or legacy path).
3. Record payments in existing **client AR** tables.

### 6.2 Monthly costing

1. Run **payroll** (existing).
2. Run **allocation engine** with rules → **payroll_cost_allocation_facts**.
3. Refresh **deployment_margin_facts** (materialized or nightly job).

### 6.3 Audit

- Never overwrite locked snapshots; new version or adjustment record.

---

## 7. Open decisions (log before build)

1. **Single customer model:** Is `billing_customers` the same as CRM account / `business_parties`? Recommend: one canonical party, billing extends with AR fields.
2. **Outsourcing contracts vs commercial AR:** Merge paths so `outsourcing_contracts` can reference `billing_customer_id` and drive default rate, or keep legal and billing loosely coupled.
3. **Promoter assignments:** Deprecate in favor of `deployment_assignments`, or sync both during migration.
4. **VAT:** Confirm Oman VAT fields on customer and invoice lines.

---

## 8. Suggested priority order (sprints)

| Sprint | Focus | Deliverable |
|--------|--------|-------------|
| S1 | Phase 1 schema + migrations + read APIs | Deployments queryable in DB |
| S2 | Customer + site link UI + deployment CRUD | Usable in UI |
| S3 | Phase 2 snapshot + invoice integration (flagged) | Pilot tenant |
| S4 | Phase 3 allocation + facts | First margin report |
| S5 | Phase 4 dashboard + alerts | Owner view |

---

## 9. Related docs

- `docs/ARCHITECTURE.md` — platform overview
- `docs/PRODUCTION_READINESS_ASSESSMENT.md` — readiness checklist
- `server/routers/clientBilling.ts` — current AR generation
- `drizzle/schema.ts` — `outsourcing_contracts`, `promoter_assignments`, `attendance_sites`

---

*This backlog is the implementation twin of the deployment economics product narrative: connect the ledgers through shared entities, then report margin—never fake it on the invoice screen alone.*
