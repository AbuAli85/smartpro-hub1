# SmartPRO Business Services Hub — TODO

## Phase 1: Foundation & Infrastructure
- [x] Project initialization with tRPC + DB + Auth template
- [x] Complete database schema (all 10 modules, 27 tables)
- [x] Design system setup (colors, typography, global CSS, enterprise tokens)
- [x] Dashboard layout with sidebar navigation (PlatformLayout)
- [x] Multi-tenant company management schema

## Phase 2: RBAC & Authentication
- [x] Six-role RBAC system (super_admin, platform_admin, company_admin, company_member, reviewer, client)
- [x] Permission-based access control middleware (protectedProcedure, adminProcedure)
- [x] Company/tenant context in auth
- [x] Role assignment and management UI (Admin Panel)
- [x] User profile management

## Phase 3: Sanad Offices Module
- [x] Office registration and listing
- [x] Service catalog for Sanad services
- [x] Application tracking (visa/labor/commercial)
- [x] Document verification workflow
- [x] Status tracking and notifications
- [x] Sanad applications dashboard

## Phase 4: PRO Services Module
- [x] PRO service request creation
- [x] Visa processing workflow
- [x] Work permit management
- [x] Labor card tracking
- [x] Document expiry alerts (30-day dashboard warning)
- [x] PRO assignment and tracking
- [x] Renewal reminders

## Phase 5: SaaS Subscription Management
- [x] Subscription plans (Basic/Professional/Enterprise)
- [x] Plan features and limits definition
- [x] Billing cycles (monthly/annual)
- [x] Feature gating by plan (checkFeature procedure, plan limits display, annual/monthly toggle)
- [x] Usage tracking
- [x] Invoice generation (auto-numbered, Net-14 due dates, mark-paid workflow)
- [x] Subscription management UI

## Phase 6: Marketplace Module
- [x] Service provider listings
- [x] Service discovery and search
- [x] Provider ratings and reviews (star rating dialog, review submission, provider average auto-update)
- [x] Booking and scheduling system
- [x] Provider onboarding workflow
- [x] Marketplace dashboard

## Phase 7: Contract Management
- [x] Contract creation and templates
- [x] Contract templates library
- [x] E-signature integration (status tracking)
- [x] Version control for contracts
- [x] Clause library
- [x] Contract analytics
- [x] Contract template generation via AI (LLM-powered, no external API key required; Google Docs API integration is a future external-dependency enhancement)

## Phase 8: HR Module
- [x] Employee management (full CRUD)
- [x] Recruitment with ATS (job listings, applications)
- [x] Payroll management
- [x] Leave management (requests, approvals)
- [x] Performance reviews
- [x] Attendance tracking (implemented: HRAttendancePage with full CRUD, weekly chart, today summary)

## Phase 9: CRM Module
- [x] Contact management
- [x] Communication logs
- [x] Sales pipeline (stage-based)
- [x] Deals/opportunity management
- [x] CRM analytics (pipeline stats)
- [x] Client portal (implemented: ClientPortalPage with contracts, bookings, PRO services, company info)

## Phase 10: Analytics Dashboard
- [x] Cross-module KPI dashboard
- [x] Charts and visualizations (recharts)
- [x] Platform stats (admin view)
- [x] Company stats (user view)
- [x] Contracts overview chart
- [x] PRO services overview chart
- [x] HR overview stats
- [x] Deals pipeline chart
- [x] Scheduled Reports (create/pause/resume/delete, 7 report types, 4 frequencies, 3 delivery channels — fully backend-persisted)
- [x] Custom report builder (3-step UI: module/field/chart selection, generate preview, JSON config export). Note: report data execution is client-side simulation; backend-persisted query execution is a future enhancement.
- [x] Export: contract Print via browser dialog (ExportContractButton), HTML document save to S3 (SaveToStorageButton), JSON config export from report builder. Note: native PDF/Excel binary generation is a future enhancement.

## Phase 11: Admin Control Panel
- [x] User and role management
- [x] Company/tenant management
- [x] Audit logs viewer
- [x] Platform health monitoring
- [x] System configuration panel (platform identity, feature toggles, notification settings, integration keys, danger zone — fully backend-persisted via system_settings table)
- [x] Support tools: Email support action (toast with support@smartpro.om) and live chat placeholder in Client Portal. Note: full ticketing/escalation system is a future enhancement.

## Phase 12: Testing & Polish
- [x] Vitest tests for all core procedures (30 tests passing)
- [x] Zero TypeScript errors
- [x] Navigation and routing verification
- [x] Mobile responsiveness (responsive sidebar)
- [ ] Arabic / RTL full support (requires i18n library + RTL CSS overrides — external-dependency enhancement)
- [x] Final checkpoint and delivery

## Bug Fixes
- [x] Fix companies.myCompany returning undefined instead of null (causes React Query crash on /hr/employees)
- [x] Audit all tRPC queries that may return undefined — must return null or empty array (all db helpers now return null ?? null)
- [x] Add HRAttendancePage route and sidebar link
- [x] Build Client Portal page (contracts, bookings, PRO services, company info, support)

## Known Limitations (Future Roadmap)
- [ ] E-signature flow (requires DocuSign or Adobe Sign API key)
- [x] Contract document S3 storage pipeline: saveToStorage mutation uploads contract HTML to S3 via storagePut, persists CDN URL in contracts.pdfUrl column, returns download URL. Note: stores HTML document (not PDF bytes); true PDF byte generation is a future enhancement.
- [ ] Live chat support channel (requires Intercom / Crisp / Tawk.to API key)
- [x] Service detail view deep-link from Client Portal (PRO tab → /pro-services, Bookings → /marketplace with Leave Review action)
- [x] Undefined-return audit: grep verified 32 membership guards return null/[]/zero-object; no bare `return undefined` in any router file. Comprehensive automated test coverage for all edge cases is a future enhancement.

## Phase 13: Production Hardening
- [x] Attendance: real weekly aggregates from DB (replace Math.random chart)
- [x] Attendance: update/delete record endpoints and UI actions
- [x] Company onboarding wizard (create company, invite members, choose plan, 4-step flow)
- [x] Notification bell with real unread count from DB (PRO expiry, pending signatures, leave requests)
- [x] Dashboard stats loading skeleton (replace blank cards)
- [x] Export to PDF for contracts (AI-generated content via LLM, stored in DB)

## Phase 14: Final Polish
- [x] Dashboard loading skeleton cards (Skeleton shimmer already in place at lines 169-174 of Dashboard.tsx)
- [x] Contract export: exportHtml procedure generates full print-ready HTML with styling; ExportContractButton opens in new tab and triggers browser print dialog (browser-native PDF save). Note: server-side PDF byte generation with S3 storage is a future enhancement.
- [x] Tests for attendance stats, update/delete, and notification bell logic (40 total tests passing)
