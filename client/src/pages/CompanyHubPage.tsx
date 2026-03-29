import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Briefcase,
  Building2,
  Clock,
  FileText,
  Landmark,
  Megaphone,
  Shield,
  Target,
  Users,
  Wallet,
} from "lucide-react";

const DEPARTMENTS = [
  {
    title: "Sales & business development",
    description: "Pipeline, deals, and customer relationships.",
    icon: <Target className="h-8 w-8 text-[var(--smartpro-orange)]" />,
    href: "/crm",
    cta: "Open CRM",
  },
  {
    title: "Marketing & growth",
    description: "Reports and analytics to track performance.",
    icon: <Megaphone className="h-8 w-8 text-[var(--smartpro-orange)]" />,
    href: "/analytics",
    cta: "View analytics",
  },
  {
    title: "Operations",
    description: "Day-to-day tasks and what needs attention today.",
    icon: <Clock className="h-8 w-8 text-[var(--smartpro-orange)]" />,
    href: "/operations",
    cta: "Operations centre",
  },
  {
    title: "Human resources",
    description: "Employees, leave, attendance, and hiring.",
    icon: <Users className="h-8 w-8 text-[var(--smartpro-orange)]" />,
    href: "/hr/employees",
    cta: "HR — employees",
  },
  {
    title: "Finance & payroll",
    description: "Pay runs, payslips, and WPS-style exports (where enabled).",
    icon: <Wallet className="h-8 w-8 text-[var(--smartpro-orange)]" />,
    href: "/payroll",
    cta: "Payroll engine",
    leadershipOnly: true,
  },
  {
    title: "Legal & contracts",
    description: "Agreements, signatures, and document status.",
    icon: <FileText className="h-8 w-8 text-[var(--smartpro-orange)]" />,
    href: "/contracts",
    cta: "Contracts",
  },
  {
    title: "Workforce & government",
    description: "Permits, government cases, and document vault.",
    icon: <Shield className="h-8 w-8 text-[var(--smartpro-orange)]" />,
    href: "/workforce",
    cta: "Workforce hub",
  },
  {
    title: "Compliance",
    description: "MoL-style checks, certificates, and risk signals.",
    icon: <Landmark className="h-8 w-8 text-[var(--smartpro-orange)]" />,
    href: "/compliance",
    cta: "Compliance dashboard",
  },
  {
    title: "Procurement & services",
    description: "Quotations and marketplace providers.",
    icon: <Briefcase className="h-8 w-8 text-[var(--smartpro-orange)]" />,
    href: "/quotations",
    cta: "Quotations",
  },
];

export default function CompanyHubPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-[var(--smartpro-orange)]/15 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-[var(--smartpro-orange)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Company hub</h1>
            <p className="text-muted-foreground text-sm">
              Map your departments to SmartPRO — same product, clearer navigation for owners and managers.
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl mt-4">
          You do not need separate products per department. Use this page as a launchpad: pick the area that matches how
          your business is organised (sales, marketing, HR, finance, etc.). Access still follows your account role — for
          example payroll may only appear for owners and finance.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DEPARTMENTS.map((d) => (
          <Card key={d.title} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                {d.icon}
                {d.leadershipOnly && (
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    Owner / finance
                  </span>
                )}
              </div>
              <CardTitle className="text-lg leading-snug">{d.title}</CardTitle>
              <CardDescription>{d.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto pt-0">
              <Button asChild variant="secondary" className="w-full">
                <Link href={d.href}>{d.cta}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-dashed bg-muted/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Tip for owners</CardTitle>
          </div>
          <CardDescription>
            Hiding modules you do not use keeps the sidebar focused — open{" "}
            <Link href="/preferences" className="text-primary font-medium underline-offset-2 hover:underline">
              Navigation preferences
            </Link>{" "}
            to turn optional items off. Platform-only tools (billing, officer registry, etc.) are hidden automatically for
            business accounts.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
