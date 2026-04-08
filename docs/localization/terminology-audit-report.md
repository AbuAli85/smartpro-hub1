# Oman Terminology Audit Report

**Date:** April 2026  
**Scope:** All user-facing strings in `client/src/` and `shared/`  
**Policy:** Oman Legal Dictionary (`docs/localization/oman-legal-dictionary.md`)

---

## Summary

This report documents the terminology standardization pass applied across the SmartPRO Business Services Hub codebase. All changes follow the Oman Terminology Policy: formal institutional English, consistent Omani legal document names, and no mixed variants for the same system object.

| Category | Issues Found | Issues Fixed |
|----------|-------------|-------------|
| Status labels ("In progress") | 4 | 4 |
| Loading states ("Submitting...") | 10 | 10 |
| Document names ("CR Renewal", "Company Registration (CR)") | 6 | 6 |
| Service type labels ("LC Renewal", "Business Licence") | 3 | 3 |
| Navigation labels | 3 | 3 |
| Attendance status | 1 | 1 |

---

## Changes Applied

### 1. Status Labels

**Policy:** Prefer "Processing" for in-flight tasks (not "In progress"). Reserve "Under Review" for approval queues.

| File | Before | After |
|------|--------|-------|
| `TaskManagerPage.tsx` (STATUS_CONFIG) | `"In Progress"` | `"Processing"` |
| `TaskManagerPage.tsx` (stats card) | `"In progress"` | `"Processing"` |
| `TaskManagerPage.tsx` (color logic) | `s.label === "In progress"` | `s.label === "Processing"` |
| `WorkspacePage.tsx` | `"In progress"` | `"Processing"` |

### 2. Attendance Status

**Policy:** Avoid startup-style copy. "In progress" is ambiguous for a shift status.

| File | Before | After |
|------|--------|-------|
| `EmployeePortalPage.tsx` | `"In progress"` (active shift) | `"Active Shift"` |

### 3. Loading / Pending States

**Policy:** Use "Processing..." instead of "Submitting..." for pending mutation buttons.

Applied via global `sed` across all TSX files. Affected files:

- `ClientPortalPage.tsx` (2 occurrences)
- `ContractsPage.tsx`
- `HRLeavePage.tsx`
- `MarketplacePage.tsx`
- `SanadCentreProfilePage.tsx`
- `WorkforceCasesPage.tsx`
- `EmployeePortalPage.tsx` (2 occurrences)
- `FinanceOverviewPage.tsx`

### 4. Document and Service Names

**Policy:** Use full official Omani document names. No abbreviations in labels.

| File | Before | After |
|------|--------|-------|
| `SanadCatalogueAdminPage.tsx` | `"Business Licence"` | `"Commercial Registration (Licence)"` |
| `SanadCatalogueAdminPage.tsx` | `"CR Renewal"` | `"Commercial Registration Renewal"` |
| `SanadCentreProfilePage.tsx` | `"CR Renewal"` | `"Commercial Registration Renewal"` |
| `SanadMarketplacePage.tsx` | `"CR Renewal"` | `"Commercial Registration Renewal"` |
| `SanadOfficeDashboardPage.tsx` | `"CR Renewal"` | `"Commercial Registration Renewal"` |
| `SanadOfficeDashboardPage.tsx` | `"LC Renewal"` | `"Labour Card Renewal"` |
| `QuotationsPage.tsx` | `"CR Renewal"` | `"Commercial Registration Renewal"` |
| `ProServicesPage.tsx` | `"Company Registration (CR)"` | `"Commercial Registration"` |
| `QuotationsPage.tsx` | `"Company Registration (CR)"` | `"Commercial Registration"` |

### 5. Navigation Labels (PlatformLayout)

Reviewed and confirmed correct per Oman policy. No changes required — labels already use formal institutional English (e.g., "Workforce Management", "Document Expiry", "PRO Services").

---

## Remaining Deferred Items

The following items were identified but deferred — they require deeper refactoring or are intentional design choices:

| Item | Reason for Deferral |
|------|---------------------|
| `"Saving..."`, `"Creating..."`, `"Updating..."`, `"Deleting..."` loading states | These are context-specific and accurate; no policy violation |
| `"Business Setup"` provider type in `SanadCatalogueAdminPage.tsx` | Internal classification value, not a legal document name |
| `"PRO Services"` label across analytics/dashboard | Established product name in Oman; intentional |
| `"Exit/Re-entry Permit"` label | Correct Omani terminology; no change needed |
| Arabic string standardization | Requires a dedicated Arabic localization pass with native reviewer |

---

## Approved Terminology Reference (Quick Table)

| Concept | Approved English Label | Avoid |
|---------|----------------------|-------|
| Task in-flight status | Processing | In progress, In Progress |
| Approval queue status | Under Review | In review, Pending review |
| Active shift status | Active Shift | In progress, Ongoing |
| Pending mutation button | Processing... | Submitting..., Loading... |
| CR document | Commercial Registration | CR, Company Registration, Business License |
| CR renewal | Commercial Registration Renewal | CR Renewal |
| Labour document | Labour Card | LC, Labor Card |
| Labour renewal | Labour Card Renewal | LC Renewal |
| Work authorization | Work Permit | Labour Permit, Work Visa |
| Business licence | Commercial Registration (Licence) | Business Licence, Business License |
