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
        <Route path="/crm" component={CRMPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/subscriptions" component={SubscriptionsPage} />
        <Route path="/admin" component={AdminPage} />
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
