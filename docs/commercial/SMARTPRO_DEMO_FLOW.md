# SmartPRO — Demo Flow & Persona Guide

> Last updated: 2026-04-24  
> Audience: Sales, Pre-sales, Customer Success  
> Environment: Demo tenant (isolated, pre-seeded)

---

## Overview

This document defines the five standard demo personas and the guided walk-through flow used when demonstrating SmartPRO to prospective clients in Oman.

Demo tenant: **Al Noor Gulf LLC** (fictional)  
Package: **Business** (modules: hr, payroll, finance, documents, contracts, compliance)  
Company size: 45 employees, mixed Omani/expat, Muscat HQ  
Omanization target: 35%

---

## 1. Demo Personas

### 1.1 Platform Admin (Super Admin)

| Field | Value |
|---|---|
| Name | Ahmed Al-Rashdi |
| Email | `ahmed.admin@smartpro.demo` |
| Role | `super_admin` (platform-level) |
| Access | Full platform — all companies, all modules, system settings |
| Package tier | N/A (platform operator, not a company member) |

**What this persona demonstrates:**
- Company management dashboard (create, suspend, configure companies)
- Subscription plan assignment and module gating
- Platform-level user management and 2FA enforcement
- Audit log viewer (all companies, all events)
- System health and billing overview

**Key demo steps:**
1. Log in as `ahmed.admin@smartpro.demo` → lands on `/platform-admin`
2. Show the company list — Al Noor Gulf LLC is active on Business tier
3. Click into Al Noor → show `package: "business"` and derived `enabledModules: ["hr","payroll","finance","documents","contracts","compliance"]`
4. Navigate to Audit Logs → show capability change events (who changed what, when)
5. Demonstrate 2FA enforcement: try to disable MFA → blocked by `assertPlatformAdminMfaEnabled`
6. Show package selector: switch Al Noor to **Starter** → system sets `enabledModules: ["hr","documents","contracts"]` — Finance/Payroll/Compliance tabs disappear for company members. Switch back to Business to restore. This is the live "module gating driven by package" moment.

---

### 1.2 Company HR Admin

| Field | Value |
|---|---|
| Name | Fatma Al-Balushi |
| Email | `fatma.hr@alnoor.demo` |
| Role | `hr_admin` (company member of Al Noor Gulf LLC) |
| Capabilities | view_hr, manage_hr, view_reports, approve_tasks, view_documents |
| Package tier | Business |

**What this persona demonstrates:**
- Employee onboarding and profile management
- Leave request approval workflow
- Attendance tracking and correction
- HR letter generation (salary certificate, NOC, experience letter) — Arabic + English
- Omanization ratio dashboard
- Document vault (employee files, contracts)
- Task approval queue

**Key demo steps:**
1. Log in as `fatma.hr@alnoor.demo` → lands on `/hr/employees`
2. Show employee list — 45 employees with Omani/expat breakdown
3. Open a leave request → approve it (triggers `approve_tasks` capability check)
4. Generate a salary certificate in Arabic → download PDF
5. Show Omanization ratio: current 31%, target 35% — system flags as at-risk
6. Navigate to Documents → upload an employee file, set expiry reminder
7. Try to access `/payroll` → blocked (capability check: `view_payroll` not in hr_admin defaults)  
   *(Shows the role boundary clearly)*
8. Show the HR module nav items — Finance and Compliance tabs are **visible but access-controlled** (module is enabled, but role lacks capability)

---

### 1.3 Company Finance Admin

| Field | Value |
|---|---|
| Name | Khalid Al-Mawali |
| Email | `khalid.finance@alnoor.demo` |
| Role | `finance_admin` (company member of Al Noor Gulf LLC) |
| Capabilities | view_payroll, edit_payroll, view_finance, view_executive_summary, view_reports |
| Package tier | Business |

**What this persona demonstrates:**
- Payroll run (WPS-ready)
- PASI contribution calculation
- Finance dashboard (P&L, cost centres, executive KPIs)
- Pay-slip generation in Arabic
- Compliance module: MoL workforce summary, Sanad expat quota status
- External auditor provisioning

**Key demo steps:**
1. Log in as `khalid.finance@alnoor.demo` → lands on `/payroll`
2. Start a payroll run for the current month:
   - System auto-calculates PASI deductions for Omani nationals
   - Flags 2 employees with missing bank IBAN
   - Generates WPS file for Bank Muscat
3. Navigate to `/finance/overview` → show executive KPI dashboard
   - Headcount cost breakdown, Omanization cost premium, monthly payroll trend
4. Navigate to `/sanad` (Compliance module) → show Sanad expat quota: 12 expats, 3 renewal due
5. Navigate to `/workforce` → show MoL compliance status: "Warning" (1 expired labour card)
6. Demonstrate provisioning an external auditor:
   - Invite `auditor@kpmg.om` with role `external_auditor`
   - Show which capabilities are auto-assigned (read-only payroll, finance, reports)
7. Try to access `/hr/employees` → accessible (view_hr not in finance_admin defaults — demo shows the boundary)

---

### 1.4 Client Workspace User

| Field | Value |
|---|---|
| Name | Sara Al-Hinai |
| Email | `sara.client@vision-consult.demo` |
| Role | `client` (company member of Al Noor Gulf LLC — external client) |
| Capabilities | (none by default — scoped to contractor workspace) |
| Package tier | Business |

**What this persona demonstrates:**
- Contractor/client self-service portal
- Quotation review and approval
- Contract signing workflow
- Document access (shared documents only)
- Service request submission

**Key demo steps:**
1. Log in as `sara.client@vision-consult.demo` → lands on `/client/portal`
2. Show the scoped view — no HR, no payroll, no finance tabs visible (module+capability gating)
3. Open a pending quotation from Al Noor → review line items, approve
4. Navigate to `/contracts` → 2 active contracts, 1 pending signature
5. E-sign a contract → audit trail shows `sara.client@vision-consult.demo` signed at timestamp
6. Download a shared document from the document vault (Al Noor shared it explicitly)
7. Submit a service request (new project scope) → HR admin receives notification

**Talking point:** "The client never sees your internal payroll, HR records, or finance data — they only see what you explicitly share with them."

---

### 1.5 External Auditor

| Field | Value |
|---|---|
| Name | Mohammed Al-Farsi |
| Email | `m.alfarsi@kpmg.demo` |
| Role | `external_auditor` (company member of Al Noor Gulf LLC) |
| Capabilities | view_payroll, view_reports, view_finance, view_executive_summary, view_hr, view_contracts, view_compliance |
| Package tier | Business |

**What this persona demonstrates:**
- Read-only access to financial and HR records
- Payroll history review
- Compliance status visibility
- Audit-trail export
- No write access (no `edit_payroll`, `manage_hr`, etc.)

**Key demo steps:**
1. Log in as `m.alfarsi@kpmg.demo` → lands on `/reports`
2. Show payroll summary for last 3 months — read only, no "Run Payroll" button visible
3. Navigate to `/finance/overview` → full executive KPI view (view_executive_summary granted)
4. Navigate to `/hr/employees` → can view employee list, cannot edit
5. Navigate to `/sanad` → compliance status readable, no edit actions
6. Export a payroll report to Excel for audit workpapers
7. Try to click "Edit Employee" → button hidden (capability check: `manage_hr` not present)
8. Navigate to audit log — can see all changes made to payroll records with timestamps and actor names

**Talking point:** "Your auditors get a dedicated read-only seat — no shared passwords, full traceability of every action."

---

## 2. Full Demo Run Order (45-minute session)

| Time | Persona | Section | Goal |
|---|---|---|---|
| 0:00 – 5:00 | — | Intro & context | Set scene: Al Noor Gulf LLC, 45 employees, Oman SME |
| 5:00 – 12:00 | Platform Admin | Company setup | Show package assignment, module gating, audit log |
| 12:00 – 22:00 | HR Admin | HR workflow | Employee management, leave approval, letters, Omanization |
| 22:00 – 32:00 | Finance Admin | Payroll + Finance | Payroll run, WPS, PASI, finance KPIs, Sanad |
| 32:00 – 38:00 | Client | Client portal | Scoped access, quotation, contract signing |
| 38:00 – 43:00 | External Auditor | Audit review | Read-only view, report export, no write access |
| 43:00 – 45:00 | — | Q&A / pricing | Hand to pricing sheet, close next step |

---

## 3. Demo Environment Setup

### Seed data required

The demo tenant should be pre-seeded with:

```
Company: Al Noor Gulf LLC
  slug: al-noor-gulf-demo
  country: OM
  city: Muscat
  package: "business"
  enabledModules: ["hr","payroll","finance","documents","contracts","compliance"]
  subscriptionPlanId: → Business plan (slug: "business")
  omanizationTarget: 35.00
  molComplianceStatus: warning

Users (platform):
  ahmed.admin@smartpro.demo  → super_admin

Company members:
  fatma.hr@alnoor.demo       → hr_admin
  khalid.finance@alnoor.demo → finance_admin
  sara.client@vision-consult.demo → client
  m.alfarsi@kpmg.demo        → external_auditor

Employees: 45 (30 expat, 15 Omani)
  - Mix of departments: Admin (5), Engineering (20), Operations (15), Sales (5)
  - 3 employees with expired documents (triggers compliance warning)
  - 2 employees with missing IBAN (triggers payroll warning)
  - 1 employee with expired labour card (triggers MoL warning)

Payroll: 3 months of historical payroll runs
Contracts: 3 active, 1 pending signature (Sara's quotation)
Documents: 12 company documents, 2 shared with client role
```

### Module gating demo

To demonstrate gating live during the demo, the Platform Admin can:
1. Switch Al Noor from **Business** → **Starter** (system sets `package: "starter"`, `enabledModules: ["hr","documents","contracts"]`)
2. Finance Admin refreshes — Payroll, Finance, and Compliance tabs disappear from sidebar
3. Switch back to **Business** (`package: "business"`, `enabledModules: [...]`) — tabs return immediately (no page reload required after token refresh)
4. This single action demonstrates the commercial value of upgrading a plan

---

## 4. Objection Handling

| Objection | Response |
|---|---|
| "Is this compliant with Oman's data protection law?" | All data is stored on servers in the GCC region. Role-based access ensures only authorised personnel see sensitive data. Audit logs capture every access event. |
| "We already use Excel for payroll" | SmartPRO generates the WPS file Bank Muscat and other Omani banks accept directly — no manual re-entry. PASI deductions are auto-calculated. |
| "We're too small for this" | Starter plan at OMR 45/month replaces a part-time HR admin cost. Setup takes one afternoon. |
| "Can we integrate with our existing accounting software?" | Enterprise tier includes API access. Professional/Business tiers can export to Excel/CSV for import into Sage or QuickBooks. |
| "What happens to our data if we cancel?" | You can export all data in standard formats (CSV, PDF) at any time. Data is retained for 90 days post-cancellation, then deleted. |

---

## 5. Next Steps After Demo

1. Share [SMARTPRO_PACKAGING_AND_PRICING.md](./SMARTPRO_PACKAGING_AND_PRICING.md) with the prospect
2. Identify their headcount and primary pain point → recommend tier
3. Offer 14-day free trial on Professional (no credit card)
4. Book onboarding call if they proceed — covers data import and 2-session training
5. Log the prospect in CRM under the account manager's pipeline

---

## 6. Technical Guardrails (Demo-specific)

- Demo tenant must be isolated from production — separate DB or schema prefix `demo_`
- Demo credentials must be rotated monthly
- No real employee data in demo tenant
- Platform Admin demo user must have 2FA enabled (enforced by `assertPlatformAdminMfaEnabled`)
- All demo actions are audit-logged — review monthly to detect unauthorised access
