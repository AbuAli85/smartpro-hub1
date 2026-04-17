import { Route, Switch, Redirect } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { ClientWorkspaceLayout } from "@/features/clientWorkspace/ClientWorkspaceLayout";
import { ClientWorkspaceOnboarding } from "@/features/clientWorkspace/ClientWorkspaceOnboarding";
import { ClientWorkspaceBootstrapSkeleton } from "@/features/clientWorkspace/ClientWorkspaceBootstrapSkeleton";
import ClientDashboardPage from "./ClientDashboardPage";
import ClientEngagementsPage from "./ClientEngagementsPage";
import ClientEngagementDetailPage from "./ClientEngagementDetailPage";
import ClientDocumentsPage from "./ClientDocumentsPage";
import ClientInvoicesPage from "./ClientInvoicesPage";
import ClientMessagesPage from "./ClientMessagesPage";
import ClientTeamPage from "./ClientTeamPage";

/**
 * Shell + nested routes for `/client/*` (strict client workspace).
 * Users without any company membership see full-page onboarding (no sidebar) until a workspace exists.
 */
export default function ClientWorkspaceRoutes() {
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const { loading: companyCtxLoading, companies } = useActiveCompany();
  const bootstrapLoading = authLoading || companyCtxLoading;

  if (bootstrapLoading) {
    return <ClientWorkspaceBootstrapSkeleton />;
  }

  if (!isAuthenticated || !user) {
    return <Redirect to={getLoginUrl()} />;
  }

  if (companies.length === 0) {
    return <ClientWorkspaceOnboarding />;
  }

  return (
    <ClientWorkspaceLayout>
      <Switch>
        <Route path="/client/engagements/:id" component={ClientEngagementDetailPage} />
        <Route path="/client/engagements" component={ClientEngagementsPage} />
        <Route path="/client/documents" component={ClientDocumentsPage} />
        <Route path="/client/invoices" component={ClientInvoicesPage} />
        <Route path="/client/messages" component={ClientMessagesPage} />
        <Route path="/client/team" component={ClientTeamPage} />
        <Route path="/client" component={ClientDashboardPage} />
      </Switch>
    </ClientWorkspaceLayout>
  );
}
