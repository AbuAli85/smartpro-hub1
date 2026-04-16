# Phase 2 — failure-mode review (pre-coding)

**Companion to:** `docs/DEPLOYMENT_ECONOMICS_PHASE2_SPEC.md`

This document lists **likely failure modes**, **ambiguous states**, and **tightening** recommendations before implementation. It is not a duplicate of the spec; it answers “what goes wrong if we only implement the happy path?”

---

## 1. Snapshot uniqueness and rerun behavior

### Risk: Unique constraint vs void + recreate

The spec uses **`UNIQUE (company_id, customer_deployment_id, period_year, period_month)`** for the active row. In MySQL, **void** rows still occupy the unique key unless you:

- **Option A:** `status = void` rows are rare; **delete** void drafts in dev only — bad for audit.
- **Option B:** Unique index includes `status` — usually wrong (multiple voids).
- **Option C (recommended):** Treat **void** as terminal; **new** draft for same period gets a **new** `id` only if unique allows it — **it does not**, if void row still exists.

**Tighten:** Define explicitly:

- Either **no void** for drafts — only **delete draft** before recreate (bad audit), or
- **Partial unique** is not native in older MySQL — use **application guard**: at most one non-void row per `(company, deployment, period)`, enforced in transaction + query `WHERE status IN ('draft','locked')`.

**Implementation note:** Add a **filtered uniqueness** story in code: `SELECT … FOR UPDATE` before insert, or composite unique on `(company_id, customer_deployment_id, period_year, period_month, snapshot_generation)` with generation int — adds complexity. Simplest MVP: **one row per deployment+period** ever; corrections use **version** column or **child adjustment** table.

### Risk: Rerun “preview” vs persisted draft drift

Operator runs **preview** twice; attendance changed between runs; **draft** row still shows old `system_quantity`.

**Tighten:** `previewCompute` is always read-only; **upsertDraft** must document **last_computed_at** and optionally **source_hash** (hash of session ids counted) to detect drift. Reconciliation UI should show “stale draft” if `sessions_updated_after > draft.updated_at` (alert “Draft stale”).

### Risk: Lock idempotency

Double-click **lock** or duplicate API calls.

**Tighten:** `lock` must be **idempotent**: second call on already-locked returns success with no side effects; or returns 409 with clear message.

---

## 2. Month-boundary and attendance edge cases

### Risk: `business_date` vs tenant timezone

`monthYmdRange` is calendar-month in **which** timezone? Attendance `business_date` is typically **site/local** (e.g. Muscat).

**Tighten:** Document that aggregation uses **the same** `monthYmdRange(year, month)` as today’s legacy path for that company/site, and that `business_date` strings are comparable. If some sites use different timezones later, Phase 2 must **scope** to primary site’s timezone or document “all dates are calendar dates in Asia/Muscat” for pilot.

### Risk: Deployment effective dates vs calendar month

`sessions` exist in March but `customer_deployments.effective_from` / `effective_to` **exclude** part of the month.

**Tighten:** Aggregation must filter sessions to **dates where deployment is active** (intersection of `[effective_from, effective_to]` with month range). Otherwise invoice and reality diverge.

### Risk: Primary site changed mid-month

Site ID on deployment updated **after** sessions were recorded on old site.

**Tighten:** Phase 2 single-site: define whether **historical** aggregation uses **deployment’s current** `primary_attendance_site_id` (wrong for history) vs **immutable snapshot of site id** on first draft — likely need **`billing_site_id` on snapshot row** set at draft creation time for audit stability.

### Risk: Session not closed

Legacy generator only counts **closed** sessions — good. **Partially open** sessions: excluded; operators may expect them — document exclusion.

---

## 3. Invoice idempotency collisions

### Risk: Legacy + deployment double-bill same commercial customer

Same **commercial** client could appear as:

- legacy **client_key** from `client_name` on site A, and  
- deployment invoice keyed by **customer_deployment_id**,

if site is linked to `billing_customer` **and** legacy run still includes that site.

**Tighten:** For `mode=auto`, define **exclusion rule**:

- Sites (or customers) that are **fully** on deployment path for that month **must be excluded** from legacy aggregation for that period, **or**
- Legacy path only runs for sites where **`billing_customer_id` IS NULL** (strict), **or**
- Feature flag splits **entire company** — no mixed run in same month until product allows.

**Strictest safe default:** `auto` = deployment branch **only** for deployments with locked snapshot; legacy branch **only** for sites with **no** active locked deployment for that period **and** no overlapping billing customer — needs clear matrix in code comments.

### Risk: Unique constraint collision on `client_service_invoices`

Adding `UNIQUE (company_id, customer_deployment_id, period_year, period_month)` — legacy rows have `customer_deployment_id` NULL; multiple NULLs allowed in MySQL unique — OK.

**Risk:** Manual SQL insert duplicates — still possible; app must handle unique violation gracefully.

### Risk: Regenerate invoice after snapshot void

Invoice exists, snapshot voided — invoice still there.

**Tighten:** Void snapshot **after** invoice exists should be **forbidden** or triggers **credit note / void invoice** workflow (Phase 2.1). Minimum: **block void** if `billable_snapshot_id` referenced by non-void invoice.

---

## 4. Reconciliation states and operator actions

### Risk: Undefined transitions

Allowed: `draft → locked`, `draft → void`, `locked → ?`

**Tighten:** Explicit state machine:

| From | To | Allowed |
|------|-----|---------|
| draft | locked | yes |
| draft | void | yes |
| locked | void | only if **no** invoice (or with finance override + audit) |
| locked | draft | **no** (breaks trust) — use correction path |
| void | draft | new row / new period only |

### Risk: “Adjust” without permission

**Tighten:** `manual_adjustment` on quantity requires same or higher role as lock; audit `before`/`after`.

### Risk: Reconciliation summary inconsistent

System quantity from live query vs stored `system_quantity` on draft.

**Tighten:** API should return **both** live recomputation and **stored** draft fields, labeled, so operators see drift.

---

## 5. Audit and correction paths

### Risk: No audit on draft recompute

**Tighten:** Optional audit on **significant** draft updates (quantity delta > threshold) to avoid log noise.

### Risk: Post-lock correction

Spec says additive/versioned — implement **one** pattern:

- **Credit invoice** + new invoice (finance standard), or  
- **Adjustment snapshot** child row (complex).

Phase 2 minimum: **document** “no locked mutation”; finance uses void invoice + new period correction in spreadsheet if product not ready.

---

## 6. Feature flag and mixed legacy / new tenants

### Risk: `use_deployment_billing` true but no snapshots

Generation runs `auto`; deployment branch finds **no** locked snapshots → creates **nothing** for deployments; legacy might still bill same customer if exclusion wrong.

**Tighten:** `auto` mode should log **per deployment** skip reason: `no_snapshot`, `draft_only`, `no_rate_rule`, `deployment_inactive`.

### Risk: Pilot half-migrated

Some sites have `billing_customer_id`, others not; one deployment active.

**Tighten:** Default **legacy** for whole company until pilot checklist: “all in-scope sites linked + deployments + rate rules + training”.

### Risk: Flag off but someone locks snapshots

Snapshots exist; flag off; `generate` legacy only — **no** double bill if exclusion rules correct; **orphan** locked snapshots confuse ops.

**Tighten:** UI or admin query: “locked snapshot with no invoice and flag off” as warning, not alert storm.

---

## 7. Alerts — false positives / performance

| Alert | False positive cause | Mitigation |
|-------|---------------------|------------|
| Uninvoiced locked | Invoice created but `billable_snapshot_id` not backfilled | Migration backfill + invariant on generate |
| Draft stale | N large | Make N configurable; compare session `updated_at` if column exists |
| Deployment inactive | Sessions from before status change | Filter sessions by date vs `status` as of period end (hard) — MVP: alert informational only |

---

## 8. Summary — tighten before first PR

1. **Enforce** non-void uniqueness in app layer if DB unique + void is awkward; or add **version** column.
2. **Intersect** deployment `effective_*` dates with month range for aggregation.
3. **Persist** `billing_site_id` on snapshot at draft creation if site can change.
4. **Define** `mode=auto` exclusion matrix to prevent legacy+deployment double billing.
5. **Block** snapshot void when invoice references it (or define finance workflow).
6. **Document** state machine and idempotent `lock`.
7. **Backfill** `billable_snapshot_id` on invoice when generating from deployment path.

---

*After addressing these in design or tickets, Phase 2 implementation risk drops from “integration surprise” to “normal CRUD.”*
