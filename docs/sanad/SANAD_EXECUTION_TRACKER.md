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

---

## Changelog

- **2026-04-18**: Initial tracker; added marketplace parity tests, partner/roster integration tests, v2 invite hashing + migration `0076`, invite unit tests, bridge test updates.
- **2026-04-18 (Week 1 closeout):** Workstream B — extracted `roster`, `catalogue`, `marketplace`, `workspace` sub-routers; `sanadCore.ts` reduced to ~872 lines; tracker + parity doc paths aligned with `server/routers/sanad/*`.
