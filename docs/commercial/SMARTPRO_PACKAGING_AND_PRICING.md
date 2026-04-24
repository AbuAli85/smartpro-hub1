# SmartPRO — SaaS Packaging & Pricing (Oman Market)

> Last updated: 2026-04-24  
> Audience: Sales, Account Management, Platform Operations  
> Currency: Omani Rial (OMR). All prices exclusive of VAT (5%).

---

## 1. Package Overview

| | **Starter** | **Professional** | **Business** | **Enterprise** |
|---|---|---|---|---|
| **Target** | SME < 20 staff | 20–100 employees | 50–300 employees | 300+ / multi-branch |
| **Monthly price (OMR)** | 45 – 75 | 120 – 180 | 280 – 450 | From 600 (custom) |
| **Annual price (OMR/mo)** | 38 – 64 | 102 – 153 | 238 – 382 | Custom |
| **Onboarding fee (OMR)** | 150 – 250 | 350 – 500 | 750 – 1,200 | 2,000+ |
| **Included users** | Up to 10 | Up to 50 | Up to 200 | Unlimited |
| **SLA** | Best effort | Business hours | 4 h response | Dedicated CSM |
| **Free trial** | 14 days | 14 days | 14 days | POC (scoped) |

Annual billing offers **15% discount** on the monthly rate.

---

## 2. Module Mapping

Modules correspond 1:1 to `CompanyModule` keys in `shared/capabilities.ts`.  
`null` means all modules are active (Enterprise — no gating applied).  
The `companies.package` column stores the assigned tier; `companies.enabledModules` stores the derived module list.

```typescript
// shared/capabilities.ts
export const PACKAGE_ENABLED_MODULES: Record<CompanyPackage, CompanyModule[] | null> = {
  starter:      ["hr", "documents", "contracts"],
  professional: ["hr", "payroll", "documents", "contracts"],
  business:     ["hr", "payroll", "finance", "documents", "contracts", "compliance"],
  enterprise:   null, // all modules
};
```

### Module availability by tier

| Module | Starter | Professional | Business | Enterprise |
|---|:---:|:---:|:---:|:---:|
| **HR** (employees, leave, attendance, tasks) | ✓ | ✓ | ✓ | ✓ |
| **Documents** (vault, templates, letters) | ✓ | ✓ | ✓ | ✓ |
| **Contracts** (NDAs, service agreements, quotations) | ✓ | ✓ | ✓ | ✓ |
| **Payroll** (run, WPS, PASI) | — | ✓ | ✓ | ✓ |
| **Finance** (P&L, executive KPIs, cost centres) | — | — | ✓ | ✓ |
| **Compliance** (Sanad, MoL, PRO, Omanization) | — | — | ✓ | ✓ |
| **CRM** (client pipeline, service requests) | — | — | — | ✓ |
| **Marketplace** (internal vendor catalogue) | — | — | — | ✓ |

---

## 3. Feature Details per Tier

### 3.1 Starter — OMR 45–75 / month

**Ideal for:** Small trading companies, retail shops, sole proprietorships, and micro-businesses with < 20 staff who need to formalise their HR and start managing agreements.

**Included:**
- Employee profiles (up to 10 users)
- Leave requests & balance tracking (annual, sick, emergency — Oman Labour Law defaults)
- Attendance records
- Task approval workflows
- Document vault (5 GB storage)
- HR letter generation (experience, salary, NOC) — Arabic + English
- Basic contracts: NDAs, service agreements, quotations
- Mobile-friendly employee self-service portal

**Not included:** Payroll processing, WPS/PASI export, finance dashboards, compliance tools.

**Why Contracts in Starter?**  
Even the smallest Omani SME issues service agreements and NDAs. Including Contracts makes Starter a genuinely usable product day one — not just a demo tier.

**Typical clients:** A Muscat trading company with 8–15 Omani + expat staff, a small consultancy that needs HR + basic agreements but processes payroll through their accountant.

---

### 3.2 Professional — OMR 120–180 / month ⭐ Recommended

**Ideal for:** Growing businesses (20–100 employees) where WPS compliance and payroll automation are the primary pain point. The main upsell target from Starter.

**Includes everything in Starter, plus:**
- Payroll processing (WPS-ready export, PASI deduction calculation)
- Pay-slip generation — Arabic + English
- 25 GB storage

**Key selling points for Oman:**
- WPS (Wage Protection System) compliance out of the box — mandatory for > 6 employees
- PASI contribution auto-calculation for Omani nationals
- Arabic payslip and MoL-standard letter templates
- Omanization ratio tracking at company level

**Payroll is here, not in Business — why?**  
WPS is a legal obligation in Oman for any company with more than 6 employees. Putting payroll in Business would force Professional-tier clients to break the law or maintain a parallel system. Payroll stays in Professional.

**Typical clients:** An engineering consultancy in Ruwi with 35 staff, a Muscat-based logistics firm needing compliant payroll + contracts.

---

### 3.3 Business — OMR 280–450 / month

**Ideal for:** Finance-heavy companies, construction contractors, oil-field services, and companies under MoL compliance scrutiny (50–300 employees).

**Includes everything in Professional, plus:**
- Finance module (P&L dashboards, executive KPIs, cost centres)
- Compliance module: Sanad portal integration, MoL workforce management, PRO tracking
- Multi-role access (independent finance_admin + hr_admin)
- Advanced audit log (all capability + module changes recorded)
- External auditor role with read-only finance/payroll access
- 100 GB storage
- Quarterly account review call

**Key selling points for Oman:**
- Sanad expat quota and visa renewal tracking
- MoL compliance status dashboard (compliant / warning / non-compliant)
- Omanization ratio enforcement and board-level reporting
- Dedicated external auditor seat for Big 4 / chartered accountants

**Typical clients:** A construction company in Sohar with 120 employees (heavy expat workforce), an oil-services firm needing MoL compliance + payroll + finance in one platform.

---

### 3.4 Enterprise — From OMR 600 / month (custom)

**Ideal for:** Large corporations, multi-branch groups, Sanad network operators, government-adjacent organisations, companies needing custom integrations.

**All modules enabled — no gating (`enabledModules: null`):**
- Everything in Business
- CRM (client pipeline, service requests, opportunity management)
- Marketplace (internal vendor catalogue, RFQ flow)
- Unlimited users
- Multi-branch / multi-company configuration
- Dedicated account manager (CSM)
- Custom onboarding and data migration
- API access + webhook support
- Custom SLA (99.5% uptime guarantee, named escalation path)
- Unlimited storage

**Key selling points for Oman:**
- Multi-branch management under one platform admin
- Government-adjacent compliance (OCCI, municipality, labour card)
- Custom Arabic/English board-level reporting
- Integration with existing ERP or payroll systems (Sage, SAP, QuickBooks)

**Typical clients:** A Sanad-licensed company with 500+ workforce across multiple governorates; a group holding company managing 3 subsidiaries; a large financial institution needing full HR + compliance.

---

## 4. Trial Strategy

| Tier | Trial | Terms |
|---|---|---|
| Starter | 14 days full access | No credit card required |
| Professional | 14 days full access | No credit card required |
| Business | 14 days full access | Sales-assisted setup call included |
| Enterprise | Scoped POC (30 days) | Requires NDA + signed scope doc |

**Trial to paid conversion flow:**
1. Trial auto-expires — company is downgraded to read-only (data preserved, no deletion)
2. Sales receives notification at day 10 to trigger follow-up call
3. Conversion: account manager assigns package → `getEnabledModulesForPackage(pkg)` runs → modules activate immediately

---

## 5. Onboarding Strategy

| Tier | Session 1 | Session 2 | Data migration | Support |
|---|---|---|---|---|
| Starter | 90-min remote setup (HR + Contracts) | Employee bulk import | CSV template provided | Email |
| Professional | 90-min remote setup | Payroll config + WPS test run | CSV + Excel import | Email + live chat |
| Business | Half-day on-site (optional) | Compliance setup + auditor provisioning | Full data migration scoped separately | Phone + priority email |
| Enterprise | Custom onboarding plan | Multiple sessions, all modules | Full migration + integration | Dedicated CSM |

**Data migration pricing (add-on):**
- Basic CSV import (employees, leave balances): OMR 300
- Legacy system migration (Bayzat, Mena, custom Excel): OMR 500 – 800
- Full ERP integration mapping: quoted separately

---

## 6. Add-ons & Upsell Logic

| Add-on | Price | Available from |
|---|---|---|
| Extra 100 GB storage | OMR 12 / month | Starter+ |
| Additional user block (+10 users) | OMR 15 / month | Starter+ |
| WPS batch export (one-time setup) | OMR 100 | Professional (included) |
| External auditor seat | OMR 25 / seat/month | Professional+ |
| Data migration (CSV) | OMR 300 | Any |
| Data migration (legacy system) | OMR 500 – 800 | Any |
| Custom Arabic report template | OMR 150 / template | Business+ |
| Priority support (4 h SLA) | OMR 60 / month | Starter / Professional |
| Additional branch | OMR 150 / month | Business+ |

### Upsell triggers

- **Starter → Professional:** Company reaches 15+ employees and needs WPS payroll. Trigger: finance team asks "can we do payroll here?"
- **Professional → Business:** Finance team wants P&L dashboard, or MoL compliance tracking becomes urgent (Omanization audit, Sanad renewal).
- **Business → Enterprise:** Company opens a second branch, requests API integration, or needs CRM for client pipeline management.

---

## 7. Technical Implementation

### Storing the package

The `companies.package` column (added in migration 0080) stores the tier key.  
On plan assignment or upgrade, call `getEnabledModulesForPackage` and persist both fields atomically:

```typescript
import { getEnabledModulesForPackage, type CompanyPackage } from "@/shared/capabilities";

const pkg: CompanyPackage = "professional";
await db.update(companies)
  .set({
    package: pkg,
    enabledModules: getEnabledModulesForPackage(pkg),
  })
  .where(eq(companies.id, companyId));
// Audit log this change — package + module transitions are billing events
```

`null` package = legacy / manually-configured company — treat as Enterprise semantics for module gating.

### Technical guardrails

1. Every new module declares a `CompanyModule` key in `shared/capabilities.ts > MODULE_KEYS`.
2. Every sensitive API route calls `requireCapableMembership` — bare role checks are insufficient.
3. Every nav item declares module/capability visibility through `clientNavItemVisible()` in `shared/clientNav.ts`.
4. Every package/module change is audit-logged.
5. `PACKAGE_ENABLED_MODULES` is the single source of truth — never hard-code module lists elsewhere.
6. `DEFAULT_COMPANY_CONFIG.enabledModules = null` means Enterprise semantics. Never set to `[]`.

---

## 8. Oman Market Notes

### Pricing rationale
- Starter at OMR 45–75 is competitive vs. manual Excel + accountant fees (accountant charges OMR 100–200/month minimum).
- Professional at OMR 120–180 undercuts Bayzat equivalent tiers by ~20% and is cheaper than a part-time HR assistant.
- Business at OMR 280–450 competes with hiring an in-house HR officer (OMR 350–500/month minimum salary).
- Enterprise is custom — justified by dedicated CSM, API access, and compliance depth.

### Mandatory compliance context
- **WPS** (Wage Protection System): Mandatory for all companies with > 6 employees. Professional tier covers this — do not move payroll above Professional.
- **PASI** (Public Authority for Social Insurance): Mandatory Omani national contributions. Calculated in payroll module.
- **Sanad**: Government-run expat fee collection and quota system. Compliance module tracks this.
- **MoL** (Ministry of Labour): Workforce reporting, Omanization ratios, labour card management. Compliance module.
- **OCCI** (Oman Chamber of Commerce): CR number stored on company profile — all tiers.

### Contract terms
- Monthly billing: no lock-in after month 1.
- Annual contracts: 15% discount, 30-day cancellation notice required.
- Onboarding fee: non-refundable, covers data import + 2 training sessions.
- Trial: 14-day free, no credit card required (Starter/Professional/Business).

---

## 9. Roadmap Considerations

| Priority | Item | Target tier |
|---|---|---|
| High | WPS file export (MUSCAT/SOHAR/BARKA bank variants) | Professional+ |
| High | PASI XML export for bulk upload | Professional+ |
| High | In-app plan upgrade/downgrade UI (Platform Admin) | All |
| Medium | Sanad API live integration (quota deduction) | Business+ |
| Medium | MoL e-Residency portal sync | Business+ |
| Low | Marketplace vendor RFQ flow | Enterprise |
| Low | Multi-currency payroll (OMR + home currency) | Enterprise |
