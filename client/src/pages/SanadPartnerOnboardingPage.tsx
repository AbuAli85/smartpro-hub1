import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Layers,
  Loader2,
  MapPin,
  Phone,
  ShoppingBag,
  Sparkles,
  User,
} from "lucide-react";
import { Link } from "wouter";

export default function SanadPartnerOnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const { data, isLoading, error } = trpc.sanad.partnerOnboardingWorkspace.useQuery(undefined, {
    enabled: Boolean(user),
  });

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto p-8">
        <Card>
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
            <CardDescription>Sign in with the SmartPRO account linked to your SANAD centre invite.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href={getLoginUrl("/sanad/partner-onboarding")}>Sign in</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto p-8">
        <Card className="border-destructive/50">
          <CardContent className="pt-6 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            {error.message}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              No linked centre
            </CardTitle>
            <CardDescription>
              We could not find a SANAD network centre linked to your account. Complete an invite from SmartPRO
              operations, or ask your administrator to connect your office record.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/sanad/marketplace">Browse marketplace</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const compliancePct =
    data.compliance.total > 0 ? Math.round((data.compliance.done / data.compliance.total) * 100) : 0;
  const profilePct = data.office
    ? Math.round((data.profileCompleteness.score / data.profileCompleteness.max) * 100)
    : 0;
  const recommended =
    data.recommendedNextActions && data.recommendedNextActions.length > 0
      ? data.recommendedNextActions
      : data.blockers;
  const marketplace = data.marketplaceReadiness;
  const catalogue = data.catalogueCompleteness;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">SANAD partner workspace</p>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">{data.centerName}</h1>
        <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
          <MapPin className="h-3.5 w-3.5" />
          {[data.governorateLabel, data.wilayat].filter(Boolean).join(" · ") || "Location pending"}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Centre ID <span className="tabular-nums font-medium text-foreground">{data.centerId}</span>
          {" · "}
          Lifecycle stage{" "}
          <span className="font-medium text-foreground capitalize">{data.stage.replace(/_/g, " ")}</span>
        </p>
      </div>

      <Card className="border-red-200/60 dark:border-red-900/40">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-red-600" />
              Current stage
            </CardTitle>
            <Badge className={data.badge.className}>{data.badge.label}</Badge>
          </div>
          <CardDescription>{data.badge.description}</CardDescription>
        </CardHeader>
      </Card>

      {recommended.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              Recommended next actions
            </CardTitle>
            <CardDescription>Based on your centre&apos;s lifecycle stage, compliance, and marketplace readiness.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground">
              {recommended.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Compliance checklist
            </CardTitle>
            <CardDescription>
              {data.compliance.total === 0
                ? "Compliance items are not seeded yet for this centre."
                : `${data.compliance.done} of ${data.compliance.total} items closed`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.compliance.total > 0 ? (
              <>
                <Progress value={compliancePct} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">{compliancePct}% complete</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Your network team will seed requirements before review.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Public profile
            </CardTitle>
            <CardDescription>
              {data.office
                ? "Fields needed for a strong marketplace presence."
                : "Activate your office to edit your public profile."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.office ? (
              <>
                <Progress value={profilePct} className="h-2" />
                {data.profileCompleteness.missing.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Missing: {data.profileCompleteness.missing.join(", ")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Office activation unlocks catalogue and listing controls.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Marketplace readiness
            </CardTitle>
            <CardDescription>Requirements before your office can appear in the public SANAD marketplace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={marketplace?.ready ? "default" : "secondary"}>
                {marketplace?.ready ? "Ready" : "Not ready"}
              </Badge>
            </div>
            {!marketplace?.ready && marketplace?.reasons && marketplace.reasons.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                {marketplace.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            ) : marketplace?.ready ? (
              <p className="text-sm text-muted-foreground">Your office meets the discovery-quality bar for listing.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Activate your office to evaluate marketplace readiness.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Service catalogue
            </CardTitle>
            <CardDescription>Active services clients can request from your office.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.office ? (
              <>
                <p className="text-2xl font-semibold tabular-nums">{catalogue?.activeCount ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {catalogue?.needsAtLeastOneActive
                    ? "Add at least one active catalogue item for marketplace eligibility."
                    : "Catalogue has active items."}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Available after office activation.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4" />
            Invite contact
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {data.contact.inviteAcceptName || data.contact.inviteAcceptPhone || data.contact.inviteAcceptEmail ? (
            <>
              {data.contact.inviteAcceptName && <p>{data.contact.inviteAcceptName}</p>}
              {data.contact.inviteAcceptPhone && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  {data.contact.inviteAcceptPhone}
                </p>
              )}
              {data.contact.inviteAcceptEmail && <p className="text-muted-foreground">{data.contact.inviteAcceptEmail}</p>}
            </>
          ) : (
            <p className="text-muted-foreground">No lead details on file — complete the invite form if you have not yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 pt-2">
        {!data.office ? (
          <p className="text-sm text-muted-foreground w-full">
            After SmartPRO activates your office, you can manage your catalogue and marketplace listing here.
          </p>
        ) : !marketplace?.ready ? (
          <>
            <Button asChild className="gap-2">
              <Link href="/sanad/catalogue-admin">
                Complete catalogue <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/sanad/office-dashboard">Office profile &amp; listing</Link>
            </Button>
          </>
        ) : (
          <>
            <Button asChild className="gap-2">
              <Link href="/sanad/marketplace">
                View marketplace <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/sanad/catalogue-admin">Manage catalogue</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/sanad/office-dashboard">Office dashboard</Link>
            </Button>
          </>
        )}
        <Button variant="ghost" asChild>
          <Link href="/dashboard">Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
