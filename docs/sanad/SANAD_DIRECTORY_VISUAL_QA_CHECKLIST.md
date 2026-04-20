# SANAD directory — visual & layout QA checklist

**Purpose:** Repeatable verification after **dependency install** and **`pnpm check` / `pnpm test`**, following UI refinements on the SANAD Intelligence **Directory** tab and related shell (see also Workstream I tracker).

**Scope:** Primarily **`/admin/sanad/directory`** and shared chrome (**section nav**, **daily queue card** when shown on directory). Does not replace functional/API tests.

**References:** [`docs/ai/QA_VERIFICATION_SKILL.md`](../ai/QA_VERIFICATION_SKILL.md), [`docs/sanad/SANAD_EXECUTION_TRACKER.md`](./SANAD_EXECUTION_TRACKER.md).

---

## A — Environment & build (record results)

| Step | Command / action | Expected | Pass |
| --- | --- | --- | --- |
| A1 | Clean install | `pnpm install` completes without symlink/lock errors | ☐ |
| A2 | Typecheck | `pnpm check` exits 0 | ☐ |
| A3 | Tests | `pnpm test` exits 0 | ☐ |
| A4 | Dev smoke (optional) | `pnpm dev` loads app without console errors on landing admin route | ☐ |

**Commit / branch under test:** _[branch@SHA]_

**Gaps (if any):** _[e.g. test skipped, env var missing]_

---

## B — Access & routing

| # | Check | Pass |
| --- | --- | --- |
| B1 | User with SANAD Intelligence access can open `/admin/sanad/directory` | ☐ |
| B2 | User without access gets restricted/denied treatment (no data leak) | ☐ |
| B3 | Section nav shows **SANAD directory** as active state (subtle highlight, not destructive red primary) | ☐ |

---

## C — Directory page layout

| # | Check | Pass |
| --- | --- | --- |
| C1 | **Filters** card: search full width; governorate / stage / owner / needs-action row aligns on baseline; labels readable (semibold) | ☐ |
| C2 | **Needs action only** control height matches **h-10** selects | ☐ |
| C3 | **Queues** label is left-aligned; queue chips wrap from the **start** (not centered) | ☐ |
| C4 | **KPI** strip: 2 cols mobile → 4 cols `sm+`; cards even padding; **Conversion** / **Unassigned** tooltips on hover (native `title`) | ☐ |
| C5 | **Onboarding** callout: readable body text; registry row count is **dynamic** (not hard-coded) | ☐ |
| C6 | **Partner centres** card: title + range + pagination readable; pagination not disconnected on wide screens | ☐ |

---

## D — Data table

| # | Check | Pass |
| --- | --- | --- |
| D1 | Sticky header scrolls correctly inside bounded table area | ☐ |
| D2 | Row **vertical alignment** — cells use middle alignment vs two-line office column | ☐ |
| D3 | **Stage** badges: **imported** (and similar) have sufficient contrast | ☐ |
| D4 | **Contact readiness** — “Phone only” (and variants) readable | ☐ |
| D5 | **Actions** menu opens; **long menu scrolls** (`max-height` + scroll) without clipping off-screen | ☐ |
| D6 | Mixed Arabic/English **office** column: `dir="auto"` does not break layout | ☐ |

---

## E — Daily queue card (on Directory)

| # | Check | Pass |
| --- | --- | --- |
| E1 | Card renders or shows intentional empty/error (not blank silent failure) | ☐ |
| E2 | Scope selector (if applicable for role) works | ☐ |
| E3 | Deep link from an item lands on directory + **highlight** / drawer behaviour per spec | ☐ |

---

## F — Global chrome regression (SANAD admin)

| # | Check | Pass |
| --- | --- | --- |
| F1 | **Quick Actions FAB** hidden on `/admin/sanad` routes (no overlap with table/pagination) | ☐ |

---

## G — Viewports (manual)

| Viewport | Focus | Pass |
| --- | --- | --- |
| ~375px width | Filters stack; KPI grid 2-col; table horizontal scroll | ☐ |
| ~1280px | Section nav wraps cleanly; table uses width | ☐ |

---

## Sign-off

| Field | Value |
| --- | --- |
| **Tester** | |
| **Date** | |
| **Verdict** | Ready / Not ready — reason: |
| **Follow-ups** | Issue links |

---

## Related documents

- [`SANAD_EXECUTION_TRACKER.md`](./SANAD_EXECUTION_TRACKER.md)
- [`WORKSTREAM_I_OPERATIONAL_NOISE_SPOTCHECK.md`](./WORKSTREAM_I_OPERATIONAL_NOISE_SPOTCHECK.md)
- [`SANAD_DAILY_QUEUE_DEEPLINK.md`](./SANAD_DAILY_QUEUE_DEEPLINK.md)
