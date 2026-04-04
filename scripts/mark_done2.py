"""
Mark todo items as done if they are already implemented in the codebase.
Second pass - more comprehensive.
"""

with open("todo.md", "r") as f:
    content = f.read()

# Items that are definitely done based on our audit
done_patterns = [
    # Departments - all done
    "hr.listDepartments, hr.createDepartment, hr.updateDepartment, hr.deleteDepartment",
    "hr.listPositions, hr.createPosition, hr.updatePosition, hr.deletePosition",
    "DepartmentsPage.tsx — manage departments and positions",
    "Nav: Departments link added to Human Resources sidebar section",
    # Tasks - all done
    "tasks.listTasks",
    "tasks.createTask",
    "tasks.updateTask",
    "tasks.deleteTask",
    "tasks.completeTask",
    "TaskManagementPage.tsx",
    "TaskManagerPage",
    "Nav: Tasks link added to Human Resources sidebar section",
    # Announcements - all done
    "announcements.listAnnouncements",
    "announcements.createAnnouncement",
    "announcements.markRead",
    "announcements.deleteAnnouncement",
    "AnnouncementsPage.tsx",
    "Nav: Announcements link added to Human Resources sidebar section",
    # Employee Portal - all done
    "EmployeePortalPage.tsx",
    "portal.getMyProfile",
    "portal.getMyAttendance",
    "portal.getMyLeave",
    "portal.getMyTasks",
    "portal.getMyAnnouncements",
    "portal.getMyPayslips",
    "portal.submitLeaveRequest",
    "Nav: My Portal link added",
    # Leave balance - done
    "hr.getLeaveBalance — per-employee leave balance",
    "hr.getLeaveBalanceSummary — all employees",
    "HRLeavePage — add leave balance summary table",
    # Employee completeness - done
    "hr.getEmployeeCompleteness — per-employee profile completeness",
    "EmployeeCompletenessPage.tsx",
    "Nav: Profile Completeness link",
    # Org structure - done
    "OrgStructurePage.tsx",
    "Nav: Org Structure link",
    # Attendance - done
    "attendance.getAttendanceStats",
    "attendance.getTodayBoard",
    "attendance.getMonthlyReport",
    "TodayBoardPage.tsx",
    "MonthlyReportPage.tsx",
    "ShiftTemplatesPage.tsx",
    "EmployeeSchedulesPage.tsx",
    "HolidayCalendarPage.tsx",
    "AttendanceSitesPage.tsx",
    # HR Letters - done
    "HRLettersPage.tsx",
    "hr.createLetter",
    "hr.listLetters",
    "hr.deleteLetter",
    # HR KPI - done
    "HRKpiPage.tsx",
    "kpi.listTargets",
    "kpi.createTarget",
    "kpi.logActivity",
    "kpi.adminGetTeamProgress",
    # Documents - done
    "HRDocumentsDashboardPage.tsx",
    "DocumentExpiryDashboard.tsx",
    "CompanyDocumentsPage.tsx",
    "EmployeeDocumentsPage.tsx",
    "documents.listCompanyDocs",
    "documents.uploadCompanyDoc",
    "documents.updateCompanyDoc",
    "documents.deleteCompanyDoc",
    # Payroll - done
    "PayrollEnginePage.tsx",
    "PayrollProcessingPage.tsx",
    "payroll.listRuns",
    "payroll.createRun",
    "payroll.approveRun",
    "payroll.getRunDetails",
    # Leave - done
    "HRLeavePage.tsx",
    "LeaveBalancePage.tsx",
    "hr.listLeaveRequests",
    "hr.approveLeave",
    "hr.rejectLeave",
    # Recruitment - done
    "HRRecruitmentPage.tsx",
    "recruitment.listJobs",
    "recruitment.createJob",
    "recruitment.listApplications",
    # CRM - done
    "CRMPage.tsx",
    "crm.listContacts",
    "crm.createContact",
    # Contracts - done
    "ContractsPage.tsx",
    "contracts.listContracts",
    "contracts.createContract",
    # Quotations - done
    "QuotationsPage.tsx",
    "quotations.listQuotations",
    "quotations.createQuotation",
    # Analytics - done
    "AnalyticsPage.tsx",
    # Reports - done
    "ReportsPage.tsx",
    # Compliance - done (partial)
    "ComplianceDashboardPage.tsx",
    "compliance.getComplianceScore",
    # Operations - done
    "OperationsDashboardPage.tsx",
    "operations.getDailySnapshot",
    "operations.getSmartDashboard",
    "operations.getTodaysTasks",
    # Business Dashboard - done
    "BusinessDashboardPage.tsx",
    # My Team - done
    "MyTeamPage.tsx",
    "team.listMembers",
    "team.getMember",
    "team.inviteMember",
    "team.updateMember",
    "team.removeMember",
    "team.getTeamStats",
    # Company profile - done
    "CompanyProfilePage.tsx",
    "CompanySettingsPage.tsx",
    "companies.myCompany",
    "companies.updateCompany",
    # Team access - done
    "TeamAccessPage.tsx",
    "MultiCompanyRolesPage.tsx",
    # Workforce - done
    "WorkforceDashboard.tsx",
    "WorkforceEmployeesPage.tsx",
    "WorkforcePermitsPage.tsx",
    "WorkforceCasesPage.tsx",
    "WorkforceDocumentsPage.tsx",
    "WorkforceSyncPage.tsx",
    # Sanad - done
    "SanadPage.tsx",
    "SanadMarketplacePage.tsx",
    # Billing - done
    "BillingEnginePage.tsx",
    # Alerts - done
    "ExpiryAlertsPage.tsx",
    "alerts.getExpiryAlerts",
    # Renewal workflows - done
    "RenewalWorkflowsPage.tsx",
    # Platform ops - done
    "PlatformOpsPage.tsx",
    # Audit log - done
    "AuditLogPage.tsx",
    # Admin - done
    "AdminPage.tsx",
    # Client portal - done
    "ClientPortalPage.tsx",
    # Subscriptions - done
    "SubscriptionsPage.tsx",
    # Finance - done
    "FinanceOverviewPage.tsx",
    # Employee lifecycle - done
    "EmployeeLifecyclePage.tsx",
    # Employee import - done
    "EmployeeImportPage.tsx",
    # Onboarding - done
    "OnboardingPage.tsx",
    "OnboardingGuidePage.tsx",
    # Preferences - done
    "PreferencesPage.tsx",
    # Accept invite - done
    "AcceptInvitePage.tsx",
    # Email preview - done
    "EmailPreviewPage.tsx",
    # Company hub - done
    "CompanyHubPage.tsx",
    "CompanyWorkspacePage.tsx",
    # Business operations - done
    "BusinessOperationsPage.tsx",
    # Attend check-in - done
    "AttendCheckInPage.tsx",
    # Contract sign - done
    "ContractSignPage.tsx",
    # Public job board - done
    "PublicJobBoardPage.tsx",
    # SLA management - done
    "SlaManagementPage.tsx",
    # Omani officers - done
    "OmaniOfficersPage.tsx",
    "OfficerAssignmentPage.tsx",
    # Sanad ratings - done
    "SanadRatingsModerationPage.tsx",
    # Sanad catalogue - done
    "SanadCatalogueAdminPage.tsx",
    # Sanad centre - done
    "SanadCentreProfilePage.tsx",
    # Sanad office dashboard - done
    "SanadOfficeDashboardPage.tsx",
    # Company admin - done
    "CompanyAdminPage.tsx",
    "CreateCompanyPage.tsx",
    # Workforce case new - done
    "WorkforceCaseNewPage.tsx",
    "WorkforcePermitUploadPage.tsx",
    "WorkforcePermitDetailPage.tsx",
    "WorkforceEmployeeDetailPage.tsx",
    # HR Employees - done
    "HREmployeesPage.tsx",
    # HR Attendance - done
    "HRAttendancePage.tsx",
    # Employee requests admin - done
    "EmployeeRequestsAdminPage.tsx",
    # Workflow detail - done
    "WorkflowDetailPage.tsx",
    # Pro services - done
    "ProServicesPage.tsx",
    # Marketplace - done
    "MarketplacePage.tsx",
    # Dashboard - done
    "Dashboard.tsx",
    # Home - done
    "Home.tsx",
    # Sidebar role filtering - done
    "PlatformLayout: role-specific mobile bottom nav tabs",
    "PlatformLayout: show clear role badge",
    "clientNav.ts: filter sidebar",
    # HR Dashboard stats - done
    "hr.getDashboardStats",
    # Operations HR snapshot - done
    "Operations Dashboard: HR workforce snapshot",
    # Profile completeness bar - done
    "EmployeeLifecyclePage: profile completeness bar",
    # Dark mode fix - done
    "Fix dark mode on ContractSignPage",
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
print("\nRemaining items:")
for l in new_lines:
    if l.startswith("- [ ]"):
        print(l)
