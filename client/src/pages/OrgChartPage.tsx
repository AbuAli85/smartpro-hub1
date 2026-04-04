import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Building2, Users, Search, X, ZoomIn, ZoomOut, Maximize2,
  ChevronDown, ChevronRight, LayoutGrid, Network, List,
  UserCheck, Briefcase, Globe, Download, RefreshCw,
  Layers, DollarSign, Shield, Wrench, Code2, Megaphone,
  Truck, HeartPulse, BookOpen, Headphones, FlaskConical,
  UserMinus,
} from "lucide-react";

// ─── Color palette (matching DepartmentsPage) ────────────────────────────────
const DEPT_PALETTE: Record<string, { bg: string; border: string; text: string; dot: string; header: string }> = {
  blue:    { bg: "bg-blue-500/10",    border: "border-blue-400/40",    text: "text-blue-700 dark:text-blue-300",    dot: "bg-blue-500",    header: "bg-blue-600" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-400/40", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500", header: "bg-emerald-600" },
  amber:   { bg: "bg-amber-500/10",   border: "border-amber-400/40",   text: "text-amber-700 dark:text-amber-300",   dot: "bg-amber-500",   header: "bg-amber-500" },
  violet:  { bg: "bg-violet-500/10",  border: "border-violet-400/40",  text: "text-violet-700 dark:text-violet-300",  dot: "bg-violet-500",  header: "bg-violet-600" },
  rose:    { bg: "bg-rose-500/10",    border: "border-rose-400/40",    text: "text-rose-700 dark:text-rose-300",    dot: "bg-rose-500",    header: "bg-rose-600" },
  cyan:    { bg: "bg-cyan-500/10",    border: "border-cyan-400/40",    text: "text-cyan-700 dark:text-cyan-300",    dot: "bg-cyan-500",    header: "bg-cyan-600" },
  orange:  { bg: "bg-orange-500/10",  border: "border-orange-400/40",  text: "text-orange-700 dark:text-orange-300",  dot: "bg-orange-500",  header: "bg-orange-500" },
  teal:    { bg: "bg-teal-500/10",    border: "border-teal-400/40",    text: "text-teal-700 dark:text-teal-300",    dot: "bg-teal-500",    header: "bg-teal-600" },
  slate:   { bg: "bg-slate-500/10",   border: "border-slate-400/40",   text: "text-slate-700 dark:text-slate-300",   dot: "bg-slate-500",   header: "bg-slate-600" },
};

// Auto-assign colors based on index
const AUTO_COLORS = ["blue","emerald","amber","violet","rose","cyan","orange","teal","slate"];

function getDeptColor(color: string | null | undefined, idx: number) {
  const key = color && DEPT_PALETTE[color] ? color : AUTO_COLORS[idx % AUTO_COLORS.length];
  return DEPT_PALETTE[key];
}

// ─── Icon map ─────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  building: Building2, users: Users, dollar: DollarSign, shield: Shield,
  wrench: Wrench, layers: Layers, code: Code2, megaphone: Megaphone,
  globe: Globe, truck: Truck, flask: FlaskConical, heart: HeartPulse,
  book: BookOpen, headphones: Headphones, briefcase: Briefcase,
};
function getDeptIcon(icon?: string | null): React.ElementType {
  return (icon && ICON_MAP[icon]) ? ICON_MAP[icon] : Building2;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Member = {
  id: number; firstName: string; lastName: string;
  position?: string | null; managerId?: number | null;
  employmentType?: string | null; nationality?: string | null;
  avatarUrl?: string | null;
};
type DeptNode = {
  id: number; name: string; nameAr?: string | null;
  description?: string | null; color?: string | null; icon?: string | null;
  headEmployeeId?: number | null;
  head?: { id: number; firstName: string; lastName: string; position?: string | null } | null;
  memberCount: number; members: Member[];
  positions: { id: number; title: string; description?: string | null }[];
};

function getInitials(first: string, last: string) {
  return ((first?.[0] ?? "") + (last?.[0] ?? "")).toUpperCase();
}

// ─── Employee Card (small) ────────────────────────────────────────────────────
function EmpCard({ emp, colorClass, highlight }: { emp: Member; colorClass: string; highlight?: string }) {
  const fullName = `${emp.firstName} ${emp.lastName}`;
  const isMatch = highlight && fullName.toLowerCase().includes(highlight.toLowerCase());
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
      isMatch ? "bg-yellow-50 border-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-600/40" : "bg-background border-border hover:bg-muted/40"
    }`}>
      <div className={`w-7 h-7 rounded-full ${colorClass} flex items-center justify-center text-white font-bold text-[10px] shrink-0`}>
        {getInitials(emp.firstName, emp.lastName)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate leading-tight">{fullName}</p>
        {emp.position && <p className="text-[10px] text-muted-foreground truncate leading-tight">{emp.position}</p>}
      </div>
      {emp.nationality?.toLowerCase().includes("oman") && (
        <span title="Omani National" className="w-4 h-4 rounded-full bg-green-500 shrink-0" />
      )}
    </div>
  );
}

// ─── Department Tree Card ─────────────────────────────────────────────────────
function DeptTreeCard({
  dept, idx, expanded, onToggle, search,
}: {
  dept: DeptNode; idx: number; expanded: boolean; onToggle: () => void; search: string;
}) {
  const palette = getDeptColor(dept.color, idx);
  const Icon = getDeptIcon(dept.icon);
  const visibleMembers = useMemo(() => {
    if (!search) return dept.members;
    const q = search.toLowerCase();
    return dept.members.filter(
      (m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
             (m.position ?? "").toLowerCase().includes(q)
    );
  }, [dept.members, search]);

  const hasMatch = search && visibleMembers.length > 0;

  return (
    <div className={`rounded-xl border-2 overflow-hidden transition-all ${
      hasMatch ? "border-yellow-400/60" : palette.border
    } ${palette.bg}`}>
      {/* Department header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        <div className={`w-9 h-9 rounded-lg ${palette.header} flex items-center justify-center shrink-0`}>
          <Icon size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-bold text-sm ${palette.text}`}>{dept.name}</span>
            {dept.nameAr && <span className="text-xs text-muted-foreground" dir="rtl">{dept.nameAr}</span>}
          </div>
          {dept.head && (
            <p className="text-[11px] text-muted-foreground truncate">
              Head: {dept.head.firstName} {dept.head.lastName}
              {dept.head.position ? ` · ${dept.head.position}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-xs font-bold">{dept.memberCount}</Badge>
          {expanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded members */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-border/50">
          {dept.positions.length > 0 && (
            <div className="flex flex-wrap gap-1 py-2">
              {dept.positions.map((p) => (
                <span key={p.id} className="text-[10px] bg-background border border-border rounded-full px-2 py-0.5 text-muted-foreground">
                  {p.title}
                </span>
              ))}
            </div>
          )}
          {visibleMembers.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              {search ? "No members match your search" : "No members assigned yet"}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
              {visibleMembers.map((m) => (
                <EmpCard key={m.id} emp={m} colorClass={palette.header} highlight={search} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Visual Tree Node (for Tree View) ────────────────────────────────────────
function TreeDeptNode({
  dept, idx, expanded, onToggle, search,
}: {
  dept: DeptNode; idx: number; expanded: boolean; onToggle: () => void; search: string;
}) {
  const palette = getDeptColor(dept.color, idx);
  const Icon = getDeptIcon(dept.icon);
  const visibleMembers = useMemo(() => {
    if (!search) return dept.members;
    const q = search.toLowerCase();
    return dept.members.filter(
      (m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
             (m.position ?? "").toLowerCase().includes(q)
    );
  }, [dept.members, search]);

  return (
    <div className="flex flex-col items-center">
      {/* Department box */}
      <button
        type="button"
        onClick={onToggle}
        className={`rounded-xl border-2 ${palette.border} ${palette.bg} px-4 py-3 min-w-[160px] max-w-[200px] text-center hover:shadow-md transition-all group`}
      >
        <div className={`w-10 h-10 rounded-lg ${palette.header} flex items-center justify-center mx-auto mb-2`}>
          <Icon size={18} className="text-white" />
        </div>
        <p className={`font-bold text-sm ${palette.text} leading-tight`}>{dept.name}</p>
        {dept.head && (
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {dept.head.firstName} {dept.head.lastName}
          </p>
        )}
        <div className="flex items-center justify-center gap-1 mt-1.5">
          <Users size={10} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground font-semibold">{dept.memberCount}</span>
          {expanded ? <ChevronDown size={10} className="text-muted-foreground" /> : <ChevronRight size={10} className="text-muted-foreground" />}
        </div>
      </button>

      {/* Connector line + employee nodes */}
      {expanded && visibleMembers.length > 0 && (
        <div className="flex flex-col items-center mt-0">
          {/* Vertical line down */}
          <div className="w-0.5 h-5 bg-border" />
          {/* Horizontal line spanning all children */}
          <div className="relative flex items-start justify-center gap-3">
            {/* Top horizontal bar */}
            {visibleMembers.length > 1 && (
              <div
                className="absolute top-0 h-0.5 bg-border"
                style={{ left: "calc(50% - " + (visibleMembers.length * 84) / 2 + "px)", width: (visibleMembers.length - 1) * 84 + "px" }}
              />
            )}
            {visibleMembers.map((m) => (
              <div key={m.id} className="flex flex-col items-center">
                <div className="w-0.5 h-4 bg-border" />
                <div className={`rounded-lg border ${palette.border} bg-background px-2.5 py-2 w-20 text-center`}>
                  <div className={`w-7 h-7 rounded-full ${palette.header} flex items-center justify-center text-white font-bold text-[9px] mx-auto mb-1`}>
                    {getInitials(m.firstName, m.lastName)}
                  </div>
                  <p className="text-[9px] font-semibold leading-tight truncate">{m.firstName}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight truncate">{m.position ?? "—"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {expanded && visibleMembers.length === 0 && (
        <div className="flex flex-col items-center mt-0">
          <div className="w-0.5 h-5 bg-border" />
          <div className="rounded-lg border border-dashed border-border px-3 py-2 text-[10px] text-muted-foreground">
            No members
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OrgChartPage() {
  const { activeCompanyId } = useActiveCompany();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"tree" | "grid" | "list">("grid");
  const [expandedDepts, setExpandedDepts] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState(100);

  const { data, isLoading, refetch } = trpc.hr.getOrgChart.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );

  const departments: DeptNode[] = (data?.departments ?? []) as DeptNode[];
  const unassigned = data?.unassigned ?? [];

  // Auto-expand all departments when data loads
  useEffect(() => {
    if (departments.length > 0 && expandedDepts.size === 0) {
      setExpandedDepts(new Set(departments.map((d) => d.id)));
    }
  }, [departments.length]);

  // When searching, auto-expand departments that have matches
  useEffect(() => {
    if (!search) return;
    const q = search.toLowerCase();
    const matchingIds = departments
      .filter((d) =>
        d.name.toLowerCase().includes(q) ||
        d.members.some((m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) || (m.position ?? "").toLowerCase().includes(q))
      )
      .map((d) => d.id);
    if (matchingIds.length > 0) {
      setExpandedDepts((prev) => { const next = new Set(prev); matchingIds.forEach((id) => next.add(id)); return next; });
    }
  }, [search]);

  const toggleDept = useCallback((id: number) => {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const expandAll = () => setExpandedDepts(new Set(departments.map((d) => d.id)));
  const collapseAll = () => setExpandedDepts(new Set());

  // Stats
  const totalEmployees = departments.reduce((s, d) => s + d.memberCount, 0);
  const staffedDepts = departments.filter((d) => d.memberCount > 0).length;
  const deptsWithHead = departments.filter((d) => d.head).length;

  // Filtered departments for search
  const filteredDepts = useMemo(() => {
    if (!search) return departments;
    const q = search.toLowerCase();
    return departments.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.nameAr ?? "").toLowerCase().includes(q) ||
        d.members.some(
          (m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
                 (m.position ?? "").toLowerCase().includes(q)
        )
    );
  }, [departments, search]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Top bar ── */}
      <div className="px-6 pt-5 pb-4 border-b bg-background shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <Network size={24} className="text-red-700" />
              Organization Chart
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Visual hierarchy of departments and employees
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => refetch()}>
              <RefreshCw size={13} /> Refresh
            </Button>
            <div className="flex rounded-lg border overflow-hidden">
              {([
                { mode: "grid" as const, icon: LayoutGrid, label: "Grid" },
                { mode: "tree" as const, icon: Network, label: "Tree" },
                { mode: "list" as const, icon: List, label: "List" },
              ] as const).map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  type="button"
                  title={label}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    viewMode === mode
                      ? "bg-red-700 text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          {[
            { label: "Departments", value: departments.length, icon: Building2, color: "text-blue-600" },
            { label: "Total Employees", value: totalEmployees, icon: Users, color: "text-emerald-600" },
            { label: "Staffed Depts", value: staffedDepts, icon: UserCheck, color: "text-amber-600" },
            { label: "Dept Heads Set", value: `${deptsWithHead}/${departments.length}`, icon: Briefcase, color: "text-violet-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border">
              <Icon size={18} className={color} />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-bold text-lg leading-tight">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search + controls */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 h-8 text-sm"
              placeholder="Search departments or employees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch("")}>
                <X size={13} />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={expandAll}>
            <ChevronDown size={12} /> Expand All
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={collapseAll}>
            <ChevronRight size={12} /> Collapse All
          </Button>
          {viewMode === "tree" && (
            <div className="flex items-center gap-1 ml-auto">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(50, z - 10))} disabled={zoom <= 50}>
                <ZoomOut size={13} />
              </Button>
              <span className="text-xs text-muted-foreground w-12 text-center">{zoom}%</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(150, z + 10))} disabled={zoom >= 150}>
                <ZoomIn size={13} />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(100)}>
                <Maximize2 size={13} />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : departments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-20 text-center text-muted-foreground">
            <Network size={48} className="mb-4 opacity-20" />
            <h2 className="text-lg font-semibold">No departments yet</h2>
            <p className="text-sm mt-1">Create departments in the Departments &amp; Positions page first.</p>
          </div>
        ) : viewMode === "grid" ? (
          // ── Grid View ──────────────────────────────────────────────────────
          <div className="space-y-3">
            {/* Company root node */}
            <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-red-700 text-white mb-6 max-w-sm mx-auto">
              <Building2 size={22} />
              <div>
                <p className="font-bold text-base">Company</p>
                <p className="text-xs text-red-200">{totalEmployees} active employees · {departments.length} departments</p>
              </div>
            </div>

            {/* Connector */}
            <div className="flex justify-center">
              <div className="w-0.5 h-6 bg-border" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredDepts.map((dept, i) => (
                <DeptTreeCard
                  key={dept.id}
                  dept={dept}
                  idx={i}
                  expanded={expandedDepts.has(dept.id)}
                  onToggle={() => toggleDept(dept.id)}
                  search={search}
                />
              ))}
            </div>

            {/* Unassigned employees */}
            {unassigned.length > 0 && !search && (
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <UserMinus size={15} className="text-muted-foreground" />
                  <span className="text-sm font-semibold text-muted-foreground">Unassigned Employees</span>
                  <Badge variant="outline" className="text-xs">{unassigned.length}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                  {(unassigned as any[]).map((emp) => (
                    <div key={emp.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border bg-muted/20">
                      <div className="w-7 h-7 rounded-full bg-slate-400 flex items-center justify-center text-white font-bold text-[10px] shrink-0">
                        {getInitials(emp.firstName, emp.lastName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{emp.firstName} {emp.lastName}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{emp.position ?? "No position"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        ) : viewMode === "tree" ? (
          // ── Tree View ──────────────────────────────────────────────────────
          <div
            className="overflow-auto"
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center", minHeight: "600px" }}
          >
            {/* Company root */}
            <div className="flex justify-center mb-2">
              <div className="rounded-xl bg-red-700 text-white px-6 py-3 text-center min-w-[200px]">
                <Building2 size={24} className="mx-auto mb-1" />
                <p className="font-bold text-base">Company</p>
                <p className="text-xs text-red-200">{totalEmployees} employees</p>
              </div>
            </div>

            {/* Connector */}
            <div className="flex justify-center">
              <div className="w-0.5 h-6 bg-border" />
            </div>

            {/* Horizontal branch line */}
            <div className="relative flex justify-center">
              {filteredDepts.length > 1 && (
                <div
                  className="absolute top-0 h-0.5 bg-border"
                  style={{
                    left: `calc(50% - ${(filteredDepts.length * 220) / 2}px)`,
                    width: `${(filteredDepts.length - 1) * 220}px`,
                  }}
                />
              )}
              <div className="flex gap-4 flex-wrap justify-center">
                {filteredDepts.map((dept, i) => (
                  <div key={dept.id} className="flex flex-col items-center">
                    <div className="w-0.5 h-5 bg-border" />
                    <TreeDeptNode
                      dept={dept}
                      idx={i}
                      expanded={expandedDepts.has(dept.id)}
                      onToggle={() => toggleDept(dept.id)}
                      search={search}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

        ) : (
          // ── List View ──────────────────────────────────────────────────────
          <div className="space-y-2">
            {filteredDepts.map((dept, i) => {
              const palette = getDeptColor(dept.color, i);
              const Icon = getDeptIcon(dept.icon);
              const isExpanded = expandedDepts.has(dept.id);
              const visibleMembers = search
                ? dept.members.filter((m) =>
                    `${m.firstName} ${m.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
                    (m.position ?? "").toLowerCase().includes(search.toLowerCase())
                  )
                : dept.members;

              return (
                <div key={dept.id} className="rounded-xl border overflow-hidden">
                  {/* Header row */}
                  <button
                    type="button"
                    onClick={() => toggleDept(dept.id)}
                    className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-muted/40 transition-colors"
                  >
                    <div className={`w-8 h-8 rounded-lg ${palette.header} flex items-center justify-center shrink-0`}>
                      <Icon size={15} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{dept.name}</span>
                        {dept.nameAr && <span className="text-xs text-muted-foreground" dir="rtl">{dept.nameAr}</span>}
                      </div>
                      {dept.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{dept.description}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {dept.head && (
                        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                          <UserCheck size={12} />
                          <span>{dept.head.firstName} {dept.head.lastName}</span>
                        </div>
                      )}
                      <Badge variant="secondary" className="text-xs">{dept.memberCount} members</Badge>
                      {dept.positions.length > 0 && (
                        <Badge variant="outline" className="text-xs">{dept.positions.length} roles</Badge>
                      )}
                      {isExpanded ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Expanded employee list */}
                  {isExpanded && (
                    <div className={`border-t px-5 py-3 ${palette.bg}`}>
                      {dept.positions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mr-1">Roles:</span>
                          {dept.positions.map((p) => (
                            <span key={p.id} className="text-[10px] bg-background border border-border rounded-full px-2 py-0.5">
                              {p.title}
                            </span>
                          ))}
                        </div>
                      )}
                      {visibleMembers.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">
                          {search ? "No members match your search" : "No members assigned yet"}
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {visibleMembers.map((m) => (
                            <EmpCard key={m.id} emp={m} colorClass={palette.header} highlight={search} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unassigned */}
            {unassigned.length > 0 && !search && (
              <div className="rounded-xl border border-dashed overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleDept(-1)}
                  className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-muted/40 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-500 flex items-center justify-center shrink-0">
                    <UserMinus size={15} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <span className="font-semibold text-sm text-muted-foreground">Unassigned</span>
                    <p className="text-xs text-muted-foreground mt-0.5">Employees not linked to any department</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{unassigned.length}</Badge>
                  {expandedDepts.has(-1) ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
                </button>
                {expandedDepts.has(-1) && (
                  <div className="border-t px-5 py-3 bg-muted/20">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {(unassigned as any[]).map((emp) => (
                        <EmpCard key={emp.id} emp={emp} colorClass="bg-slate-500" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
