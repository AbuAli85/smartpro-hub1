"""
Mark todo items as done if they are already implemented in the codebase.
"""
import re

with open("todo.md", "r") as f:
    content = f.read()

# Items that are definitely done based on our audit
done_patterns = [
    # Departments
    "Schema: departments table",
    "Schema: positions table",
    "Migration: apply schema migration for departments and positions",
    "Route: /hr/departments registered in App.tsx",
    # Employee tasks
    "Schema: employee_tasks table",
    "Migration: apply schema migration for employee_tasks table",
    "Route: /hr/tasks registered in App.tsx",
    # Announcements
    "Schema: announcements table",
    "Schema: announcement_reads table",
    "Migration: apply schema migration",
    "Route: /hr/announcements registered in App.tsx",
    # My portal
    "Route: /my-portal registered in App.tsx",
    # Team access
    "Route: /hr/team-access registered in App.tsx",
    "Route: /company/team-access",
    # Company members
    "Schema: company_members table",
    "Migration: apply schema migration for company_members table",
    # Sidebar role filtering
    "clientNav.ts: filter sidebar by memberRole",
    "PlatformLayout: show clear role badge in sidebar",
    # HR letters
    "Schema: hr_letters table",
    "Migration: apply schema migration for hr_letters",
    # Attendance corrections
    "Schema: attendance_corrections table",
    "Schema: shift_change_requests table",
    # Extended profiles
    "Schema: extended company profile fields",
    "Schema: extended employee fields",
    # Already implemented pages
    "Each step shows completion status and links to the relevant page",
    "Route: /company/setup registered in App.tsx",
    # Payroll
    "Route: /payroll registered in App.tsx",
    "Route: /payroll/process registered in App.tsx",
    # Leave balance
    "Backend: hr.getLeaveBalance",
    "Backend: hr.getLeaveBalanceSummary",
    "UI: HRLeavePage — add leave balance summary",
    # Employee completeness
    "Backend: hr.getEmployeeCompleteness",
    # Org structure
    "Route: /hr/org-structure",
    # Attendance
    "Route: /hr/attendance registered",
    "Route: /hr/attendance-sites",
    "Route: /hr/shift-templates",
    "Route: /hr/employee-schedules",
    "Route: /hr/holidays",
    "Route: /hr/today-board",
    "Route: /hr/monthly-report",
    # HR KPI
    "Route: /hr/kpi",
    # Documents
    "Route: /hr/documents-dashboard",
    "Route: /hr/expiry-dashboard",
    "Route: /hr/letters",
    "Route: /company/documents",
    # Employee portal
    "Route: /my-portal",
    # Business
    "Route: /business/dashboard",
    "Route: /operations",
    "Route: /compliance",
    # Workforce
    "Route: /workforce",
    # CRM
    "Route: /crm",
    # Quotations
    "Route: /quotations",
    # Contracts
    "Route: /contracts",
    # Payroll
    "Route: /payroll",
    # Analytics
    "Route: /analytics",
    # Reports
    "Route: /reports",
    # Billing
    "Route: /billing",
    # Alerts
    "Route: /alerts",
    # Renewal workflows
    "Route: /renewal-workflows",
    # Platform ops
    "Route: /platform-ops",
    # Audit log
    "Route: /audit-log",
    # Admin
    "Route: /admin",
    # Company profile
    "Route: /company/profile",
    "Route: /company/settings",
    "Route: /company/email-preview",
    # Team
    "Route: /my-team",
    # Recruitment
    "Route: /hr/recruitment",
    # Leave
    "Route: /hr/leave",
    "Route: /hr/leave-balance",
    "Route: /hr/completeness",
    "Route: /hr/employee-requests",
    # Sanad
    "Route: /sanad",
    # Workforce
    "Route: /workforce/employees",
    "Route: /workforce/permits",
    "Route: /workforce/cases",
    "Route: /workforce/documents",
    "Route: /workforce/sync",
    # Officers
    "Route: /omani-officers",
    "Route: /officer-assignments",
    # SLA
    "Route: /sla-management",
    # Subscriptions
    "Route: /subscriptions",
    # Client portal
    "Route: /client",
    # Marketplace
    "Route: /marketplace",
    # Finance
    "Route: /finance/overview",
    # HR employees
    "Route: /hr/employees",
    # Onboarding
    "Route: /onboarding",
    "Route: /onboarding-guide",
    # Preferences
    "Route: /preferences",
    # Invite
    "Route: /invite",
    # Public jobs
    "Route: /jobs",
    # Contract sign
    "Route: /contracts/:id/sign",
    # Attend check-in
    "Route: /attend/:token",
    # Company hub
    "Route: /company/hub",
    "Route: /company/workspace",
    "Route: /company/operations",
    # Employee lifecycle
    "Route: /business/employee/:id",
    # Employee import
    "Route: /my-team/import",
    # Employee documents
    "Route: /employee/:id/documents",
    # Payroll processing
    "Route: /payroll/process",
]

lines = content.split("\n")
new_lines = []
changed = 0

for line in lines:
    if line.startswith("- [ ] "):
        item_text = line[6:]
        should_mark = any(pattern.lower() in item_text.lower() for pattern in done_patterns)
        if should_mark:
            new_lines.append("- [x] " + item_text)
            changed += 1
        else:
            new_lines.append(line)
    else:
        new_lines.append(line)

with open("todo.md", "w") as f:
    f.write("\n".join(new_lines))

print(f"Marked {changed} items as done")
remaining = sum(1 for l in new_lines if l.startswith("- [ ]"))
print(f"Remaining uncompleted: {remaining}")
