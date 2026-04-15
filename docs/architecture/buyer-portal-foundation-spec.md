# Buyer Portal — Foundation implementation spec

**Purpose:** Executable blueprint for **PR1 (foundation only)** — schema, guards, stub router, feature flag, placeholder UI.  
**Companion:** [`buyer-portal.md`](./buyer-portal.md) (product architecture).  
**Last updated:** 2026-04-15

---

## 1. Scope of this document

| In scope | Out of scope (later PRs) |
|----------|---------------------------|
| `customer_accounts`, `customer_account_members` tables | `customer_*_links` tables (invoices, contracts, …) |
| Guard helpers + test matrix | Real `listInvoices` / joins |
| `buyerPortalRouter` with **one** stub procedure | Buyer UI beyond placeholder |
| Feature flag wiring | Backfill / migration of legacy data |

---

## 2. Drizzle schema (draft)

**Conventions:** Match `drizzle/schema.ts` — `mysqlTable` snake_case table names, physical columns `snake_case`, TypeScript properties `camelCase` where consistent with nearby tables (e.g. `client_portal_tokens`).

### 2.1 `customer_accounts`

Represents an **external buyer** commercial relationship with a **provider** (operating company).

| TS property | DB column | Type | Notes |
|-------------|-----------|------|--------|
| `id` | `id` | PK, autoincrement | |
| `providerCompanyId` | `provider_company_id` | int, not null, FK → `companies.id` | Falcon Eye / service provider tenant |
| `displayName` | `display_name` | varchar(255), not null | e.g. “Samsung Gulf” |
| `legalName` | `legal_name` | varchar(255), optional | |
| `slug` | `slug` | varchar(100), optional, unique per provider | **optional** for URLs; nullable until MVP needs it |
| `status` | `status` | enum: `draft`, `active`, `suspended`, `closed` | default `active` |
| `country` | `country` | varchar(10), optional | default `OM` |
| `primaryContactEmail` | `primary_contact_email` | varchar(320), optional | |
| `primaryContactPhone` | `primary_contact_phone` | varchar(32), optional | |
| `createdAt` | `created_at` | timestamp, default now | |
| `updatedAt` | `updated_at` | timestamp, on update | |

**Indexes**

- `idx_ca_provider` on `(provider_company_id)`
- Unique `(provider_company_id, slug)` **where** `slug` is not null — or defer unique slug to P2 if nullable everywhere in MVP

**Drizzle sketch**

```ts
// Proposed — add to drizzle/schema.ts after review
export const customerAccountStatusEnum = mysqlEnum("customer_account_status", [
  "draft",
  "active",
  "suspended",
  "closed",
]).default("active");

export const customerAccounts = mysqlTable(
  "customer_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    providerCompanyId: int("provider_company_id").notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    legalName: varchar("legal_name", { length: 255 }),
    slug: varchar("slug", { length: 100 }),
    status: customerAccountStatusEnum.notNull(),
    country: varchar("country", { length: 10 }).default("OM"),
    primaryContactEmail: varchar("primary_contact_email", { length: 320 }),
    primaryContactPhone: varchar("primary_contact_phone", { length: 32 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_ca_provider").on(t.providerCompanyId),
    // unique(slug, provider) — add when slug strategy is fixed
  ],
);
```

### 2.2 `customer_account_members`

Links **`users`** to **`customer_accounts`** with a **buyer role**. This is **orthogonal** to `company_members` (same user can be Falcon Eye employee + Samsung buyer).

| TS property | DB column | Type | Notes |
|-------------|-----------|------|--------|
| `id` | `id` | PK | |
| `customerAccountId` | `customer_account_id` | int, not null, FK | |
| `userId` | `user_id` | int, not null, FK → `users.id` | |
| `role` | `role` | enum | See §2.3 |
| `status` | `status` | enum: `invited`, `active`, `revoked` | default `active` for MVP seed |
| `invitedAt` | `invited_at` | timestamp, optional | |
| `acceptedAt` | `accepted_at` | timestamp, optional | |
| `createdAt` | `created_at` | timestamp | |

**Indexes**

- Unique `(customer_account_id, user_id)` — one membership row per user per account
- `idx_cam_user` on `(user_id)` — list accounts for a user

**Drizzle sketch**

```ts
export const buyerMemberRoleEnum = mysqlEnum("buyer_member_role", [
  "buyer_admin",
  "buyer_finance",
  "buyer_operations",
  "buyer_viewer",
]);

export const buyerMemberStatusEnum = mysqlEnum("buyer_member_status", [
  "invited",
  "active",
  "revoked",
]);

export const customerAccountMembers = mysqlTable(
  "customer_account_members",
  {
    id: int("id").autoincrement().primaryKey(),
    customerAccountId: int("customer_account_id").notNull(),
    userId: int("user_id").notNull(),
    role: buyerMemberRoleEnum.notNull(),
    status: buyerMemberStatusEnum.notNull().default("active"),
    invitedAt: timestamp("invited_at"),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_cam_account").on(t.customerAccountId),
    index("idx_cam_user").on(t.userId),
    unique("uq_cam_account_user").on(t.customerAccountId, t.userId),
  ],
);
```

### 2.3 Buyer role enum (§2.2)

| Role | Intent |
|------|--------|
| `buyer_admin` | Full account visibility; manage buyer-side users (future); approvals |
| `buyer_finance` | Invoices, billing artifacts |
| `buyer_operations` | Assignments, cases, service status |
| `buyer_viewer` | Read-only |

### 2.4 Migration order

1. Generate SQL via Drizzle Kit from new tables (or handwrite migration matching `drizzle/` style).
2. **No** FK constraints in MVP if the repo avoids them elsewhere — **prefer** application-level joins + indexes; document in migration comment if FKs added later.

---

## 3. Guard contract (server)

**New module (suggested):** `server/buyer/buyerContext.ts` (or `server/_core/buyerContext.ts`).

### 3.1 Types

```ts
export type BuyerContext = {
  customerAccountId: number;
  providerCompanyId: number;
  role: BuyerMemberRole; // inferred from enum
  membershipId: number;
};
```

### 3.2 Functions

| Function | Behavior |
|----------|----------|
| `getUserCustomerMembership(userId, customerAccountId)` | DB lookup; returns row + joined `customer_accounts.provider_company_id` or null |
| `requireCustomerAccountMembership(user, customerAccountId)` | If no row or `status !== 'active'` → `TRPCError` **`FORBIDDEN`** or **`NOT_FOUND`** (pick one policy; **NOT_FOUND** reduces enumeration for cross-account IDs) |
| `resolveBuyerContext(user, input: { customerAccountId: number })` | Calls `requireCustomerAccountMembership`; returns `BuyerContext` |

**Rules**

- **Never** infer buyer access from `requireActiveCompanyId` alone.
- Platform global admins: **explicit policy** — either **blocked** from buyer portal procedures (service accounts only) or **must impersonate** with audit; **default for foundation:** **reject** buyer routes unless `BUYER_PORTAL_ENABLED` + explicit membership (same as normal user).

### 3.3 Dual workspace invariant (validation)

**Question:** Can one user belong to **Falcon Eye** (`company_members`) **and** **Samsung** (`customer_account_members`)?

**Answer:** **Yes.** Foundation PR must **unit-test**:

- User A: `company_members` row for company 1 **and** `customer_account_members` for account X (provider = company 1 or another provider).
- Buyer procedures use **only** `customerAccountId` + membership guard.
- Operating procedures use **only** `companyId` + `requireActiveCompanyId`.

**No mixing** in a single query without explicit joins on link tables (future).

---

## 4. RBAC matrix (foundation + MVP direction)

Rows: **buyer procedure** (future). Columns: **buyer role**.

| Procedure / area (target) | buyer_admin | buyer_finance | buyer_operations | buyer_viewer |
|---------------------------|:-------------:|:---------------:|:------------------:|:--------------:|
| `getOverview` | ✓ | ✓ | ✓ | ✓ |
| `listContracts` (future) | ✓ | ✓ | ✓ | ✓ |
| `listInvoices` (future) | ✓ | ✓ | ✓ | read-only |
| `sendMessage` (future) | ✓ | ✗ | ✓ | ✗ |
| `approveX` (future) | ✓ | ✓* | ✓ | ✗ |

\* Product decision: finance-only approvals.

**Foundation PR:** stub `getOverview` — **any** `active` membership role is allowed (or restrict to `buyer_viewer` minimum = all).

---

## 5. Router: `buyerPortalRouter`

**File:** `server/routers/buyerPortal.ts` (new).

**Registration:** In main app router (e.g. `server/routers/_app.ts` or equivalent) **only if** `env.buyerPortalEnabled === true`.

**Input**

```ts
const buyerAccountInput = z.object({
  customerAccountId: z.number().int().positive(),
});
```

**Stub procedure**

```ts
getOverview: protectedProcedure
  .input(buyerAccountInput)
  .query(async ({ ctx, input }) => {
    const ctx2 = await resolveBuyerContext(ctx.user, input);
    return {
      customerAccountId: ctx2.customerAccountId,
      providerCompanyId: ctx2.providerCompanyId,
      role: ctx2.role,
      message: "buyer_portal_stub",
    };
  });
```

**Naming:** tRPC `buyerPortal` → client `trpc.buyerPortal.getOverview`.

---

## 6. Feature flag

| Mechanism | Suggestion |
|-----------|------------|
| `BUYER_PORTAL_ENABLED` | `process.env.BUYER_PORTAL_ENABLED === "true"` in `server/_core/env.ts` |
| Client | `import.meta.env.VITE_BUYER_PORTAL_ENABLED` or mirror from server config endpoint — **simplest MVP:** same env in Vite build; document in `.env.example` |

**Behavior**

- **Server:** do not register `buyerPortalRouter` when false.
- **Client:** do not register `/buyer` routes; show 404 or redirect to `/dashboard` when false.

---

## 7. Placeholder UI

| Item | Detail |
|------|--------|
| `BuyerPortalLayout.tsx` | Minimal shell: header “Buyer Portal”, no `PlatformSidebarNav` full tree |
| `BuyerPortalPlaceholderPage.tsx` | Calls `trpc.buyerPortal.getOverview.useQuery({ customerAccountId })` — **requires** dev seed or query param for testing |
| `App.tsx` | Route `/buyer` (or `/buyer/overview`) wrapped in layout, **gated** by feature flag |

**Note:** `customerAccountId` source for MVP — **query param** `?account=` in dev only, or hardcoded after seed; **not** production UX.

---

## 8. PR checklist (must pass before merge)

- [ ] Migration applies cleanly (up/down if team uses).
- [ ] Drizzle types exported; no duplicate table names.
- [ ] `unique(customer_account_id, user_id)` enforced.
- [ ] Unit tests: `requireCustomerAccountMembership` — success / wrong user / wrong account / revoked `status`.
- [ ] Unit test: user with **both** company membership and buyer membership — buyer procedure **does not** use `companyId` from operating workspace for authorization.
- [ ] `BUYER_PORTAL_ENABLED=false` → router not registered; no client crash.
- [ ] `BUYER_PORTAL_ENABLED=true` → stub returns stub payload when membership valid.
- [ ] Docs: link from [`buyer-portal.md`](./buyer-portal.md) (migration path unchanged).

---

## 9. Security review prompts (before P2)

- Enumeration: use `NOT_FOUND` vs `FORBIDDEN` consistently for invalid `customerAccountId`.
- Rate limiting: `getOverview` (future) on public internet.
- Audit log: record `customerAccountId` + `userId` on sensitive actions (P2).

---

## 10. Related documents

- [`buyer-portal.md`](./buyer-portal.md) — Target architecture and roadmap.
- `server/_core/tenant.ts` — `requireActiveCompanyId` (**operating** scope only).
- `server/routers/clientPortal.ts` — **Same-tenant** contact portal (**do not** extend for buyer scope).
