# SmartPRO Hub 1 Hardening Summary — March 2026

This document captures the multi-pass security, tenant-isolation, access-control, and storage hardening completed in `smartpro-hub1`, plus the remaining open items.

## What is now covered

### Access control and tenancy
- Canonical RBAC helpers in `shared/rbac.ts`
- Canonical tenant and membership helpers in `server/_core/tenant.ts` and `server/_core/membership.ts`
- Consistent use of `getUserCompany`, `requireActiveCompanyId`, `requireActiveCompanyMembership`, `resolveStatsCompanyFilter`, and `resolvePlatformOrCompanyScope`
- Documented `NOT_FOUND` vs `FORBIDDEN` policy in `docs/ARCHITECTURE.md`
- Broad router hardening across analytics, renewal workflows, contracts, pro, HR, marketplace, reports, CRM, quotations, Sanad, payroll, clientPortal, alerts, ratings, workforce, compliance, operations, recruitment, SLA, officers, and subscriptions

### Tenant-boundary and mutation safety
- Cross-tenant reads and writes hardened in high-risk routes
- Bare-id mutations replaced or wrapped with row-load + ownership checks
- Unsafe `companyId ?? 1` / fallback patterns removed from critical paths
- Platform-only routes and templates explicitly gated where required

### Storage and document handling
- Storage and download access policy documented in `docs/ARCHITECTURE.md`
- No router-level use of `storageGet`; only tests use it today
- Tenant-aware storage key partitioning added where applicable:
  - contracts
  - signatures
  - quotations
  - officer certificates
  - workforce certificate ingestion
  - payroll/reports/recruitment artifacts where applicable
- `fileUrlMatchesConfiguredStorage` added for MOL certificate ingestion alignment when Forge is configured
- Forge generated image keys moved to `generated/{uuid}.png`

### Verification and regression coverage
- Typecheck and Vitest passing through the hardening batches
- Regression tests expanded across RBAC, tenant boundaries, membership behavior, storage helpers, subscriptions behavior, and route-level security behavior

## Current known open items

### Must re-check if future work adds new surfaces
- Any authenticated download or signed-URL tRPC endpoint must re-validate ownership on the owning row before calling `storageGet`
- Any new storage keys should follow documented partitioning rules and avoid shared numeric fallback namespaces

### Product decisions / accepted limitations
- Multi-company users still depend on a single active-company context
- `generateImage` is UUID-based but not tenant-prefixed until a call site passes scope metadata
- Forge URL origin vs CDN/public object origin may need a second allowed origin if deployment changes
- Platform/global views may intentionally allow unfiltered operations when `companyId` is omitted for true platform operators

### Future enhancements
- Tenant prefixing for generated images when a concrete tenant-aware call site exists
- Richer provider identity model for Sanad / PRO officer self-service
- More explicit active-company switching UX for multi-company users

## Recommended next steps

1. Treat this hardening baseline as the minimum standard for all new routes and mutations.
2. Before adding new download/export endpoints, implement row-validated access wrappers.
3. Shift the next engineering phase toward product depth:
   - Shared Omani PRO domain
   - workflow/case engine depth
   - Arabic/RTL readiness
   - multi-company UX strategy
4. Keep `docs/ARCHITECTURE.md` and this summary updated when platform-wide rules change.
