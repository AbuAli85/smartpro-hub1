# Phase 2 — billable snapshots, invoice hook-in, reconciliation, alerts

**Depends on:** Phase 1 merged (`billing_customers`, `customer_deployments`, `billing_rate_rules`, `customer_deployment_assignments`, `attendance_sites.billing_customer_id`, `deploymentEconomics` router).

**Principle:** Operational truth (attendance) → **explicit billable quantity** (snapshot) → **invoice** (AR). Legacy path remains when deployment economics is not used.

**Parent docs:** `docs/DEPLOYMENT_ECONOMICS_BACKLOG.md` §Phase 2, `docs/DEPLOYMENT_ECONOMICS_PHASE1_SPEC.md`

---

## Locked decisions (pre-implementation)

These should be treated as **closed** for the first Phase 2 PRs unless a pilot explicitly forces otherwise.

### Multi-site

- **Phase 2 uses a single effective site:** `customer_deployments.primary_attendance_site_id` only (see Phase 1 column name in schema).
- **`customer_deployment_sites` (or equivalent) is deferred** — do not add it in the first snapshot / billing PR unless a real pilot requires multi-site immediately.
- **Rationale:** Keeps attendance aggregation, reconciliation, and invoice idempotency simpler and reviewable.

### `client_key` (coexistence with legacy)

- **`client_key` remains legacy compatibility** for existing invoices and the **site-name** generation path.
- **The deployment path must not rely on new business rules keyed only on `client_key`.** Prefer:
  - **`customer_deployment_id`** and **`billable_snapshot_id`** on the invoice row (when present),
  - legacy generation **unchanged** when deployment-linked data is absent.
- **Avoid** inventing blended logic that “upgrades” behavior through `client_key` alone — that obscures the migration gradient.

### PR sequence (narrow; do not reorder)

1. Snapshot schema + guarded APIs (draft lifecycle).
2. Aggregation + **lock** flow (with immutability rules below).
3. Invoice generation hook-in (locked snapshot only).
4. Reconciliation APIs.
5. Alerts as **query-backed reads** only.

**Rationale:** Invoice writes come **after** snapshot truth is lockable.

### Financial trust boundary: snapshot locking

- **Draft** snapshots may be recomputed and adjusted (within policy).
- **Locked** snapshots are **not** overwritten in place — they are the boundary of financial trust for billing and audit.
- **Corrections** after lock should be **additive or versioned** (e.g. new row voiding prior, or explicit adjustment record with audit), **not** silent destructive edits to locked rows.

---

## 1. Goals and non-goals

| In scope (Phase 2) | Out of scope |
|--------------------|--------------|
| `billable_quantity_snapshots` + lifecycle (draft → locked) | Payroll allocation, margin facts (Phase 3–4) |
| Procedures to **compute** snapshot from `attendance_sessions` (closed, in range) | Changing payroll routers |
| **Invoice generation** that can use **locked** snapshot + `billing_rate_rules` + `billing_customers` | Full customer portal |
| **Reconciliation** APIs + minimal UI or internal-only screen | Promoter dual-write |
| **Alerts** (query-backed + optional notifications) | Rewriting all of `clientBilling` at once |

---

## 2. Conceptual flow

```
Month N
  → (optional) Compute draft snapshot per customer_deployment from attendance
  → Review reconciliation (system quantity vs adjustments)
  → Approve / lock snapshot
  → Generate invoice (uses locked quantity × active rate rule)
```

**Legacy path (unchanged):** Sites with no active deployment economics usage keep today’s behavior: `client_name` + `daily_rate_omr` on `attendance_sites`, `generateMonthlyInvoices` as implemented in Phase 0.

**Rule:** Phase 2 **never** removes legacy behavior; it **adds** a second path selected per tenant or per deployment.

---

## 3. Schema additions

### 3.1 `billable_quantity_snapshots`

| Column | Type | Notes |
|--------|------|--------|
| `id` | int PK AI | |
| `company_id` | int NOT NULL | Tenant |
| `customer_deployment_id` | int NOT NULL FK → `customer_deployments` | |
| `period_year`, `period_month` | int | Calendar period billed |
| `quantity` | decimal(12,3) NOT NULL | Billable units (e.g. days for `unit=day`) |
| `quantity_source` | varchar(32) | `attendance_aggregated` \| `manual_adjustment` \| `import` |
| `status` | varchar(32) | `draft` \| `locked` \| `void` |
| `system_quantity` | decimal(12,3) NULL | Raw aggregate before adjustment (audit) |
| `adjustment_note` | text NULL | Why quantity differs from system |
| `approved_by_user_id` | int NULL | |
| `approved_at` | timestamp NULL | |
| `locked_at` | timestamp NULL | Redundant with status; optional |
| `created_at`, `updated_at` | timestamp | |

**Unique:** `UNIQUE (company_id, customer_deployment_id, period_year, period_month)` for the active lifecycle row — void superseded rows rather than mutating locked history (see **Locked decisions** → snapshot locking).

**Index:** `(company_id, period_year, period_month, status)` for alerts and lists.

### 3.2 Optional: link invoice to snapshot (recommended)

Add nullable on `client_service_invoices`:

| Column | Notes |
|--------|--------|
| `billable_snapshot_id` | int NULL FK → `billable_quantity_snapshots.id` |
| `customer_deployment_id` | int NULL FK → `customer_deployments.id` |

Enables: “invoice line was generated from this locked snapshot” and reconciliation reports. **Do not** require these columns for legacy rows (always NULL).

**Invoice uniqueness (deployment path):** Add partial/secondary unique strategy:

- Legacy: existing `uq_client_invoice_period` on `(company_id, client_key, period_year, period_month)`.
- Deployment: add **`UNIQUE (company_id, customer_deployment_id, period_year, period_month)`** where `customer_deployment_id IS NOT NULL` — or separate table `deployment_invoices` — **prefer** extending `client_service_invoices` with nullable `customer_deployment_id` + new unique index that allows multiple NULL legacy rows (MySQL: multiple NULLs in unique columns).

**client_key for deployment invoices (display / legacy lists only):** May still be populated for AR screens that key on `client_key` today (e.g. stable slug from billing customer display name). **Idempotency and reconciliation for the deployment path must use `customer_deployment_id` + period (+ snapshot), not `client_key` semantics.**

---

## 4. Attendance aggregation (compute snapshot)

**Source of truth:** `attendance_sessions` where:

- `company_id` = tenant
- `site_id` IN sites covered by deployment (see §4.1)
- `status` = `closed`
- `business_date` between `monthYmdRange(year, month).start` and `.end`

**Quantity unit:** For Phase 2 default, match `billing_rate_rules.unit`:

- `day` → `COUNT(DISTINCT business_date)` for **primary site only** in Phase 2 (see **Locked decisions** → multi-site).
- `hour` / `month` → define in Phase 2.1 spec detail (may need session duration columns); if not ready, **scope Phase 2 to `day` only** and guard `generate` when unit ≠ day.

### 4.1 Which sites belong to a deployment?

**Phase 2 (locked):** `customer_deployments.primary_attendance_site_id` only. Multi-site via `customer_deployment_sites` is **explicitly deferred** unless a pilot blocks on it (see **Locked decisions**).

---

## 5. tRPC surface (suggested)

**Namespace:** extend **`deploymentEconomics`** (keep writes out of `payroll`):

| Procedure | Type | Purpose |
|-----------|------|---------|
| `billableSnapshots.previewCompute` | mutation/query | Input: `customerDeploymentId`, `year`, `month` → returns system quantity + session breakdown (read-only) |
| `billableSnapshots.upsertDraft` | mutation | Writes/updates **draft** row with `system_quantity`, optional adjustment |
| `billableSnapshots.lock` | mutation | `draft` → `locked`; sets `approved_by` / `approved_at`; **audit** |
| `billableSnapshots.void` | mutation | Admin void wrong snapshot (before invoice) |
| `billableSnapshots.listForPeriod` | query | Company + month → all deployments with snapshot status |

**Invoice (extend `clientBilling`):**

| Change | Purpose |
|--------|---------|
| `generateMonthlyInvoices` input | Add optional `mode`: `legacy` \| `deployment` \| `auto` (default `legacy` until feature enabled) |
| New mutation **or** branch | `generateMonthlyInvoicesFromDeployments` — only processes deployments with **locked** snapshot + active rate rule |

**Implementation discipline:** Prefer **one** `generateMonthlyInvoices` with internal branching + `mode` to avoid duplicate idempotency bugs — or two procedures that share a private `lib/` function. **Do not** copy-paste invoice insert logic.

---

## 6. Invoice generation logic (deployment path)

For each `(customer_deployment, year, month)` eligible:

1. **Snapshot** must be `locked`; quantity > 0 (or allow zero with product approval).
2. **Rate:** pick **one** applicable `billing_rate_rules` row for that deployment where period overlaps `[year-month-01, year-month-end]` and `unit` matches snapshot semantics (day).
3. **Line items:** One line per deployment (or per site if multi-site later): `quantity` × `amount_omr` → `calculateInvoice` / existing VAT path.
4. **Header:** `billing_customers.display_name` as `client_display_name`; `client_key` stable string; set `billable_snapshot_id`, `customer_deployment_id` if columns added.
5. **Idempotency:** Skip if invoice already exists for same `(company_id, customer_deployment_id, year, month)` or same unique key as chosen in §3.2.

**Fallback:** If `mode=auto`, for each site still on legacy (no locked deployment path), run existing site-name aggregation **unchanged**.

---

## 7. Reconciliation flow

**User story:** Ops selects **company + month**, sees a table:

| Customer deployment | System qty | Snapshot qty | Status | Invoice # |
|---------------------|------------|--------------|--------|-----------|
| … | from aggregate | from snapshot row | draft/locked/void | if any |

**Actions:**

- **Refresh draft** — recompute `system_quantity` from attendance.
- **Adjust** — update draft with note (requires permission).
- **Lock** — freezes snapshot; enables invoice generation for that deployment.
- **Compare to invoice** — after generate, show billed quantity vs locked snapshot (alert if mismatch).

**API:** `deploymentEconomics.reconciliation.summary({ companyId, year, month })` returning rows + flags.

---

## 8. Alerts (Phase 2 minimum)

Implement as **queries** first (no new infra); optional `alerts` router or reuse `alerts` module if pattern exists.

| Alert | Condition |
|-------|-----------|
| **Uninvoiced locked attendance** | Locked snapshot for period, no invoice row linked |
| **Draft stale** | Draft snapshot older than N days with closed sessions changed |
| **Quantity mismatch** | Invoice exists and line quantity ≠ snapshot quantity (if linked) |
| **No rate rule** | Locked snapshot but no applicable `billing_rate_rules` for period |
| **Deployment inactive** | Sessions counted but `customer_deployments.status` not `active` |

Store **no** new tables for alerts in Phase 2 unless product requires snooze; use scheduled job or on-demand query.

---

## 9. Audit and RBAC

- **Lock snapshot**, **void snapshot**, **generate invoice (deployment path)** → `audit_events` + same entity types as Phase 1 style.
- **Roles:** Same as invoice generation today (`requireNotAuditor` for writes); optional `company_admin` only for lock.

---

## 10. Feature flag / rollout

- **Per-tenant** flag in `companies` metadata JSON or dedicated column `use_deployment_billing` (boolean, default false).
- **Pilot:** enable for one `company_id`; `mode=auto` only after pilot sign-off.

---

## 11. Acceptance criteria (Phase 2 PR)

- [ ] Migration(s) for `billable_quantity_snapshots` + optional invoice columns + unique indexes.
- [ ] Compute path matches manual spreadsheet for **one pilot deployment** (day unit).
- [ ] Legacy `generateMonthlyInvoices` with `mode=legacy` (default) **bit-for-bit** same behavior as pre–Phase 2.
- [ ] Locked snapshot required before deployment-based invoice creates rows.
- [ ] Reconciliation API returns consistent numbers vs DB.
- [ ] At least **two** alert queries documented and runnable.
- [ ] No changes to payroll routers; `deploymentEconomics` remains write surface for snapshot lifecycle.

---

## 12. Suggested implementation order (PRs)

Aligned with **Locked decisions** → PR sequence:

1. **Schema + snapshot CRUD** (draft only; compute from attendance for primary site).
2. **Lock + audit** + immutability rules for locked rows + unique constraints hardened.
3. **Invoice branch** + FK columns on invoices + idempotency keyed on deployment + period (+ snapshot).
4. **Reconciliation API** + thin UI or internal tool.
5. **Alerts** as query-backed reads + doc.

---

## 13. Open decisions (before coding)

1. **Multi-site:** **Deferred** for Phase 2 unless pilot requires it; use primary site only (see **Locked decisions**).
2. **Hour/month units:** in Phase 2 or defer to 2.1 (day-only guard acceptable for first ship).
3. **Invoice uniqueness:** confirm unique index strategy with MySQL NULL behavior for legacy rows.
4. **`client_key` for deployment rows:** display/compat only; **do not** make deployment idempotency depend on `client_key` format alone (see **Locked decisions**).

---

*Phase 2 completes the “trusted revenue” bridge; Phase 3 allocates payroll cost against these same deployments.*
