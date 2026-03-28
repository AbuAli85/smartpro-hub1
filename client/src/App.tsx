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
import ProServicesPage from "./pages/ProServicesPage";
import MarketplacePage from "./pages/MarketplacePage";
import ContractsPage from "./pages/ContractsPage";
import HREmployeesPage from "./pages/HREmployeesPage";
import HRRecruitmentPage from "./pages/HRRecruitmentPage";
import HRLeavePage from "./pages/HRLeavePage";
import CRMPage from "./pages/CRMPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import AdminPage from "./pages/AdminPage";
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
import WorkforceCaseNewPage from "./pages/WorkforceCaseNewPage";
import CompanyAdminPage from "./pages/CompanyAdminPage";

function AppRoutes() {
  return (
    <PlatformLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/sanad" component={SanadPage} />
        <Route path="/pro" component={ProServicesPage} />
        <Route path="/marketplace" component={MarketplacePage} />
        <Route path="/contracts" component={ContractsPage} />
        <Route path="/hr/employees" component={HREmployeesPage} />
        <Route path="/hr/recruitment" component={HRRecruitmentPage} />
        <Route path="/hr/leave" component={HRLeavePage} />
        <Route path="/hr/attendance" component={HRAttendancePage} />
        <Route path="/client-portal" component={ClientPortalPage} />
        <Route path="/onboarding" component={OnboardingPage} />
        <Route path="/crm" component={CRMPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/subscriptions" component={SubscriptionsPage} />
        <Route path="/admin" component={AdminPage} />
        {/* Workforce Hub */}
        <Route path="/workforce" component={WorkforceDashboard} />
        <Route path="/workforce/employees" component={WorkforceEmployeesPage} />
        <Route path="/workforce/permits" component={WorkforcePermitsPage} />
        <Route path="/workforce/cases" component={WorkforceCasesPage} />
        <Route path="/workforce/documents" component={WorkforceDocumentsPage} />
        <Route path="/workforce/sync" component={WorkforceSyncPage} />
        <Route path="/workforce/permits/upload" component={WorkforcePermitUploadPage} />
        <Route path="/workforce/permits/:id" component={WorkforcePermitDetailPage} />
        <Route path="/workforce/employees/:id" component={WorkforceEmployeeDetailPage} />
        <Route path="/workforce/cases/new" component={WorkforceCaseNewPage} />
        {/* Company Admin */}
        <Route path="/company-admin" component={CompanyAdminPage} />
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
          <AppRoutes />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
