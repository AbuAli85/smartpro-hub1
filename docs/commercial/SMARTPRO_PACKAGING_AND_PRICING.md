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

Annual billing offers **15% discount** on the monthly rate.

---

## 2. Module Mapping

Modules correspond 1:1 to `CompanyModule` keys in `shared/capabilities.ts`.  
`null` means all modules are active (Enterprise — no gating applied).

```typescript
// shared/capabilities.ts
export const PACKAGE_ENABLED_MODULES: Record<CompanyPackage, CompanyModule[] | null> = {
  starter:      ["hr", "documents"],
  professional: ["hr", "payroll", "documents", "contracts"],
  business:     ["hr", "payroll", "finance", "documents", "contracts", "compliance"],
  enterprise:   null, // all modules
};
```

### Module availability by tier

| Module | Starter | Professional | Business | Enterprise |
|---|:---:|:---:|:---:|:---:|
| **HR** (employees, leave, attendance) | ✓ | ✓ | ✓ | ✓ |
| **Documents** (vault, templates) | ✓ | ✓ | ✓ | ✓ |
| **Payroll** (run, WPS, PASI) | — | ✓ | ✓ | ✓ |
| **Contracts** (NDAs, quotations) | — | ✓ | ✓ | ✓ |
| **Finance** (P&L, executive KPIs) | — | — | ✓ | ✓ |
| **Compliance** (Sanad, MoL, PRO) | — | — | ✓ | ✓ |
| **CRM** | — | — | — | ✓ |
| **Marketplace** | — | — | — | ✓ |

---

## 3. Feature Details per Tier

### 3.1 Starter — OMR 45–75 / month

**Ideal for:** Small trading companies, retail shops, sole proprietorships, micro-businesses first formalising their HR in Oman.

**Included:**
- Employee profiles (up to 10 users)
- Leave requests & balance tracking
- Attendance records
- Document vault (5 GB storage)
- Basic letter generation (experience, salary, NOC)
- Mobile-friendly portal for employees

**Not included:** Payroll processing, WPS/PASI export, finance dashboards, compliance tools.

**Typical clients:** A small Muscat trading company with 8–15 Omani + expat staff who need an HR system but process payroll manually or through their accountant.

---

### 3.2 Professional — OMR 120–180 / month ⭐ Recommended

**Ideal for:** Growing service businesses, contracting companies, professional firms (20–100 employees). This is the primary upsell target from Starter.

**Includes everything in Starter, plus:**
- Payroll processing (WPS-ready export, PASI deduction calculation)
- Pay-slip generation (Arabic + English)
- Contract management (NDAs, service agreements, quotations)
- Document workflow (approvals, versioning)
- 25 GB storage

**Key selling points for Oman:**
- WPS (Wage Protection System) compliance out of the box
- PASI contribution export
- Arabic document templates for MoL standard letters
- Omanization ratio tracking at company level

**Typical clients:** An engineering consultancy in Ruwi with 35 staff (mixed Omani/expat), a Muscat-based logistics firm needing payroll + contracts.

---

### 3.3 Business — OMR 280–450 / month

**Ideal for:** Finance-heavy companies, construction contractors, oil-field services, companies under MoL compliance scrutiny (50–300 employees).

**Includes everything in Professional, plus:**
- Finance module (P&L dashboards, executive KPIs, cost centres)
- Compliance module: Sanad portal integration, MoL workforce management, PRO tracking
- Multi-role access (finance_admin + hr_admin independently)
- Advanced audit log (all capability + module changes recorded)
- 100 GB storage
- Quarterly account review call

**Key selling points for Oman:**
- Sanad network integration (expat visa tracking)
- MoL compliance status dashboard (compliant / warning / non-compliant)
- Omanization ratio enforcement and reporting
- External auditor role with read-only finance/payroll access

**Typical clients:** A construction company in Sohar with 120 employees (heavy expat workforce), an oil-services firm needing MoL compliance + payroll + finance in one platform.

---

### 3.4 Enterprise — From OMR 600 / month (custom)

**Ideal for:** Large corporations, multi-branch groups, Sanad network operators, government-adjacent organisations, companies needing custom integrations.

**All modules enabled — no gating (`enabledModules: null`):**
- Everything in Business
- CRM (client pipeline, service requests)
- Marketplace (internal vendor catalogue)
- Unlimited users
- Multi-branch / multi-company configuration
- Dedicated account manager (CSM)
- Custom onboarding and data migration
- API access + webhook support
- Custom SLA (99.5% uptime guarantee)
- Unlimited storage

**Key selling points for Oman:**
- Multi-branch management under one platform admin
- Government-adjacent compliance (OCCI, municipality, labour card)
- Custom Arabic/English reporting for board-level
- Integration with existing payroll or ERP systems

**Typical clients:** A Sanad-licensed company with 500+ workforce across multiple Omani governorates; a group holding company managing 3 subsidiaries; a large bank or insurance company needing full HR + compliance.

---

## 4. Add-ons & Upsell Logic

| Add-on | Price | Available from |
|---|---|---|
| Extra 100 GB storage | OMR 12 / month | Starter+ |
| Additional user block (+10 users) | OMR 15 / month | Starter+ |
| WPS batch export (one-time setup) | OMR 100 | Professional+ |
| Sanad/PRO module (standalone) | OMR 80 / month | Business (included) |
| External auditor seat | OMR 25 / seat/month | Professional+ |
| Data migration from legacy system | OMR 300 – 800 | Any |
| Custom Arabic report template | OMR 150 / template | Business+ |
| Priority support (4 h SLA) | OMR 60 / month | Starter / Professional |

### Upsell triggers

- **Starter → Professional:** When the company needs to run payroll (WPS) or manage formal contracts. Trigger event: company reaches 15+ employees.
- **Professional → Business:** When the finance team wants P&L dashboards, or when MoL compliance tracking is required (Omanization ratio, Sanad expat tracking).
- **Business → Enterprise:** When the company opens a second branch, needs CRM, or requests API integration with an existing ERP.

---

## 5. Oman Market Notes

### Pricing rationale
Oman's SaaS HR market is price-sensitive for SMEs. Benchmarking against regional alternatives (Bayzat, HROne, Zoho People):
- Starter at OMR 45–75 is competitive vs. manual Excel + accountant fees.
- Professional at OMR 120–180 undercuts Bayzat equivalent tiers by ~20%.
- Business at OMR 280–450 is positioned against hiring an in-house HR officer (OMR 350–500/month minimum).

### Regulatory context
- **WPS** (Wage Protection System): Mandatory for all companies with > 6 employees. Professional tier covers this.
- **PASI** (Public Authority for Social Insurance): Mandatory Omani national contributions. Calculated in payroll module.
- **Sanad**: Government-run expat fee collection and quota system. Compliance module handles tracking.
- **MoL** (Ministry of Labour): Workforce reporting, Omanization ratios, labour card management. Compliance module.
- **OCCI** (Oman Chamber of Commerce): CR number required. Stored on company profile.

### Contract terms
- Monthly billing: no lock-in after month 1.
- Annual contracts: 15% discount, 30-day cancellation notice required.
- Onboarding fee: non-refundable, covers data import + 2-session training.
- Pilot period: 14-day free trial on Professional tier, credit card not required.

---

## 6. Technical Guardrails

These constraints must be maintained across all future development:

1. **Every new module declares a `CompanyModule` key** in `shared/capabilities.ts > MODULE_KEYS`.
2. **Every sensitive API route** must call `requireCapableMembership` (or `requireCapabilityAndModule`) — bare role checks are insufficient.
3. **Every nav item** must declare module/capability visibility through `clientNavItemVisible()` in `shared/clientNav.ts`.
4. **Every package/module change** must be audit-logged via the audit system (`logCapabilityChange` / `logModuleChange`).
5. **`PACKAGE_ENABLED_MODULES`** is the single source of truth for package → module mapping; do not hard-code module lists elsewhere.
6. **`DEFAULT_COMPANY_CONFIG.enabledModules = null`** means Enterprise semantics (all active). Never set this to `[]` (that would disable everything).

### Provisioning a new company

```typescript
import { getEnabledModulesForPackage, type CompanyPackage } from "@/shared/capabilities";

// On company signup / plan selection:
const pkg: CompanyPackage = "professional";
const enabledModules = getEnabledModulesForPackage(pkg);
// → ["hr", "payroll", "documents", "contracts"]

await db.update(companies)
  .set({ enabledModules, subscriptionPlanId: planId })
  .where(eq(companies.id, companyId));
```

---

## 7. Roadmap Considerations

| Priority | Item | Target tier |
|---|---|---|
| High | WPS file export (MUSCAT/SOHAR/BARKA variants) | Professional+ |
| High | PASI XML export for bulk upload | Professional+ |
| Medium | Sanad API live integration (quota deduction) | Business+ |
| Medium | MoL e-Residency portal sync | Business+ |
| Low | Marketplace vendor RFQ flow | Enterprise |
| Low | Multi-currency payroll (OMR + foreign-national home currency) | Enterprise |
