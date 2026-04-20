# P4 decision memo — SANAD queue and Control Tower

**Status:** Draft (provisional recommendation set; final decision pending gates)  
**Scope:** Post-Option C MVP (after Workstream I closure gates)  
**Owners:** Product + Engineering + Operations  
**Last updated:** 2026-04-20

---

## 1) Decision to make

Choose the P4 direction for SANAD daily actions:

- **Option A — Keep parallel SANAD intelligence layer** (current Option C surface remains primary).
- **Option B — Merge SANAD into Control Tower** (extend `ActionKind` / `ActionSource` and related contracts).

This memo records the decision rationale and approval history.

---

## 2) Context and boundaries

- P1-P3 shipped as **Option C MVP** with no Control Tower schema/type edits.
- Workstream I closure requires operational noise validation before claiming operational closure.
- Any P4 merge work is explicitly higher regression risk and should be gated by real usage evidence.
- Current state: MVP is technically complete; operational noise validation remains the last closure gate.

**Non-negotiables carried into P4 analysis:**

- Tenant isolation and RBAC must remain strict.
- Reviewer vs operator semantics must stay policy-correct.
- No unverifiable claims (all decisions backed by measured evidence).

---

## 2.1) Provisional recommendation (leadership-ready, not final)

> **Provisional recommendation: Option A (keep SANAD parallel) until all decision gates pass.**

**Why now (evidence-aligned):**

- Option C MVP is technically complete and already operational as a parallel SANAD queue surface.
- Workstream I still has an open closure gate for operational noise validation.
- A Control Tower merge is the higher-regression path and should not be treated as default progression.

**This recommendation auto-expires** when Section 3 gates are all green and Section 4 scoring is completed with evidence links.

---

## 3) Preconditions (must be true before P4 decision is final)

| Gate | Requirement | Evidence | Pass |
| --- | --- | --- | --- |
| G1 | Workstream I DoD is fully closed (including noise spot-check pass row) | `SANAD_EXECUTION_TRACKER.md` + spot-check file | ☐ |
| G2 | Post-install verification complete (`pnpm check`, `pnpm test`) on candidate branch | CI/local logs | ☐ |
| G3 | Visual QA checklist complete for SANAD directory | QA checklist sign-off | ☐ |
| G4 | At least one staged usage window reviewed (operator feedback + false-positive/noise notes) | Notes / ticket links | ☐ |

If any gate is not met, default to **Option A (defer merge)**.

---

## 4) Evaluation criteria

Score each criterion from 1 (poor) to 5 (strong).

| Criterion | Weight | Option A (parallel) | Option B (merge) | Notes |
| --- | --- | --- | --- | --- |
| Operational clarity for SANAD teams | 3 |  |  |  |
| Cross-domain triage efficiency (single queue) | 3 |  |  |  |
| RBAC safety and auditability | 5 |  |  |  |
| Regression risk to existing Control Tower users | 5 |  |  |  |
| Engineering effort / maintenance cost (12 months) | 3 |  |  |  |
| Alert/notification noise risk | 4 |  |  |  |
| Time-to-value for next release | 3 |  |  |  |
| Stakeholder presentation simplicity | 2 |  |  |  |

**Weighted total:**  
- Option A: _____  
- Option B: _____

---

## 5) Option analysis template

### Option A — Keep parallel SANAD intelligence layer

**Benefits**

- Lowest regression risk to Control Tower contracts.
- Keeps SANAD-specific workflows explicit and easier to tune.
- Faster incremental improvements on SANAD signal quality.

**Risks**

- Operators who live in Control Tower may context-switch.
- Potential duplicate concepts across two queue surfaces over time.

**When to choose**

- Noise/signal quality still stabilizing.
- Merge risk outweighs UX consolidation benefits.

### Option B — Merge SANAD into Control Tower

**Benefits**

- Single operational queue concept for cross-domain users.
- Potentially better executive visibility in one place.

**Risks**

- Requires schema/type evolution (`ActionKind`, `ActionSource`, domain narratives, and QA blast radius).
- Higher chance of regressions in unrelated Control Tower flows.
- More complex RBAC and policy testing burden.

**When to choose**

- Signal quality is stable, operational noise is low, and user research strongly supports one queue.

---

## 6) Recommended default policy

Until evidence supports merge with acceptable risk, choose:

> **Default: Option A (parallel SANAD layer), with explicit revisit checkpoint.**

Revisit trigger examples:

- Two consecutive review windows show low queue noise and stable action completion quality.
- Clear stakeholder demand for one-queue operational model.
- Capacity exists for full regression test matrix across Control Tower.

---

## 7) If Option B is selected — mandatory guardrails

- Ship behind a feature flag.
- Keep a rollback path to the existing parallel SANAD surface.
- Run dedicated RBAC and tenant-isolation regression tests.
- Validate notification/noise impact before broad rollout.
- Stage rollout by role group (not all users at once).

---

## 8) Final decision record

### 8.1 Provisional decision record (current)

| Field | Value |
| --- | --- |
| Provisional recommendation | **Option A (parallel SANAD layer)** |
| Recommendation status | Active until gates G1-G4 pass |
| Basis | Current closure state + regression risk profile |
| Not yet complete | Workstream I noise closure, post-install checks, at least one usage/noise review window |
| Owner | Product + Engineering |

### 8.2 Final decision record (complete only after gates pass)

| Field | Value |
| --- | --- |
| Final decision | Option A / Option B |
| Decision date | |
| Approved by | |
| Effective release | |
| Evidence links | |
| Risks accepted | |
| Follow-up actions | |

---

## 9) Links

- `docs/sanad/SANAD_EXECUTION_TRACKER.md`
- `docs/sanad/WORKSTREAM_I_OPERATIONAL_NOISE_SPOTCHECK.md`
- `docs/sanad/SANAD_DIRECTORY_VISUAL_QA_CHECKLIST.md`
- `docs/sanad/SANAD_INTELLIGENCE_ENGINE_DESIGN_SPEC.md`
