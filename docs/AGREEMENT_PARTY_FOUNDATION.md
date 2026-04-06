# Agreement & party foundation

## Problem

Promoter contracts were modeled only as “company A / company B” pickers, with no canonical **business party** identity separate from a **platform tenant**. In practice:

- A client may exist only as an employer-managed counterparty before joining the platform.
- The same legal entity must not fork into duplicate rows when they later get a `companies` record.
- Roles (client, employer, future roles) are **per agreement**, not intrinsic to the company.

## Domain model (target)

| Concept | Meaning |
|--------|---------|
| **Business party** (`business_parties`) | Canonical counterparty: display/legal names, optional link to `companies.id`, optional `managed_by_company_id` for external records. |
| **Agreement / contract** (`outsourcing_contracts` + children) | Typed agreement (e.g. `promoter_assignment`) with lifecycle status and audit events. |
| **Agreement party snapshot** (`outsourcing_contract_parties`) | Role + name/reg snapshot at creation time; optional `party_id` → `business_parties.id`. |
| **Platform company** (`companies`) | Tenant with users; may be linked from a party via `linked_company_id`. |

## Transitional design (shipped in this phase)

1. **New tables**: `business_parties`, `business_party_events`.
2. **`outsourcing_contracts.company_id`** is now **nullable**. Historically it was the first-party client tenant id. When the client is external-only at creation, it stays `NULL` until the party is linked to a platform company (or manually corrected).
3. **`outsourcing_contract_parties.party_id`** optional FK to `business_parties` — populated for new creates via `ensurePartyForLinkedCompany` (platform) or the external party row.
4. **Employer-side create flow** (`ContractManagementPage`): second party locked to active company; client chosen from `promoterFlowClientOptions` (platform tenants ∪ managed externals).
5. **Linking**: `contractManagement.linkPartyToPlatformCompany` (platform admin only in this phase) sets `linked_company_id`, backfills `company_id` on headers that were `NULL`, and updates first-party snapshots’ `company_id`.
6. **RBAC**: Mutations that previously required “first party only” now allow any **involved** party with contract-management roles (first party, second party, or promoter employer company), matching list/visibility rules.

## API surface (`contractManagement`)

| Procedure | Role |
|-----------|------|
| `promoterFlowClientOptions` | Unified client list for employer flow. |
| `createManagedExternalClient` | Employer creates managed external party. |
| `linkPartyToPlatformCompany` | Platform admin links party ↔ tenant. |
| `createPromoterAssignment` | Accepts `creationPerspective`, `clientKind`, `clientCompanyId` XOR `clientPartyId`. |
| `listEmployerEmployees` | `forEmployerPerspective` skips client-anchored RBAC when the client is external. |

## Audit

- `business_party_events`: `party_created`, `external_party_created`, `party_linked_to_company`, etc.
- Contract `created` event `details` may include `creationPerspective` and `clientKind` (via `auditExtra` on `createOutsourcingContractFull`).

## Future migration steps

1. Backfill `party_id` / `business_parties` for historical `outsourcing_contract_parties` rows.
2. Enforce uniqueness / merge rules when linking (fuzzy name match, admin review queue).
3. Extend party roles beyond `first_party` / `second_party` / `third_party` with type-specific required roles in metadata or a small config table.
4. Allow employer-initiated link requests + tenant acceptance instead of platform-only linking.
5. Generalize header `company_id` into explicit `record_owner_company_id` or drop in favor of party-graph visibility only.

## Migration SQL

Apply `drizzle/0019_agreement_party_foundation.sql` to your MySQL database (adds tables, nullable `company_id`, `party_id` on parties).
