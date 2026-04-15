# Provider-side Customer Account — Invoice Linking Control

**Status:** Implementation spec (next PR after buyer-scoped `listInvoices`)  
**Audience:** Engineering, product  
**Last updated:** 2026-04-15

---

## 1. Purpose

Operating-company users (e.g. Falcon Eye) must **control which `pro_billing_cycles` rows appear in Buyer Portal** for each external **customer account**, without SQL or ad-hoc tooling. Visibility is already enforced by **`customer_invoice_links`** + buyer guards; this PR adds **provider-side CRUD** for those links only.

---

## 2. User personas

| Persona | Need |
|---------|------|
| **Company owner / admin** | Full control over which buyers see which invoices; audit who is exposed. |
| **Finance manager** | Day-to-day linking/unlinking aligned with billing and collections. |
| **Operations / account manager** (optional later) | May need read-only list of links or delegated link—**out of first PR** unless product insists. |

---

## 3. Allowed roles / RBAC (decision)

**First PR — allow:**

| Role | Link / unlink |
|------|-----------------|
| **`company_admin`** | Yes |
| **`finance_admin`** | Yes |

**Deny (first PR):** `hr_admin`, `company_member`, `client`, `external_auditor`, `reviewer`, portal-only shells.

**Justification:** Linking is a **commercial / receivables exposure** decision, same class as billing and collections. HR-only roles must not change buyer-visible financials. Keep the matrix small to ship fast; extend with `operations_manager` or `account_manager` **after** audit and permission keys exist.

**Server guard:** Resolve **`companyId`** with **`requireActiveCompanyId`** (existing tenant pattern); verify **`customer_accounts.provider_company_id === companyId`** and **`pro_billing_cycles.company_id === companyId`** on every mutation and list.

---

## 4. Main workflows

1. **List links for one customer account** — Provider opens an account; sees table of linked invoice IDs / references (read-only list from join to `pro_billing_cycles`).
2. **Link one invoice** — Choose an invoice (by id or search) that belongs to the same `companyId` and is not already linked to another account for the same row (DB unique is per `(customer_account_id, invoice_id)`; **same invoice must not be linked to two buyer accounts** — enforce in API).
3. **Unlink** — Remove row from `customer_invoice_links` when business says to hide from buyer.

**Deferred:** bulk-from-contract, bulk CSV, buyer self-request, history/audit table (use existing audit if available in a follow-up).

---

## 5. Screens / entry points (decision)

**Recommendation for first PR: Customer Account detail page as the primary (and only) screen.**

| Option | Pros | Cons |
|--------|------|------|
| **Customer Account detail only** | One place to manage “what this buyer sees”; natural mental model; smallest UI. | Need a minimal “account” page or section if none exists yet. |
| **Invoice page only** | Familiar from billing UI. | Harder to see “everything exposed to Samsung” in one glance. |
| **Both** | Flexible. | Two surfaces to build, test, and keep consistent in one PR — **violates small PR**. |

**Second PR (recommended):** Add **“Linked customer accounts”** (or “Buyer visibility”) on **invoice / billing detail** as a shortcut: same mutations, deep-link to account context pre-filled.

**First PR scope:** **Customer Account detail (or a dedicated `/company/customer-accounts/:id` stub)** + link list + link/unlink actions only.

---

## 6. API / mutation shapes (tRPC, provider router)

Add procedures under an **existing or new provider router** (e.g. `companies` or `billing` or new `customerAccountsRouter`). Namespace suggestion: **`customerAccounts`** on the app router to keep boundaries clear.

```ts
// List links for an account (provider)
listInvoiceLinks: protectedProcedure
  .input(z.object({
    companyId: z.number().int().positive().optional(), // multi-tenant; required when ambiguous
    customerAccountId: z.number().int().positive(),
  }))
  .query(/* ... */);

// Link one PRO billing cycle to a customer account
linkInvoiceToCustomerAccount: protectedProcedure
  .input(z.object({
    companyId: z.number().int().positive().optional(),
    customerAccountId: z.number().int().positive(),
    invoiceId: z.number().int().positive(), // pro_billing_cycles.id
  }))
  .mutation(/* ... */);

unlinkInvoiceFromCustomerAccount: protectedProcedure
  .input(z.object({
    companyId: z.number().int().positive().optional(),
    customerAccountId: z.number().int().positive(),
    invoiceId: z.number().int().positive(),
  }))
  .mutation(/* ... */);
```

**Optional for first PR:** `listLinkableInvoices` (paginated search of `pro_billing_cycles` for `companyId` **excluding** rows already linked to **any** customer account, or only excluding same account — product choice; **minimal:** client passes `invoiceId` from existing billing UI copy-paste or internal invoice picker in phase 2).

---

## 7. Validation and guard rules

1. **Caller** must be **`company_admin`** or **`finance_admin`** on **`input.companyId`** (resolved active workspace).
2. **`customer_accounts.id`** must exist and **`customer_accounts.provider_company_id === companyId`**.
3. **`pro_billing_cycles.id`** must exist and **`pro_billing_cycles.company_id === companyId`**.
4. **Uniqueness:** `(customer_account_id, invoice_id)` — on link insert, catch duplicate; return `CONFLICT` or clear `BAD_REQUEST`.
5. **No double buyer exposure (recommended):** Before insert, if `invoice_id` is already linked to **another** `customer_account_id` where `customer_accounts.provider_company_id = companyId`, **reject** (unless product explicitly wants one invoice visible to multiple buyers — rare for PRO cycles). **Justification:** avoids ambiguous collections and buyer confusion.
6. **Unlink:** Same triple check; delete only if link row matches account + invoice belongs to `companyId`.
7. **Responses:** Use `NOT_FOUND` for cross-tenant or invalid ids where enumeration is a concern; otherwise `FORBIDDEN` / `BAD_REQUEST` with clear messages.

---

## 8. UX notes

**Detailed UI wireframe, copy, and empty/error strings:** [`buyer-portal-provider-linking-ui-spec.md`](./buyer-portal-provider-linking-ui-spec.md).

- Show **invoice reference** (`invoice_number` or label), **amount**, **status**, **billing period** in the link table.
- **Confirm** before unlink: “Buyer will no longer see this invoice.”
- **Empty state:** “No invoices linked — buyers will not see billing lines for this account until you link PRO invoices.”
- **Feature flag (optional):** Reuse **`BUYER_PORTAL_ENABLED`** or add **`CUSTOMER_ACCOUNT_LINKING_ENABLED`** if you want to ship UI behind flag; not required if entire buyer portal is already flagged.

---

## 9. Non-goals (this PR)

- Buyer-facing UI or API changes.
- **Payments**, **approvals**, **contracts**, **messages**, subscription invoices (unless explicitly extending link semantics).
- **Bulk link from contract** (see §10).
- **Customer account create/edit** (assume accounts exist or add minimal `createCustomerAccount` only if blocking — prefer seed / admin script for first dogfood).

---

## 10. Recommended first PR scope (mergeable)

| Include | Skip |
|---------|------|
| `listInvoiceLinks`, `linkInvoiceToCustomerAccount`, `unlinkInvoiceFromCustomerAccount` with guards above | Bulk link from contract |
| One **provider** page: **customer account detail** with link table + “Link by invoice ID” (numeric input or small modal) + unlink | Invoice detail widget |
| Unit/integration tests: happy path, wrong `companyId`, duplicate link, invoice already linked elsewhere | Full searchable invoice picker |
| Reuse **`customer_invoice_links`** only | New tables |

**Bulk link (decision):** **Not in first PR.** Justification: requires contract→invoice mapping rules and more UX; **single link by `invoice_id`** proves the same guards and DB constraints end-to-end.

**Summary table**

| Decision | Choice |
|----------|--------|
| First UI entry | **Customer account detail (provider)** |
| Roles | **`company_admin`**, **`finance_admin`** |
| Bulk | **No** — single link/unlink first |

---

## Related docs

- [`buyer-portal.md`](./buyer-portal.md) — Buyer Portal architecture  
- [`buyer-portal-foundation-spec.md`](./buyer-portal-foundation-spec.md) — Schema foundation  
- `server/buyer/buyerInvoices.ts` — Buyer-scoped read query (consumer of `customer_invoice_links`)
