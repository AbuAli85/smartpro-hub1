import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2,
  Circle,
  SkipForward,
  ArrowRight,
  Trophy,
  User,
  Building2,
  Users,
  Briefcase,
  ShieldCheck,
  Compass,
  LayoutDashboard,
  UserPlus,
  FileText,
  Store,
  CreditCard,
  RotateCcw,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  User,
  Building2,
  Users,
  UserPlus,
  FileText,
  Briefcase,
  ShieldCheck,
  LayoutDashboard,
  Store,
  CreditCard,
};

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  profile: User,
  company: Building2,
  team: Users,
  services: Briefcase,
  compliance: ShieldCheck,
  explore: Compass,
};

const CATEGORY_LABELS: Record<string, string> = {
  all: "All Steps",
  profile: "Profile",
  company: "Company",
  team: "Team",
  services: "Services",
  compliance: "Compliance",
  explore: "Explore",
};

type StepStatus = "pending" | "completed" | "skipped";

interface OnboardingStep {
  id: number;
  stepKey: string;
  category: string;
  titleEn: string;
  titleAr: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  actionLabel: string | null;
  actionUrl: string | null;
  iconName: string | null;
  sortOrder: number;
  isRequired: boolean;
  status: StepStatus;
  completedAt: Date | null;
  skippedAt: Date | null;
  autoCompleted: boolean;
}

export default function OnboardingChecklistPage() {
  const { t, i18n } = useTranslation("common");
  const isAr = i18n.language.startsWith("ar");
  const { activeCompanyId } = useActiveCompany();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("all");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.onboarding.getProgress.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );

  const completeStep = trpc.onboarding.completeStep.useMutation({
    onSuccess: () => utils.onboarding.getProgress.invalidate(),
  });

  const skipStep = trpc.onboarding.skipStep.useMutation({
    onSuccess: () => utils.onboarding.getProgress.invalidate(),
  });

  const resetProgress = trpc.onboarding.resetProgress.useMutation({
    onSuccess: () => utils.onboarding.getProgress.invalidate(),
  });

  const steps: OnboardingStep[] = data?.steps ?? [];
  const summary = data?.summary;

  const filteredSteps =
    activeTab === "all" ? steps : steps.filter((s) => s.category === activeTab);

  const categories = ["all", ...Array.from(new Set(steps.map((s) => s.category)))];

  const getTitle = (step: OnboardingStep) =>
    isAr && step.titleAr ? step.titleAr : step.titleEn;
  const getDescription = (step: OnboardingStep) =>
    isAr && step.descriptionAr ? step.descriptionAr : step.descriptionEn;

  const handleAction = (step: OnboardingStep) => {
    if (step.status !== "completed") {
      completeStep.mutate({
        stepKey: step.stepKey,
        companyId: activeCompanyId ?? undefined,
      });
    }
    if (step.actionUrl) {
      navigate(step.actionUrl);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-3 w-full" />
        <div className="grid gap-4 mt-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (summary?.isComplete) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center space-y-6 pt-16">
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <Trophy className="w-12 h-12 text-emerald-500" />
          </div>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {isAr ? "تهانينا! 🎉" : "Congratulations! 🎉"}
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            {isAr
              ? "لقد أكملت جميع خطوات الإعداد المطلوبة. منصتك جاهزة للعمل."
              : "You've completed all required setup steps. Your platform is ready to go."}
          </p>
        </div>
        <div className="flex gap-3 justify-center flex-wrap">
          <Button asChild>
            <Link href="/dashboard">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              {isAr ? "الذهاب إلى لوحة التحكم" : "Go to Dashboard"}
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              resetProgress.mutate({ companyId: activeCompanyId ?? undefined })
            }
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {isAr ? "إعادة التشغيل" : "Restart Checklist"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">
            {isAr ? "دليل الإعداد" : "Getting Started"}
          </h1>
        </div>
        <p className="text-muted-foreground">
          {isAr
            ? "أكمل هذه الخطوات لإعداد منصتك والبدء في الاستفادة الكاملة من SmartPRO."
            : "Complete these steps to set up your platform and get the most out of SmartPRO."}
        </p>
      </div>

      {/* Progress summary card */}
      {summary && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  {isAr ? "تقدمك الإجمالي" : "Overall Progress"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? `${summary.completed} من ${summary.total} خطوة مكتملة`
                    : `${summary.completed} of ${summary.total} steps completed`}
                </p>
              </div>
              <div className="text-right">
                <span className="text-3xl font-bold text-primary">
                  {summary.percentComplete}%
                </span>
              </div>
            </div>
            <Progress value={summary.percentComplete} className="h-2.5" />
            <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                {summary.completed} {isAr ? "مكتمل" : "completed"}
              </span>
              <span className="flex items-center gap-1">
                <Circle className="w-3.5 h-3.5 text-muted-foreground" />
                {summary.pending} {isAr ? "معلق" : "pending"}
              </span>
              {summary.skipped > 0 && (
                <span className="flex items-center gap-1">
                  <SkipForward className="w-3.5 h-3.5 text-amber-500" />
                  {summary.skipped} {isAr ? "تم التخطي" : "skipped"}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1 bg-muted/50">
          {categories.map((cat) => {
            const CatIcon = CATEGORY_ICONS[cat];
            const catSteps = cat === "all" ? steps : steps.filter((s) => s.category === cat);
            const catDone = catSteps.filter((s) => s.status === "completed").length;
            return (
              <TabsTrigger key={cat} value={cat} className="text-xs gap-1.5">
                {CatIcon && <CatIcon className="w-3.5 h-3.5" />}
                {CATEGORY_LABELS[cat] ?? cat}
                <Badge
                  variant={catDone === catSteps.length && catSteps.length > 0 ? "default" : "secondary"}
                  className="text-[10px] px-1.5 py-0 h-4 ml-1"
                >
                  {catDone}/{catSteps.length}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {categories.map((cat) => (
          <TabsContent key={cat} value={cat} className="mt-4 space-y-3">
            {filteredSteps.map((step) => {
              const StepIcon = ICON_MAP[step.iconName ?? ""] ?? Circle;
              const isDone = step.status === "completed";
              const isSkipped = step.status === "skipped";

              return (
                <div
                  key={step.stepKey}
                  className={cn(
                    "group relative flex items-start gap-4 rounded-xl border p-4 transition-all",
                    isDone
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : isSkipped
                      ? "border-border/50 bg-muted/30 opacity-60"
                      : "border-border bg-card hover:border-primary/30 hover:shadow-sm",
                  )}
                >
                  {/* Step icon / check */}
                  <div
                    className={cn(
                      "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center mt-0.5",
                      isDone
                        ? "bg-emerald-500/10 text-emerald-500"
                        : isSkipped
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <StepIcon className="w-5 h-5" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3
                            className={cn(
                              "font-semibold text-sm",
                              isDone ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
                            )}
                          >
                            {getTitle(step)}
                          </h3>
                          {step.isRequired && !isDone && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/40 text-primary">
                              {isAr ? "مطلوب" : "Required"}
                            </Badge>
                          )}
                          {isDone && step.autoCompleted && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                              {isAr ? "تلقائي" : "Auto"}
                            </Badge>
                          )}
                        </div>
                        {getDescription(step) && (
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            {getDescription(step)}
                          </p>
                        )}
                        {isDone && step.completedAt && (
                          <p className="text-[10px] text-emerald-500 mt-1">
                            {isAr ? "اكتمل في" : "Completed"}{" "}
                            {new Date(step.completedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      {!isDone && !isSkipped && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              skipStep.mutate({
                                stepKey: step.stepKey,
                                companyId: activeCompanyId ?? undefined,
                              })
                            }
                          >
                            <SkipForward className="w-3 h-3 mr-1" />
                            {isAr ? "تخطي" : "Skip"}
                          </Button>
                          <Button
                            size="sm"
                            className="text-xs h-7 px-3"
                            onClick={() => handleAction(step)}
                          >
                            {step.actionLabel ?? (isAr ? "ابدأ" : "Start")}
                            <ChevronRight className="w-3 h-3 ml-1" />
                          </Button>
                        </div>
                      )}

                      {isDone && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </TabsContent>
        ))}
      </Tabs>

      {/* Reset button */}
      {summary && summary.completed > 0 && (
        <div className="flex justify-end pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() =>
              resetProgress.mutate({ companyId: activeCompanyId ?? undefined })
            }
          >
            <RotateCcw className="w-3 h-3 mr-1.5" />
            {isAr ? "إعادة تعيين التقدم" : "Reset Progress"}
          </Button>
        </div>
      )}
    </div>
  );
}
