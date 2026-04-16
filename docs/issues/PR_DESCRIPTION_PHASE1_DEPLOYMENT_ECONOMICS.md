# PR description — paste when opening the Phase 1 foundation PR

## Title (suggested)

```
feat(finance): Phase 1 deployment economics — schema + deploymentEconomics API (foundation only)
```

## Summary

Implements **Phase 1 foundation** for deployment economics: tenant-scoped **billing customers**, **customer deployments**, **deployment assignments**, and **billing rate rules**, with a nested **`deploymentEconomics`** tRPC router. **API-only** — no product UI in this PR.

**Closes:** _#&lt;issue-number&gt;_ (link to issue created from `PHASE1-deployment-economics-github-issue.md`)

---

## Scope (explicit)

| In this PR | Not in this PR |
|------------|----------------|
| Drizzle schema + migration `0056_deployment_economics_phase1` | Invoice generation / `clientBilling.generateMonthlyInvoices` changes |
| `attendance_sites.billing_customer_id` (nullable) | Payroll allocation / margin facts |
| `deploymentEconomics` router (nested: billingCustomers, customerDeployments, billingRateRules, customerDeploymentAssignments) | Product/nav UI |
| `audit_events` via `deploymentEconomicsAudit` on mutations | Dual-write to `promoter_assignments` |

---

## Backward compatibility

- **`clientBilling` / legacy path:** unchanged when `attendance_sites.billing_customer_id` is **NULL** (site text + daily rate + existing flows).
- **Payroll:** no coupling added.

### Pre-merge mental model (do not skip)

1. **`party_id`** — Optional link to `business_parties`; **not** a primary join key. Application logic must **not** assume a single row per tenant when `party_id IS NULL`. Phase 2+ joins must handle NULL explicitly.
2. **Ownership** — Every mutation must keep `company_id` consistent: assignment ↔ employee ↔ deployment; rate rule ↔ deployment; deployment ↔ site (no cross-tenant site switch).
3. **Router boundaries** — `deploymentEconomics` stays the write surface for this data. **`clientBilling` and `payroll` do not absorb this logic**; later phases **read** from deployment economics, they do not duplicate writes here.

---

## Reviewer checklist

### Schema

- [ ] `UNIQUE (company_id, party_id)` on `billing_customers` — multiple rows with `party_id` NULL allowed (MySQL); non-null `party_id` unique per tenant.
- [ ] Indexes/FKs on: `billing_customer_id` (sites, FK chains), `customer_deployment_id`, `employee_id`, `primary_attendance_site_id`, `outsourcing_contract_id` as in migration.
- [ ] Timestamps + status defaults on new tables.

### Router safety

- [ ] Every procedure uses `requireWorkspaceMembership`; mutations enforce row `company_id`.
- [ ] Deployment create/update: primary site belongs to tenant when set.
- [ ] Assignment create: employee belongs to tenant.
- [ ] Rate rules: deployment belongs to tenant.

### Audit

- [ ] Mutations emit `audit_events` for billing customer, customer deployment, deployment assignment (create), billing rate rule.

### Migration

- [ ] `0056_deployment_economics_phase1` applies cleanly on a DB that already has `business_parties`, `attendance_sites`, `employees`, `outsourcing_contracts`.

---

## How to validate locally

```bash
# Requires DATABASE_URL
pnpm tsx scripts/migrate.ts

# Touched files (IDE) or full project with heap if needed:
# cross-env NODE_OPTIONS=--max-old-space-size=8192 npm run check
```

---

## Labels (suggested)

`enhancement` · `migration` · `area:finance` · `phase:foundation`
