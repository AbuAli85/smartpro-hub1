import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import PlatformLayout from "./components/PlatformLayout";

// Pages
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import SanadPage from "./pages/SanadPage";
import SanadOfficeDashboardPage from "./pages/SanadOfficeDashboardPage";
import ProServicesPage from "./pages/ProServicesPage";
import MarketplacePage from "./pages/MarketplacePage";
import ContractsPage from "./pages/ContractsPage";
import HREmployeesPage from "./pages/HREmployeesPage";
import HrEmployeeDetailRedirect from "./pages/HrEmployeeDetailRedirect";
import HRRecruitmentPage from "./pages/HRRecruitmentPage";
import HRLeavePage from "./pages/HRLeavePage";
import CRMPage from "./pages/CRMPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import AdminPage from "./pages/AdminPage";
import AdminSanadIntelligencePage from "./pages/AdminSanadIntelligencePage";
import HRAttendancePage from "./pages/HRAttendancePage";
import ClientPortalPage from "./pages/ClientPortalPage";
import OnboardingPage from "./pages/OnboardingPage";
import WorkforceDashboard from "./pages/WorkforceDashboard";
import WorkforceEmployeesPage from "./pages/WorkforceEmployeesPage";
import WorkforcePermitsPage from "./pages/WorkforcePermitsPage";
import WorkforceCasesPage from "./pages/WorkforceCasesPage";
import WorkforceDocumentsPage from "./pages/WorkforceDocumentsPage";
import WorkforceSyncPage from "./pages/WorkforceSyncPage";
import WorkforcePermitUploadPage from "./pages/WorkforcePermitUploadPage";
import WorkforcePermitDetailPage from "./pages/WorkforcePermitDetailPage";
import WorkforceEmployeeDetailPage from "./pages/WorkforceEmployeeDetailPage";
import WorkforceProfileChangeRequestsPage from "./pages/WorkforceProfileChangeRequestsPage";
import WorkforceCaseNewPage from "./pages/WorkforceCaseNewPage";
import CompanyAdminPage from "./pages/CompanyAdminPage";
import CreateCompanyPage from "./pages/CreateCompanyPage";
import CompanyProfilePage from "./pages/CompanyProfilePage";
import CompanySettingsPage from "./pages/CompanySettingsPage";
import OmaniOfficersPage from "./pages/OmaniOfficersPage";
import OfficerAssignmentPage from "./pages/OfficerAssignmentPage";
import SanadMarketplacePage from "./pages/SanadMarketplacePage";
import SanadPartnerOnboardingPage from "./pages/SanadPartnerOnboardingPage";
import SanadCentreProfilePage from "./pages/SanadCentreProfilePage";
import SanadCatalogueAdminPage from "./pages/SanadCatalogueAdminPage";
import BillingEnginePage from "./pages/BillingEnginePage";
import ExpiryAlertsPage from "@/pages/ExpiryAlertsPage";
import RenewalWorkflowsPage from "@/pages/RenewalWorkflowsPage";
import PlatformOpsPage from "./pages/PlatformOpsPage";
import PayrollEnginePage from "./pages/PayrollEnginePage";
import PayrollProcessingPage from "./pages/PayrollProcessingPage";
import SanadRatingsModerationPage from "./pages/SanadRatingsModerationPage";
import ReportsPage from "./pages/ReportsPage";
import AuditLogPage from "./pages/AuditLogPage";
import PublicJobBoardPage from "./pages/PublicJobBoardPage";
import WorkflowDetailPage from "./pages/WorkflowDetailPage";
import ContractSignPage from "./pages/ContractSignPage";
import OperationsDashboardPage from "./pages/OperationsDashboardPage";
import QuotationsPage from "./pages/QuotationsPage";
import SlaManagementPage from "./pages/SlaManagementPage";
import ComplianceDashboardPage from "./pages/ComplianceDashboardPage";
import CompanyHubPage from "./pages/CompanyHubPage";
import CompanyWorkspacePage from "./pages/CompanyWorkspacePage";
import MyTeamPage from "./pages/MyTeamPage";
import PreferencesPage from "./pages/PreferencesPage";
import OnboardingGuidePage from "@/pages/OnboardingChecklistPage";
import AcceptInvitePage from "@/pages/AcceptInvitePage";
import SanadJoinInvitePage from "@/pages/SanadJoinInvitePage";
import BusinessDashboardPage from "./pages/BusinessDashboardPage";
import EmployeeLifecyclePage from "./pages/EmployeeLifecyclePage";
import BusinessOperationsPage from "./pages/BusinessOperationsPage";
import EmployeeImportPage from "./pages/EmployeeImportPage";
import CompanyDocumentsPage from "./pages/CompanyDocumentsPage";
import EmployeeDocumentsPage from "./pages/EmployeeDocumentsPage";
import HRDocumentsDashboardPage from "./pages/HRDocumentsDashboardPage";
import ContractManagementPage from "./pages/ContractManagementPage";
import PromoterAssignmentsPage from "./pages/PromoterAssignmentsPage";
import ContractDetailPage from "./pages/ContractDetailPage";
import DocumentExpiryDashboard from "./pages/DocumentExpiryDashboard";
import HRLettersPage from "./pages/HRLettersPage";
import HRKpiPage from "./pages/HRKpiPage";
import HRPerformancePage from "./pages/HRPerformancePage";
import HRAccountabilityPage from "./pages/HRAccountabilityPage";
import WorkspacePage from "./pages/WorkspacePage";
import FinanceOverviewPage from "./pages/FinanceOverviewPage";
import LeaveBalancePage from "./pages/LeaveBalancePage";
import EmployeeCompletenessPage from "./pages/EmployeeCompletenessPage";
import OrgStructurePage from "./pages/OrgStructurePage";
import DepartmentsPage from "./pages/DepartmentsPage";
import OrgChartPage from "./pages/OrgChartPage";
import WorkforceIntelligencePage from "./pages/WorkforceIntelligencePage";
import TaskManagerPage from "./pages/TaskManagerPage";
import AnnouncementsPage from "./pages/AnnouncementsPage";
import EmployeePortalPage from "./pages/EmployeePortalPage";
import AttendCheckInPage from "./pages/AttendCheckInPage";
import AttendanceSitesPage from "./pages/AttendanceSitesPage";
import EmployeeRequestsAdminPage from "./pages/EmployeeRequestsAdminPage";
import ShiftTemplatesPage from "./pages/ShiftTemplatesPage";
import EmployeeSchedulesPage from "./pages/EmployeeSchedulesPage";
import HolidayCalendarPage from "./pages/HolidayCalendarPage";
import TodayBoardPage from "./pages/TodayBoardPage";
import MonthlyReportPage from "./pages/MonthlyReportPage";
import TeamAccessPage from "./pages/TeamAccessPage";
import MultiCompanyRolesPage from "./pages/MultiCompanyRolesPage";
import EmailPreviewPage from "./pages/EmailPreviewPage";
import UserRolesPage from "./pages/UserRolesPage";
import ExecutiveDashboardPage from "./pages/ExecutiveDashboardPage";
import ControlTowerPage from "./pages/ControlTowerPage";
function PublicRoutes() {
  return (
    <Switch>
      <Route path="/jobs" component={PublicJobBoardPage} />
      <Route path="/contracts/:id/sign" component={ContractSignPage} />
      <Route path="/attend/:token" component={AttendCheckInPage} />
      <Route path="/sanad/join" component={SanadJoinInvitePage} />
      <Route path="/" component={Home} />
      <Route component={AppRoutes} />
    </Switch>
  );
}
function AppRoutes() {
  return (
    <PlatformLayout>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/control-tower" component={ControlTowerPage} />
        <Route path="/sanad" component={SanadPage} />
        <Route path="/sanad/office-dashboard" component={SanadOfficeDashboardPage} />
        <Route path="/pro" component={ProServicesPage} />
        <Route path="/marketplace" component={MarketplacePage} />
        <Route path="/contracts" component={ContractsPage} />
        <Route path="/hr/employees/:id" component={HrEmployeeDetailRedirect} />
        <Route path="/hr/employees" component={HREmployeesPage} />
        <Route path="/hr/recruitment" component={HRRecruitmentPage} />
        <Route path="/hr/leave" component={HRLeavePage} />
        <Route path="/hr/attendance" component={HRAttendancePage} />
        <Route path="/hr/attendance-sites" component={AttendanceSitesPage} />
        <Route path="/hr/employee-requests" component={EmployeeRequestsAdminPage} />
        <Route path="/hr/shift-templates" component={ShiftTemplatesPage} />
        <Route path="/hr/employee-schedules" component={EmployeeSchedulesPage} />
        <Route path="/hr/holidays" component={HolidayCalendarPage} />
        <Route path="/hr/today-board" component={TodayBoardPage} />
        <Route path="/hr/monthly-report" component={MonthlyReportPage} />
        <Route path="/client-portal" component={ClientPortalPage} />
        <Route path="/onboarding" component={OnboardingPage} />
        <Route path="/crm" component={CRMPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/subscriptions" component={SubscriptionsPage} />
        <Route path="/admin/sanad/compliance" component={AdminSanadIntelligencePage} />
        <Route path="/admin/sanad/opportunity" component={AdminSanadIntelligencePage} />
        <Route path="/admin/sanad/demand" component={AdminSanadIntelligencePage} />
        <Route path="/admin/sanad/directory" component={AdminSanadIntelligencePage} />
        <Route path="/admin/sanad" component={AdminSanadIntelligencePage} />
        <Route path="/admin" component={AdminPage} />
        {/* Workforce Hub — specific routes MUST come before parameterized ones */}
        <Route path="/workforce" component={WorkforceDashboard} />
        <Route path="/workforce/employees" component={WorkforceEmployeesPage} />
        <Route path="/workforce/permits/upload" component={WorkforcePermitUploadPage} />
        <Route path="/workforce/permits/:id" component={WorkforcePermitDetailPage} />
        <Route path="/workforce/permits" component={WorkforcePermitsPage} />
        <Route path="/workforce/cases/new" component={WorkforceCaseNewPage} />
        <Route path="/workforce/cases" component={WorkforceCasesPage} />
        <Route path="/workforce/profile-change-requests" component={WorkforceProfileChangeRequestsPage} />
        <Route path="/workforce/employees/:id" component={WorkforceEmployeeDetailPage} />
        <Route path="/workforce/documents" component={WorkforceDocumentsPage} />
        <Route path="/workforce/sync" component={WorkforceSyncPage} />
        {/* Company Admin */}
        <Route path="/company-admin" component={CompanyAdminPage} />
        <Route path="/company/profile" component={CompanyProfilePage} />
        <Route path="/company/settings" component={CompanySettingsPage} />
        <Route path="/company/email-preview" component={EmailPreviewPage} />
        <Route path="/company/create" component={CreateCompanyPage} />
        <Route path="/omani-officers" component={OmaniOfficersPage} />
        <Route path="/officer-assignments" component={OfficerAssignmentPage} />
        {/* Sanad Marketplace — specific routes before parameterized */}
        <Route path="/sanad/partner-onboarding" component={SanadPartnerOnboardingPage} />
        <Route path="/sanad/marketplace" component={SanadMarketplacePage} />
        <Route path="/sanad/catalogue-admin" component={SanadCatalogueAdminPage} />
        <Route path="/billing" component={BillingEnginePage} />
        <Route path="/alerts" component={ExpiryAlertsPage} />
          <Route path="/renewal-workflows/:id" component={WorkflowDetailPage} />
        <Route path="/renewal-workflows" component={RenewalWorkflowsPage} />
        <Route path="/platform-ops" component={PlatformOpsPage} />
        <Route path="/finance/overview" component={FinanceOverviewPage} />
        <Route path="/payroll" component={PayrollEnginePage} />
        <Route path="/payroll/process" component={PayrollProcessingPage} />
        <Route path="/sanad/ratings-moderation" component={SanadRatingsModerationPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/audit-log" component={AuditLogPage} />
        <Route path="/user-roles" component={UserRolesPage} />
        <Route path="/operations" component={OperationsDashboardPage} />
        <Route path="/quotations" component={QuotationsPage} />
        <Route path="/sla-management" component={SlaManagementPage} />
        <Route path="/compliance" component={ComplianceDashboardPage} />
        <Route path="/company/hub" component={CompanyHubPage} />
        <Route path="/company/workspace" component={CompanyWorkspacePage} />
        <Route path="/my-team/import" component={EmployeeImportPage} />
        <Route path="/company/documents" component={CompanyDocumentsPage} />
        <Route path="/employee/:id/documents" component={EmployeeDocumentsPage} />
        <Route path="/hr/documents-dashboard" component={HRDocumentsDashboardPage} />
        <Route path="/hr/expiry-dashboard" component={DocumentExpiryDashboard} />
        <Route path="/hr/letters" component={HRLettersPage} />
        {/* ── Promoter Contract Management (canonical routes) ──────────────── */}
        <Route path="/hr/contracts" component={ContractManagementPage} />
        <Route path="/hr/contracts/:id" component={ContractDetailPage} />
        {/* Legacy aliases — kept for backward compatibility; will be removed in a future release */}
        <Route path="/hr/promoter-assignments" component={ContractManagementPage} />
        <Route path="/hr/promoter-assignments/:id" component={ContractDetailPage} />
        <Route path="/hr/kpi" component={HRKpiPage} />
        <Route path="/hr/performance" component={HRPerformancePage} />
        <Route path="/hr/accountability" component={HRAccountabilityPage} />
        <Route path="/hr/leave-balance" component={LeaveBalancePage} />
        <Route path="/hr/completeness" component={EmployeeCompletenessPage} />
        <Route path="/hr/org-structure" component={OrgStructurePage} />
        <Route path="/hr/departments" component={DepartmentsPage} />
        <Route path="/hr/org-chart" component={OrgChartPage} />
        <Route path="/hr/workforce-intelligence" component={WorkforceIntelligencePage} />
        <Route path="/hr/executive-dashboard" component={ExecutiveDashboardPage} />
        <Route path="/hr/tasks" component={TaskManagerPage} />
        <Route path="/hr/announcements" component={AnnouncementsPage} />
        <Route path="/workspace" component={WorkspacePage} />
        <Route path="/my-portal" component={EmployeePortalPage} />
        <Route path="/company/team-access" component={TeamAccessPage} />
        <Route path="/company/multi-company-roles" component={MultiCompanyRolesPage} />
        <Route path="/my-team" component={MyTeamPage} />
        <Route path="/business/dashboard" component={BusinessDashboardPage} />
        <Route path="/business/employee/:id" component={EmployeeLifecyclePage} />
        <Route path="/company/operations" component={BusinessOperationsPage} />
        <Route path="/preferences" component={PreferencesPage} />
        <Route path="/onboarding-guide" component={OnboardingGuidePage} />
        <Route path="/invite/:token" component={AcceptInvitePage} />
        <Route path="/sanad/centre/:id" component={SanadCentreProfilePage} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </PlatformLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <PublicRoutes />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
