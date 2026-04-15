import { Route, Switch } from "wouter";
import BuyerPortalLayout from "@/components/BuyerPortalLayout";
import BuyerPortalPlaceholderPage from "@/pages/BuyerPortalPlaceholderPage";
import BuyerInvoicesPage from "@/pages/BuyerInvoicesPage";

export default function BuyerPortalRoutes() {
  return (
    <BuyerPortalLayout>
      <Switch>
        <Route path="/buyer/invoices" component={BuyerInvoicesPage} />
        <Route path="/buyer" component={BuyerPortalPlaceholderPage} />
      </Switch>
    </BuyerPortalLayout>
  );
}
