# Provider UI spec — Customer Account Detail & invoice linking

**Status:** Wireframe / copy spec (implementation-ready)  
**Companion:** [`buyer-portal-provider-invoice-linking.md`](./buyer-portal-provider-invoice-linking.md) (API, guards, RBAC)  
**Last updated:** 2026-04-15

This document is **UI and copy only**. Behaviour must match the companion spec: **`company_admin`** or **`finance_admin`**, same-provider scoping, no duplicate buyer exposure for one invoice under the same provider.

---

## 1. Customer Account Detail page

### 1.1 Page title / route

- **Browser / shell title:** `Customer account · {displayName}` (or product default breadcrumb).
- **Page H1:** `{displayName}` (primary).
- **Optional sublabel:** `Customer account` (muted, above or beside H1).

### 1.2 Header (account summary)

Single card or top section, read-only in v1.

| Block        | Content |
|-------------|---------|
| **Name**    | `displayName` (required field from `customer_accounts`). |
| **Legal name** | `legalName` if present; else hide row or show em dash. |
| **Status**  | Badge: Draft / Active / Suspended / Closed (from `customer_accounts.status`). |
| **Contact** | `primary_contact_email`, `primary_contact_phone` when present; label rows clearly. |
| **Account owner** | Product choice: primary contact label **or** “Provider company” line showing operating company name (resolved from `provider_company_id`). If not available in v1, omit and add in follow-up. |
| **Internal IDs** | Optional collapsed “Details”: `customer_account_id`, provider company id — **dev/admin only** or hide in production if noisy. |

**Actions in header (v1):** none required except navigation back (e.g. “Back to customer accounts” if list exists).

### 1.3 Section: Linked invoices (core)

**Section title:** `Linked invoices`

**Helper text (below title):**

> Invoices you link here are visible to buyers who belong to this customer account in Buyer Portal. Unlink to remove visibility.

**Primary button (section toolbar, right-aligned on desktop):**

- **Label:** `Link invoice`
- **Visibility:** Only if user has `company_admin` or `finance_admin` (others: hide button or show disabled with tooltip “You don’t have permission to change buyer-visible invoices.”).

#### Table — columns

| Column           | Source / notes |
|------------------|----------------|
| **Invoice**      | `invoice_number` or stable reference from `pro_billing_cycles`. |
| **Period**       | Billing period (e.g. month/year from cycle fields). |
| **Amount**       | Amount + currency (e.g. OMR). |
| **Status**       | Cycle status (pending, paid, overdue, etc.). |
| **Linked**       | Optional: `created_at` of link row, short date. |
| **Actions**      | `Unlink` (text or icon + label); opens confirm dialog (see §3). |

**Sorting:** Default by period descending (newest first) or by invoice number — pick one and stay consistent.

**Row click:** No navigation required in v1; optional “Open in billing” deep link later.

#### Empty state

**When there are no linked rows:**

- **Title line (short):** `No invoices linked yet`
- **Body:**

  > Buyers will not see any billing lines for this account until you link invoices from your company’s billing.

- **Optional CTA:** Primary `Link invoice` (same as toolbar).

---

## 2. Link Invoice modal

### 2.1 Structure

**Modal title:** `Link invoice to this account`

**Helper text (under title):**

> Only invoices for your company can be linked. An invoice can only be linked to one customer account at a time.

### 2.2 Step A — Search / select invoice

**Pattern:** Searchable list or combobox (v1 can be minimal: search by invoice number / id with debounced query).

- **Search field placeholder:** `Search by invoice number or ID…`
- **Helper under field (muted):** `Shows invoices for your company that are not already linked to another customer account.`

**Each selectable row shows:**

| Field        | Notes |
|-------------|--------|
| **Invoice** | Reference / number (primary line, semibold). |
| **Period**  | Billing period. |
| **Amount**  | Amount + currency. |
| **Status**  | Badge or text. |

**Empty search results:**

> No matching invoices. Try another number or check billing.

**No linkable invoices (list empty):**

> There are no eligible invoices to link right now (for example, all may already be linked).

### 2.3 Step B — Confirm

After user selects one row:

**Summary block (read-only):**

- Invoice: `{reference}`
- Period: `{period}`
- Amount: `{amount} {currency}`
- Status: `{status}`

**Checkbox (optional but recommended for sensitivity):**

> I understand this invoice will become visible to buyers on this account.

**Primary button:** `Link invoice`  
**Secondary:** `Back` (return to search) or `Cancel` (close modal).

### 2.4 Success / error in modal

**On success:**

- Toast or inline success: `Invoice linked. Buyers on this account can see it in Buyer Portal.`
- Close modal; refresh linked table.

**On error:** See §4 (show message inline under summary or as banner).

---

## 3. Unlink confirmation

**Dialog title:** `Remove invoice from this account?`

**Body:**

> Buyers will no longer see this invoice in Buyer Portal for **{displayName}**. Billing data in your company is unchanged; only buyer visibility is removed.

**Bullets (optional, one line each):**

- Invoice: `{reference}`
- Period: `{period}`

**Actions:**

- **Destructive / primary:** `Remove link` (or `Unlink`)
- **Secondary:** `Cancel`

**Success (toast):** `Invoice unlinked from this account.`

---

## 4. Error messages (copy)

Use codes internally; **user-facing strings** below.

| Situation | User-facing message |
|-----------|---------------------|
| Invoice already linked **to this** account | `This invoice is already linked to this customer account.` |
| Invoice linked **to another** customer account (same provider) | `This invoice is already linked to another customer account. Unlink it there first, or choose a different invoice.` |
| Cross-company / wrong tenant | `This invoice doesn’t belong to your company.` or generic `Invoice not found.` (match NOT_FOUND policy). |
| Customer account not found or wrong provider | `This customer account wasn’t found or you don’t have access.` |
| Permission denied | `You don’t have permission to change buyer-visible invoices.` |
| Invoice not found | `That invoice wasn’t found.` |
| Duplicate link (DB race) | `This invoice is already linked.` |
| Network / unknown | `Something went wrong. Try again.` |

**Validation (client-side, before submit):**

- Missing selection: `Select an invoice to link.`
- Missing account context: Should not happen; if so: `Customer account is missing. Refresh the page.`

---

## 5. Non-UI rules (reminder)

- No linking from Buyer Portal (provider-only).
- No bulk link in v1.
- No auto-link from contracts in v1.

---

## Related docs

- [`buyer-portal-provider-invoice-linking.md`](./buyer-portal-provider-invoice-linking.md) — API, RBAC, validation  
- [`buyer-portal.md`](./buyer-portal.md) — Buyer Portal architecture  
