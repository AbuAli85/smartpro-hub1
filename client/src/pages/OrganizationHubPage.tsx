import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HubBreadcrumb } from "@/components/hub/HubBreadcrumb";
import { Building2, ExternalLink, LayoutGrid, Network, Users, UserCheck } from "lucide-react";
import { Link } from "wouter";

export default function OrganizationHubPage() {
  const { activeCompanyId } = useActiveCompany();

  const { data: depts, isLoading: dLoading } = trpc.orgStructure.listDepartments.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );

  const { data: positions, isLoading: pLoading } = trpc.orgStructure.listPositions.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );

  const { data: stats, isLoading: sLoading } = trpc.team.getTeamStats.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );

  const deptCount = depts?.length ?? 0;
  const posCount = positions?.length ?? 0;
  const headcount = stats?.total ?? 0;
  const unassigned =
    stats?.byDepartment?.find((d) => d.dept === "Unassigned" || d.dept === "")?.count ?? 0;

  const topDepts = [...(depts ?? [])]
    .sort((a, b) => (b.employeeCount ?? 0) - (a.employeeCount ?? 0))
    .slice(0, 4);

  const sections = [
    {
      key: "chart",
      title: "Org chart",
      desc: "Drag-and-drop hierarchy by department.",
      href: "/hr/org-chart",
      icon: Network,
      preview: dLoading ? "…" : `${deptCount} department${deptCount === 1 ? "" : "s"} · ${headcount} people on roster`,
    },
    {
      key: "structure",
      title: "Org structure",
      desc: "Expandable tree: departments, positions, and members.",
      href: "/hr/org-structure",
      icon: LayoutGrid,
      preview: dLoading ? "…" : `Same ${deptCount} departments · drill into positions`,
    },
    {
      key: "departments",
      title: "Departments",
      desc: "Create, merge, and manage department records.",
      href: "/hr/departments",
      icon: Building2,
      preview: dLoading ? "…" : `${deptCount} active department record${deptCount === 1 ? "" : "s"}`,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <HubBreadcrumb
        items={[
          { label: "Home", href: "/dashboard" },
          { label: "People", href: "/my-team" },
          { label: "Organization" },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-7 w-7 text-primary" />
          Organization
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Structure, hierarchy, and departments — preview here, manage in each workspace.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryPill label="Departments" loading={dLoading} value={deptCount} />
        <SummaryPill label="Positions" loading={pLoading} value={posCount} />
        <SummaryPill label="Headcount" loading={sLoading} value={headcount} />
        <SummaryPill label="Unassigned dept." loading={sLoading} value={unassigned} warn={unassigned > 0} />
      </div>

      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCheck className="h-4 w-4" /> Completeness &amp; data hygiene
          </CardTitle>
          <CardDescription>
            Org strength depends on clean departments, positions, and employee profiles — jump to the right fix.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" asChild>
            <Link href="/hr/completeness">Profile completeness</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/hr/departments">Department records</Link>
          </Button>
        </CardContent>
      </Card>

      {topDepts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Largest teams</CardTitle>
            <CardDescription>By active roster in each department name.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {topDepts.map((d) => (
              <div key={d.id} className="flex justify-between text-sm border-b border-border/60 last:border-0 pb-2 last:pb-0">
                <span className="font-medium truncate">{d.name}</span>
                <span className="text-muted-foreground tabular-nums">{d.employeeCount ?? 0} people</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {sections.map((s) => (
          <Card key={s.key} className="hover:border-primary/30 transition-colors">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <s.icon className="h-4 w-4 text-primary" />
                {s.title}
              </CardTitle>
              <CardDescription>{s.desc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground min-h-[2.5rem]">{s.preview}</p>
              <Button asChild size="sm" className="gap-1">
                <Link href={s.href}>
                  Open <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SummaryPill({
  label,
  value,
  loading,
  warn,
}: {
  label: string;
  value: number;
  loading: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
      {loading ? (
        <Skeleton className="h-8 w-16 mt-1" />
      ) : (
        <p className={`text-2xl font-bold tabular-nums ${warn ? "text-amber-600" : ""}`}>{value}</p>
      )}
    </div>
  );
}
