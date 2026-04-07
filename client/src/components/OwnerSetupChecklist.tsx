import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Building2,
  UserPlus,
  DollarSign,
  FileText,
  Shield,
  CheckCircle2,
  Zap,
} from "lucide-react";

const SETUP_STEPS = [
  { key: "company", label: "Company profile created", icon: Building2, href: "/company/workspace" },
  { key: "employees", label: "Add your first employee", icon: UserPlus, href: "/my-team" },
  { key: "payroll", label: "Run your first payroll", icon: DollarSign, href: "/payroll" },
  { key: "contracts", label: "Create a contract", icon: FileText, href: "/contracts" },
  { key: "pro", label: "Submit a PRO service request", icon: Shield, href: "/pro" },
] as const;

/**
 * Shown on the owner command center for new workspaces until core setup is complete.
 */
export function OwnerSetupChecklist() {
  const { activeCompanyId } = useActiveCompany();
  const { data: company } = trpc.companies.myCompany.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: stats } = trpc.companies.myStats.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: teamStats } = trpc.team.getTeamStats.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: payrollRuns } = trpc.payroll.listRuns.useQuery({
    year: new Date().getFullYear(),
    companyId: activeCompanyId ?? undefined,
  }, { enabled: activeCompanyId != null });

  const setupDone = {
    company: !!company?.company,
    employees: (teamStats?.total ?? 0) > 0,
    payroll: (payrollRuns?.length ?? 0) > 0,
    contracts: (stats?.contracts ?? 0) > 0,
    pro: (stats?.proServices ?? 0) > 0,
  };
  const setupComplete = Object.values(setupDone).filter(Boolean).length;
  const setupTotal = SETUP_STEPS.length;
  const isNewCompany = setupComplete < 3;

  if (!isNewCompany || activeCompanyId == null) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap size={16} className="text-primary" />
            Getting started — set up your business
          </CardTitle>
          <span className="text-sm font-medium text-muted-foreground">
            {setupComplete}/{setupTotal} complete
          </span>
        </div>
        <Progress value={(setupComplete / setupTotal) * 100} className="h-1.5 mt-2" />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {SETUP_STEPS.map((step, i) => {
            const done = setupDone[step.key as keyof typeof setupDone];
            const Icon = step.icon;
            const inner = (
              <>
                <div
                  className={`p-1 rounded-md shrink-0 ${done ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-muted"}`}
                >
                  {done ? (
                    <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Icon size={12} className="text-muted-foreground" />
                  )}
                </div>
                <span
                  className={`text-xs font-medium ${
                    done ? "text-emerald-700 dark:text-emerald-400 line-through" : "text-foreground"
                  }`}
                >
                  {i + 1}. {step.label}
                </span>
              </>
            );
            if (done) {
              return (
                <div
                  key={step.key}
                  className="flex items-center gap-2 p-2.5 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20 cursor-default"
                >
                  {inner}
                </div>
              );
            }
            return (
              <Link key={step.key} href={step.href}>
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                  {inner}
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
