import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  getHiddenNavHrefs,
  toggleNavHrefHidden,
  notifyNavPreferencesChanged,
} from "@/lib/navVisibility";
import { OPTIONAL_NAV_HREFS, shouldUsePortalOnlyShell } from "@shared/clientNav";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";

const OPTIONAL_LABELS: Record<string, string> = {
  "/analytics": "Analytics",
  "/compliance": "Compliance dashboard",
  "/marketplace": "Marketplace",
  "/hr/recruitment": "Recruitment",
  "/quotations": "Quotations",
};

export default function PreferencesPage() {
  const { activeCompanyId } = useActiveCompany();
  const { user } = useAuth();
  const { data: myCompany, isLoading: myCompanyLoading } = trpc.companies.myCompany.useQuery({ companyId: activeCompanyId ?? undefined });
  const [hidden, setHidden] = useState<Set<string>>(() => getHiddenNavHrefs());

  useEffect(() => {
    setHidden(getHiddenNavHrefs());
  }, []);

  const portalOnly = shouldUsePortalOnlyShell(user, {
    hasCompanyWorkspace: Boolean(myCompany?.company?.id),
    companyWorkspaceLoading: myCompanyLoading,
  });

  const onToggle = (href: string, checked: boolean) => {
    toggleNavHrefHidden(href, !checked);
    setHidden(getHiddenNavHrefs());
    notifyNavPreferencesChanged();
  };

  if (portalOnly) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>
              Your account uses the simplified client experience. Navigation preferences apply to full company workspaces.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Navigation preferences</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Turn off areas you do not need — the sidebar updates instantly. This only affects your browser; it does not change
          permissions on the server.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Optional sidebar items</CardTitle>
          <CardDescription>Hidden items can be re-enabled anytime.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from(OPTIONAL_NAV_HREFS).map((href) => (
            <div key={href} className="flex items-center justify-between gap-4">
              <Label htmlFor={`nav-${href}`} className="text-sm font-normal cursor-pointer flex-1">
                {OPTIONAL_LABELS[href] ?? href}
              </Label>
              <Switch
                id={`nav-${href}`}
                checked={!hidden.has(href)}
                onCheckedChange={(on) => onToggle(href, on)}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
