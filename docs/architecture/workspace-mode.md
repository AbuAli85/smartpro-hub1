# Client workspace modes (pre-company vs company)

This note documents how SmartPRO’s **client** distinguishes users with **no settled company membership** from tenants, operators, and portal-only customers — so dashboard and navigation stay aligned with real access.

## Invariant

**Pre-company mode only applies after company membership resolution is settled; loading and platform/operator/portal contexts are explicitly excluded.**

- **Settled:** `trpc.companies.myCompanies` has completed its initial fetch (`ActiveCompanyContext.loading === false`). Do not infer “no company” from an empty list while still loading.
- **Excluded from pre-company UI:** platform operators (`seesPlatformOperatorNav`), global admins (`canAccessGlobalAdminProcedures`), and portal-only clients (`isPortalClientNav` + portal shell). They use other surfaces or full tooling — not the pre-company onboarding dashboard.

## Where it is enforced

| Concern | Location |
|--------|----------|
| Pre-company detection | `client/src/lib/workspaceMode.ts` — `isPreCompanyWorkspaceUser()` |
| Membership list + loading | `client/src/contexts/ActiveCompanyContext.tsx` |
| Dashboard branch | `client/src/pages/Dashboard.tsx` → `PreCompanyDashboard` |
| Nav visibility + pre-registration shell | `shared/clientNav.ts` — `shouldUsePreRegistrationShell`, `PRE_COMPANY_NAV_HREFS`, `clientNavItemVisible` |
| Route guard (same rules as sidebar) | `shared/clientNav.ts` — `clientRouteAccessible`; `client/src/components/ClientAccessGate.tsx` |
| Sidebar structure | `client/src/config/platformNav.tsx` + `PlatformLayout` / `filterVisibleNavGroups` |

## Reviewer note

Changes to **dashboard entry**, **sidebar filtering**, or **`companies.myCompanies` / `loading`** semantics can regress this classification. Prefer extending `isPreCompanyWorkspaceUser` and `clientNav` together rather than one-off `if` branches in pages.

## Follow-up (product)

A dedicated **`/company/join`** (or similar) flow for invites / codes should replace routing the “Join existing company” CTA through interim destinations (currently documented in `PreCompanyDashboard`).
