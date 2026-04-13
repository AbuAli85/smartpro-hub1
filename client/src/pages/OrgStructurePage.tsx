import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Building2, Users, ChevronDown, ChevronRight, UserCheck,
  Briefcase, Search, X, Network, AlertCircle,
} from "lucide-react";
import { Link } from "wouter";
import { HubBreadcrumb } from "@/components/hub/HubBreadcrumb";
import { organizationTrail } from "@/components/hub/hubCrumbs";

// ─── Types ────────────────────────────────────────────────────────────────────
type OrgEmployee = { id: number; name: string; position: string | null; managerId: number | null };
type OrgPosition = { id: number; title: string; titleAr?: string | null; employeeCount: number };
type OrgDept = {
  id: number;
  name: string;
  nameAr?: string | null;
  description?: string | null;
  headName: string | null;
  employeeCount: number;
  positions: OrgPosition[];
  employees: OrgEmployee[];
};
type UnassignedEmp = { id: number; name: string; position: string | null; department: string | null };

// ─── Color palette for departments ───────────────────────────────────────────
const DEPT_COLORS = [
  { bg: "bg-blue-500/10", border: "border-blue-500/30", icon: "text-blue-500", badge: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  { bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: "text-emerald-500", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  { bg: "bg-amber-500/10", border: "border-amber-500/30", icon: "text-amber-500", badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { bg: "bg-violet-500/10", border: "border-violet-500/30", icon: "text-violet-500", badge: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  { bg: "bg-rose-500/10", border: "border-rose-500/30", icon: "text-rose-500", badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  { bg: "bg-cyan-500/10", border: "border-cyan-500/30", icon: "text-cyan-500", badge: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" },
  { bg: "bg-orange-500/10", border: "border-orange-500/30", icon: "text-orange-500", badge: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  { bg: "bg-teal-500/10", border: "border-teal-500/30", icon: "text-teal-500", badge: "bg-teal-500/15 text-teal-700 dark:text-teal-300" },
];
function getDeptColor(idx: number) { return DEPT_COLORS[idx % DEPT_COLORS.length]; }

// ─── Employee Avatar ──────────────────────────────────────────────────────────
function EmpAvatar({ name }: { name: string }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="w-7 h-7 rounded-full bg-primary/15 text-primary font-semibold text-xs flex items-center justify-center shrink-0">
      {initials}
    </div>
  );
}

// ─── Employee Node ────────────────────────────────────────────────────────────
function EmployeeNode({ emp }: { emp: OrgEmployee }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-muted/40 transition-colors">
      <EmpAvatar name={emp.name} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate leading-tight">{emp.name}</p>
        {emp.position && <p className="text-xs text-muted-foreground truncate">{emp.position}</p>}
      </div>
    </div>
  );
}

// ─── Position Node ────────────────────────────────────────────────────────────
function PositionNode({ pos, employees, colorBadge }: { pos: OrgPosition; employees: OrgEmployee[]; colorBadge: string }) {
  const [expanded, setExpanded] = useState(false);
  const posEmps = employees.filter((e) => e.position === pos.title);

  return (
    <div className="ml-4 border-l-2 border-dashed border-border pl-4">
      <div
        className={`flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors ${posEmps.length > 0 ? "cursor-pointer hover:bg-muted/40" : ""}`}
        onClick={() => posEmps.length > 0 && setExpanded(!expanded)}
      >
        <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0">
          <Briefcase size={12} className="text-muted-foreground" />
        </div>
        <span className="text-sm font-medium flex-1 truncate">{pos.title}</span>
        {pos.titleAr && <span className="text-xs text-muted-foreground hidden sm:block" dir="rtl">{pos.titleAr}</span>}
        {posEmps.length > 0 ? (
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${colorBadge}`}>{posEmps.length}</span>
        ) : (
          <span className="text-xs text-muted-foreground/50 italic">Vacant</span>
        )}
        {posEmps.length > 0 && (expanded ? <ChevronDown size={13} className="text-muted-foreground shrink-0" /> : <ChevronRight size={13} className="text-muted-foreground shrink-0" />)}
      </div>
      {expanded && posEmps.length > 0 && (
        <div className="ml-4 border-l border-border pl-3 mt-1 space-y-0.5">
          {posEmps.map((emp) => <EmployeeNode key={emp.id} emp={emp} />)}
        </div>
      )}
    </div>
  );
}

// ─── Department Card ──────────────────────────────────────────────────────────
function DeptCard({ dept, colorIdx, defaultExpanded }: { dept: OrgDept; colorIdx: number; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAllEmps, setShowAllEmps] = useState(false);
  const color = getDeptColor(colorIdx);

  const positionTitles = new Set(dept.positions.map((p) => p.title));
  const unlinkedEmps = dept.employees.filter((e) => !e.position || !positionTitles.has(e.position));
  const displayedUnlinked = showAllEmps ? unlinkedEmps : unlinkedEmps.slice(0, 4);

  return (
    <div className={`rounded-2xl border-2 ${color.border} overflow-hidden transition-all`}>
      {/* Header */}
      <div
        className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer ${color.bg} hover:opacity-90 transition-opacity`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-10 h-10 rounded-xl bg-background/50 flex items-center justify-center shrink-0">
          <Building2 size={18} className={color.icon} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-base leading-tight">{dept.name}</h3>
            {dept.nameAr && <span className="text-sm text-muted-foreground" dir="rtl">{dept.nameAr}</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {dept.headName && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <UserCheck size={11} /> {dept.headName}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users size={11} /> {dept.employeeCount} employee{dept.employeeCount !== 1 ? "s" : ""}
            </span>
            {dept.positions.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Briefcase size={11} /> {dept.positions.length} position{dept.positions.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color.badge}`}>{dept.employeeCount}</span>
          {expanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 py-3 space-y-3 bg-background">
          {dept.description && (
            <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">{dept.description}</p>
          )}

          {/* Positions */}
          {dept.positions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Positions</p>
              <div className="space-y-1">
                {dept.positions.map((pos) => (
                  <PositionNode key={pos.id} pos={pos} employees={dept.employees} colorBadge={color.badge} />
                ))}
              </div>
            </div>
          )}

          {/* Employees not linked to a position */}
          {unlinkedEmps.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {dept.positions.length > 0 ? "Other Employees" : "Employees"}
              </p>
              <div className="space-y-0.5">
                {displayedUnlinked.map((emp) => <EmployeeNode key={emp.id} emp={emp} />)}
                {unlinkedEmps.length > 4 && (
                  <button className="text-xs text-primary hover:underline pl-2 mt-1" onClick={() => setShowAllEmps(!showAllEmps)}>
                    {showAllEmps ? "Show less" : `+${unlinkedEmps.length - 4} more`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Empty dept */}
          {dept.positions.length === 0 && dept.employeeCount === 0 && (
            <div className="text-center py-4 text-muted-foreground">
              <p className="text-xs">No positions or employees assigned yet</p>
              <Link href="/hr/departments">
                <span className="text-xs text-primary hover:underline mt-1 inline-block cursor-pointer">
                  Add positions in Departments →
                </span>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────
function SummaryBar({ depts, unassigned }: { depts: OrgDept[]; unassigned: UnassignedEmp[] }) {
  const totalEmps = depts.reduce((s, d) => s + d.employeeCount, 0) + unassigned.length;
  const totalPositions = depts.reduce((s, d) => s + d.positions.length, 0);
  const staffedDepts = depts.filter((d) => d.employeeCount > 0).length;
  const items = [
    { label: "Departments", value: depts.length, icon: <Building2 size={16} className="text-blue-500" />, bg: "bg-blue-500/10" },
    { label: "Active Employees", value: totalEmps, icon: <Users size={16} className="text-emerald-500" />, bg: "bg-emerald-500/10" },
    { label: "Defined Positions", value: totalPositions, icon: <Briefcase size={16} className="text-amber-500" />, bg: "bg-amber-500/10" },
    { label: "Staffed Depts", value: staffedDepts, icon: <UserCheck size={16} className="text-violet-500" />, bg: "bg-violet-500/10" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map(({ label, value, icon, bg }) => (
        <div key={label} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>{icon}</div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold leading-tight">{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OrgStructurePage() {
  const { activeCompanyId } = useActiveCompany();
  const [search, setSearch] = useState("");
  const [expandAll, setExpandAll] = useState(false);

  const { data, isLoading } = trpc.orgStructure.getOrgChartData.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );

  const departments: OrgDept[] = (data?.departments ?? []) as OrgDept[];
  const unassigned: UnassignedEmp[] = (data?.unassigned ?? []) as UnassignedEmp[];

  const filtered = useMemo(() => {
    if (!search.trim()) return departments;
    const q = search.toLowerCase();
    return departments.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.nameAr ?? "").toLowerCase().includes(q) ||
        d.employees.some((e) => e.name.toLowerCase().includes(q) || (e.position ?? "").toLowerCase().includes(q)) ||
        d.positions.some((p) => p.title.toLowerCase().includes(q))
    );
  }, [departments, search]);

  const filteredUnassigned = useMemo(() => {
    if (!search.trim()) return unassigned;
    const q = search.toLowerCase();
    return unassigned.filter(
      (e) => e.name.toLowerCase().includes(q) || (e.position ?? "").toLowerCase().includes(q)
    );
  }, [unassigned, search]);

  return (
    <div className="p-6 space-y-6">
      <HubBreadcrumb items={organizationTrail("Org structure")} />
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <Network size={24} className="text-primary" />
            Organisation Structure
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visual hierarchy of departments, positions, and team members
          </p>
          <p className="text-xs text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Organization:</span>
            <Link href="/hr/org-chart" className="text-primary hover:underline">
              Org chart
            </Link>
            <span className="text-muted-foreground/60">·</span>
            <Link href="/hr/departments" className="text-primary hover:underline">
              Departments
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline" size="sm"
            onClick={() => setExpandAll(!expandAll)}
            className="gap-1.5"
          >
            {expandAll ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {expandAll ? "Collapse All" : "Expand All"}
          </Button>
          <Link href="/hr/departments">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Building2 size={14} /> Manage Departments
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      {!isLoading && <SummaryBar depts={departments} unassigned={unassigned} />}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search departments, positions, employees..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setSearch("")}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-2xl" />)}
        </div>
      )}

      {/* Empty state — no departments */}
      {!isLoading && departments.length === 0 && (
        <div className="text-center py-20 border-2 border-dashed rounded-2xl text-muted-foreground">
          <Network size={48} className="mx-auto mb-4 opacity-20" />
          <p className="font-semibold text-lg">No departments defined yet</p>
          <p className="text-sm mt-1 mb-4">Create departments first to build your organisation structure</p>
          <Link href="/hr/departments">
            <Button className="gap-2">
              <Building2 size={15} /> Go to Departments
            </Button>
          </Link>
        </div>
      )}

      {/* Search empty */}
      {!isLoading && departments.length > 0 && filtered.length === 0 && filteredUnassigned.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Search size={32} className="mx-auto mb-3 opacity-25" />
          <p className="font-medium">No results for &ldquo;{search}&rdquo;</p>
          <button className="text-sm text-primary hover:underline mt-1" onClick={() => setSearch("")}>Clear search</button>
        </div>
      )}

      {/* Department cards */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map((dept) => (
            <DeptCard
              key={dept.id}
              dept={dept}
              colorIdx={departments.indexOf(dept)}
              defaultExpanded={expandAll || !!search}
            />
          ))}
        </div>
      )}

      {/* Unassigned employees */}
      {!isLoading && filteredUnassigned.length > 0 && (
        <div className="rounded-2xl border-2 border-dashed border-amber-500/40 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3.5 bg-amber-500/5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <AlertCircle size={18} className="text-amber-500" />
            </div>
            <div>
              <h3 className="font-bold text-base">Unassigned Employees</h3>
              <p className="text-xs text-muted-foreground">
                {filteredUnassigned.length} employee{filteredUnassigned.length !== 1 ? "s" : ""} not linked to any department
              </p>
            </div>
            <Badge variant="secondary" className="ml-auto bg-amber-500/15 text-amber-700 dark:text-amber-300 border-0">
              {filteredUnassigned.length}
            </Badge>
          </div>
          <div className="px-4 py-3 bg-background">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
              {filteredUnassigned.map((emp) => (
                <div key={emp.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-muted/40 transition-colors">
                  <EmpAvatar name={emp.name} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{emp.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {emp.position ?? "No position"}{emp.department ? ` · ${emp.department}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3 border-t pt-2">
              These employees have a department name that does not match any defined department.{" "}
              <Link href="/hr/departments">
                <span className="text-primary hover:underline cursor-pointer">Create matching departments</span>
              </Link>{" "}
              to include them in the chart.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
