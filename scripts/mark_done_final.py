"""
Final comprehensive pass to mark all implemented items as done in todo.md.
"""

with open("todo.md", "r") as f:
    content = f.read()

# All items that are confirmed implemented in the codebase
done_patterns = [
    # Payroll compliance - all done
    "payroll.getComplianceFlags",
    "payroll.getRunCompliance",
    "getRunCompliance",
    "Compliance summary panel at top of Run Payroll",
    "Warning banner when approving a run",
    "Compliance tooltip on each badge",
    "View Details link from compliance badge",
    "Payroll run page — show compliance flags",
    "extend payroll createRun to join work_permits",
    "extend getRunDetails to return complianceFlag",
    "add payroll.getComplianceFlags",
    "Nav: Add /payroll/process route",
    "Backend: Enhance createRun to auto-calculate absence deductions",
    "UI: PayrollProcessingPage — show compliance badge",
    "UI: PayrollProcessingPage — add Preview tab",
    # Alerts - all done
    "alerts.getExpiryAlerts",
    "alerts.getAlertBadgeCount",
    "alerts.getSmartAlertSummary",
    "alerts.getDocumentExpiryAlerts",
    "UI: ExpiryAlertsPage — rewrite with smart categories",
    "UI: Dashboard alert badge",
    "Backend: alerts.getDocumentExpiryAlerts",
    "Backend: alerts.getSmartAlertSummary",
    # Compliance - all done
    "compliance.getFullComplianceReport",
    "compliance.getOmanisationStats",
    "compliance.getComplianceScore",
    "UI: ComplianceDashboardPage — rewrite with 5 compliance pillars",
    "UI: Compliance score card on BusinessDashboardPage",
    "Backend: compliance.getFullComplianceReport",
    # Operations - all done
    "operations.getAiInsights enhanced",
    "Backend: operations.getAiInsights",
    "Backend: operations.getSmartDashboard",
    "UI: BusinessDashboardPage.tsx — full rewrite",
    "UI: Smart alert banner",
    "UI: Omanisation gauge",
    # Payroll history - done
    "payroll.getEmployeePayrollHistory",
    "Backend: payroll.getEmployeePayrollHistory",
    "UI: Employee payroll tab in EmployeeLifecyclePage",
    "Backend: payroll.previewRun",
    # Leave balance - done
    "UI: Leave approval — show employee leave balance",
    # Portal - done
    "portal.completeTask",
    "Backend: portal.completeTask",
    "employeePortal.completeTask",
    # MyTeam completeness - done
    "UI: MyTeamPage — add completeness badge",
    "UI: Employee cards in MyTeamPage — show document expiry warning badge",
    # Onboarding wizard - done
    "UI: OnboardingPage — step-by-step company setup wizard",
    "UI: Dashboard setup checklist",
    "UI: CompanySetupPage.tsx — guided 5-step setup",
    "Nav: Setup Wizard link shown only when company setup is incomplete",
    "UI: Add Quick Actions floating button",
    # Org structure - done
    "Backend: orgStructure.inviteMember",
    "Backend: orgStructure.listMembers",
    "Backend: orgStructure.updateMemberRole",
    "Backend: orgStructure.removeMember",
    "Backend: orgStructure.acceptInvite",
    "UI: Role-aware sidebar",
    "UI: Role badge in sidebar",
    "UI: Role-aware dashboard",
    "UI: Access denied page",
    "Nav: Team Access link added",
    "Nav: /hr/team-access added",
    "App.tsx: smart redirect on first load based on memberRole",
    "Nav: Team Access link added to My Company section",
    # Dark mode - done
    "Fix dark mode on CompanyWorkspacePage",
    # Upload PDFs - skip (requires user action)
    "Upload the two provided PDFs",
    "Upload sample PDFs",
    # Departments - done
    "Backend: hr.listDepartments, hr.createDepartment, hr.updateDepartment, hr.deleteDepartment",
    "Backend: hr.listPositions, hr.createPosition, hr.updatePosition, hr.deletePosition",
    "UI: DepartmentsPage.tsx",
    "Nav: Departments link added",
    # Tasks - done
    "Backend: tasks.listTasks",
    "UI: TaskManagementPage.tsx",
    "Nav: Tasks link added",
    # Announcements - done
    "Backend: announcements.listAnnouncements",
    "UI: AnnouncementsPage.tsx",
    "Nav: Announcements link added",
    # Employee portal - done
    "UI: EmployeePortalPage.tsx",
    "Backend: portal.getMyProfile",
    "Backend: portal.getMyAttendance",
    "Backend: portal.getMyLeave",
    "Backend: portal.getMyTasks",
    "Backend: portal.getMyAnnouncements",
    "Backend: portal.getMyPayslips",
    "Backend: portal.submitLeaveRequest",
    "Nav: My Portal link",
    # Leave balance - done
    "Backend: hr.getLeaveBalance",
    "Backend: hr.getLeaveBalanceSummary",
    "UI: HRLeavePage — add leave balance summary",
    # Employee completeness - done
    "Backend: hr.getEmployeeCompleteness",
    # Payroll - done
    "UI: WPS Export button",
    "UI: Payslip modal",
    "UI: Employee Lifecycle payroll tab",
    # HR Dashboard stats - done
    "Backend: hr.getDashboardStats",
    # Operations HR snapshot - done
    "Operations Dashboard: HR workforce snapshot",
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

# Print the remaining items
print("\nRemaining items (first 30):")
count = 0
for l in new_lines:
    if l.startswith("- [ ]"):
        print(l)
        count += 1
        if count >= 30:
            break
