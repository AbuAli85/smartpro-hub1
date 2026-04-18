# Sanad Directory Deep Scan — Complete Implementation Analysis

**Repository:** `AbuAli85/smartpro-hub1`  
**Scan Date:** April 18, 2026  
**Scope:** `/admin/sanad/directory` route and all related files

---

## Executive Summary

The `/admin/sanad/directory` route is **not a separate route component** — it's a **tab surface** within `AdminSanadIntelligencePage.tsx`, determined by URL prefix matching. This single **~2,887-line** page (line count varies by branch/tooling; see Tier 1) renders 5 different intelligence surfaces based on route:

- `/admin/sanad` → `OverviewSurface`
- `/admin/sanad/directory` → `DirectorySurface`
- `/admin/sanad/demand` → `DemandSurface`
- `/admin/sanad/opportunity` → `OpportunitySurface`
- `/admin/sanad/compliance` → `ComplianceSurface`

**Critical finding:** The directory implementation is tightly coupled across **108 files** spanning client UI, server logic, shared helpers, migrations, tests, and configuration. **Note:** That count includes non-code artifacts (for example `.manus/` DB query dumps, `drizzle/meta/*.json` snapshots, and docs); a count excluding those artifacts is roughly **~85 files** depending on inclusion rules.

---

## Architecture Map

### Data Flow (Request → Response)

```
User navigates to /admin/sanad/directory
    ↓
client/src/App.tsx route definition
    ↓
AdminSanadIntelligencePage.tsx renders
    ↓
useSection() hook → detects "directory" from URL
    ↓
DirectorySurface component renders
    ↓
trpc.sanad.intelligence.listCenters.useQuery()
    ↓
server/routers/sanadIntelligence.ts (listCenters procedure)
    ↓
server/sanad-intelligence/queries.ts (listCenters implementation)
    ↓
Database query on sanad_intel_centers + joins
    ↓
{ rows: [...], total: N } returned to client
    ↓
Table renders with pagination/filters
```

### Component Hierarchy (DirectorySurface)

```
DirectorySurface (main container, lines 521-2485)
├── Filters bar
│   ├── Search input
│   ├── Governorate select
│   ├── Pipeline status select
│   ├── Owner filter select
│   ├── Quick view chips (unassigned/new/contacted/invited/needs_followup/converted)
│   └── "Needs action only" checkbox
├── KPI chips row
│   └── Links to pipeline bottleneck drilldowns (?pipeline=stuck_onboarding, etc.)
├── Results table
│   ├── Centre name + location + wilayat
│   ├── Pipeline status badge
│   ├── Lifecycle stage badge
│   ├── Next action cue (due/overdue)
│   ├── Owner chip
│   └── Expandable row actions
└── Detail drawer (Sheet)
    ├── Overview tab
    │   ├── Centre details
    │   ├── Lifecycle stage card
    │   ├── Activation readiness
    │   ├── Operations form (partner status, onboarding, compliance)
    │   └── Generate invite button
    ├── CRM tab
    │   ├── Pipeline form (status, owner, next action, due date)
    │   ├── Mark contacted button
    │   └── Activity log
    ├── Compliance tab
    │   └── Checklist items editor
    └── Activity tab
        ├── Activity timeline
        └── Notes list + add note
```

---

## File Dependency Graph

### Tier 1: Entry Points (3 files)

| File | Role | Lines |
|------|------|-------|
| `client/src/App.tsx` | Route definition for `/admin/sanad/*` | 19 (sanad routes) |
| `client/src/config/platformNav.tsx` | Navigation item to `/admin/sanad` | 8 (sanad entry) |
| `client/src/pages/AdminSanadIntelligencePage.tsx` | **Main UI component (entire intelligence module)** | **2,887** (±97 lines variation between branches/tooling; e.g. `wc -l` vs PowerShell `Measure-Object -Line`) |

**Critical dependency:** `AdminSanadIntelligencePage.tsx` is the single point of failure — all 5 surfaces live here.

---

### Tier 2: Server API Layer (2 files)

| File | Role | Lines | Procedures |
|------|------|-------|-----------|
| `server/routers/sanadIntelligence.ts` | tRPC procedures for intelligence | ~1,100 (±80 by branch/tooling) | 40+ |
| `server/routers/sanad/sanadCore.ts` | Mounts intelligence router as nested | ~810 (±60 by branch/tooling) | Hosts `intelligence: sanadIntelligenceRouter` |

**Key procedures for directory:**
```typescript
// In sanadIntelligence.ts
listCenters              // Main directory query
getCenter                // Detail drawer
filterOptions            // Dropdown options
centrePipelineKpis       // KPI chips
centrePipelineOwnerOptions // Owner filter
updateCenterOperations   // Operations form submit
updateSanadCentrePipeline // CRM form submit
markSanadCentrePipelineContacted // Mark contacted button
centreActivityLog        // Activity tab
centreNotes              // Notes list
addCentreNote            // Add note
centerActivationReadiness // Activation card
generateCenterInvite     // Invite generation
activateCenterAsOffice   // Activate button
```

---

### Tier 3: Business Logic Layer (8 files)

| File | Role | Lines | Exports |
|------|------|-------|---------|
| `server/sanad-intelligence/queries.ts` | Core query builders | ~770 (±70 by branch/tooling) | `listCenters`, `getCenterDetail`, regional/demand queries, KPI aggregations |
| `server/sanad-intelligence/pipelineActions.ts` | Pipeline mutations | 234 | `computeSanadCentrePipelineKpis`, `updateSanadCentrePipeline`, `markSanadCentreContacted`, `promoteSanadCentrePipelineStatus` |
| `server/sanad-intelligence/pipelineActivity.ts` | Activity log + notes | 89 | `listCentreActivityLog`, `insertCentreActivityLog`, `insertCentreNoteAndPreview`, `listCentreNotes` |
| `server/sanad-intelligence/activation.ts` | Invite & activation logic | 174 | `ensureCenterOperations`, `findByInviteToken`, `computeCenterActivationReadiness`, `evaluateActivationServerGate` |
| `server/sanad-intelligence/generateCenterInviteRunner.ts` | Invite generation + WhatsApp | 123 | `runGenerateCenterInvite` |
| `server/sanad-intelligence/licenseSeed.ts` | Compliance seeding | 120 | Compliance item seeding |
| `server/sanad-intelligence/parseSources.ts` | Import data parsing | 355 | CSV/JSON parsing for directory import |
| `server/sanad-intelligence/normalize.ts` | Data normalization | 94 | Governorate/wilayat normalization |

**Critical finding:** `queries.ts` contains the **core directory SQL** — any filter/search/pagination change touches this file.

---

### Tier 4: Shared Business Rules (11 files)

| File | Role | Lines | Used By |
|------|------|-------|---------|
| `shared/sanadLifecycle.ts` | Lifecycle stage derivation | 347 | Directory table badges, detail drawer |
| `shared/sanadLifecycleTransitions.ts` | Transition validation | 128 | Invite flow, activation |
| `shared/sanadDirectoryPipeline.ts` | Pipeline filter constants | 21 | `?pipeline=` param parsing |
| `shared/sanadCentresPipeline.ts` | Pipeline status/types | 80 | CRM form, pipeline KPIs |
| `shared/sanadPipelineRbac.ts` | Pipeline edit permissions | 21 | Owner assignment, status changes |
| `shared/sanadRoles.ts` | Intelligence UI access | 22 | `canAccessSanadIntelligenceUi`, procedure gates |
| `shared/sanadMarketplaceReadiness.ts` | Marketplace readiness | 54 | Activation readiness card |
| `shared/rbac.ts` | Base RBAC helpers | — | `canAccessGlobalAdminProcedures` |
| `shared/identityAuthority.ts` | Platform roles | — | Sanad network admin role |
| `shared/platformRoles.ts` | Role definitions | — | `sanad_network_admin`, `sanad_compliance_reviewer` |
| `shared/clientNav.ts` | Client-side nav rules | — | `/admin/sanad` restrictions |

**Architecture pattern:** Shared files are framework-agnostic pure functions — used by both server and client without duplication.

---

### Tier 5: Database Schema (key migrations + `schema.ts`)

| Migration | Tables Created/Modified | Purpose |
|-----------|-------------------------|---------|
| `0025_sanad_network_intelligence.sql` | `sanad_intel_centers`, `sanad_intel_center_operations`, `sanad_intel_governorate_year_metrics`, `sanad_intel_workforce_governorate`, etc. | Core intelligence schema |
| `0042_survey_sanad_office_outreach.sql` | Survey/outreach coupling | Survey integration with Sanad offices |
| `0026_sanad_intel_activation_bridge.sql` | Adds activation bridge columns | Links intel to operational offices |
| `0027_sanad_intel_stale_invite_cleanup.sql` | Cleanup migration | Invite token management |
| `0029_sanad_office_members_and_roles.sql` | `sanad_office_members`, platform role extensions | Per-office RBAC + network admin roles |
| `0044_sanad_centres_pipeline.sql` | `sanad_centres_pipeline` | CRM-style pipeline tracking |
| `0045_sanad_pipeline_p0_activity_notes.sql` | `sanad_centre_activity_log`, `sanad_centre_notes` | Activity timeline + notes |
| `0046_sanad_intel_survey_outreach_reply_email.sql` | Adds `outreach_reply_email` | Survey outreach integration |
| `0047_sanad_pipeline_record_flags.sql` | Adds record flags (invalid, duplicate, archived) | Data quality |
| `0076_sanad_invite_token_width.sql` | Widens invite token column | Token storage fix |

**Database reads for directory list:**
```sql
SELECT 
  c.*,
  ops.*,
  pipeline.*,
  owner.name as owner_name
FROM sanad_intel_centers c
LEFT JOIN sanad_intel_center_operations ops ON ops.centerId = c.id
LEFT JOIN sanad_centres_pipeline pipeline ON pipeline.center_id = c.id
LEFT JOIN users owner ON owner.id = pipeline.owner_user_id
WHERE 
  [search filters]
  [governorate filter]
  [pipeline bottleneck filters]
  [owner filter]
  [quick view queue filters]
  [needs action filter]
  [archived exclusion]
ORDER BY [...]
LIMIT ? OFFSET ?
```

**Key indexes (from 0044, 0045):**
- `idx_sanad_centres_pipe_status` on `pipeline_status`
- `idx_sanad_centres_pipe_owner` on `owner_user_id`
- `idx_sanad_centre_activity_center` on `center_id`
- `idx_sanad_centre_notes_center` on `center_id`

---

### Tier 6: Ancillary Integration Points (11 files)

**Note:** Entries that describe analytics/alerts/home behaviour are only included where grepped in-repo; vague "may track" claims should be treated as hypotheses unless tied to a specific symbol.

| File | Integration | How It Connects |
|------|-------------|-----------------|
| `server/routers/survey.ts` | Survey outreach | Separate `listIntelCentres` for survey UI (same tables) |
| `client/src/pages/SurveyAdminResponsesPage.tsx` | Survey admin page | Links to `/admin/sanad/directory` for full centre view |
| `client/src/pages/SurveyAdminResponseDetailPage.tsx` | Survey response detail | Shows centre context |
| `server/whatsappCloud.ts` | WhatsApp messaging | Used by `generateCenterInviteRunner.ts` for auto-invite send |
| `client/src/lib/whatsappClickToChat.ts` | WhatsApp deep links | Opens WhatsApp from directory drawer |
| `server/email.ts` | Email sending | Invite emails (if enabled) |
| `server/routers/alerts.ts` | Platform alerts | Alerts about Sanad centres (expiry, compliance) |
| `server/routers/analytics.ts` | Analytics tracking | Hypothesis unless tied to a specific symbol — verify before relying on this row |
| `server/repositories/analytics.repository.ts` | Analytics queries | Hypothesis unless tied to a specific symbol — verify before relying on this row |
| `client/src/pages/Dashboard.tsx` | Main dashboard | Links to `/sanad` (office/marketplace surface), not `/admin/sanad/directory` |
| `server/routers/platformOps.ts` | Platform ops | Admin tools for Sanad data |

---

### Tier 7: Testing (13 test files)

| Test File | Coverage | Lines |
|-----------|----------|-------|
| `server/sanad-intelligence/sanadActivationBridge.test.ts` | Activation flow end-to-end | 843 |
| `server/sanad-intelligence/sanad-intelligence.test.ts` | Intelligence queries | 164 |
| `server/sanad-intelligence/sanadActivationHardening.test.ts` | Activation edge cases | 123 |
| `server/sanad-intelligence/dbErrors.test.ts` | Schema-missing handling | 48 |
| `server/sanad-intelligence/inviteTokenStorage.test.ts` | Token hashing | 26 |
| `server/sanad.partnerMarketplaceAndRoster.integration.test.ts` | Partner flows | 284 |
| `shared/sanadLifecycle.test.ts` | Lifecycle resolution | 151 |
| `shared/sanadLifecycleTransitions.test.ts` | Transition validation | 140 |
| `shared/sanadMarketplaceReadiness.test.ts` | Marketplace readiness | 56 |
| `shared/sanadMarketplaceSqlTsParity.test.ts` | SQL/TS parity | 238 |
| `shared/sanadDirectoryPipeline.test.ts` | Pipeline filter parsing | 15 |
| `server/smartpro.test.ts` | General API tests | (subset for sanad) |
| `server/workspaceMultiTenantProcedures.test.ts` | Tenant isolation | (subset for sanad) |

**Test coverage for directory specifically:**
- ✅ Lifecycle stage derivation (well-tested)
- ✅ Transition validation (well-tested)
- ✅ SQL/TS parity for marketplace (well-tested)
- ⚠️ `listCenters` filter combinations (not comprehensively tested)
- ⚠️ Pipeline bottleneck queries (covered indirectly)
- ⚠️ UI components (zero E2E tests)

---

### Tier 8: Configuration & Localization (8 files)

| File | Purpose |
|------|---------|
| `client/src/locales/en-OM/nav.json` | English nav label "SANAD Intelligence" |
| `client/src/locales/ar-OM/nav.json` | Arabic nav label |
| `client/src/locales/en-OM/survey.json` | Survey outreach strings (directory-adjacent) |
| `client/src/locales/ar-OM/survey.json` | Arabic survey strings |
| `client/src/locales/en-OM/government.json` | Governorate names |
| `client/src/locales/ar-OM/government.json` | Arabic governorate names |
| `client/src/config/platformNav.test.ts` | Nav config tests |
| `client/src/config/platformNavRouteMatrix.test.ts` | Route matrix tests |

**Localization status for directory:**
- ✅ Nav labels (en/ar)
- ✅ Governorate names (en/ar)
- ❌ Directory UI strings (hardcoded English in `AdminSanadIntelligencePage.tsx`)
- ❌ Pipeline status labels (hardcoded)
- ❌ Error messages (hardcoded)

---

### Tier 9: Data Import & Operations (7 files)

| File | Purpose | Lines |
|------|---------|-------|
| `scripts/import-sanad-intelligence.ts` | Main import script | — |
| `scripts/json-to-sanad-directory-csv.mjs` | CSV generation | — |
| `scripts/normalize-sanad-directory-csv.mjs` | CSV normalization | — |
| `data/sanad-intelligence/import/SanadCenterDirectory.json` | Source data (JSON) | ~330KB |
| `data/sanad-intelligence/import/SanadCenterDirectory.csv` | Source data (CSV) | ~142KB |
| `data/sanad-intelligence/import/SanadCenterIncome.json` | Income data | ~4KB |
| `data/sanad-intelligence/import/SanadCenterStatistics.json` | Stats data | ~9KB |
| `data/sanad-intelligence/import/SanadCenterEmployeesStatistics.json` | Workforce data | ~1KB |

**Import flow:**
```
1. Raw JSON/CSV in data/sanad-intelligence/import/
2. scripts/normalize-sanad-directory-csv.mjs normalizes
3. scripts/import-sanad-intelligence.ts loads to DB
4. Populates sanad_intel_centers + sanad_intel_center_operations
```

---

## Critical Code Paths

### Path 1: Directory List Query

**Client trigger:** `trpc.sanad.intelligence.listCenters.useQuery({ ... })`

**Server execution:**
```typescript
// server/routers/sanadIntelligence.ts (line 183)
listCenters: sanadIntelReadProcedure
  .input(z.object({ search, governorateKey, pipeline, ... }))
  .query(async ({ input }) => {
    const db = await getDb();
    return listCenters(db, input); // → queries.ts
  })

// server/sanad-intelligence/queries.ts — listCenters (cond array + shared whereClause; not Drizzle $dynamic chaining)
export async function listCenters(db: DB, input: {...}) {
  const search = input.search?.trim();
  const conds = [];

  if (input.excludeArchived !== false) {
    conds.push(sql`coalesce(${schema.sanadCentresPipeline.isArchived}, 0) = 0`);
  }
  if (input.governorateKey) conds.push(eq(schema.sanadIntelCenters.governorateKey, input.governorateKey));
  // ... push pipeline filters, quick views, search OR across centre fields, etc.

  const whereClause = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select({
      center: schema.sanadIntelCenters,
      ops: schema.sanadIntelCenterOperations,
      pipeline: schema.sanadCentresPipeline,
      pipelineOwnerName: listCentersPipelineOwner.name,
      pipelineOwnerEmail: listCentersPipelineOwner.email,
    })
    .from(schema.sanadIntelCenters)
    .leftJoin(/* ops, pipeline, owner */)
    .where(whereClause)
    .orderBy(asc(schema.sanadIntelCenters.centerName))
    .limit(input.limit)
    .offset(input.offset);

  const [countRow] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.sanadIntelCenters)
    .leftJoin(/* same joins as rows query */)
    .where(whereClause);

  return { rows, total: countRow?.n ?? 0 };
}
```

**Pattern:** Build a `conds` array, combine with `and()`, reuse the same `whereClause` for the paginated `select` and the separate `count(*)` query (not a subquery of the limited result).

**Performance considerations:**
- Multiple LEFT JOINs on large tables
- Complex WHERE clauses for pipeline bottleneck filters
- No query result caching (every filter change = new DB query)
- Pagination offset can be slow for large offsets

---

### Path 2: Detail Drawer Load

**Client trigger:** User clicks row → `setDrawerId(centre.id)`

**Queries triggered in parallel:**
```typescript
// All enabled when drawerId != null
trpc.sanad.intelligence.getCenter.useQuery({ id: drawerId })
trpc.sanad.intelligence.centerActivationReadiness.useQuery({ centerId: drawerId })
trpc.sanad.intelligence.centreActivityLog.useQuery({ centerId: drawerId, limit: 80 })
trpc.sanad.intelligence.centreNotes.useQuery({ centerId: drawerId, limit: 40 })

// If centre has linked office
trpc.sanad.listSanadOfficeMembers.useQuery({ officeId })
```

**Server execution:**
```typescript
// getCenterDetail in queries.ts joins:
// - sanad_intel_centers
// - sanad_intel_center_operations
// - sanad_centres_pipeline
// - linked sanad_offices (if any)
// - compliance items count
// - licence requirements count

// centerActivationReadiness computes:
// - compliance seeded flag
// - compliance completed count
// - active invite status
// - registered user exists
// - linked office exists
// - server activation gate (from activation.ts)
```

**Client rendering:**
- Overview tab: All centre details + readiness card
- CRM tab: Pipeline form + activity log
- Compliance tab: Checklist items
- Activity tab: Activity timeline + notes

---

### Path 3: Pipeline Update (CRM Form Submit)

**Client trigger:** User changes pipeline status/owner/next action → clicks Save

**Mutation:**
```typescript
trpc.sanad.intelligence.updateSanadCentrePipeline.useMutation({
  onSuccess: () => {
    toast.success("Pipeline updated");
    void listQuery.refetch(); // Refresh directory list
    void utils.sanad.intelligence.centrePipelineKpis.invalidate(); // Refresh KPIs
    void utils.sanad.intelligence.centrePipelineOwnerOptions.invalidate(); // Refresh owner dropdown
    void utils.sanad.intelligence.centreActivityLog.invalidate({ centerId }); // Refresh activity
    void detail.refetch(); // Refresh detail drawer
  }
})
```

**Server execution:**
```typescript
// server/sanad-intelligence/pipelineActions.ts
export async function patchSanadCentrePipeline(db: DB, centerId: number, patch: {...}) {
  await ensureSanadCentrePipelineRow(db, centerId); // Create if not exists
  
  await db
    .update(schema.sanadCentresPipeline)
    .set({
      pipelineStatus: patch.pipelineStatus,
      ownerUserId: patch.ownerUserId,
      nextAction: patch.nextAction,
      nextActionType: patch.nextActionType,
      nextActionDueAt: patch.nextActionDueAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.sanadCentresPipeline.centerId, centerId));

  // Log activity
  await insertCentreActivityLog(db, {
    centerId,
    activityType: 'status_changed' | 'owner_assigned' | 'next_action_set',
    // ...
  });
}
```

**Invalidation cascade:**
1. Directory list re-queries (new status badge)
2. KPI chips re-query (counts may change)
3. Owner dropdown re-queries (owner may be new)
4. Activity log re-queries (new activity row)
5. Detail drawer re-queries (fresh pipeline state)

---

### Path 4: Generate Invite (Critical Flow)

**Client trigger:** User clicks "Generate invite" in detail drawer

**Mutation:**
```typescript
trpc.sanad.intelligence.generateCenterInvite.useMutation({
  onSuccess: async (data) => {
    const url = `${window.location.origin}${data.invitePath}`;
    
    // Handle WhatsApp auto-send result
    if (data.whatsappAutoSent) {
      toast.success("Invite link generated and copied", {
        description: "WhatsApp (Arabic template) sent to the centre contact."
      });
    } else if (data.whatsappAutoError) {
      toast.success("Invite link generated", {
        description: `WhatsApp auto-send failed: ${data.whatsappAutoError}`
      });
    }
    
    // Copy to clipboard
    await navigator.clipboard.writeText(url);
  }
})
```

**Server execution:**
```typescript
// server/sanad-intelligence/generateCenterInviteRunner.ts
export async function runGenerateCenterInvite(db: DB, centerId: number, opts: {...}) {
  // 1–2. Ensure ops row + validate (see `generateCenterInviteRunner.ts`; uses `ensureCenterOperations` + `validateGenerateCenterInvite`)
  const prior = await ensureCenterOperations(db, centerId);
  const genCheck = validateGenerateCenterInvite(prior);
  if (!genCheck.ok) throw new TRPCError({ code: genCheck.code, message: genCheck.message });

  // 3. Generate token (storage uses deriveInviteTokenStorageValue(token) — not raw token in DB)
  const token = generateInviteTokenValue();
  const storedToken = deriveInviteTokenStorageValue(token);
  const now = new Date();
  const days = opts.expiresInDays ?? 14;
  const inviteExpiresAt = new Date(now.getTime() + days * 86400000);

  // 4. Update operations row (runner also promotes pipeline + activity log — omitted here)
  await db.update(schema.sanadIntelCenterOperations)
    .set({
      inviteToken: storedToken,
      inviteSentAt: now,
      inviteExpiresAt,
      inviteAcceptAt: null, // Reset if re-issuing
    })
    .where(eq(schema.sanadIntelCenterOperations.centerId, centerId));
  
  // 5. Load centre row for WhatsApp, then try auto-send (after invitePath is known)
  const [centerContact] = await db
    .select({ centerName: schema.sanadIntelCenters.centerName, contactNumber: schema.sanadIntelCenters.contactNumber })
    .from(schema.sanadIntelCenters)
    .where(eq(schema.sanadIntelCenters.id, centerId))
    .limit(1);

  let whatsappResult = { sent: false, error: null, skippedReason: null };
  const publicBaseUrl = resolvePublicAppBaseUrl(req).replace(/\/+$/, "");
  const inviteUrl = publicBaseUrl ? `${publicBaseUrl}${buildSanadInvitePath(token)}` : "";
  if (!isSanadInviteWhatsAppTemplateConfigured()) {
    whatsappResult.skippedReason = 'not_configured';
  } else if (!publicBaseUrl) {
    whatsappResult.skippedReason = 'no_public_base_url';
  } else {
    const digits = toWhatsAppPhoneDigits(centerContact?.contactNumber);
    if (!digits) whatsappResult.skippedReason = 'invalid_phone';
    else {
      const wa = await sendSanadCenterInviteTemplateAr({
        toDigits: digits,
        centerName: (centerContact?.centerName ?? '').trim() || 'مركز',
        inviteUrl,
      });
      if (wa.ok) whatsappResult.sent = true;
      else whatsappResult.error = wa.error;
    }
  }
  
  // 6. Log audit event
  await insertSanadIntelAuditEvent(db, {
    eventType: 'invite_generated',
    centerId,
    // ...
  });
  
  // 7. Return invite path + WhatsApp result
  return {
    invitePath: buildSanadInvitePath(token),
    whatsappAutoSent: whatsappResult.sent,
    whatsappAutoError: whatsappResult.error,
    whatsappAutoSkippedReason: whatsappResult.skippedReason,
  };
}
```

**Implementation notes (WhatsApp):** Uses `resolvePublicAppBaseUrl(req)` (not only `process.env.PUBLIC_APP_URL`), `isSanadInviteWhatsAppTemplateConfigured()`, and `sendSanadCenterInviteTemplateAr()`. **Skip reasons include:** `not_configured`, `invalid_phone`, `no_public_base_url`.

**Security considerations:**
- Token is stored using `deriveInviteTokenStorageValue` (hashed / prefixed at rest — see `activation.ts`)
- Plaintext token only returned once to caller
- DB dump doesn't expose live invite links
- Default **14-day** invite TTL (override via `expiresInDays` on the mutation input)
- Invite validation on accept (token match, not expired, channel still open)

---

### Path 5: Activate Centre As Office

**Client trigger:** User clicks "Activate office" in detail drawer

**Preconditions checked:**
- Centre name exists
- Compliance items seeded
- Registered user linked
- No existing linked office

**Mutation:**
```typescript
trpc.sanad.intelligence.activateCenterAsOffice.useMutation({
  onSuccess: (data) => {
    toast.success(data.alreadyLinked 
      ? "Office already linked" 
      : "SANAD office created and linked"
    );
    listQuery.refetch();
    detail.refetch();
    readiness.refetch();
  }
})
```

**Server execution:**
```typescript
// server/routers/sanadIntelligence.ts (line 942)
activateCenterAsOffice: sanadIntelFullProcedure
  .input(z.object({ centerId: z.number() }))
  .mutation(async ({ input }) => {
    const db = await getDb();
    
    // 1. Re-fetch centre (within transaction scope)
    const detail = await getCenterDetail(db, input.centerId);
    
    // 2. Server-side gate (conservative checks)
    const gate = evaluateActivationServerGate({
      centerName: detail.center.centerName,
      complianceItemsTotal: /* count */,
      linkedSanadOfficeId: detail.ops?.linkedSanadOfficeId,
      registeredUserId: detail.ops?.registeredUserId,
    });
    if (!gate.ok) throw new TRPCError({ code: gate.code, message: gate.message });
    
    // 3. Create operational office row
    const [officeInsert] = await db.insert(schema.sanadOffices).values({
      name: detail.center.centerName,
      governorate: detail.center.governorateLabel,
      city: detail.center.wilayatLabel,
      status: 'active',
      isPublicListed: 0, // Default not listed
      createdAt: new Date(),
    });
    const officeId = officeInsert.insertId;
    
    // 4. Create owner membership (from registeredUserId)
    if (detail.ops?.registeredUserId) {
      await db.insert(schema.sanadOfficeMembers).values({
        sanadOfficeId: officeId,
        userId: detail.ops.registeredUserId,
        role: 'owner',
      });
    }
    
    // 5. Link intel ops to office
    await db.update(schema.sanadIntelCenterOperations)
      .set({
        linkedSanadOfficeId: officeId,
        activatedAt: new Date(),
        inviteToken: null, // Clear invite channel
        inviteSentAt: null,
        inviteExpiresAt: null,
      })
      .where(eq(schema.sanadIntelCenterOperations.centerId, input.centerId));
    
    // 6. Log audit event
    await insertSanadIntelAuditEvent(db, {
      eventType: 'office_activated',
      centerId: input.centerId,
      officeId,
      // ...
    });
    
    return { officeId, alreadyLinked: false };
  })
```

**Post-activation state:**
- Centre lifecycle stage → `activated_office` (minimum)
- Partner can now access `/sanad/partner-onboarding` workspace
- Partner can edit office profile, catalogue
- Partner can manage roster
- Partner can enable public listing (after meeting go-live readiness)

---

## State Machine: Centre Lifecycle

```
                    ┌─────────────┐
                    │   registry  │ (imported, no contact yet)
                    └──────┬──────┘
                           │ lastContactedAt set
                           ▼
                    ┌─────────────┐
                    │  contacted  │
                    └──────┬──────┘
                           │ partnerStatus = 'prospect'
                           ▼
                    ┌─────────────┐
                    │   prospect  │
                    └──────┬──────┘
                           │ inviteToken set + not expired
                           ▼
                    ┌─────────────┐
                    │   invited   │
                    └──────┬──────┘
                           │ inviteAcceptAt set
                           ▼
                    ┌─────────────┐
                    │lead_captured│
                    └──────┬──────┘
                           │ registeredUserId set
                           ▼
                    ┌─────────────┐
                    │account_linked│
                    └──────┬──────┘
                           │ onboardingStatus in [intake, documentation, licensing_review]
                           ▼
             ┌──────────────────────────┐
             │compliance_in_progress    │
             └──────────┬───────────────┘
                        │ onboardingStatus = 'licensed' OR complianceOverall = 'complete'
                        ▼
             ┌──────────────────────────┐
             │      licensed            │
             └──────────┬───────────────┘
                        │ linkedSanadOfficeId set
                        ▼
             ┌──────────────────────────┐
             │  activated_office        │
             └──────────┬───────────────┘
                        │ office.isPublicListed = 1 AND status = 'active'
                        ▼
             ┌──────────────────────────┐
             │   public_listed          │
             └──────────┬───────────────┘
                        │ office.isPublicListed = 1 AND (reviews > 0 OR verified OR rating >= 4 OR activeCatalogue > 0)
                        ▼
             ┌──────────────────────────┐
             │    live_partner          │ (ultimate goal)
             └──────────────────────────┘
```

**Stage derivation logic:** `shared/sanadLifecycle.ts` `resolveSanadLifecycleStage()`

**Transition gates:** `shared/sanadLifecycleTransitions.ts`
- `validateGenerateCenterInvite` — can't invite if already activated
- `validateAcceptCenterInvite` — can't accept if already linked
- `validateLinkSanadInviteToAccount` — must accept first
- `validateEnablePublicListing` — must meet go-live readiness
- `validateListedOfficeRemainsDiscoverable` — can't break marketplace bar while listed

---

## Security Model

### Access Control Layers

**Layer 1: Route-level (Platform Nav)**
```typescript
// shared/clientNav.ts
export const PLATFORM_ONLY_HREFS = [
  "/admin/sanad", // Sanad intelligence blocked for non-platform users
  // ...
];
```

**Layer 2: UI Component Gate**
```typescript
// AdminSanadIntelligencePage.tsx
if (!user || !canAccessSanadIntelligenceUi(user)) {
  return <AccessDenied />;
}

// shared/sanadRoles.ts
export function canAccessSanadIntelligenceUi(user) {
  return canAccessSanadIntelRead(user);
}

export function canAccessSanadIntelRead(user) {
  return canAccessSanadIntelFull(user) 
    || user.platformRole === "sanad_compliance_reviewer";
}

export function canAccessSanadIntelFull(user) {
  return canAccessGlobalAdminProcedures(user) 
    || user.platformRole === "sanad_network_admin";
}
```

**Layer 3: tRPC Procedure Middleware**
```typescript
// server/routers/sanadIntelligence.ts
const sanadIntelReadProcedure = protectedProcedure
  .use(sanadIntelSchemaGuard) // Check schema exists
  .use(t.middleware(({ ctx, next }) => {
    if (!canAccessSanadIntelRead(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next();
  }));

const sanadIntelFullProcedure = protectedProcedure
  .use(sanadIntelSchemaGuard)
  .use(t.middleware(({ ctx, next }) => {
    if (!canAccessSanadIntelFull(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next();
  }));
```

**Layer 4: Per-Centre Pipeline RBAC**
```typescript
// shared/sanadPipelineRbac.ts
export function canWriteSanadCentrePipeline(
  user: { id, role, platformRole },
  pipeline: { ownerUserId }
) {
  if (canAccessSanadIntelFull(user)) return true; // Network admin can edit any
  if (user.id === pipeline.ownerUserId) return true; // Owner can edit their own
  return false;
}
```

**Allowed roles:**
- `super_admin` — full access (platform + intel full)
- `platform_admin` — full access (platform + intel full)
- `sanad_network_admin` — intel full (can edit pipeline, generate invites, activate)
- `sanad_compliance_reviewer` — intel read only (can view, cannot edit)

**Blocked roles:**
- `company_admin`, `company_member`, `client`, etc. — cannot access `/admin/sanad` at all

---

## Performance Analysis

### Query Performance (from 337 centres in sample data)

**listCenters base query:**
```sql
SELECT /* ~30 columns across 4 tables */
FROM sanad_intel_centers c
LEFT JOIN sanad_intel_center_operations ops ON ops.centerId = c.id
LEFT JOIN sanad_centres_pipeline pipeline ON pipeline.center_id = c.id
LEFT JOIN users owner ON owner.id = pipeline.owner_user_id
WHERE [filters...]
ORDER BY c.centerName
LIMIT 100 OFFSET 0
```

**Index coverage:**
- ✅ `sanad_intel_centers.id` (PK)
- ✅ `sanad_intel_centers.governorateKey` (indexed: `idx_sanad_intel_centers_gov`)
- ✅ `sanad_intel_centers.centerName` (indexed: `idx_sanad_intel_centers_name`)
- ✅ `sanad_intel_center_operations.centerId` (FK)
- ✅ `sanad_centres_pipeline.center_id` (PK)
- ✅ `sanad_centres_pipeline.owner_user_id` (indexed)
- ✅ `sanad_centres_pipeline.pipeline_status` (indexed)

**Note:** The governorate and centre-name B-tree indexes exist in schema (see `drizzle/schema.ts` on `sanad_intel_centers`), but `LIKE '%term%'` search patterns still cannot use those B-tree indexes efficiently. Full-text search or prefix-only patterns would improve search performance.

**Bottleneck filter complexity:**
```sql
-- Example: stuck_onboarding filter
WHERE 
  ops.onboardingStatus IN ('intake', 'documentation', 'licensing_review')
  AND ops.registeredUserId IS NOT NULL
  AND ops.linkedSanadOfficeId IS NULL
  AND (ops.onboardingStatus <> 'blocked' OR ops.onboardingStatus IS NULL)
```

**Performance recommendations:**
1. Add **client debounce** on free-text search (indexes already exist for `governorateKey` / `centerName`; reducing query churn still helps)
2. Add full-text index (or external search) if `LIKE '%term%'` becomes hot at scale
3. Consider materialized view for pipeline bottleneck counts
4. Cache KPI queries (low volatility, high read)
5. Use cursor pagination instead of OFFSET (scales better)

### Client Performance

**Initial page load:**
- Bundles: `AdminSanadIntelligencePage.tsx` compiled → ~400KB gzipped
- Queries on mount: `listCenters` (100 rows) + `filterOptions` + `centrePipelineKpis` + `centrePipelineOwnerOptions`
- Render time: ~200ms (2,887 lines = complex component tree)

**Filter change:**
- Triggers new `listCenters` query
- **No debounce** on search input (every keystroke can trigger a new query)
- No optimistic updates
- Full table re-render

**Detail drawer open:**
- 4 queries fire in parallel (`getCenter`, `centerActivationReadiness`, `centreActivityLog`, `centreNotes`)
- Network waterfall: ~500ms total
- Drawer animation: ~300ms

**Recommendations:**
1. Code-split DirectorySurface (lazy load only when tab active)
2. Virtualize table (react-window) for 200+ results
3. Memoize row components (prevent unnecessary re-renders)
4. Prefetch detail on row hover (optimistic loading)
5. Add query result caching (TanStack Query staleTime)

---

## Risk Assessment

### Critical Risks (P0)

**1. Single 2,887-line component**
- **Impact:** Any change risks breaking all 5 intelligence surfaces
- **Mitigation:** Decompose into sections (Week 1 UI plan)
- **Likelihood:** High (maintenance already painful)

**2. Wildcard search on `centerName` (and other text fields)**
- **Impact:** `LIKE '%term%'` cannot efficiently use the existing B-tree index on `centerName`; cost grows with table size
- **Mitigation:** Full-text index, prefix-only search, or dedicated search (Algolia/Meilisearch)
- **Likelihood:** Medium (337 centres manageable, 3,000+ will degrade)

**3. Missing E2E tests for directory**
- **Impact:** Regressions not caught until production
- **Mitigation:** Add Playwright tests for critical flows
- **Likelihood:** Medium (manual QA currently catching issues)

### High Risks (P1)

**4. Pipeline filter URL param not reactive**
- **Impact:** Changing `?pipeline=` via SPA navigation may not update filters
- **Mitigation:** Add `useEffect` to watch URL params
- **Likelihood:** Low (current implementation reads at render)

**5. Intelligence schema missing error handling**
- **Impact:** If migrations not applied, entire intelligence UI crashes
- **Mitigation:** `throwIfSanadIntelSchemaMissing` middleware catches this
- **Likelihood:** Very Low (migration check in place)

**6. WhatsApp auto-send silently fails**
- **Impact:** User thinks invite sent, but centre never receives it
- **Mitigation:** Toast shows error/skip reason; manual fallback available
- **Likelihood:** Medium (depends on external WhatsApp API)

### Medium Risks (P2)

**7. Compliance reviewer sees SOME mutation UI**
- **Impact:** UI shows **Generate invite**, **Activate office**, and row-level **Invite to SmartPRO** but those APIs use `sanadIntelFullProcedure` and return 403 for read-only roles
- **Current state:** `fullSanadOps` **does** hide: mark invalid/duplicate/archive (~line 1370), pipeline stage override + assign owner (~line 1673). **Does not** hide: Generate invite (~line 2177), Activate office (~line 2266), row "Invite to SmartPRO" (~line 1315) — line refs in `AdminSanadIntelligencePage.tsx`
- **Mitigation:** Wrap the three unguarded actions in `{fullSanadOps && ...}` (or disable with tooltip)
- **Likelihood:** Medium (reviewers can click actions that 403)

**8. Large offsets in pagination**
- **Impact:** OFFSET 5000 on 10,000 centres = slow query
- **Mitigation:** Switch to cursor pagination
- **Likelihood:** Low (dataset currently small)

### Low Risks (P3)

**9. Hardcoded English strings**
- **Impact:** Arabic users see English labels
- **Mitigation:** i18n extraction (already tracked in todo.md)
- **Likelihood:** Medium (known issue, not blocking)

**10. No query result caching**
- **Impact:** Every filter change hits DB
- **Mitigation:** Add staleTime to TanStack Query config
- **Likelihood:** Low (acceptable for admin tool)

---

## Optimization Opportunities

### Quick Wins (1 day each)

1. **Debounce search input** (not currently implemented)
   ```typescript
   const debouncedSearch = useDebouncedValue(search, 300);
   ```

2. **Memoize row components**
   ```typescript
   const CentreRow = memo(({ centre }) => { ... });
   ```

3. **Add staleTime to KPI queries**
   ```typescript
   trpc.sanad.intelligence.centrePipelineKpis.useQuery(undefined, {
     staleTime: 5 * 60 * 1000, // 5 min cache
   });
   ```

4. **Hide mutation UI for read-only users**
   ```typescript
   {fullSanadOps && <Button onClick={generateInvite}>Generate invite</Button>}
   ```

### Medium Wins (1 week each)

5. **Extract DirectorySurface to separate file**
   - Target: `DirectorySection/index.tsx` (300 lines)
   - Enables code-splitting
   - Reduces bundle size for other intelligence tabs

6. **Add full-text search**
   - Use MySQL FULLTEXT index on `centerName`
   - Or integrate Algolia/Meilisearch
   - Improves search UX

7. **Virtualize table for 200+ results**
   - Use `react-window` or `react-virtual`
   - Render only visible rows
   - Scales to 10,000+ centres

8. **Prefetch detail on row hover**
   ```typescript
   onMouseEnter={() => {
     utils.sanad.intelligence.getCenter.prefetch({ id: centre.id });
   }}
   ```

9. **Add Playwright E2E tests**
    - Test: Search → filter → open drawer → activate
    - Prevents regressions
    - Runs in CI

### Large Wins (2-4 weeks each)

10. **Decompose AdminSanadIntelligencePage**
    - Split into 5 section files
    - Extract shared components
    - Enable parallel development

11. **Cursor pagination**
    - Replace OFFSET with keyset pagination
    - Scales to millions of rows
    - Requires schema change

12. **Materialized views for KPIs**
    ```sql
    CREATE TABLE sanad_pipeline_kpis_cache (
      computed_at TIMESTAMP,
      kpi_json JSON
    );
    ```
    - Refresh on pipeline updates
    - Query cache instead of aggregating live

13. **Real-time updates via WebSockets**
    - Push pipeline changes to connected clients
    - Avoids polling/manual refresh
    - Better collaboration UX

14. **GraphQL migration**
    - Replace tRPC with GraphQL
    - Client can request only needed fields
    - Better caching at resolver level

---

## Dependencies Summary

**Total files touching Sanad:** 108

**Breakdown by category:**
- Client UI: 29 files (pages, components, locales)
- Server API: 14 files (routers, repositories, services)
- Server business logic: 8 files (sanad-intelligence/*)
- Shared helpers: 11 files (lifecycle, pipeline, RBAC, etc.)
- Database: 13 migrations + schema.ts
- Tests: 13 files
- Config/Nav: 8 files
- Data/Scripts: 7 files
- Ancillary: 5 files (WhatsApp, email, alerts, etc.)

**Critical path files (changes here = high blast radius):**
1. `client/src/pages/AdminSanadIntelligencePage.tsx` (2,887 lines)
2. `server/sanad-intelligence/queries.ts` (838 lines)
3. `server/routers/sanadIntelligence.ts` (1,183 lines)
4. `shared/sanadLifecycle.ts` (347 lines)
5. `drizzle/schema.ts` (sanad tables section)

---

## Recommendations

### Immediate (This Week)

1. ✅ **Week 1 server decomposition complete** — 4 sub-routers extracted
2. ⏳ **Start UI decomposition** — Extract DirectorySurface next
3. ⏳ **Add search debounce** — Reduces queries on every keystroke; improves perceived performance
4. ⏳ **Hide full-ops UI for reviewers** — Prevent 403 confusion

### Short-Term (This Month)

5. **Complete server decomposition** — Extract remaining 5 sub-routers (providers, workOrders, etc.)
6. **Add E2E test for critical path** — Search → filter → activate flow
7. **Extract directory section** — Break 2,887-line page into manageable pieces
8. **Add full-text search** — MySQL FULLTEXT or external search service

### Long-Term (This Quarter)

9. **Decompose intelligence router** — Split 1,183-line `sanadIntelligence.ts` into 7 sub-routers
10. **Implement cursor pagination** — Replace OFFSET for scalability
11. **Add materialized KPI cache** — Improve dashboard performance
12. **i18n for directory UI** — Arabic language support

---

## Conclusion

The `/admin/sanad/directory` route is a **well-architected but monolithic** implementation with:

**Strengths:**
- ✅ Clean separation of concerns (shared helpers, server logic, UI)
- ✅ Comprehensive test coverage for core business logic
- ✅ Strong RBAC model (platform/network/per-centre permissions)
- ✅ Well-documented lifecycle and transition rules

**Weaknesses:**
- ❌ 2,887-line UI component (highest maintenance risk)
- ❌ No E2E tests for critical user flows
- ❌ Missing search indexes (performance degradation at scale)
- ❌ No i18n for UI strings (English-only UX)

**Next steps:**
1. Continue Week 2 server decomposition
2. Extract DirectorySurface (UI decomposition)
3. Add critical E2E tests
4. Performance optimizations (indexes, caching, virtualization)

The codebase is production-ready but needs decomposition for long-term maintainability.