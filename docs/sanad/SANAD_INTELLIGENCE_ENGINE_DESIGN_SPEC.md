# SANAD Intelligence Engine — Design Spec

**Document type:** Design spec (PRD-level + implementation notes)  
**Evidence class:** Code audit + product design — **not** production verification, live ROI proof, or implemented behaviour.

**Version:** 1.1  
**Scope:** SANAD directory as **signal source**; Control Tower as **prioritization + narrative shell** (post–MVP merge); finance as **future attribution target** once data exists.

**MVP policy (locked):** **Option C** — SANAD daily queue is a **parallel surface** (P1–P3). Through **P3**, **`ActionKind`**, **`ActionSource`**, and **`ControlTowerDomain`** remain **unchanged**. Control Tower merge and any `ActionKind` extension are **P4+** only, after signal quality, caps, and operator noise are validated.

---

## 1. Executive summary

The SANAD admin directory already behaves as a **CRM + pipeline** (`DirectorySurface`, `sanad.intelligence.listCenters`, pipeline KPIs, cohort filters). It does **not** yet feed a **unified decision layer**: operators still choose filters and rows manually.

This spec defines:

1. A **SANAD signal taxonomy** derivable from existing directory/pipeline/operations fields (no fake new sensors).
2. A **priority model** (severity, urgency, confidence, impact, ownership, aging, dedupe) that can map into **Control Tower** concepts.
3. A **daily action queue** as first-class **work items** (title, rationale, recommended action, horizon, owner, success condition, deep link).
4. **Explainability** fields per item (trigger, why now, expected outcome, risk if ignored).
5. An explicit **integration map** to current Control Tower types (`ActionQueueItem`, `ActionKind`, `priorityEngine`, domain narratives) — including the **schema extension** required to treat SANAD as a peer source (**P4+**; **not** in Option C MVP).
6. **Data model groundwork** for later monetization (milestones, attribution, confidence) **without** claiming revenue numbers today.
7. **Non-goals** and a **rollout sequence** ending in a **Cursor-ready implementation brief** (Section 12).

---

## 2. Problem framing

### 2.1 Current state

- **Strength:** Rich operational data, server-enforced RBAC, pipeline presets aligned with `listCenters` filters (`shared/sanadDirectoryPipeline.ts`, `server/sanad-intelligence/queries.ts`).
- **Gap:** Decisions are **implicit** (which filter, which row). There is no **ranked “do this next”** surface that composes with company-level Control Tower work.

### 2.2 Target state

- Platform operators with SANAD access see **a bounded daily queue** of SANAD-derived actions, each **explainable** and **deep-linked** to `/admin/sanad/directory` (row or drawer context).
- Long term, the same signals may surface in **Control Tower** for roles that span SANAD + company ops — **only after** `ActionKind` / `ActionSource` (or an agreed adapter) supports SANAD.

### 2.3 Success criteria (design-level)

| Criterion | Measure |
|-----------|---------|
| Actionable | Each queue item maps to ≤2 concrete UI destinations |
| Honest | Scores labeled with **confidence**; no fabricated ROI |
| Bounded | Default cap (e.g. 10–25 items/day per operator scope) |
| Auditable | Trigger reason + snapshot fields stored or reproducible from DB |
| RBAC-safe | Generation respects `canAccessSanadIntelRead` / full operator split |

---

## 3. Existing hooks in repo (code audit)

Use these as **integration anchors** — paths are authoritative for implementers.

| Layer | Hook | Role |
|-------|------|------|
| SANAD list/detail | `trpc.sanad.intelligence.listCenters`, `getCenter`, `centrePipelineKpis`, `centrePipelineOwnerOptions` | Signal inputs |
| Pipeline semantics | `shared/sanadCentresPipeline.ts`, `shared/sanadDirectoryPipeline.ts`, `listCenters` filters | Cohort + stage definitions |
| Stale / due UX (client) | `isLeadStale`, `nextActionDueCue` in `AdminSanadIntelligencePage.tsx` | Aging heuristics to mirror or centralize |
| Control Tower queue model | `client/src/features/controlTower/actionQueueTypes.ts` — `ActionQueueItem`, `ActionKind`, `ActionSource`, `ActionSeverity` | Target shape for **unified** queue |
| Priority band | `client/src/features/controlTower/priorityEngine.ts` — `getPriorityLevelForItem`, `buildPriorityItems` | Maps `kind` + `blocking` + `severity` → `critical` / `important` / `watch` |
| Explainability copy | `client/src/features/controlTower/actionExplanations.ts` — `getWhyThisMatters`, `getRecommendedAction` | **Today keyed only by `ActionKind`** — SANAD needs new kinds or a parallel explainability map |
| Domain narrative | `client/src/features/controlTower/domainNarrativeTypes.ts` — `ControlTowerDomain` | Today: `payroll` \| `workforce` \| `contracts` \| `hr` \| `compliance` \| `operations` \| `general` — **no `sanad` domain** yet |
| Company decision work | `server/decisionWorkItems.ts` — `DecisionWorkItem`, `DecisionActionKey` | Pattern: stable keys + deep links + tRPC mutation mapping — **parallel pattern** for platform-global SANAD work |

**Important constraint:** `ActionKind` is a **closed union** (`actionQueueTypes.ts`). SANAD integration is a **deliberate schema/design choice**:

- **Option A — Extend:** Add `sanad_*` kinds to `ActionKind`, extend `getPriorityLevelForItem`, `WHY`/`RECOMMENDED` in `actionExplanations.ts`, and any switch statements on `kind`.
- **Option B — Adapter:** Keep SANAD items in a `SanadQueueItem` type; map to `ActionQueueItem` at the Control Tower boundary with a small set of generic kinds + `reason` payload (weaker typing, faster ship).
- **Option C — Parallel surface:** SANAD “Daily queue” page/section first; merge into Control Tower after kinds exist.

**Formal MVP decision (no drift):** The project adopts **Option C** for P1–P3.

> For MVP, the project adopts **Option C**. **`ActionKind`**, **`ActionSource`**, and **`ControlTowerDomain`** remain unchanged through P1–P3.

**Post-MVP:** Revisit **Option A** vs **Option B** only in **P4+** when merging into Control Tower or the notification bell — after parallel-queue validation. **Option A** remains the natural fit if SANAD items must share `buildPriorityItems` / bell compression with HR items; until then, do not extend the closed union.

---

## 4. Proposed SANAD signal taxonomy

Signals are **detectable states** derivable from **current** intel + pipeline tables (same inputs as directory UI). Each signal has a **stable signal key** for logging and dedupe.

| Signal key | Detection (conceptual) | Primary existing levers |
|------------|------------------------|-------------------------|
| `SANAD_UNASSIGNED_PIPELINE` | Pipeline row exists, `ownerUserId` null, stage not terminal | `listCenters` owner filter, `pipeKpis.unassigned` |
| `SANAD_OVERDUE_FOLLOWUP` | `nextActionDueAt` date &lt; today | Queue filters, `pipeKpis.overdue` |
| `SANAD_DUE_TODAY` | `nextActionDueAt` = today | Same |
| `SANAD_STALE_CONTACT` | Last contact &gt; N days, stage not `active`/`registered` | Mirror `STALE_LEAD_DAYS` (14) from client; centralize in shared constant for server parity |
| `SANAD_INVITED_NO_ACCOUNT` | Invite sent, no registered user | Pipeline preset `invited_never_linked` |
| `SANAD_LINKED_NOT_ACTIVATED` | Registered, no linked office | Preset `linked_not_activated` |
| `SANAD_STUCK_ONBOARDING` | Registered, no office, onboarding in non-terminal states | Preset `stuck_onboarding` |
| `SANAD_LICENSED_NO_OFFICE` | Licensed onboarding, no office | Preset `licensed_no_office` |
| `SANAD_ACTIVATED_UNLISTED` | Linked office not public-listed | Preset `activated_unlisted` |
| `SANAD_LISTED_NO_CATALOGUE` | Public listed, no active catalogue | Preset `public_listed_no_active_catalogue` |
| `SANAD_SOLO_OWNER_ROSTER` | Office linked, roster = single owner only | Preset `solo_owner_roster_only` |
| `SANAD_NO_PHONE` | Missing contact phone | `contactReadinessBadge` logic |
| `SANAD_PHONE_NO_REPLY_EMAIL` | Phone present, no survey reply email, not linked | Ops + outreach fields |
| `SANAD_RECORD_QUALITY` | `isInvalid` / `isDuplicate` / manual quality flags | Pipeline flags (full-operator only for mutations) |

**Notes**

- Signals **overlap** (one centre may fire multiple). **Dedupe** (Section 5.6) picks a **primary signal** per centre per run.
- **Compliance reviewer** role: queue generation should emit **read-only** CTAs (view / remind) or be suppressed for mutating recommendations — align with existing `updateSanadCentrePipeline` restrictions.

---

## 5. Priority model

### 5.1 Dimensions (scoring inputs)

| Dimension | Meaning | Example proxy |
|-----------|---------|-----------------|
| **Severity** | Regulatory / revenue-at-risk framing | Stuck licensing &gt; missing phone for “critical” band |
| **Urgency** | Time-based | Overdue follow-up &gt; due today &gt; no due date |
| **Confidence** | How sure we are this is the right problem | High if DB flags set; medium if heuristic; low if inferred |
| **Expected impact** | Qualitative until monetization exists | “Unlocks onboarding” vs “hygiene” |
| **Ownership** | `ownerUserId` vs unassigned | Unassigned high-value cohort boosts score |
| **Aging** | Days since signal first eligible / since last contact | Monotonic increase capped |

### 5.2 Normalized score (0–100) — proposal

Define:

`raw = w_sev * S_sev + w_urg * S_urg + w_own * S_own + w_age * S_age + w_coh * S_coh`

- Clamp to `[0, 100]`.
- Weights `w_*` are **configurable constants** (JSON or DB table later); **initial values are engineering-tunable**, not business-optimized in v1.

**Cohort boost `S_coh`:** small additive weight when centre matches active **pipeline drilldown** preset (aligns product story with overview bottleneck tiles).

### 5.3 Mapping to Control Tower `PriorityLevel` (P4+ only)

Under **Option C MVP**, queue rows are **`SanadActionQueueItem`** with local `severity` / score only; **do not** map through `getPriorityLevelForItem` until SANAD is represented as `ActionQueueItem` (P4+).

Once SANAD items are `ActionQueueItem`s:

- **Critical:** `SANAD_STUCK_ONBOARDING` with blocked state, or `SANAD_OVERDUE_FOLLOWUP` + high severity policy, or explicit “compliance blocker” when compliance module marks centre — **open decision** (avoid false criticals).
- **Important:** Most conversion funnel leaks, unassigned + invited, licensed no office.
- **Watch:** hygiene (`SANAD_NO_PHONE`), solo roster, optional catalogue gaps.

Extend `getPriorityLevelForItem` with explicit branches for new `sanad_*` kinds **or** drive via `severity` + `blocking` flags on a generic kind — document chosen path in implementation ticket.

### 5.4 Ownership rules

- **Unassigned:** queue item `ownerUserId` null; `ownerLabel` = “Unassigned — SANAD pool”.
- **Assigned:** use pipeline owner display name / email (same as directory table).

### 5.5 Suppression rules

- Suppress if centre **archived** (directory already `excludeArchived: true` pattern).
- Suppress duplicate **same signal key + same centre** within one generation run.
- **Cooldown:** after user completes recommended action (e.g. marks contacted), suppress same signal for **K days** unless state regresses (configurable).

### 5.6 Dedupe (primary signal per centre)

1. Sort candidate signals by `(priority band desc, score desc, signal key asc)`.
2. Pick top signal; attach **secondary signals** as metadata for explainability (“also: overdue follow-up”).

---

## 6. Daily action queue design

### 6.1 Work item shape (logical)

Independent of Control Tower merge timing, define **`SanadActionQueueItem`** (name illustrative):

| Field | Purpose |
|-------|---------|
| `id` | Stable string: e.g. `sanad:{centerId}:{signalKey}:{dateBucket}` |
| `centerId` | FK to intel centre |
| `signalKey` | From Section 4 |
| `title` | Short imperative: “Assign owner: {centre name}” |
| `subtitle` | One line context: governorate, stage |
| `whyThisMatters` | Explainability (Section 7) |
| `recommendedAction` | Concrete verb: “Open directory drawer → Assign owner” |
| `successCondition` | Machine-checkable where possible: “ownerUserId non-null” |
| `dueHorizon` | `today` / `24h` / `7d` / `none` |
| `dueAt` | Optional ISO from `nextActionDueAt` |
| `ownerUserId` / `ownerLabel` | From pipeline |
| `href` | `/admin/sanad/directory?highlight={id}` or drawer deep link convention |
| `ctaLabel` | “Open in SANAD directory” |
| `severity` | `high` \| `medium` \| `low` |
| `blocking` | Boolean — default false until linked to compliance blockers |
| `confidence` | `high` \| `medium` \| `low` |
| `metadata` | JSON: secondary signals, snapshot counts, preset id |

### 6.2 Daily cap and ordering

- **Cap:** default **15** items per user per day (configurable); fill by global score order filtered to **items owned by user OR unassigned pool** (role policy).
- **“Top 10 today”** variant: hard cap 10 for exec summary card.

### 6.3 Source links

- **Minimum:** `href` to directory with query `centerId` or hash — implementer must add **one** supported deep-link contract (today row click uses drawer state only).

---

## 7. Explainability model

Per item, always render (or store) four strings:

| Field | Content |
|-------|---------|
| **Trigger** | “Detected: pipeline owner unassigned while stage = invited.” |
| **Why now** | “Invited centres without owner have lowest follow-up discipline (rule v1).” |
| **Expected outcome** | “Assigning an owner increases chance of follow-up within 7 days (hypothesis — not measured until analytics).” |
| **Risk if ignored** | “Invite may expire; centre may register without onboarding support.” |

**Template library:** store templates keyed by `signalKey` (en/ar). **Do not** reuse only `ActionKind`-keyed copy for SANAD unless kinds are extended — otherwise SANAD-specific templates live in `sanadActionExplanations.ts` (new file) mirroring `actionExplanations.ts` pattern.

---

## 8. Control Tower alignment map

**Scope note:** This section describes **target alignment** and **P4+** integration work. **P1–P3 (Option C)** does **not** modify `client/src/features/controlTower/*`, `actionQueueTypes.ts`, `priorityEngine.ts`, or `domainNarrativeTypes.ts`.

### 8.1 `ActionQueueItem` mapping

| SANAD field | Control Tower field |
|-------------|---------------------|
| Stable id | `id` |
| Mapped / new kind | `kind` |
| Title / subtitle | `title` / optional use `reason` for subtitle |
| Severity | `severity` |
| Usually false until compliance | `blocking` |
| New value `sanad` or `operations` | `source` — **recommend new `sanad` in `ActionSource`** for filtering |
| Directory URL | `href` |
| CTA | `ctaLabel` |
| Owner display | `ownerLabel`, `ownerUserId` |
| Due | `dueAt` |

### 8.2 `priorityEngine.ts`

Add branches for each new `sanad_*` `ActionKind` **or** map SANAD kinds to severity/blocking so existing fall-through assigns `important` vs `watch`.

### 8.3 Domain narrative

- **Short term:** aggregate SANAD counts under **`operations`** or **`general`** in `DomainNarrativeSummary`-style widgets.
- **Long term:** extend `ControlTowerDomain` with `"sanad"` and add narrative copy in `domainNarrativeTypes` consumers — **requires** audit of all `switch (domain)` sites.

### 8.4 Commitments / next actions

If product uses “commitment” objects elsewhere, define whether a SANAD queue item **creates** a commitment on dismiss/snooze — **open decision** (likely v2).

### 8.5 Notifications / bell

`countUrgentItemsForBell` uses `getPriorityLevelForItem` + `severity === "high"`. SANAD items must use **consistent** `severity` to avoid noise.

---

## 9. Data model additions (attribution groundwork — no fake ROI)

**Principle:** Store **facts** and **milestones**; compute money later when definitions exist.

### 9.1 `sanad_centre_conversion_milestone` (illustrative name)

| Column | Purpose |
|--------|---------|
| `id` | PK |
| `center_id` | Intel centre |
| `milestone` | Enum: `first_contact`, `invite_sent`, `account_registered`, `office_linked`, `public_listed`, `catalogue_live`, … |
| `occurred_at` | Timestamp |
| `actor_user_id` | Nullable |
| `source` | `user` \| `import` \| `system` |
| `metadata` | JSON — invite token hash id, office id, etc. |

### 9.2 `sanad_centre_company_attribution` (optional, v2)

| Column | Purpose |
|--------|---------|
| `center_id` | Intel centre |
| `company_id` | Linked SmartPRO company |
| `confidence` | `high` \| `medium` \| `low` |
| `method` | `manual_link` \| `name_match` \| `invite_email_domain` |
| `linked_at` | |

### 9.3 Owner attribution

Already largely present via `sanad_centres_pipeline.owner_user_id`, `assigned_at`, `assigned_by_user_id`. Spec adds: **emit queue metrics “actions completed per owner per week”** from activity log (`centreActivityLog` patterns) — **reporting only**, not PnL.

### 9.4 Revenue attribution (future)

- **Convention doc only in v1:** e.g. “Revenue attributed to SANAD centre only when `company_id` linked AND invoice metadata carries `attribution:sanad_center_id`.”
- **No** mandatory schema change to `financeHR.getPnlSummary` in v1 — optional **materialized view** or **analytical table** later.

### 9.5 Confidence levels

All inferred links carry **confidence** for UI disclosure (“Suggested match — low confidence”).

---

## 10. Phase-by-phase rollout

| Phase | Deliverable | Risk |
|-------|-------------|------|
| **P0** | Spec agreed (this doc) | — |
| **P1** | Server: `generateSanadQueueItems(user, now)` pure function + tests from fixture rows | Low |
| **P2** | tRPC: `sanad.intelligence.dailyActionQueue` (read procedure) | Low |
| **P3** | UI: “Today’s SANAD actions” panel on directory or overview tab (see **P3 acceptance** below) | Medium |
| **P4** | Optional **Control Tower merge**: extend `ActionKind` / `ActionSource` and/or adapter + `/control-tower` — **only after** Option C queue is validated in production use | Medium–high regression |
| **P5** | Milestone table + activity-driven inserts | Medium |
| **P6** | Company attribution + finance views | High (definitions) |

Directory **code cleanup** (split `DirectorySurface`, i18n, dynamic counts) can run **in parallel** with P1–P2 — not blocking for signal math.

### 10.1 MVP policy restatement (P1–P3)

> For MVP, the project adopts **Option C**. **`ActionKind`**, **`ActionSource`**, and **`ControlTowerDomain`** remain unchanged through P3.

### 10.2 P3 acceptance criteria (including i18n)

| # | Criterion |
|---|-----------|
| A | **English** user-facing strings are complete for the SANAD queue card (titles, CTAs, empty states, errors). |
| B | **i18n structure** is in the **same PR** as P3 UI: translation keys (e.g. `admin.sanadDailyQueue.*`) exist for **both** `en-OM` and `ar-OM` namespaces; **Arabic values may be scaffold** (`defaultValue` / English placeholder) where final product or legal review for outreach-adjacent copy is pending. |
| C | **Final Arabic product copy** may follow in a subsequent PR, but **no English-only hardcoded surface** is merged without the key scaffold — prevents embedding another untranslated admin island. |
| D | Deep links to directory (and optional `highlight=` / drawer contract) behave consistently from queue rows. |

**Arabic / legal:** WhatsApp-adjacent and outreach strings elsewhere in SANAD remain subject to product + legal review; the queue card should reuse established patterns and avoid duplicating sensitive templates until reviewed.

---

## 11. Risks and open decisions

| Risk | Mitigation |
|------|------------|
| Bell / CT spam | Strict caps, cooldowns, conservative default severities |
| Role confusion | Different queue filters for compliance reviewer vs full operator |
| False “critical” | Start with max severity `important` for all SANAD until policy reviewed |
| Duplicate logic | Centralize stale/due rules shared with client (`shared/sanadQueueSignals.ts` proposal) |
| `ActionKind` exhaustiveness | TypeScript will force updates everywhere — budget QA time |

**Open decisions**

1. ~~Option A vs B vs C~~ — **Resolved for MVP:** **Option C** (Section 3, Section 10.1). **P4+:** choose A vs B when merging to Control Tower.
2. Whether SANAD queue is **platform-only** (always) or also **visible to `sanad_network_admin` on company Control Tower** when context exists.
3. Deep-link contract for drawer open from URL (minimum: query param + scroll; drawer open optional).
4. **Arabic final copy** for queue-specific strings: operationalized under **Section 10.2 P3 acceptance** (scaffold + follow-up); product + legal for WhatsApp-adjacent **content** outside this card still applies per existing SANAD surfaces.

---

## 12. Cursor-ready implementation brief — **P1–P3 only (Option C)**

**Hard constraints**

- **Option C only:** parallel SANAD queue surface; **no** Control Tower merge in this phase.
- **No** changes to `ActionKind`, `ActionSource`, `ControlTowerDomain`, `priorityEngine.ts`, `actionExplanations.ts` (Control Tower), or bell aggregation.
- **Order of work:** (1) shared **pure** signal module + unit tests → (2) **server** queue generation + deterministic fixtures → (3) **read-only** tRPC → (4) small **SANAD UI** card.
- **Tests are mandatory:** overlap, dedupe, cap, **RBAC / read-only** behaviour (e.g. compliance reviewer vs full operator expectations per Section 4 notes).
- **No** production claims, **no** ROI metrics, **no** `financeHR` or PnL coupling in this phase.

**Implementation steps**

1. **`shared/sanadQueueSignals.ts` (or agreed name):** signal key constants, `detectSignalsForCenter(row)`, dedupe + primary signal, scoring helpers — **pure**, **unit-tested** (no DB).
2. **`server/sanad-intelligence/generateSanadActionQueue.ts`:** consumes rows from existing list/detail shape (or calls `listCenters` internally), outputs `SanadActionQueueItem[]`, sort, cap; **deterministic** given fixture input + fixed `now`.
3. **`sanad.intelligence.dailyActionQueue`** in `server/routers/sanadIntelligence.ts`: **`sanadIntelReadProcedure`** only (read-only); input e.g. `{ limit?: number, ownerScope?: 'me' | 'unassigned' | 'all' }`; enforce same access as directory list; **no** new write paths.
4. **UI:** Card on `AdminSanadIntelligencePage` (overview and/or directory): top N items, `href` to directory; reuse existing layout/components; meet **Section 10.2 P3 acceptance** (en + ar key scaffold).
5. **Tests:** `server/sanad-intelligence/sanadQueueGeneration.test.ts` (or colocated) — overlap, dedupe, cap, role/read-only filters; shared module tests under `shared/*.test.ts`.
6. **Docs:** Deep-link contract noted in `docs/sanad/` (short ADR or README fragment).

**Acceptance bar (merge gate for P1–P3)**

1. A **pure shared signal module** exists and is **unit-tested**.
2. A **server generator** produces **deterministic** queue items from **fixture** rows (+ fixed clock).
3. **`sanad.intelligence.dailyActionQueue`** is **read-only** and **RBAC-safe** (aligned with `canAccessSanadIntelRead` / reviewer vs operator semantics).
4. **UI** renders top items with **deep links**, **without** modifying Control Tower schemas or types.
5. **No** production verification claims in PR text; **no** ROI metrics; **no** finance coupling.

---

## Document control

| Status | Owner | Next review |
|--------|-------|-------------|
| MVP policy locked (v1.1) | Product + Engineering | After P1–P3 ship; before P4 CT merge |

**Non-goals (reaffirmed):** Not a production incident report; not ROI proof; not national orchestration; not HR/Omanization integration in this spec; not finance linkage implementation.
