import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import { lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import PlatformLayout from "./components/PlatformLayout";
import { ClientPreCompanyMinimalLayout } from "./features/clientWorkspace/ClientPreCompanyMinimalLayout";
import NavigationProgress from "./components/NavigationProgress";
import { PostAuthNavigationSweep } from "./components/PostAuthNavigationSweep";
import { isBuyerPortalUiEnabled } from "./lib/buyerPortalEnv";

// ─── Route-level code splitting ───────────────────────────────────────────────
// Each page is loaded only when its route is first visited, dramatically
// reducing the initial JS bundle size.
const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const SanadPage = lazy(() => import("./pages/SanadPage"));
const SanadOfficeDashboardPage = lazy(() => import("./pages/SanadOfficeDashboardPage"));
const ProServicesPage = lazy(() => import("./pages/ProServicesPage"));
const MarketplacePage = lazy(() => import("./pages/MarketplacePage"));
const ContractsPage = lazy(() => import("./pages/ContractsPage"));
const HREmployeesPage = lazy(() => import("./pages/HREmployeesPage"));
const HrEmployeeDetailRedirect = lazy(() => import("./pages/HrEmployeeDetailRedirect"));
const HRRecruitmentPage = lazy(() => import("./pages/HRRecruitmentPage"));
const HRLeavePage = lazy(() => import("./pages/HRLeavePage"));
const CRMPage = lazy(() => import("./pages/CRMPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const SubscriptionsPage = lazy(() => import("./pages/SubscriptionsPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const AdminSanadIntelligencePage = lazy(() => import("./pages/AdminSanadIntelligencePage"));
const HRAttendancePage = lazy(() => import("./pages/HRAttendancePage"));
const ClientWorkspaceRoutes = lazy(() => import("./pages/client/ClientWorkspaceRoutes"));
const EngagementsPage = lazy(() => import("./pages/EngagementsPage"));
const EngagementsOpsPage = lazy(() => import("./pages/EngagementsOpsPage"));
const EngagementDetailPage = lazy(() => import("./pages/EngagementDetailPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const WorkforceDashboard = lazy(() => import("./pages/WorkforceDashboard"));
const WorkforceEmployeesPage = lazy(() => import("./pages/WorkforceEmployeesPage"));
const WorkforcePermitsPage = lazy(() => import("./pages/WorkforcePermitsPage"));
const WorkforceCasesPage = lazy(() => import("./pages/WorkforceCasesPage"));
const WorkforceDocumentsPage = lazy(() => import("./pages/WorkforceDocumentsPage"));
const WorkforceSyncPage = lazy(() => import("./pages/WorkforceSyncPage"));
const WorkforcePermitUploadPage = lazy(() => import("./pages/WorkforcePermitUploadPage"));
const WorkforcePermitDetailPage = lazy(() => import("./pages/WorkforcePermitDetailPage"));
const WorkforceEmployeeDetailPage = lazy(() => import("./pages/WorkforceEmployeeDetailPage"));
const WorkforceProfileChangeRequestsPage = lazy(() => import("./pages/WorkforceProfileChangeRequestsPage"));
const WorkforceCaseNewPage = lazy(() => import("./pages/WorkforceCaseNewPage"));
const CompanyAdminPage = lazy(() => import("./pages/CompanyAdminPage"));
const CreateCompanyPage = lazy(() => import("./pages/CreateCompanyPage"));
const CompanyProfilePage = lazy(() => import("./pages/CompanyProfilePage"));
const CompanySettingsPage = lazy(() => import("./pages/CompanySettingsPage"));
const OmaniOfficersPage = lazy(() => import("./pages/OmaniOfficersPage"));
const OfficerAssignmentPage = lazy(() => import("./pages/OfficerAssignmentPage"));
const SanadMarketplacePage = lazy(() => import("./pages/SanadMarketplacePage"));
const SanadPartnerOnboardingPage = lazy(() => import("./pages/SanadPartnerOnboardingPage"));
const SanadCentreProfilePage = lazy(() => import("./pages/SanadCentreProfilePage"));
const SanadCatalogueAdminPage = lazy(() => import("./pages/SanadCatalogueAdminPage"));
const BillingEnginePage = lazy(() => import("./pages/BillingEnginePage"));
const ClientBillingPage = lazy(() => import("./pages/ClientBillingPage"));
const CollectionsPage = lazy(() => import("./pages/CollectionsPage"));
const ExpiryAlertsPage = lazy(() => import("./pages/ExpiryAlertsPage"));
const RenewalWorkflowsPage = lazy(() => import("./pages/RenewalWorkflowsPage"));
const PlatformOpsPage = lazy(() => import("./pages/PlatformOpsPage"));
const NavIntegrityPage = lazy(() => import("./pages/NavIntegrityPage"));
const PayrollEnginePage = lazy(() => import("./pages/PayrollEnginePage"));
const PayrollProcessingPage = lazy(() => import("./pages/PayrollProcessingPage"));
const SanadRatingsModerationPage = lazy(() => import("./pages/SanadRatingsModerationPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const AuditLogPage = lazy(() => import("./pages/AuditLogPage"));
const PublicJobBoardPage = lazy(() => import("./pages/PublicJobBoardPage"));
const WorkflowDetailPage = lazy(() => import("./pages/WorkflowDetailPage"));
const ContractSignPage = lazy(() => import("./pages/ContractSignPage"));
const OperationsDashboardPage = lazy(() => import("./pages/OperationsDashboardPage"));
const QuotationsPage = lazy(() => import("./pages/QuotationsPage"));
const SlaManagementPage = lazy(() => import("./pages/SlaManagementPage"));
const ComplianceDashboardPage = lazy(() => import("./pages/ComplianceDashboardPage"));
const CompanyHubPage = lazy(() => import("./pages/CompanyHubPage"));
const CompanyWorkspacePage = lazy(() => import("./pages/CompanyWorkspacePage"));
const MyTeamPage = lazy(() => import("./pages/MyTeamPage"));
const PreferencesPage = lazy(() => import("./pages/PreferencesPage"));
const OnboardingGuidePage = lazy(() => import("./pages/OnboardingChecklistPage"));
const AcceptInvitePage = lazy(() => import("./pages/AcceptInvitePage"));
const SanadJoinInvitePage = lazy(() => import("./pages/SanadJoinInvitePage"));
const BusinessDashboardPage = lazy(() => import("./pages/BusinessDashboardPage"));
const EmployeeLifecyclePage = lazy(() => import("./pages/EmployeeLifecyclePage"));
const BusinessOperationsPage = lazy(() => import("./pages/BusinessOperationsPage"));
const EmployeeImportPage = lazy(() => import("./pages/EmployeeImportPage"));
const CompanyDocumentsPage = lazy(() => import("./pages/CompanyDocumentsPage"));
const EmployeeDocumentsPage = lazy(() => import("./pages/EmployeeDocumentsPage"));
const HRDocumentsDashboardPage = lazy(() => import("./pages/HRDocumentsDashboardPage"));
const ContractManagementPage = lazy(() => import("./pages/ContractManagementPage"));
const PromoterAssignmentsPage = lazy(() => import("./pages/PromoterAssignmentsPage"));
const PromoterAssignmentOperationsPage = lazy(() => import("./pages/PromoterAssignmentOperationsPage"));
const PromoterAssignmentStagingPage = lazy(() => import("./pages/PromoterAssignmentStagingPage"));
const PromoterFinanceHubPage = lazy(() => import("./pages/PromoterFinanceHubPage"));
const ContractDetailPage = lazy(() => import("./pages/ContractDetailPage"));
const DocumentExpiryDashboard = lazy(() => import("./pages/DocumentExpiryDashboard"));
const HRLettersPage = lazy(() => import("./pages/HRLettersPage"));
const HRKpiPage = lazy(() => import("./pages/HRKpiPage"));
const HRPerformancePage = lazy(() => import("./pages/HRPerformancePage"));
const HRAccountabilityPage = lazy(() => import("./pages/HRAccountabilityPage"));
const WorkspacePage = lazy(() => import("./pages/WorkspacePage"));
const FinanceOverviewPage = lazy(() => import("./pages/FinanceOverviewPage"));
const LeaveBalancePage = lazy(() => import("./pages/LeaveBalancePage"));
const EmployeeCompletenessPage = lazy(() => import("./pages/EmployeeCompletenessPage"));
const OrgStructurePage = lazy(() => import("./pages/OrgStructurePage"));
const DepartmentsPage = lazy(() => import("./pages/DepartmentsPage"));
const OrgChartPage = lazy(() => import("./pages/OrgChartPage"));
const WorkforceIntelligencePage = lazy(() => import("./pages/WorkforceIntelligencePage"));
const TaskManagerPage = lazy(() => import("./pages/TaskManagerPage"));
const AnnouncementsPage = lazy(() => import("./pages/AnnouncementsPage"));
const EmployeePortalPage = lazy(() => import("./pages/EmployeePortalPage"));
const AttendCheckInPage = lazy(() => import("./pages/AttendCheckInPage"));
const AttendanceSitesPage = lazy(() => import("./pages/AttendanceSitesPage"));
const AttendanceAnomaliesPage = lazy(() => import("./pages/AttendanceAnomaliesPage"));
const AttendanceReconciliationPage = lazy(() => import("./pages/AttendanceReconciliationPage"));
const EmployeeRequestsAdminPage = lazy(() => import("./pages/EmployeeRequestsAdminPage"));
const ShiftTemplatesPage = lazy(() => import("./pages/ShiftTemplatesPage"));
const EmployeeSchedulesPage = lazy(() => import("./pages/EmployeeSchedulesPage"));
const HolidayCalendarPage = lazy(() => import("./pages/HolidayCalendarPage"));
const TodayBoardPage = lazy(() => import("./pages/TodayBoardPage"));
const MonthlyReportPage = lazy(() => import("./pages/MonthlyReportPage"));
const TeamAccessPage = lazy(() => import("./pages/TeamAccessPage"));
const MultiCompanyRolesPage = lazy(() => import("./pages/MultiCompanyRolesPage"));
const EmailPreviewPage = lazy(() => import("./pages/EmailPreviewPage"));
const UserRolesPage = lazy(() => import("./pages/UserRolesPage"));
const ExecutiveDashboardPage = lazy(() => import("./pages/ExecutiveDashboardPage"));
const HRInsightsHubPage = lazy(() => import("./pages/HRInsightsHubPage"));
const OrganizationHubPage = lazy(() => import("./pages/OrganizationHubPage"));
const ComplianceRenewalsHubPage = lazy(() => import("./pages/ComplianceRenewalsHubPage"));
const ControlTowerPage = lazy(() => import("./pages/ControlTowerPage"));
const SurveyStartPage = lazy(() => import("./pages/SurveyStartPage"));
const SurveyRespondPage = lazy(() => import("./pages/SurveyRespondPage"));
const SurveyCompletePage = lazy(() => import("./pages/SurveyCompletePage"));
const SurveyAdminResponsesPage = lazy(() => import("./pages/SurveyAdminResponsesPage"));
const SurveyAdminResponseDetailPage = lazy(() => import("./pages/SurveyAdminResponseDetailPage"));
const SurveyAdminAnalyticsPage = lazy(() => import("./pages/SurveyAdminAnalyticsPage"));
const ProductionReadinessPage = lazy(() => import("./pages/ProductionReadinessPage"));
const AttractPage = lazy(() => import("./pages/AttractPage"));
const ConvertPage = lazy(() => import("./pages/ConvertPage"));
const RetainPage = lazy(() => import("./pages/RetainPage"));
const BuyerPortalRoutes = lazy(() => import("./pages/BuyerPortalRoutes"));
const BuyerPortalLegacyPathPage = lazy(() => import("./pages/BuyerPortalLegacyPathPage"));
const MfaChallengePage = lazy(() => import("./pages/MfaChallengePage"));
const NotFound = lazy(() => import("./pages/NotFound"));

// ─── Page loading fallback ────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

/** `/client` and `/client/...` — never wrapped in {@link PlatformLayout} (no admin sidebar / ops shell). */
const CLIENT_APP_PATH = /^\/client(\/.*)?$/;

function ClientAppLayout() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ClientPreCompanyMinimalLayout>
        <Switch>
          <Route path="/client/company/create" component={CreateCompanyPage} />
          <Route component={ClientWorkspaceRoutes} />
        </Switch>
      </ClientPreCompanyMinimalLayout>
    </Suspense>
  );
}

function PublicRoutes() {
  const buyerPortalUi = isBuyerPortalUiEnabled();
  return (
    <Switch>
      <Route path="/buyer-portal/invoices" component={BuyerPortalLegacyPathPage} />
      <Route path="/buyer-portal" component={BuyerPortalLegacyPathPage} />
      {buyerPortalUi ? <Route path="/buyer/invoices" component={BuyerPortalRoutes} /> : null}
      {buyerPortalUi ? <Route path="/buyer" component={BuyerPortalRoutes} /> : null}
      <Route path="/jobs" component={PublicJobBoardPage} />
      <Route path="/auth/mfa" component={MfaChallengePage} />
      <Route path="/contracts/:id/sign" component={ContractSignPage} />
      <Route path="/attend/:token" component={AttendCheckInPage} />
      <Route path="/sanad/join" component={SanadJoinInvitePage} />
      {/* ── Business Sector Survey (public) ────────────────────────────── */}
      <Route path="/survey/:slug/complete" component={SurveyCompletePage} />
      <Route path="/survey/:slug" component={SurveyRespondPage} />
      <Route path="/survey" component={SurveyStartPage} />
      {/* ── Feature pillar pages (public) ──────────────────────────────── */}
      <Route path="/features/attract" component={AttractPage} />
      <Route path="/features/convert" component={ConvertPage} />
      <Route path="/features/retain" component={RetainPage} />
      <Route path="/" component={Home} />
      <Route component={AppRoutes} />
    </Switch>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path={CLIENT_APP_PATH} component={ClientAppLayout} />
      <Route>
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
        <Route path="/hr/attendance-anomalies" component={AttendanceAnomaliesPage} />
        <Route path="/hr/attendance-reconciliation" component={AttendanceReconciliationPage} />
        <Route path="/hr/employee-requests" component={EmployeeRequestsAdminPage} />
        <Route path="/hr/shift-templates" component={ShiftTemplatesPage} />
        <Route path="/hr/employee-schedules" component={EmployeeSchedulesPage} />
        <Route path="/hr/holidays" component={HolidayCalendarPage} />
        <Route path="/hr/today-board" component={TodayBoardPage} />
        <Route path="/hr/monthly-report" component={MonthlyReportPage} />
        <Route path="/hr/insights" component={HRInsightsHubPage} />
        <Route path="/client-portal">{() => <Redirect to="/client" />}</Route>
        <Route path="/engagements/ops" component={EngagementsOpsPage} />
        <Route path="/engagements/:id" component={EngagementDetailPage} />
        <Route path="/engagements" component={EngagementsPage} />
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
        <Route path="/client-billing" component={ClientBillingPage} />
        <Route path="/collections" component={CollectionsPage} />
        <Route path="/alerts" component={ExpiryAlertsPage} />
        <Route path="/renewal-workflows/:id" component={WorkflowDetailPage} />
        <Route path="/renewal-workflows" component={RenewalWorkflowsPage} />
        <Route path="/platform-ops" component={PlatformOpsPage} />
        <Route path="/nav-integrity" component={NavIntegrityPage} />
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
        <Route path="/compliance/renewals" component={ComplianceRenewalsHubPage} />
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
        <Route path="/hr/promoter-assignment-ops" component={PromoterAssignmentOperationsPage} />
        <Route path="/hr/promoter-staging" component={PromoterAssignmentStagingPage} />
        <Route path="/hr/promoter-finance" component={PromoterFinanceHubPage} />
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
        <Route path="/organization" component={OrganizationHubPage} />
        <Route path="/hr/workforce-intelligence" component={WorkforceIntelligencePage} />
        <Route path="/hr/executive-dashboard" component={ExecutiveDashboardPage} />
        <Route path="/hr/tasks" component={TaskManagerPage} />
        <Route path="/hr/announcements" component={AnnouncementsPage} />
        <Route path="/workspace" component={WorkspacePage} />
        <Route path="/my-portal" component={EmployeePortalPage} />
        <Route path="/company/team-access" component={() => <TeamAccessPage />} />
        <Route path="/company/multi-company-roles" component={MultiCompanyRolesPage} />
        <Route path="/my-team" component={MyTeamPage} />
        <Route path="/business/dashboard" component={BusinessDashboardPage} />
        <Route path="/business/employee/:id" component={EmployeeLifecyclePage} />
        <Route path="/company/operations" component={BusinessOperationsPage} />
        <Route path="/preferences" component={PreferencesPage} />
        <Route path="/onboarding-guide" component={OnboardingGuidePage} />
        <Route path="/invite/:token" component={AcceptInvitePage} />
        <Route path="/sanad/centre/:id" component={SanadCentreProfilePage} />
        {/* ── Business Sector Survey (admin) ───────────────────────────── */}
        <Route path="/survey/admin/responses/:id" component={SurveyAdminResponseDetailPage} />
        <Route path="/survey/admin/responses" component={SurveyAdminResponsesPage} />
        <Route path="/survey/admin/analytics" component={SurveyAdminAnalyticsPage} />
        <Route path="/platform-readiness" component={ProductionReadinessPage} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
          </Switch>
        </PlatformLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <PostAuthNavigationSweep />
          <NavigationProgress />
          <Toaster />
          <Suspense fallback={<PageLoader />}>
            <PublicRoutes />
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
