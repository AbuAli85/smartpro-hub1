# SANAD execution tracker

## Executive summary

Baseline review gaps are tracked as workstreams with explicit acceptance criteria. **Week 1 (2026-04-18):** the monolithic Sanad router was split into `server/routers/sanad/` (`sanadCore.ts` + four domain sub-routers + `index.ts` merge) with **no tRPC path changes**. Earlier work prioritized **test-backed verification** of marketplace readiness parity, partner/marketplace/roster flows, and **invite token at-rest hardening** (v2 SHA-256 digest + migration `0076`). Large UI splits and repository unification remain **deferred** where noted per workstream.

## What is already strong

- **Lifecycle rules** in `shared/sanadLifecycleTransitions.ts` align go-live vs listed-office invariants with `shared/sanadMarketplaceReadiness.ts`.
- **Public invite → lead → link → activate** flows are exercised in `server/sanad-intelligence/sanadActivationBridge.test.ts` (generate, accept, link, activation, audit).
- **Server-side activation gate** `evaluateActivationServerGate` in `server/sanad-intelligence/activation.ts` is unit-tested (`sanadActivationHardening.test.ts`).
- **Global API rate limiting** applies to all `/api/trpc` traffic via `apiRateLimiter` in `server/_core/security.ts` (300 requests / 15 minutes per IP).

## Confirmed gaps (from baseline)

1. Oversized `client/src/pages/AdminSanadIntelligencePage.tsx`
2. ~~Oversized `server/routers/sanad.ts`~~ → replaced by `server/routers/sanad/` package (Week 1)
3. Mixed repository pattern vs inline Drizzle in SANAD paths
4. Weak router/integration coverage for critical partner flows (partially addressed this pass)
5. Possible SQL vs TS marketplace readiness drift (parity tests added)
6. Invite token hardening / rate limit verification (hashing implemented; rate limit documented)
7. Partner-facing i18n gaps
8. Import/docs operational cleanup

---

## Workstream A — Split / modularize `AdminSanadIntelligencePage.tsx`

| Field | Value |
| --- | --- |
| **Status** | Missing (deferred) |
| **Files** | `client/src/pages/AdminSanadIntelligencePage.tsx` |
| **Risk** | Medium — maintainability and regression risk during split |
| **Acceptance criteria** | Smaller route-level components or hooks; no behavior change; smoke-tested admin SANAD intel flows |
| **Test evidence** | None for split (deferred per instruction: tests first) |
| **Notes** | Documented deferral until partner/marketplace/roster tests are stable |

## Workstream B — Split / modularize Sanad router (`server/routers/sanad/`)

| Field | Value |
| --- | --- |
| **Status** | **Done (Week 1, 2026-04-18)** — four domain sub-routers + slim core |
| **Files** | `server/routers/sanad/index.ts` (merge), `sanadCore.ts` (~872 lines), `roster.router.ts` (5), `catalogue.router.ts` (8), `marketplace.router.ts` (3), `workspace.router.ts` (4) |
| **Risk** | Medium — merge conflicts and subtle auth/query regressions |
| **Acceptance criteria** | Sub-routers by domain; **identical** `sanad.*` tRPC contracts; one-way imports: `*.router.ts` → `sanadCore.ts` only |
| **Test evidence** | `pnpm check`; `server/sanad.partnerMarketplaceAndRoster.integration.test.ts`; `shared/sanadMarketplaceSqlTsParity.test.ts`; targeted `server/smartpro.test.ts` Sanad cases |
| **Notes** | **Merge order in `index.ts`:** `sanadCore` → catalogue → marketplace → **workspace** → **roster** (spread order only matters on key collision; there is none). Top-level `server/routers/sanad.ts` removed earlier; app imports `./routers/sanad`. Week 2 can peel providers / work orders / dashboard / service requests / applications from `sanadCore.ts`. |

## Workstream C — Repository pattern consistency for SANAD

| Field | Value |
| --- | --- |
| **Status** | Missing |
| **Files** | `server/repositories/sanad.repository.ts`, `server/routers/sanad.ts`, related Drizzle calls |
| **Risk** | Low–medium — consistency and testability |
| **Acceptance criteria** | Sensitive paths use one pattern; no duplicate office/catalogue queries without reason |
| **Test evidence** | None |
| **Notes** | Out of scope for this pass |

## Workstream D — Integration tests for critical SANAD flows

| Field | Value |
| --- | --- |
| **Status** | Partial |
| **Files** | `server/sanad-intelligence/sanadActivationBridge.test.ts` (activation + invite), `server/sanad.partnerMarketplaceAndRoster.integration.test.ts` (marketplace list, public profile, go-live rejection, catalogue invariant, roster) |
| **Risk** | High if untested — incorrect listing or roster mutations |
| **Acceptance criteria** | Caller-based tests for: activation (existing), listing toggle failure, listed-office catalogue guard, last-owner protection, public listing query, public profile by id |
| **Test evidence** | `pnpm test` — suites above |
| **Notes** | `peekCenterInvite` + v2 hashed storage covered in `sanadActivationBridge.test.ts` (B5b); A1 asserts hashed `inviteToken` in DB update payload. `makeAdminCtx` in that file now uses `platformRole: "super_admin"` so `sanadIntelFullProcedure` matches current `canAccessGlobalAdminFromIdentity` rules |

## Workstream E — SQL vs TS marketplace readiness parity

| Field | Value |
| --- | --- |
| **Status** | Partial (documented mirror + tests; router still inlines SQL) |
| **Files** | `shared/sanadMarketplaceSqlTsParity.test.ts`, `shared/sanadMarketplaceReadiness.ts`, `server/routers/sanad/marketplace.router.ts` (`listPublicProviders`) |
| **Risk** | Medium — drift between SQL filters and shared readiness |
| **Acceptance criteria** | Automated proof that strict discovery rules in TS match SQL semantics; optional filters documented in tests |
| **Test evidence** | `shared/sanadMarketplaceSqlTsParity.test.ts` |
| **Notes** | Parity helper in test file must stay aligned with `listPublicProviders`; future improvement: single exported predicate used by router |

## Workstream F — Invite token security

| Field | Value |
| --- | --- |
| **Status** | Partial |
| **Files** | `server/sanad-intelligence/activation.ts`, `server/sanad-intelligence/generateCenterInviteRunner.ts`, `server/routers/sanadIntelligence.ts` (`getCenterInvite`), `drizzle/0076_sanad_invite_token_width.sql`, `drizzle/schema.ts`, `server/sanad-intelligence/inviteTokenStorage.test.ts` |
| **Risk** | High — token leakage or broken onboarding |
| **Acceptance criteria** | New invites stored hashed; legacy plaintext still resolves; expiry/invalidation unchanged; admin read API does not expose unusable “path” built from digest |
| **Test evidence** | `inviteTokenStorage.test.ts`; `sanadActivationBridge.test.ts` A1, B5b |
| **Notes** | **Expiry**: `inviteIsExpired` unchanged — missing expiry still treated expired on public paths where applicable. **Rate limits**: no SANAD-specific tRPC limiter; **all** tRPC routes share `apiRateLimiter` on `/api/trpc`. Optional follow-up: tighter limiter for `peekCenterInvite` / `acceptCenterInvite` only |

## Workstream G — Partner-facing i18n

| Field | Value |
| --- | --- |
| **Status** | Missing |
| **Files** | Partner pages under `client/src/pages/Sanad*.tsx`, locale bundles |
| **Risk** | Low–medium — UX and trust |
| **Acceptance criteria** | Keys complete for partner onboarding/marketplace strings; QA on `ar`/`en` |
| **Test evidence** | None |
| **Notes** | Not addressed this pass |

## Workstream H — Import / docs operational cleanup

| Field | Value |
| --- | --- |
| **Status** | Partial (this tracker added; `data/sanad-intelligence/IMPORT.txt` unchanged) |
| **Files** | `docs/sanad/SANAD_EXECUTION_TRACKER.md`, `docs/sanad-v2-closeout.md`, import scripts |
| **Risk** | Low |
| **Acceptance criteria** | Runbooks accurate; obsolete doc references removed |
| **Test evidence** | N/A |
| **Notes** | Tracker is source of truth for execution status going forward |

## Workstream I — SANAD Intelligence Engine — Option C MVP (P1–P3)

**Parent (GitHub):** create issue titled `SANAD Intelligence Engine — Option C MVP (P1–P3)` and paste URL here: _[parent issue URL]_

### Parent issue — copy/paste for GitHub (when `gh` / API not used)

**Title (exact):** `SANAD Intelligence Engine — Option C MVP (P1–P3)`

**Body (replace `P1_URL` / `P2_URL` / `P3_URL` after child issues exist):**

```markdown
Execution control panel for Option C MVP. **Order:** P1 → P2 → P3 only (no parallel start).

**Spec (frozen):** design spec v1.1 — Option C; no Control Tower edits through P3.

## Child issues

- P1 (signals module): P1_URL
- P2 (server generator + `dailyActionQueue` tRPC): P2_URL
- P3 (UI card + deep links + en/ar i18n scaffold): P3_URL

## Epic status

- [ ] P1 — merged; deterministic signal tests green
- [ ] P2 — merged; RBAC + read-only queue contract stable
- [ ] P3 — merged; queue visible; no English-only UI

## Definition of done (close parent when all true)

- Queue **renders** for authorized roles; empty state is intentional, not silent failure.
- Items are **actionable** (deep links match directory contract in `docs/sanad/`).
- **No noise explosion:** cap + dedupe per spec; spot-check with fixture or staging.
- **No RBAC leaks:** compliance reviewer vs full operator per spec; queue procedure read-only.
- **Deterministic tests** for P1/P2 (overlap, dedupe, cap, RBAC).
- **No English-only P3 UI** — `en-OM` + `ar-OM` keys (Arabic may be scaffold per spec).
- **Zero** changes under `client/src/features/controlTower/` for this MVP.

## Red lines (reject PR)

- Control Tower types/files (P1–P3).
- ROI / finance / `getPnlSummary` coupling.
- Skipping tests for overlap, dedupe, cap, or RBAC.
```

**Spec (frozen):** [`SANAD_INTELLIGENCE_ENGINE_DESIGN_SPEC.md`](./SANAD_INTELLIGENCE_ENGINE_DESIGN_SPEC.md) **v1.1** — Option C MVP; no `ActionKind` / `ActionSource` / `ControlTowerDomain` changes through P3.

**Execution order (strict):** **P1 → P2 → P3** — do not parallelize initially (P2 depends on signal output shape; P3 depends on stable read API).

| Phase | Scope | Tracked issue (paste URL) |
| --- | --- | --- |
| **P1** | Shared pure signal module + unit tests (`shared/sanadQueueSignals.ts` or agreed name) | _[P1 URL]_ |
| **P2** | Server queue generator + `sanad.intelligence.dailyActionQueue` (read-only, RBAC-safe) | _[P2 URL]_ |
| **P3** | UI card (daily actions) + deep links + **en/ar i18n scaffold** (Section 10.2) | _[P3 URL]_ |

**Suggested ownership:** P1 — strongest logic/backend; P2 — backend + RBAC; P3 — frontend + i18n. If one person: still **separate phases / separate PRs**, not one mega-PR.

**P1 status:** **Done** — `shared/sanadQueueSignals.ts` + `shared/sanadQueueSignals.test.ts` (pure module; `utcDayId`; optional office/roster flags only when explicitly supplied).

**P2 status:** **Done** — `listSanadCenterRowsForDailyActionQueue` + `mapListCentersRowToSnapshot` + `generateSanadActionQueue` / `filterSanadQueueRowsByOwnerScope`; `sanad.intelligence.dailyActionQueue` (read-only); tests `sanadQueueRowMapping.test.ts`, `sanadQueueGeneration.test.ts`; deeplink `docs/sanad/SANAD_DAILY_QUEUE_DEEPLINK.md`.

**P3 status:** **Done** — `SanadDailyQueueCard` + `trpc.sanad.intelligence.dailyActionQueue` on **Network overview** and **Directory** tabs; `viewer` / `ctaVariant` honoured; `?highlight=` opens drawer + scroll + `replaceState` strip; i18n namespace **`sanadIntel`** in `en-OM` + `ar-OM` (`client/src/locales/*/sanadIntel.json`); no Control Tower edits.

### P2 — design locks (non-negotiable; lock before P2 merge)

| Lock | Rule |
| --- | --- |
| **A — Time** | **One canonical clock:** server compares using **UTC**-normalized calendar days (`utcDayId` / aligned `referenceTime`). Do **not** mix JS UTC with MySQL `CURDATE()` session semantics for queue due logic — treat stored timestamps as UTC-normalized for comparison, or document a single DB-side rule if unavoidable. |
| **B — Snapshot mapping** | **Single function** `mapListCentersRowToSnapshot(row): SanadQueueCenterSnapshot`. Set `officeIsPublicListed`, `officeHasActiveCatalogue`, `rosterIsSoloOwnerOnly` **only** when SQL/join materializes them; **never** infer, guess, or default to `false`. Missing ⇒ `undefined` (preserves P1 no-false-positive contract). Unit-test the mapper. |
| **C — Generator** | **`generateSanadActionQueue(rows, referenceTime, …)`** (name may match spec): **all** inputs passed in — no DB, no tRPC, no implicit `Date.now()` inside the generator. Router loads rows, calls generator, returns output. |
| **D — RBAC** | Same **signals** for reviewer vs operator; **output** differs (e.g. view/remind vs assign/update CTAs). Do **not** drop signals or change scores for reviewer — only presentation / CTA policy. |
| **E — Cap + order** | Sort, per-centre dedupe/primary pick, and **cap (default 15)** enforced **server-side**; UI renders only. |

**P2 — recommended extra test:** **midnight boundary** — same calendar `next_action_due_at`, `referenceTime` just before vs after UTC midnight; assert `SANAD_DUE_TODAY` vs `SANAD_OVERDUE_FOLLOWUP` does not flip incorrectly.

### P2 — merge gate checklist

- [x] Generator deterministic for fixed `referenceTime` + fixture rows.
- [x] `mapListCentersRowToSnapshot` exists and is unit-tested (undefined vs explicit booleans).
- [x] UTC / date comparison consistent with lock A (document chosen rule in code or `docs/sanad/` if non-obvious).
- [x] RBAC: reviewer vs operator behaviour tested (same signals, different CTA / copy policy).
- [x] No writes; read-only procedure only.
- [x] No Control Tower imports or schema changes.
- [x] No UI logic inside generator.
- [x] Cap applied server-side after global ordering.
- [x] Midnight boundary test (recommended above).

### Definition of done (parent closes when all true)

- [x] Queue **renders** for authorized roles; empty state is intentional, not a silent failure.
- [x] Items are **actionable** (deep link to directory contract documented in `docs/sanad/`).
- [ ] **No noise explosion:** cap + dedupe behaviour matches spec; spot-check with real-sized fixture or staging.
- [x] **No RBAC leaks:** compliance reviewer vs full operator semantics per spec; read-only procedure only for queue.
- [x] **Deterministic tests** land for P1/P2 (overlap, dedupe, cap, RBAC).
- [x] **No English-only P3 UI** — keys in `en-OM` + `ar-OM` (Arabic may be scaffold per spec).
- [x] **Zero** changes under `client/src/features/controlTower/` for this MVP.

### Red lines (reject PR if violated)

- Control Tower type or file changes (P1–P3).
- ROI / finance / `getPnlSummary` coupling.
- Skipping tests for signal overlap, dedupe, cap, or RBAC.

### Operational closure (runbooks)

- **Operational noise spot-check (DoD):** [`WORKSTREAM_I_OPERATIONAL_NOISE_SPOTCHECK.md`](./WORKSTREAM_I_OPERATIONAL_NOISE_SPOTCHECK.md) — auditable table + procedure before marking the **noise** DoD checkbox.
- **Directory visual QA (post-install):** [`SANAD_DIRECTORY_VISUAL_QA_CHECKLIST.md`](./SANAD_DIRECTORY_VISUAL_QA_CHECKLIST.md) — layout/accessibility pass after `pnpm install` succeeds and `pnpm check` / `pnpm test` run.
- **P4 strategy memo (next step):** [`P4_CONTROL_TOWER_DECISION_MEMO.md`](./P4_CONTROL_TOWER_DECISION_MEMO.md) — decision framework for Option A (parallel) vs Option B (Control Tower merge).

---

## Changelog

- **2026-04-20:** Added [`P4_CONTROL_TOWER_DECISION_MEMO.md`](./P4_CONTROL_TOWER_DECISION_MEMO.md) for post-MVP Option A vs B decision governance.
- **2026-04-20:** Added runbooks [`WORKSTREAM_I_OPERATIONAL_NOISE_SPOTCHECK.md`](./WORKSTREAM_I_OPERATIONAL_NOISE_SPOTCHECK.md) and [`SANAD_DIRECTORY_VISUAL_QA_CHECKLIST.md`](./SANAD_DIRECTORY_VISUAL_QA_CHECKLIST.md); linked from Workstream I.
- **2026-04-20 (P3 ship):** Workstream I — P3: `SanadDailyQueueCard`, directory `highlight` handling, `sanadIntel` i18n (`en-OM` / `ar-OM` scaffold); parent DoD items updated where met; staging noise check remains open.
- **2026-04-20 (P2 ship):** Workstream I — P2 implemented: `dailyActionQueue` tRPC, `dailyActionQueueQueries.ts`, `sanadQueueRowMapping.ts`, `generateSanadActionQueue.ts`, unit tests + midnight boundary, `SANAD_DAILY_QUEUE_DEEPLINK.md`; merge checklist marked complete.
- **2026-04-20 (later):** Workstream I — P1 marked done; **P2 design locks** (UTC time, snapshot mapper contract, pure generator, RBAC CTA policy, server cap) + P2 merge checklist + midnight-boundary test note.
- **2026-04-20**: Workstream I — added GitHub **parent issue** copy/paste block (title, child links placeholders, epic status checklist, DoD, red lines) for environments without `gh`/API.
- **2026-04-19**: Workstream I — Option C MVP (P1–P3) parent tracker + spec link; execution order and DoD aligned with `SANAD_INTELLIGENCE_ENGINE_DESIGN_SPEC.md` v1.1.
- **2026-04-18**: Initial tracker; added marketplace parity tests, partner/roster integration tests, v2 invite hashing + migration `0076`, invite unit tests, bridge test updates.
- **2026-04-18 (Week 1 closeout):** Workstream B — extracted `roster`, `catalogue`, `marketplace`, `workspace` sub-routers; `sanadCore.ts` reduced to ~872 lines; tracker + parity doc paths aligned with `server/routers/sanad/*`.
