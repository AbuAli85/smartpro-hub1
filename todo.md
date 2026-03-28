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
- [ ] Google Docs template generation (requires Google API key)

## Phase 8: HR Module
- [x] Employee management (full CRUD)
- [x] Recruitment with ATS (job listings, applications)
- [x] Payroll management
- [x] Leave management (requests, approvals)
- [x] Performance reviews
- [ ] Attendance tracking (future enhancement)

## Phase 9: CRM Module
- [x] Contact management
- [x] Communication logs
- [x] Sales pipeline (stage-based)
- [x] Deals/opportunity management
- [x] CRM analytics (pipeline stats)
- [ ] Client portal (future enhancement)

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
- [ ] Custom report builder (future enhancement)
- [ ] Export to PDF/Excel (future enhancement)

## Phase 11: Admin Control Panel
- [x] User and role management
- [x] Company/tenant management
- [x] Audit logs viewer
- [x] Platform health monitoring
- [x] System configuration panel (platform identity, feature toggles, notification settings, integration keys, danger zone — fully backend-persisted via system_settings table)
- [ ] Support tools (future enhancement)

## Phase 12: Testing & Polish
- [x] Vitest tests for all core procedures (30 tests passing)
- [x] Zero TypeScript errors
- [x] Navigation and routing verification
- [x] Mobile responsiveness (responsive sidebar)
- [ ] Arabic RTL support (future enhancement)
- [x] Final checkpoint and delivery

## Bug Fixes
- [x] Fix companies.myCompany returning undefined instead of null (causes React Query crash on /hr/employees)
- [x] Audit all tRPC queries that may return undefined — must return null or empty array (all db helpers now return null ?? null)
- [x] Add HRAttendancePage route and sidebar link
- [x] Build Client Portal page (contracts, bookings, PRO services, company info, support)

## Known Limitations (Future Roadmap)
- [ ] E-signature flow (DocuSign / Adobe Sign integration)
- [ ] Contract document PDF download (S3 storage pipeline)
- [ ] Live chat support channel (third-party widget)
- [ ] Service detail view deep-link from Client Portal
- [ ] Arabic / RTL full support
- [ ] Full audit of every tRPC router for undefined-return edge cases in non-db paths
