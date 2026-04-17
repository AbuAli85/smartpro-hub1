import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Users, Sparkles } from "lucide-react";

/**
 * Full-page onboarding when the signed-in user has no company yet.
 * Shown instead of {@link ClientWorkspaceLayout} so empty dashboards and engagement lists are never shown.
 */
export function ClientWorkspaceOnboarding() {
  const { t } = useTranslation("engagements");
  const createHref = "/company/create?return=/client";

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-start px-4 py-10 md:py-14 bg-muted/20">
      <div className="w-full max-w-lg space-y-8 text-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("clientWorkspace.onboarding.title")}</h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{t("clientWorkspace.onboarding.subtitle")}</p>
        </div>

        <div className="space-y-4 text-start">
          <Card className="border-primary/25 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  1
                </div>
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">{t("clientWorkspace.onboarding.step1Title")}</CardTitle>
              </div>
              <CardDescription className="text-sm pt-1">{t("clientWorkspace.onboarding.step1Body")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" asChild>
                <Link href={createHref}>{t("clientWorkspace.onboarding.step1Cta")}</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="opacity-80 border-dashed">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-muted-foreground/40 text-sm font-semibold text-muted-foreground">
                  2
                </div>
                <Users className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">{t("clientWorkspace.onboarding.step2Title")}</CardTitle>
              </div>
              <CardDescription className="text-sm pt-1">{t("clientWorkspace.onboarding.step2Body")}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{t("clientWorkspace.onboarding.step2Hint")}</p>
            </CardContent>
          </Card>

          <Card className="opacity-80 border-dashed">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-muted-foreground/40 text-sm font-semibold text-muted-foreground">
                  3
                </div>
                <Sparkles className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">{t("clientWorkspace.onboarding.step3Title")}</CardTitle>
              </div>
              <CardDescription className="text-sm pt-1">{t("clientWorkspace.onboarding.step3Body")}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{t("clientWorkspace.onboarding.step3Hint")}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
