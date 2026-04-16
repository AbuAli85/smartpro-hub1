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

## Merge hygiene (enforce failure-mode protections in review)

- **Link every PR** to this Phase 2 issue: use **`Part of #&lt;issue&gt;`** (or your repo’s equivalent) for stacked PRs so the chain stays traceable; the **final** PR in the sequence may use **`Closes #&lt;issue&gt;`** if your process closes the issue only when all steps land.
- **Paste the relevant §8 constraints** into each PR body (see table below). Reviewers treat them as **required**, not nice-to-have.
- **Do not combine steps** in one PR: especially **do not** ship snapshot schema/APIs **together with** invoice hook-in — that bypasses the “snapshot truth before invoice writes” gate and makes §8.3 / §8.7 hard to review.

| PR step | What ships | §8 / acceptance to restate in PR body |
|--------|------------|--------------------------------------|
| **1** | Snapshot schema + draft APIs only | §8.1 uniqueness strategy; §8.5 site id on snapshot at draft; no invoice code. |
| **2** | Aggregation + lock + immutability | §8.2 deployment ∩ month; §8.6 lock idempotency; draft→locked state machine; still **no** invoice writes. |
| **3** | Invoice hook-in + linkage columns | §8.3 auto-mode exclusion; §8.4 void vs invoice; §8.7 `billable_snapshot_id` / `customer_deployment_id`; legacy parity. |
| **4** | Reconciliation APIs | Reconciliation bullets + live vs stored quantities. |
| **5** | Alerts (queries + doc) | Alert acceptance + documented queries. |

---

## PR description (template)

Each PR **must**:

1. State **which step (1–5)** it completes.
2. Link **this issue** (`Part of` / `Closes` per your workflow).
3. **Copy-paste** the matching row from the table above (§8 constraints for that step) into the PR body so reviewers do not rely on memory.
