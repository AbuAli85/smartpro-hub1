import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HubBreadcrumb } from "@/components/hub/HubBreadcrumb";
import {
  Bell,
  ClipboardCheck,
  ExternalLink,
  RefreshCw,
  Zap,
  CreditCard,
  Sparkles,
} from "lucide-react";
import { Link } from "wouter";

export default function ComplianceRenewalsHubPage() {
  const { activeCompanyId } = useActiveCompany();

  const { data: badge } = trpc.alerts.getAlertBadgeCount.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );

  const { data: rules } = trpc.renewalWorkflows.listRules.useQuery(undefined, {
    enabled: activeCompanyId != null,
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <HubBreadcrumb
        items={[
          { label: "Home", href: "/dashboard" },
          { label: "Compliance", href: "/compliance" },
          { label: "Renewals & expiry" },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <RefreshCw className="h-7 w-7 text-primary" />
          Renewals &amp; expiry
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          What is expiring, what needs action, and what runs automatically — then open the right tool.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-600" /> What is expiring
            </CardTitle>
            <CardDescription>Cross-surface expiry signals and HR document timelines.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {badge != null ? (
                <>
                  <span className="font-semibold text-foreground">{badge.count ?? 0}</span> items in the next window
                  {badge.critical ? (
                    <>
                      {" "}
                      · <span className="text-destructive font-medium">{badge.critical} critical</span>
                    </>
                  ) : null}
                </>
              ) : (
                "Connect your workspace to see alert counts."
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" asChild className="gap-1">
                <Link href="/alerts">
                  Expiry alerts <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button size="sm" variant="outline" asChild className="gap-1">
                <Link href="/hr/expiry-dashboard">
                  HR expiry dashboard <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" /> What needs action
            </CardTitle>
            <CardDescription>Workflows and subscriptions that require owners.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {rules != null ? (
                <>
                  <span className="font-semibold text-foreground">{rules.length}</span> renewal workflow rule
                  {rules.length === 1 ? "" : "s"} configured
                </>
              ) : (
                "Loading workflow coverage…"
              )}
            </p>
            <Button size="sm" asChild className="gap-1">
              <Link href="/renewal-workflows">
                Renewal workflows <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600" /> What is automated
            </CardTitle>
            <CardDescription>Billing signals and subscription lifecycle.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Tie commercial renewals to subscriptions and platform billing — jump in to configure or review runs.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" asChild className="gap-1">
                <Link href="/subscriptions">
                  <CreditCard className="h-3.5 w-3.5" />
                  Subscriptions
                </Link>
              </Button>
              <Button size="sm" variant="outline" asChild className="gap-1">
                <Link href="/renewal-workflows">
                  <Zap className="h-3.5 w-3.5" />
                  Automation rules
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
