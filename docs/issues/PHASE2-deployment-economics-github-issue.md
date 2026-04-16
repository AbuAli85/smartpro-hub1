# GitHub issue — Phase 2 (paste into New Issue)

**Prereq:** Phase 1 foundation merged (`deploymentEconomics`, `billing_customers`, `customer_deployments`, `billing_rate_rules`, etc.).

## Title

```
feat(finance): Phase 2 deployment economics — billable snapshots, invoice hook-in, reconciliation, alerts
```

## Labels (suggested)

`enhancement` · `migration` · `area:finance` · `phase:billing` (or `phase:foundation-followup`)

---

## Summary

Deliver **trusted billable quantity** → **locked snapshot** → **optional deployment-based invoicing**, with **legacy path unchanged**. Single-site aggregation for Phase 2; **no** payroll allocation in this issue.

**Sources of truth:** `docs/DEPLOYMENT_ECONOMICS_PHASE2_SPEC.md`

**Operational guardrails (must be in acceptance criteria):** `docs/DEPLOYMENT_ECONOMICS_PHASE2_FAILURE_MODES.md` §8–§9

---

## Implementation order (narrow PRs — do not reorder)

1. **Snapshot schema + guarded APIs** (draft lifecycle only).
2. **Aggregation + lock** (immutability for locked rows; idempotent lock).
3. **Invoice hook-in** (`clientBilling` extension / shared lib; **no** duplicate insert logic).
4. **Reconciliation APIs** (+ thin UI optional).
5. **Alerts** as query-backed reads + documentation.

---

## Acceptance criteria (from failure-modes §8–§9)

- [ ] **Uniqueness:** At most one authoritative `draft`/`locked` snapshot per `(company, deployment, period)` — strategy implemented and tested (void behavior defined).
- [ ] **Deployment ∩ month:** Aggregation uses intersection of calendar month and `customer_deployments.effective_from` / `effective_to`.
- [ ] **Mixed legacy / auto-mode:** Documented exclusion matrix; no double-bill for defined pilot scenarios; skip reasons logged.
- [ ] **Void vs invoice:** Cannot void snapshot linked to non-void invoice (minimum); clear error.
- [ ] **Site immutability:** Snapshot persists **billing site id** used at draft creation (column name as implemented).
- [ ] **Lock idempotency:** Second `lock` on already-locked snapshot is safe.
- [ ] **Invoice linkage:** Deployment-path invoices set `billable_snapshot_id` + `customer_deployment_id` when columns exist.
- [ ] **Reconciliation:** API exposes live vs stored quantities where applicable.
- [ ] **Legacy parity:** `mode=legacy` (or flag off) matches pre–Phase 2 behavior for existing flows.
- [ ] **Alerts:** At least two documented, runnable alert queries.

---

## Out of scope

- Payroll allocation, margin facts (Phase 3–4).
- `customer_deployment_sites` / multi-site (unless pilot exception).
- Promoter dual-write.
- Full customer portal.

---

## References

- `docs/DEPLOYMENT_ECONOMICS_PHASE2_SPEC.md`
- `docs/DEPLOYMENT_ECONOMICS_PHASE2_FAILURE_MODES.md`
- `docs/DEPLOYMENT_ECONOMICS_BACKLOG.md` (Phase 2 section)

---

## PR description

Each PR should state **which step (1–5)** it completes, link **this issue**, and repeat the relevant acceptance bullets from the section above.
