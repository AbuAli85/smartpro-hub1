# Workstream I — Operational noise spot-check record (Option C MVP)

**Purpose:** Close the remaining **Definition of done** item for Workstream I in [`SANAD_EXECUTION_TRACKER.md`](./SANAD_EXECUTION_TRACKER.md): *No noise explosion — cap + dedupe behaviour matches spec; spot-check with real-sized fixture or staging.*

**Spec reference:** [`SANAD_INTELLIGENCE_ENGINE_DESIGN_SPEC.md`](./SANAD_INTELLIGENCE_ENGINE_DESIGN_SPEC.md) v1.1 (Option C; parallel queue surface).

**What “operational noise” means here (non-exhaustive):**

- Queue length stays within the **server-enforced cap** (default **15** items; see `SANAD_QUEUE_DEFAULT_CAP` in code).
- **Per-centre deduplication** and **primary signal pick** do not produce duplicate rows for the same centre or contradictory CTAs.
- Ordering is stable enough for operators (no apparent random reshuffle on refresh for unchanged data).
- **Reviewer vs full operator** roles do not show forbidden actions; reviewer path remains **read-oriented** per RBAC policy.
- **Empty vs error:** empty queue is explainable (filters, scope, or genuinely clear backlog), not a silent API failure.

---

## Preconditions (before claiming “pass”)

| # | Check | Owner | Date | Pass |
| --- | --- | --- | --- | --- |
| P1 | Environment identified (staging URL or local + seeded DB) | | | ☐ |
| P2 | Roles available: platform/admin queue viewer + compliance reviewer (read-only queue) as per your RBAC matrix | | | ☐ |
| P3 | Dataset size: “real-sized” — e.g. directory import or staging snapshot large enough that **>15** centres could theoretically qualify for queue signals | | | ☐ |
| P4 | `pnpm test` and `pnpm check` green on the commit deployed to the environment under test (note commit SHA below) | | | ☐ |

**Deployed commit / release:** _[SHA or tag]_

---

## Spot-check procedure (recommended)

1. **Baseline:** Open **SANAD Network Intelligence** → confirm **Daily queue** card loads (overview and/or directory per routing).
2. **Cap:** In browser devtools or server logs, confirm returned queue length **≤ 15**; scroll UI — no “infinite” list beyond cap.
3. **Dedupe:** Scan visible rows — **no duplicate `centre` / row identity** for the same underlying centre (same deep link target).
4. **RBAC:** As **reviewer** — CTAs are view/remind style only; as **operator** — actionable CTAs appear per policy; no write surfaces exposed to reviewer-only where forbidden.
5. **Refresh:** Hard refresh twice — ordering and count remain plausible (not required to be bitwise-identical if `generatedAt` or data changes).
6. **Deep link:** From a queue item, follow **directory** link — lands on directory with expected row/drawer behaviour per [`SANAD_DAILY_QUEUE_DEEPLINK.md`](./SANAD_DAILY_QUEUE_DEEPLINK.md).

---

## Auditable closure table

Use one row per spot-check run (add rows as needed). **Do not** mark Workstream I parent DoD noise item complete until at least one **Pass** row exists with evidence attached (ticket, screenshot set, or log excerpt reference).

| Run ID | Date (UTC) | Environment | Operator | Role tested | Dataset note | Cap respected (Y/N) | Dedupe OK (Y/N) | RBAC OK (Y/N) | Evidence link | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | | | | | Pass / Fail / N/A |
| 2 | | | | | | | | | | |

**Failures:** Document in issue tracker with reproduction, role, and sample centre IDs (redacted if needed).

---

## Sign-off

| Field | Value |
| --- | --- |
| **Noise spot-check outcome** | Pass / Fail / In progress |
| **Authorised to update tracker DoD** | Name — Date |
| **Notes** | |

---

## Related documents

- [`SANAD_EXECUTION_TRACKER.md`](./SANAD_EXECUTION_TRACKER.md) — Workstream I DoD and status line
- [`SANAD_INTELLIGENCE_ENGINE_DESIGN_SPEC.md`](./SANAD_INTELLIGENCE_ENGINE_DESIGN_SPEC.md) — Option C scope and P4+ boundary
- [`SANAD_DAILY_QUEUE_DEEPLINK.md`](./SANAD_DAILY_QUEUE_DEEPLINK.md) — Directory `highlight` contract
