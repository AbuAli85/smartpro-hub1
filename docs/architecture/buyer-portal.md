# SmartPRO Buyer Portal — Architecture

**Status:** Target architecture (not yet fully implemented)  
**Audience:** Engineering, product, solution architecture  
**Last updated:** 2026-04-15

---

## 1. Overview

SmartPRO is evolving toward a **single operational engine** that serves **multiple relationship-based workspaces**: an operating company running its business, external **buyers** receiving services, **marketplace providers**, **Sanad / partner** offices, and **platform** operators.

This document defines the **Buyer Portal**: a **buyer-scoped, external customer account layer** for B2B relationships (e.g. a brand customer of a service company). It is **explicitly separate** from the existing **`/client-portal`** experience, which today is a **same-tenant restricted contact view**, not a true multi-party buyer portal.

**Architectural intent:** Buyer Portal queries must be scoped by **customer account membership** and **linked entities**, not solely by the service provider’s `companyId`.

---

## 2. Current state in repo

The following is grounded in the current codebase.

### 2.1 Route and UI

- **Route:** `client/src/App.tsx` registers **`/client-portal`** → `ClientPortalPage`.
- **Navigation:** `client/src/config/platformNav.tsx` exposes **`/client-portal`** under a **Client workspace** group (`clientWorkspace`) for users who pass visibility rules.
- **Shell:** `ClientPortalPage` aggregates tabs (dashboard, contracts, invoices, staffing, PRO, government cases, bookings, alerts, messages, etc.) and calls **`trpc.clientPortal.*`**.

### 2.2 Backend

- **Router:** `server/routers/clientPortal.ts` exports **`clientPortalRouter`**.
- **Scope:** Procedures resolve **`companyId`** via **`requireActiveCompanyId`** / **`requirePortalCompanyId`** and load data from tables keyed by **`companyId`** (e.g. `contracts`, `proBillingCycles`, `governmentServiceCases`, `proServices`, `workPermits`, `marketplaceBookings`, etc.). Header comment: *“Dedicated self-service portal for company clients … scoped to the authenticated user’s company.”*
- **Platform staff:** Global admin procedures are rejected for typical portal flows (*“Client portal is for company accounts”*).

### 2.3 Access and personas (client nav)

- **`shared/clientNav.ts`** defines **`PORTAL_CLIENT_HREFS`** (includes `/client-portal`) and **`shouldUsePortalOnlyShell`**, which applies when the user is an **end customer** (`platformRole` or **`company_members.role === "client"`**).
- **Default route for `client` role:** `getRoleDefaultRoute` returns **`/client-portal`**.
- **Internal operators:** `clientNavItemVisible` **hides `/client-portal`** from the main sidebar when **`!shouldUsePortalOnlyShell`** (e.g. `company_admin`, HR, finance), so it does not compete with full operational modules.

### 2.4 Schema signals

- **`company_members.role`** includes **`client`** — a membership on the **same** `companies` row as the operating tenant.
- **`client_portal_tokens`**, **`client_messages`** exist in `drizzle/schema.ts` and are **company-scoped** (`companyId` / `company_id` pattern), not buyer-account-scoped.

**Conclusion:** The repo implements a **same-tenant aggregate** for “contact” or “invited client” users, not a **separate buyer organization** with isolated data.

---

## 3. Problem with current `clientPortal` semantics

| Issue | Detail |
|--------|--------|
| **Tenant scope** | All meaningful reads are **`companyId`-scoped** to the **service provider** tenant. That matches **internal** commercial operations, not “Samsung’s view” as a distinct security boundary. |
| **Naming confusion** | “Client” suggests both **CRM contact** and **external buyer**; product and UX have mixed these. |
| **Overlap** | Tabs mirror **Contracts**, **PRO**, **Workforce**, **Billing**, **Marketplace**, **Alerts** elsewhere — appropriate for a **limited shell**, redundant for **owner/admin** (mitigated by sidebar hiding for internal roles). |
| **No buyer partition** | There is no first-class **`customer_account_id`** (or equivalent) in `clientPortal` procedures; **no** membership table for “buyer user ↔ buyer org ↔ provider.” |

Renaming UI alone does **not** fix this; **Buyer Portal** requires **new scoping and entities**.

---

## 4. Target workspace architecture

Sessions should be explicit about **which workspace** is active. Each workspace is a **relationship context**, not a single generic “client.”

| Workspace | Purpose | Example actors |
|-------------|---------|----------------|
| **Operating Company Workspace** | Run the business end-to-end (HR, payroll, contracts, workforce, billing, CRM, etc.). | Falcon Eye Orbit owner, admins, staff |
| **Buyer Portal** | External **customer account** view: only data linked to that buyer’s relationship with a provider. | Buyer org admins, finance, ops, viewers |
| **Provider Workspace** | Marketplace / third-party **vendor** delivering services into the ecosystem. | Service providers, fulfilment teams |
| **Partner / Sanad Workspace** | Government-linked or partner office execution (routing, cases, onboarding). | Sanad office users |
| **Platform Workspace** | SmartPRO oversight: moderation, integrity, audit, cross-tenant ops. | Platform operators |

**One user may** eventually hold multiple roles across contexts; **each request** must carry a **clear active context** (workspace + identifiers).

---

## 5. Buyer Portal purpose and scope

### In scope

- Visibility into **commercial relationship** data: linked contracts, invoices, staffing/program views, service and case **status**, approvals, alerts, and messaging **with the provider** — **only** where explicitly linked to the buyer account.
- Read-heavy workflows; **write** paths limited to messages, approvals, acknowledgments, and structured requests as designed.

### Out of scope for Buyer Portal

- Full **operating company** HR, payroll, all employees, all contracts, tenant settings.
- **Provider-internal** tools and **partner-internal** admin surfaces.
- **Platform** administration.

---

## 6. Personas and roles

### Buyer (external)

| Role (conceptual) | Typical permissions |
|-------------------|---------------------|
| **buyer_admin** | Account-level visibility, user management for buyer org, approvals, messaging |
| **buyer_finance** | Invoices, billing docs, finance approvals |
| **buyer_operations** | Assignments, service status, cases, operational requests |
| **buyer_viewer** | Read-only subset |

### Provider (operating company), interacting with buyers

Existing internal roles (e.g. `company_admin`, operations, finance, PRO) **do not** use Buyer Portal as their primary shell; they **manage** relationships from the **Operating Company Workspace** and may **respond** to buyer-originated requests.

### Platform

Unchanged: platform operators use existing platform routes and RBAC; **not** the Buyer Portal product surface for tenant operations.

---

## 7. Data model / proposed entities

The following **proposed** tables (names indicative) establish the **buyer boundary**. Exact naming should follow existing Drizzle conventions and migrations.

| Entity | Purpose |
|--------|---------|
| **`customer_accounts`** | External buyer account tied to **`provider_company_id`** (operating company), legal name, status, contacts |
| **`customer_account_members`** | **`user_id`** ↔ **`customer_account_id`**, buyer role, invitation status |
| **`customer_contract_links`** | **`contract_id`** ↔ **`customer_account_id`**, relationship metadata |
| **`customer_invoice_links`** | Billing / invoice rows ↔ **`customer_account_id`** |
| **`customer_assignment_links`** | Staffing / program / assignment ↔ **`customer_account_id`** |
| **`customer_case_links`** | Government / PRO / service cases ↔ **`customer_account_id`** |
| **`customer_threads` / `customer_thread_messages`** | Account-scoped messaging (vs company-wide `client_messages` where appropriate) |
| **`customer_approvals`** | Pending approvals / acknowledgments tied to buyer account |

**Existing CRM constructs** (`crm_contacts`, `crm_deals`, `service_quotations` with `clientName`, etc.) may **link** to `customer_accounts` over time; Buyer Portal should **not** depend on free-text alone.

---

## 8. Scoping and RBAC rules

1. **Every Buyer Portal procedure** must:
   - Resolve **`customer_account_id`** from session/context (or explicit input validated against membership).
   - Enforce **`requireCustomerAccountMembership(user, customerAccountId)`** (or equivalent).
   - Query **only** rows **linked** to that account (via link tables or denormalized allowed IDs), **never** “all contracts for `companyId`.”

2. **Provider `companyId`** alone is **insufficient** for buyer-facing reads.

3. **Buyer roles** gate tab-level or procedure-level actions (finance vs viewer).

4. **Audit:** sensitive buyer actions should be logged with **customer_account_id** and **provider_company_id**.

---

## 9. Route structure

### Preserve (reposition in copy)

- **`/client-portal`** — **Customer contact / invited-client workspace** (same-tenant). Deep links such as **`?tab=invoices`** remain supported for existing flows.

### Add (Buyer Portal product)

Recommended **first-class** routes under a dedicated prefix, for example:

- `/buyer` — overview (active account selection if multiple)
- `/buyer/contracts`, `/buyer/invoices`, `/buyer/assignments`, `/buyer/cases`, `/buyer/approvals`, `/buyer/messages`, `/buyer/reports`, `/buyer/alerts`

**Alternative:** nested by account: `/customer-account/:customerAccountId/...` for enterprise clarity.

**Layout:** **`BuyerPortalLayout`** — **not** `PlatformLayout` full company sidebar; minimal buyer chrome.

Subdomains / white-label (**e.g. `buyer.example.com`**) are **future** deployment options, not required for MVP.

---

## 10. API / router direction (`buyerPortalRouter`)

- **New router:** `buyerPortalRouter` (or `buyerPortal` under `server/routers/`), **separate from** `clientPortalRouter`.
- **Do not** overload `clientPortalRouter` with buyer semantics; migration can **delegate** or **duplicate read models** only with clear deprecation notes.
- **Illustrative procedures:** `getOverview`, `listContracts`, `listInvoices`, `listAssignments`, `listCases`, `listApprovals`, `listMessages`, `sendMessage`, `listReports`, `getAlerts` — all **customer-account-scoped** after guards.

**Frontend:** dedicated pages and hooks under `client/src/pages/buyer/` (or similar), wired to **`trpc.buyerPortal.*`**.

---

## 11. Migration strategy from current state

1. **Document and name** the current `/client-portal` as **contact** / **invited client** view in UI and internal docs (this file + release notes).
2. **Keep** `clientPortalRouter` behavior stable for **same-tenant `client` role** and **deep links** until Buyer Portal MVP is ready.
3. **Introduce** `customer_accounts` + membership + minimal link tables.
4. **Backfill** links from existing contracts/invoices where business rules allow (batch jobs, manual mapping).
5. **Onboard** first buyer users via **`customer_account_members`**; **invite** flows replace ad-hoc “client” membership where the business intends true buyer separation.
6. **Long-term:** Optionally deprecate overlapping **`client` role** semantics for **external** buyers when Buyer Portal is fully adopted (product decision).

---

## 12. Roadmap — P0 / P1 / P2 / P3

| Phase | Scope |
|-------|--------|
| **P0** | Clarify IA: `/client-portal` = **contact / invited client**; internal admins **not** primary nav; preserve deep links; **this architecture doc** |
| **P1** | Schema: **`customer_accounts`**, **`customer_account_members`**, core **link** tables; **guards**; **`buyerPortalRouter` stub** with feature flag; **placeholder layout + routes** |
| **P2** | MVP Buyer Portal: overview, contracts, invoices, messages, alerts (all scoped) |
| **P3** | Assignments, attendance summaries, approvals, reports, case detail; partner/provider **visibility rules** (status-only where required) |

---

## 13. Non-goals

- Replacing **Operating Company Workspace** with Buyer Portal.
- Implementing **full buyer** semantics **inside** `clientPortalRouter` without schema.
- **White-label** or multi-subdomain **on day one** of MVP.
- **Guaranteeing** feature parity for **same-tenant `client` role** and **buyer** users without separate migration and product decisions.

---

## 14. Final architecture decision

- **True Buyer Portal** is a **new product layer**: **new entities**, **new router**, **new routes/layout**, **customer-account-scoped RBAC**.
- **Current `/client-portal`** remains a **same-tenant restricted contact aggregate** — **not** the final buyer product.
- **Success** is measured by **clear separation** of **provider operating data** vs **buyer-visible linked data**, with **no accidental cross-buyer leakage**.

---

## Appendix — Suggested first implementation PR

A minimal first PR should be **mergeable** without enabling buyer UX in production:

| Area | Suggestion |
|------|------------|
| **Schema** | Drizzle tables: `customer_accounts`, `customer_account_members` (minimal columns + indexes); optional stub link tables or defer links to PR2 |
| **Guards** | `requireCustomerAccountMembership` / `resolveBuyerContext` in `server/_core/` (or `server/buyer/`) with unit tests |
| **Router** | `buyerPortalRouter` with **one** procedure e.g. `getOverview` returning `{ ok: true }` or empty payload, **only** after guard passes |
| **Feature flag** | Env or DB flag (e.g. `BUYER_PORTAL_ENABLED`) gating client routes and router registration |
| **Frontend** | `BuyerPortalLayout` + placeholder page at `/buyer` (or behind flag), **no** reuse of full `PlatformLayout` sidebar |

Subsequent PRs add link tables, real queries, and **progressive** tab pages.

**Detailed foundation spec (schema sketches, guards, RBAC matrix, PR checklist):** [`buyer-portal-foundation-spec.md`](./buyer-portal-foundation-spec.md).
