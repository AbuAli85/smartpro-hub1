import re

with open('todo.md', 'r') as f:
    content = f.read()

# Patterns for items that are already implemented
implemented_keywords = [
    # Attendance advanced
    'shift_templates, employee_schedules, company_holidays tables to schema',
    'Migrate DB schema for new tables',
    'createShiftTemplate, listShiftTemplates, deleteShiftTemplate',
    'assignSchedule, listEmployeeSchedules, updateSchedule, deleteSchedule',
    'addHoliday, listHolidays, deleteHoliday',
    'getTodayScheduleStatus',
    'getMonthlyAttendanceReport',
    'getMyTodaySchedule',
    'Upgrade check-in flow: auto-detect schedule',
    'Build Shift Templates management UI',
    'Build Employee Schedule assignment UI',
    'Build Holiday Calendar UI',
    'Build Admin Today Board',
    'Build Monthly Attendance Report page',
    'Register new routes in App.tsx and add nav items',
    'Write tests for schedule logic',
    '0 TypeScript errors, all tests pass',
    'Audit AttendancePage.tsx',
    # Manual check-in
    'manual_checkin_requests table to schema',
    'submitManualCheckIn, listManualCheckIns, approveManualCheckIn',
    'show justification form when outside geo-fence',
    'Add Manual Requests tab to AttendanceSitesPage',
    'Write tests for manual check-in',
    # Geo-fence
    'DB: Add lat, lng, radiusMeters',
    'Backend: Enforce geo-fence radius',
    'Backend: Enforce operating hours window',
    'Backend: Add siteType and clientName',
    'UI: AttendanceSitesPage — Google Maps picker',
    'UI: Geo-fence radius slider',
    'UI: Site type selector',
    'UI: Client/brand name field',
    'UI: Operating hours',
    'UI: Site cards show type badge',
    'UI: AttendCheckInPage — show live GPS distance',
    'UI: AttendCheckInPage — show site map',
    'UI: AttendCheckInPage — clear error if outside geo-fence',
    # Employee portal tables
    'work_logs table (employeeId',
    'expense_claims table (employeeId',
    'training_records table (employeeId',
    'performance_reviews table (employeeId',
    'workLog: submitLog, listMyLogs',
    'expenseClaims: submit, listMine',
    'training: listMyTraining, markComplete',
    'performance: submitSelfReview, listMyReviews',
    'Personal KPI cards: hours logged this week',
    'Today tasks summary with quick complete button',
    'Quick action shortcuts: Log Work, Submit Expense',
    'Daily work log form: date, start/end time',
    'Weekly hours summary bar chart',
    'Monthly timesheet table view',
    'Submit expense form: category, amount',
    'Expense history list with status badges',
    'Total pending/approved amounts summary',
    'List of assigned training courses',
    'Mark training as complete',
    'Training progress bar',
    'Completed training history with certificates',
    'Self-review form: rating sliders',
    'View manager ratings and feedback',
    'Goal tracking with progress indicators',
    'Performance history by review period',
    # Portal UI sections
    'UI: My Payslips section in portal',
    'UI: My Documents section in portal',
    'UI: My Profile section in portal',
    'UI: Notifications panel in portal',
    # RBAC
    'RBAC: /attend/:token route is public',
    'RBAC: attendance admin pages visible',
    # Attendance admin
    'Admin: manual check-in/out for any employee',
    'Admin: view all attendance records with filters',
    'Admin: approve or reject employee correction requests',
    'Employee Attendance tab: check-in / check-out button',
    "Employee Attendance tab: show today's status",
    "Employee Attendance tab: show this month's attendance",
    'Employee Attendance tab: correction request form',
    'Employee: see status of submitted correction requests',
    'Correction request: employee submits',
    'Check-in/out: employee action',
    'Attendance Sites: sites created by admin',
    # Employee import
    'Fix EmployeeImportPage: pass activeCompanyId',
    'Fix bulkImport procedure: require companyId',
    'Verify: importing while company B selected',
    # Sidebar badges
    'Fix Team Access badge (sidebar shows 31',
    'Audit sidebar navigation badges',
    # Tasks
    'Add progress % slider to each task',
    'Add notes/comments field per task',
    'Daily task report: summarize completed tasks',
    'Filter by project/category',
    # Notifications
    'Check if notifyOwner / Resend email helper exists',
    'Add in-app notification to employee when HR approves',
    'Add owner/HR notification when employee submits a new shift',
    'Show notification in employee portal bell icon',
    # Requests calendar
    'Build AdminRequestsCalendar component',
    'Each day cell shows employee initials',
    'Day click shows all requests for that day',
    'Inline approve/reject from the admin calendar',
    'Add calendar tab/section to HR Employee Schedules',
    # Attachment
    'Add attachmentUrl column to shift_change_requests',
    'Add file upload input to the shift request dialog',
    'Upload file to S3 via storagePut on submit',
    'Show attachment link/thumbnail on request cards',
    # Admin requests management
    'UI: Admin Requests Management - approve/reject',
    'UI: Employee Requests page - submit and track',
    'UI: Admin Attendance Sites page',
    'UI: Admin Attendance Board',
    'UI: MyPortalPage - redesign as employee home',
    # Email notifications
    'Email: notify employee when request is approved',
    'Email: notify HR when new request is submitted',
    # Company switcher
    "Ensure company switcher shows the user's role label",
    # Export
    'Admin: export attendance report to CSV',
    'Export timesheet as PDF report',
    # Admin expense
    'Admin: review, approve/reject with notes',
]

lines = content.split('\n')
count = 0
new_lines = []
for line in lines:
    if line.startswith('- [ ]'):
        matched = False
        for kw in implemented_keywords:
            if kw.lower() in line.lower():
                new_lines.append(line.replace('- [ ]', '- [x]', 1))
                count += 1
                matched = True
                break
        if not matched:
            new_lines.append(line)
    else:
        new_lines.append(line)

content = '\n'.join(new_lines)

with open('todo.md', 'w') as f:
    f.write(content)

remaining = sum(1 for l in new_lines if l.startswith('- [ ]'))
print(f"Marked {count} items as done. Remaining: {remaining}")
