# Agreement foundation — Phase 3 (operations & lifecycle MVP)

Builds on Phase 2 hardening (`docs/AGREEMENT_PHASE2_QA_AND_DEPLOYMENT.md`) and party foundation (`docs/AGREEMENT_PARTY_FOUNDATION.md`).

## 1. Changed surface (summary)

| Area | What |
|------|------|
| **DB** | `business_parties.merged_into_party_id` — audit trail after merge (source row retained, `status=inactive`). |
| **Integrity APIs** | `adminPartyIntegritySummary`, `adminDuplicatePartyRegistrationGroups` |
| **Merge / unlink** | `previewPartyMerge`, `executePartyMerge` (confirm `MERGE`), `previewPartyPlatformUnlink`, `executePartyPlatformUnlink` (confirm `UNLINK`) |
| **Lifecycle** | `createAmendmentDraft` — draft + `metadata` (`lifecycleKind`, `amendsContractId`, `rootContractId`) + `amendment_branched` on base timeline |
| **Renew / terminate** | Renew: single header write with `renewalOfContractId` + metadata; original transition audit includes `successorContractId` + `lifecycleKind`. Terminate: one event with `lifecycleKind: termination` (+ optional `reason`). |
| **UI** | Platform Ops → Parties → **Integrity** tab; contract detail → **Lifecycle & lineage**, **Amendment draft**, party IDs |
| **PDF** | Same snapshot rules; `buildOutsourcingContractDocumentContextFromRows` tested for platform / external / linked snapshots |
| **Shared** | `@shared/agreementLifecycle` — parse/merge metadata helpers |

## 2. Migration / data operations

1. Apply `drizzle/0020_agreement_phase3_party_merge.sql`.
2. Existing backfill script unchanged: `scripts/backfill-contract-party-ids.ts`.
3. Ops CLI: `npx tsx scripts/party-integrity-report.ts`.

## 3. Risks

| Risk | Mitigation |
|------|------------|
| **Merge** wrong source/target | Preview + explicit `MERGE` phrase; link rules block inconsistent tenant links. |
| **Unlink** with live contracts | Blocked if any related contract is `active`, `expired`, or `suspended`. |
| **Amendment** | One open draft per base (`findDraftAmendmentChildForBase`); base stays active — legal supersession is an operational follow-up. |
| **JSON metadata query** | MySQL `JSON_EXTRACT` for draft-amendment check; environment must support JSON functions. |

## 4. Staged / remaining

- Amendment **activation** workflow (supersede base, or explicit `superseded` status) — not in this MVP.
- Employer-initiated link request + tenant acceptance (Phase 2 open item).
- Full compliance export / row-level audit download.

## 5. Recommended next phase (Phase 4)

1. Amendment activation + optional `superseded` status in transition map.
2. Automated alerts when integrity counters trend upward.
3. Deep linking from KPI dashboard to Integrity tab pre-filters.

## 6. Verification commands

```bash
pnpm exec vitest run server/modules/contractManagement/outsourcingContractContext.rows.test.ts shared/agreementLifecycle.test.ts
pnpm check
```
