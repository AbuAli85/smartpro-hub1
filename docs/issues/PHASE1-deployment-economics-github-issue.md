<!--
  Paste into GitHub: New Issue → title + body below (omit this HTML comment).
  Source of truth: docs/DEPLOYMENT_ECONOMICS_PHASE1_SPEC.md
-->

## Title (copy this line)

`feat(finance): Phase 1 deployment economics — schema + billingCustomers / customerDeployments / billingRateRules (API-only)`

## Labels (suggested)

`enhancement` · `area:finance` (or your repo’s equivalent) · `migration`

---

## Locked decisions

- **Canonical party:** `business_parties`; **`billing_customers`** = tenant AR extension with optional `party_id`.
- **Uniqueness:** `UNIQUE (company_id, party_id)` on `billing_customers` (stable party reference per tenant).
- **Naming:** tables `customer_deployments`, `customer_deployment_assignments` (not bare `deployments`).
- **Rates:** relational `billing_rate_rules` only; optional `rule_meta_json` for edge metadata—not core billing JSON on headers.
- **Promoters:** no long-lived dual-write; `customer_deployment_assignments` only in this PR; one-time migration from `promoter_assignments` is a **follow-up** task.
- **Legacy:** `attendance_sites.billing_customer_id` **NULL** → existing client billing behavior **unchanged**.
- **Delivery:** **API-only** for Phase 1 (schema + guarded tRPC). UI in a **later** issue.

## In scope — tables / migration

- `billing_customers` (+ optional FK to `business_parties`)
- `attendance_sites.billing_customer_id` (nullable FK)
- `customer_contracts` (minimal shell)
- `customer_deployments`
- `customer_deployment_assignments`
- `billing_rate_rules`

## In scope — routers (minimal)

- `billingCustomers` — list, getById, create, update, setStatus
- `customerDeployments` — list, getById, create, update, setStatus/close
- `billingRateRules` — listForDeployment, create, update, void/close

Register routers in the app root router; every procedure: **`requireWorkspaceMembership`** + row `company_id` ownership checks.

## Audit

Emit **`audit_events`** for create/update/status on: billing customer, customer deployment, assignment, rate rule (see spec for `entityType` strings).

## Acceptance checklist

- [ ] Migration applies on empty DB and on DB with existing `attendance_sites` / `business_parties`
- [ ] Nullable `billing_customer_id` on sites; **legacy billing unchanged** when null
- [ ] All new tables: `company_id`, timestamps, `status` where applicable; FKs indexed
- [ ] Tenant scoping on **every** mutation
- [ ] Audit events wired for listed entities
- [ ] **`UNIQUE (company_id, party_id)`** on `billing_customers`
- [ ] No changes to `clientBilling.generateMonthlyInvoices` or payroll

## Out of scope

- Invoice generation changes, billable snapshots, payroll allocation, margin facts, dashboard UI
- Dual-write to `promoter_assignments`
- Product/nav UI (API-only Phase 1)

## References

- `docs/DEPLOYMENT_ECONOMICS_PHASE1_SPEC.md` — full column and procedure detail
- `docs/DEPLOYMENT_ECONOMICS_BACKLOG.md` — full program context
