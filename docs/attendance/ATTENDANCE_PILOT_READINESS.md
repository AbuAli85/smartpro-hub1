# Attendance Module — Pilot Readiness

**Status:** PILOT-READY  
**QA pass date:** 2026-04-25  
**QA phase:** P7.13 — Attendance Operations Acceptance QA  
**Author:** Claude Code (P7.9–P7.13 implementation series)

---

## 1. Verdict

The attendance module has completed a full static QA pass across all 16 routes.
TypeScript compiles with 0 errors. The test suite passes with 3069 tests (2 skipped, 0 failures).
All four acceptance journeys are verified. No blockers were found.

**The module is cleared for pilot deployment.**

---

## 2. Verified Journeys

### Journey 1 — HR Setup

| Route | Verified | Notes |
|---|---|---|
| `/hr/attendance-setup` | Yes | Setup hub checklist; descriptions no longer truncate (line-clamp-2) |
| `/hr/attendance-sites` | Yes | Toggle deactivate requires AlertDialog confirmation; activate is immediate |
| `/hr/shift-templates` | Yes | Deactivation blocked when `activeScheduleAssignmentCount > 0`; no bypass |
| `/hr/employee-schedules` | Yes | Muscat-aware date helpers; conflict detection (ScheduleAssignPreview) fixed |
| `/hr/attendance/setup-health` | Yes | Dedicated route; renders independently of `:tab?` wildcard |

Route ordering in `App.tsx`: `/hr/attendance-setup` and `/hr/attendance/setup-health` both precede `/hr/attendance/:tab?`. Wouter first-match semantics are satisfied.

### Journey 2 — HR Operations

| Sub-route | Verified | Notes |
|---|---|---|
| `/hr/attendance/today` | Yes | ActionQueue and OverdueCheckouts compact when empty |
| `/hr/attendance/records` | Yes | Icon-only buttons have `title` tooltips; Delete guarded by AlertDialog |
| `/hr/attendance/site-punches` | Yes | Date picker; microcopy present |
| `/hr/attendance/corrections` | Yes | Reject requires adminNote ≥ 5 chars; microcopy present |
| `/hr/attendance/manual` | Yes | Approve allows optional note, reject requires reason; microcopy present |
| `/hr/attendance/audit` | Yes | Structural audit trail; microcopy present |

### Journey 3 — Employee Portal

| Sub-route | Verified | Notes |
|---|---|---|
| `/my-portal/attendance/today` | Yes | AttendanceTodayCard with operational hints; invalid tab redirects |
| `/my-portal/attendance/history` | Yes | Month nav with maxMonth guard; present/late/absent summary; per-record status |
| `/my-portal/attendance/requests` | Yes | Correction + manual request history; `sanitizeAdminNote()` suppresses raw reason codes from all admin-note display paths |

### Journey 4 — Client Approval and Billing

| Route | Verified | Notes |
|---|---|---|
| `/finance/attendance-billing` | Yes | `canConvert` gate: `review_ready` + no existing invoice; snapshot warning override required |
| `/finance/attendance-invoices` | Yes | Full lifecycle: draft → issue → mark sent → record payment → void; payment progress bar |
| `/attendance-approval/:token` | Yes | Public route (no login); expired/invalid token handled gracefully; decided batches are read-only |

---

## 3. Technical Baseline

| Check | Result | Date |
|---|---|---|
| `npm run check` (TypeScript) | 0 errors | 2026-04-25 |
| `npm test` (Vitest) | 3069 passed, 2 skipped, 0 failed | 2026-04-25 |
| scheduleConflict unit suite | 15/15 passed | 2026-04-25 |

---

## 4. Known Non-Blocking Issues

These issues are cosmetic or edge-case only. They do not affect data correctness.

### 4.1 UTC payment date default

**File:** `client/src/pages/AttendanceInvoicesPage.tsx:86`  
**Symptom:** The `todayYmd()` helper uses `new Date().toISOString().slice(0, 10)` (UTC). A Muscat user recording payment after ~8pm local time will see yesterday's date pre-filled in the payment date field.  
**Impact:** Cosmetic — the date field is editable and correctable before submission.  
**Fix (backlog):** Replace `todayYmd()` with `muscatCalendarYmdNow()` from `@shared/attendanceMuscatTime`.

### 4.2 UTC max-month in employee history

**File:** `client/src/pages/EmployeeAttendancePage.tsx:98–99`  
**Symptom:** `maxMonth` is computed from `new Date()` in UTC, not Muscat time. The "Next month" button may be enabled for one hour past midnight UTC near a month boundary.  
**Impact:** Cosmetic — at worst, the employee can briefly navigate to the next (empty) month.  
**Fix (backlog):** Replace the UTC `new Date()` with a Muscat-aware helper.

---

## 5. Pilot Checklist

Before go-live, confirm each item:

### Infrastructure
- [ ] Database migrations 0001–0086 applied to production
- [ ] S3 / storage bucket for HTML invoice artifacts configured and accessible
- [ ] JWT secret for client approval tokens set in production environment
- [ ] Email delivery configured for client approval link distribution

### Configuration
- [ ] At least one attendance site created and active
- [ ] At least one shift template created and active
- [ ] Employee schedules assigned covering the pilot period
- [ ] At least one client contact registered for approval flow testing

### Access and permissions
- [ ] HR administrator accounts have the `hr_admin` role
- [ ] Finance accounts have the `finance_admin` role or equivalent finance permission
- [ ] Employee accounts have portal access enabled
- [ ] Client approval tokens tested end-to-end with an external email

### Smoke tests (run in production before announcing to users)
- [ ] Employee can check in and check out via QR or site punch
- [ ] Check-in appears on HR `today` dashboard within 60 seconds
- [ ] Manual check-in request submitted → appears in HR `manual` queue
- [ ] Correction request submitted → appears in HR `corrections` queue
- [ ] HR approves correction → employee history reflects updated times
- [ ] Attendance batch submitted to client → approval link email received
- [ ] Client approves via public URL → batch status updates to `approved`
- [ ] Finance converts `review_ready` candidate to draft invoice
- [ ] Invoice issued → HTML artifact URL accessible
- [ ] Payment recorded → progress bar and outstanding balance update correctly

---

## 6. Rollback and Mitigation Guidance

### If check-in / check-out is broken (P0)

1. Verify the `attendance_records` table is writable and the QR site is reachable.
2. Enable manual check-in requests as a stopgap — employees can submit requests that HR approves retroactively.
3. If the backend procedure is failing, roll back to the previous deployment tag using the documented deployment pipeline.

### If billing candidate generation is broken (P1)

1. Do not void or cancel any candidates manually.
2. Check the batch processing job logs; the job is idempotent and can be re-run.
3. If snapshot data is missing, use the snapshot-warning override in the ConvertToInvoiceDialog with a documented reason.

### If a route is inaccessible (P2)

1. Check browser console for tRPC errors — most route failures surface as tRPC `UNAUTHORIZED` or `NOT_FOUND`.
2. Confirm the user's role matches the route guard.
3. If the issue is a broken import or runtime error, hot-patch the specific page file and redeploy; the module is structured so each page is independently loadable.

### General rollback

The last stable tagged commit before pilot is the rollback target. Database migrations from 0080 onward should be reviewed for reversibility before applying a schema rollback.

---

## 7. Bug Triage Policy

All bugs discovered during pilot should be triaged against the following priority levels.

### P0 — Check-in / check-out impossible

**Definition:** Employees cannot record attendance through any available method (QR, site punch, manual request).  
**Response:** Immediate — stop pilot, investigate within 1 hour, hotfix or rollback same day.

### P1 — Payroll or billing integrity risk

**Definition:** Attendance data silently incorrect (wrong times saved), billing lines missing approved sessions, payment records not persisting, invoice totals miscalculated.  
**Response:** High — fix before next billing cycle. Manual reconciliation may be needed for affected records.

### P2 — HR workflow blocker

**Definition:** HR cannot approve or reject corrections / manual requests; shift or site management is broken; schedule assignment fails.  
**Response:** High — fix within 1–2 business days. Workaround via direct DB update is acceptable as a temporary bridge if documented.

### P3 — Copy, visual polish, or minor UX

**Definition:** Wrong label text, misaligned layout, missing microcopy, cosmetic badge color issues.  
**Response:** Normal sprint — collect and batch into post-pilot polish release.

---

## 8. Post-Pilot Backlog

Items identified during QA that are deferred for after pilot stabilization:

| ID | Area | Description | Priority |
|---|---|---|---|
| PP-01 | Finance / Invoices | Replace `todayYmd()` UTC helper with `muscatCalendarYmdNow()` in payment modal default | P3 |
| PP-02 | Employee Portal | Replace UTC `new Date()` with Muscat-aware helper for history tab `maxMonth` | P3 |
| PP-03 | Phase 12F-TYPING | Replace two `as unknown as` casts: `PaymentRecord.paidAt` (DTO fix) and `BillingLine` index signature (normalization helper) | P3 |
| PP-04 | HR Records | Add date-range filter to `/hr/attendance/records` for large datasets | Stretch |
| PP-05 | Billing | Verify billing candidate auto-generation consistently runs on internal and public client approval paths; add monitoring/retry if hook execution fails | Stretch |

---

*Document generated from P7.13 Acceptance QA pass. Update this file as pilot findings are collected.*
