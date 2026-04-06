# Agreement foundation — Phase 2 QA matrix & deployment

Companion to `docs/AGREEMENT_PARTY_FOUNDATION.md`. Covers hardening: admin party linking, backfill, merge safety, RBAC, PDFs, lifecycle, and rollout.

---

## 1. Deployment order

1. **Database** — Apply migration `0019_agreement_party_foundation.sql` (if not already applied on the environment).
2. **Application** — Deploy server + client build that includes Phase 2 UI and APIs.
3. **Backfill (recommended)** — Run party-id backfill for legacy contract party rows (see below) during a low-traffic window.
4. **Smoke** — Platform admin opens **Platform Ops → Parties**, runs one preview link on a test row, then full link with acknowledgements if warnings appear.

---

## 2. Rollback concerns

| Area | Risk | Mitigation |
|------|------|------------|
| Nullable `outsourcing_contracts.company_id` | Older code assuming non-null header | Phase 1+ code already handles null; do not roll back DB without restoring NOT NULL + backfilling NULLs. |
| `party_id` on parties | Orphan FK if `business_parties` row deleted | Use `ON DELETE SET NULL` on FK; avoid deleting parties that are linked. |
| Link mutation | Wrong tenant linked | Preview + reg mismatch **block**; name mismatch **warn** + explicit ack codes. |

**Schema rollback (emergency only):** Dropping `party_id` / `business_parties` loses canonical identity — avoid. Prefer forward-fix (unlink via new admin tool — not shipped) or manual SQL.

---

## 3. Data integrity checks (post-migration / post-backfill)

Run in MySQL (adjust as needed):

```sql
-- Party rows with linked company should be unique per company in steady state
SELECT linked_company_id, COUNT(*) c
FROM business_parties
WHERE linked_company_id IS NOT NULL
GROUP BY linked_company_id
HAVING c > 1;

-- Contract parties with platform company but missing party_id (should trend to zero after backfill)
SELECT COUNT(*) FROM outsourcing_contract_parties
WHERE company_id IS NOT NULL AND party_id IS NULL;

-- Headers null but first party has platform company_id (should be rare / transient)
SELECT oc.id FROM outsourcing_contracts oc
JOIN outsourcing_contract_parties ocp ON ocp.contract_id = oc.id AND ocp.party_role = 'first_party'
WHERE oc.company_id IS NULL AND ocp.company_id IS NOT NULL;
```

---

## 4. Backfill steps (`party_id` on contract parties)

```bash
# Preview companies that would be touched
DRY_RUN=1 npx tsx scripts/backfill-contract-party-ids.ts

# Apply
npx tsx scripts/backfill-contract-party-ids.ts
```

**Scope:** Rows with `company_id` set and `party_id` IS NULL. Creates or reuses `business_parties` per tenant via `ensurePartyForLinkedCompany`. Does **not** invent parties for purely external first parties (`company_id` NULL).

---

## 5. Manual QA matrix

### 5.1 Party linking (Platform Ops → Parties)

| # | Case | Steps | Expected |
|---|------|-------|----------|
| L1 | Happy path | Unlinked managed external + matching tenant name + same CR | Preview: can proceed, no warnings. Link succeeds. |
| L2 | Name mismatch | External name ≠ tenant name | Preview: `NAME_MISMATCH` warning. Link fails until `acknowledgedWarningCodes` includes `NAME_MISMATCH` from UI. |
| L3 | Reg conflict | Party CR ≠ tenant CR | Preview: **blocking**. Link never succeeds. |
| L4 | Duplicate party for company | Another `business_parties` already linked to target company | **Blocking** message references other party id prefix. |
| L5 | Already linked | Party has `linked_company_id` | **Blocking**. |
| L6 | Post-link contracts | Contract had `company_id` NULL, first_party had `party_id` | After link: header `company_id` set, first_party `company_id` updated. |

### 5.2 Agreement visibility / RBAC (tenant users, `company_admin` / `hr_admin`)

| # | Case | Expected |
|---|------|----------|
| V1 | Active company = first_party (`company_id` or party `company_id`) | `getById`, `list`, `update`, `activate`, `terminate`, upload allowed (subject to roles). |
| V2 | Active company = second_party | Same as V1 (involved-party rule). |
| V3 | Active company = promoter `employerCompanyId` only | Involved; same mutations as V1. |
| V4 | Unrelated company | `FORBIDDEN` / not in list. |
| V5 | Platform admin | Full access. |

### 5.3 Document / PDF generation (`outsourcing_contract` template)

| # | Scenario | Expected |
|---|----------|----------|
| P1 | Platform client (both parties have `company_id`) | PDF builds; first/second party names and CR (or `—` if missing reg). |
| P2 | External managed client (first_party `company_id` NULL before link) | PDF uses snapshot `displayNameEn`; CR from party or `—`. |
| P3 | After link | Same contract row: PDF still valid; tenant check includes linked `company_id` on parties/header. Regenerate once to confirm no error. |

### 5.4 Lifecycle

| # | Action | Expected |
|---|--------|----------|
| R1 | Renew | New contract rows copy `party_id` from original parties; `created` audit includes `lifecycle: renewal`, `renewedFromContractId`. |
| T1 | Terminate | Unchanged transition rules; involved-party RBAC allows employer-side termination where applicable. |
| A1 | Amendment (future) | Use `metadata.amendsContractId` convention when implemented; party snapshots remain source of truth for PDF. |

---

## 6. Automated tests

- `server/modules/contractManagement/contractAccess.test.ts` — involved-company set logic (RBAC visibility helper).
- `server/modules/agreementParties/party.repository.test.ts` — `partyAndCompanyNamesLooselyMatch` (link preview name warnings).
- Run: `pnpm exec vitest run server/modules/contractManagement/contractAccess.test.ts server/modules/agreementParties/party.repository.test.ts`

---

## 7. Open items (still staged)

- Employer-initiated link **request** workflow + tenant acceptance.
- Full **amendment** entity type and UI (metadata-only convention documented).
- **Unlink** / merge-two-parties admin tool.
- Row-level **audit** export for compliance.

---

## 8. Recommended next phase

1. Backfill monitoring dashboard (counts of NULL `party_id`).
2. Amendment MVP: `metadata` + clone parties with `amendsContractId`.
3. Durable **merge** workflow when two `business_parties` represent the same entity.
