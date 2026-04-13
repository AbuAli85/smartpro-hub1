import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HubBreadcrumb } from "@/components/hub/HubBreadcrumb";
import {
  Bell,
  ClipboardCheck,
  ExternalLink,
  RefreshCw,
  Zap,
  CreditCard,
  Sparkles,
  Ban,
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

  const activeRules = (rules ?? []).filter((r) => r.isActive);
  const pausedRules = (rules ?? []).filter((r) => !r.isActive);

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
          Expiry pipeline: what is coming due, what needs a human, what runs on rules, and what is paused.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-600" /> Expiring
            </CardTitle>
            <CardDescription>Cross-surface items in the alert window.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {badge != null ? (
                <>
                  <span className="font-semibold text-foreground">{badge.count ?? 0}</span> open alert
                  {badge.count === 1 ? "" : "s"}
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
              <ClipboardCheck className="h-4 w-4 text-primary" /> Needs action
            </CardTitle>
            <CardDescription>Workflows and queues waiting on an owner.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {rules != null ? (
                <>
                  <span className="font-semibold text-foreground">{pausedRules.length}</span> paused rule
                  {pausedRules.length === 1 ? "" : "s"} · review if renewals should be running.
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
              <Sparkles className="h-4 w-4 text-emerald-600" /> Automated
            </CardTitle>
            <CardDescription>Rules that create cases and notifications on schedule.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {rules != null ? (
                <>
                  <span className="font-semibold text-foreground">{activeRules.length}</span> active automation rule
                  {activeRules.length === 1 ? "" : "s"} · tie-ins to subscriptions below.
                </>
              ) : (
                "Loading…"
              )}
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
                  Configure rules
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className={pausedRules.length > 0 ? "border-amber-500/40" : ""}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Ban className="h-4 w-4 text-muted-foreground" /> Blocked / paused
            </CardTitle>
            <CardDescription>Rules turned off or cases waiting on prerequisites.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {rules != null ? (
                pausedRules.length > 0 ? (
                  <>
                    <Badge variant="outline" className="mr-2">
                      {pausedRules.length} paused
                    </Badge>
                    Re-enable or adjust triggers so renewals do not stall.
                  </>
                ) : (
                  "No paused renewal rules — good operational hygiene."
                )
              ) : (
                "Loading…"
              )}
            </p>
            <Button size="sm" variant="outline" asChild className="gap-1">
              <Link href="/renewal-workflows">
                Inspect rules <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
