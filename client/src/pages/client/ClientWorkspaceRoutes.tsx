import { Route, Switch } from "wouter";
import { ClientWorkspaceLayout } from "@/features/clientWorkspace/ClientWorkspaceLayout";
import ClientDashboardPage from "./ClientDashboardPage";
import ClientEngagementsPage from "./ClientEngagementsPage";
import ClientEngagementDetailPage from "./ClientEngagementDetailPage";
import ClientDocumentsPage from "./ClientDocumentsPage";
import ClientInvoicesPage from "./ClientInvoicesPage";
import ClientMessagesPage from "./ClientMessagesPage";
import ClientTeamPage from "./ClientTeamPage";

/**
 * Shell + nested routes for `/client/*` (strict client workspace).
 */
export default function ClientWorkspaceRoutes() {
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
