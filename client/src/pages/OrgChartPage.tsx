import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  Building2, Users, Search, X, ZoomIn, ZoomOut, Maximize2,
  ChevronDown, ChevronRight, LayoutGrid, Network, List,
  UserCheck, Briefcase, Globe, RefreshCw,
  Layers, DollarSign, Shield, Wrench, Code2, Megaphone,
  Truck, HeartPulse, BookOpen, Headphones, FlaskConical,
  UserMinus, GripVertical, ArrowRight, Info,
} from "lucide-react";
import { HubBreadcrumb } from "@/components/hub/HubBreadcrumb";
import { organizationTrail } from "@/components/hub/hubCrumbs";

// ─── Color palette ────────────────────────────────────────────────────────────
const DEPT_PALETTE: Record<string, { bg: string; border: string; text: string; header: string; ring: string }> = {
  blue:    { bg: "bg-blue-500/10",    border: "border-blue-400/40",    text: "text-blue-700 dark:text-blue-300",    header: "bg-blue-600",    ring: "ring-blue-400" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-400/40", text: "text-emerald-700 dark:text-emerald-300", header: "bg-emerald-600", ring: "ring-emerald-400" },
  amber:   { bg: "bg-amber-500/10",   border: "border-amber-400/40",   text: "text-amber-700 dark:text-amber-300",   header: "bg-amber-500",   ring: "ring-amber-400" },
  violet:  { bg: "bg-violet-500/10",  border: "border-violet-400/40",  text: "text-violet-700 dark:text-violet-300",  header: "bg-violet-600",  ring: "ring-violet-400" },
  rose:    { bg: "bg-rose-500/10",    border: "border-rose-400/40",    text: "text-rose-700 dark:text-rose-300",    header: "bg-rose-600",    ring: "ring-rose-400" },
  cyan:    { bg: "bg-cyan-500/10",    border: "border-cyan-400/40",    text: "text-cyan-700 dark:text-cyan-300",    header: "bg-cyan-600",    ring: "ring-cyan-400" },
  orange:  { bg: "bg-orange-500/10",  border: "border-orange-400/40",  text: "text-orange-700 dark:text-orange-300",  header: "bg-orange-500",  ring: "ring-orange-400" },
  teal:    { bg: "bg-teal-500/10",    border: "border-teal-400/40",    text: "text-teal-700 dark:text-teal-300",    header: "bg-teal-600",    ring: "ring-teal-400" },
  slate:   { bg: "bg-slate-500/10",   border: "border-slate-400/40",   text: "text-slate-700 dark:text-slate-300",   header: "bg-slate-600",   ring: "ring-slate-400" },
};
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

// ─── Draggable Employee Card ──────────────────────────────────────────────────
function DraggableEmpCard({
  emp, colorClass, isDragMode, highlight,
}: {
  emp: Member; colorClass: string; isDragMode: boolean; highlight?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `emp-${emp.id}`,
    data: { type: "employee", empId: emp.id, emp },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : 1,
    cursor: isDragMode ? (isDragging ? "grabbing" : "grab") : "default",
  };

  const fullName = `${emp.firstName} ${emp.lastName}`;
  const isMatch = highlight && fullName.toLowerCase().includes(highlight.toLowerCase());

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(isDragMode ? { ...listeners, ...attributes } : {})}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all select-none ${
        isDragging ? "shadow-lg z-50" : ""
      } ${
        isMatch ? "bg-yellow-50 border-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-600/40" : "bg-background border-border hover:bg-muted/40"
      } ${isDragMode ? "hover:shadow-md hover:border-[var(--smartpro-orange)]/50" : ""}`}
    >
      {isDragMode && (
        <GripVertical size={12} className="text-muted-foreground/40 shrink-0 -ml-1" />
      )}
      <div className={`w-7 h-7 rounded-full ${colorClass} flex items-center justify-center text-white font-bold text-[10px] shrink-0`}>
        {getInitials(emp.firstName, emp.lastName)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate leading-tight">{fullName}</p>
        {emp.position && <p className="text-[10px] text-muted-foreground truncate leading-tight">{emp.position}</p>}
      </div>
      {emp.nationality?.toLowerCase().includes("oman") && (
        <span title="Omani National" className="w-3.5 h-3.5 rounded-full bg-green-500 shrink-0" />
      )}
    </div>
  );
}

// ─── Drag Overlay Card (floating while dragging) ──────────────────────────────
function DragOverlayCard({ emp }: { emp: Member }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-[var(--smartpro-orange)] bg-background shadow-2xl w-52 rotate-2">
      <GripVertical size={12} className="text-muted-foreground/40 shrink-0" />
      <div className="w-7 h-7 rounded-full bg-[var(--smartpro-orange)] flex items-center justify-center text-white font-bold text-[10px] shrink-0">
        {getInitials(emp.firstName, emp.lastName)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate">{emp.firstName} {emp.lastName}</p>
        {emp.position && <p className="text-[10px] text-muted-foreground truncate">{emp.position}</p>}
      </div>
    </div>
  );
}

// ─── Droppable Department Zone ────────────────────────────────────────────────
function DroppableDeptZone({
  deptId, deptName, children, isOver, isDragMode,
}: {
  deptId: number | "unassigned"; deptName: string; children: React.ReactNode;
  isOver: boolean; isDragMode: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: `dept-${deptId}`, data: { type: "department", deptId, deptName } });
  return (
    <div
      ref={setNodeRef}
      className={`transition-all rounded-xl ${
        isDragMode && isOver
          ? "ring-2 ring-[var(--smartpro-orange)] ring-offset-2 bg-orange-50/50 dark:bg-orange-900/10"
          : ""
      }`}
    >
      {children}
    </div>
  );
}

// ─── Department Grid Card ─────────────────────────────────────────────────────
function DeptGridCard({
  dept, idx, expanded, onToggle, search, isDragMode, isOver,
}: {
  dept: DeptNode; idx: number; expanded: boolean; onToggle: () => void;
  search: string; isDragMode: boolean; isOver: boolean;
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
    <DroppableDeptZone deptId={dept.id} deptName={dept.name} isOver={isOver} isDragMode={isDragMode}>
      <div className={`rounded-xl border-2 overflow-hidden transition-all ${
        isOver && isDragMode ? "border-[var(--smartpro-orange)]" : palette.border
      } ${palette.bg}`}>
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
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="text-xs font-bold">{dept.members.length}</Badge>
            {expanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
          </div>
        </button>

        {expanded && (
          <div className="px-3 pb-3 border-t border-border/50">
            {isDragMode && (
              <div className={`my-2 px-3 py-1.5 rounded-lg text-[11px] text-center font-medium transition-all ${
                isOver
                  ? "bg-orange-100 text-orange-700 border border-orange-300"
                  : "bg-muted/50 text-muted-foreground border border-dashed border-border"
              }`}>
                {isOver ? "↓ Drop here to assign" : "Drop employees here"}
              </div>
            )}
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
                {search ? "No members match your search" : (isDragMode ? "Drag employees here" : "No members assigned yet")}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                {visibleMembers.map((m) => (
                  <DraggableEmpCard key={m.id} emp={m} colorClass={palette.header} isDragMode={isDragMode} highlight={search} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DroppableDeptZone>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OrgChartPage() {
  const { activeCompanyId } = useActiveCompany();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [expandedDepts, setExpandedDepts] = useState<Set<number>>(new Set());
  const [isDragMode, setIsDragMode] = useState(false);
  const [activeDragEmp, setActiveDragEmp] = useState<Member | null>(null);
  const [overDeptId, setOverDeptId] = useState<number | "unassigned" | null>(null);

  // Local optimistic state: empId → deptName (or null = unassigned)
  const [localAssignments, setLocalAssignments] = useState<Record<number, string | null>>({});

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.hr.getOrgChart.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );

  const assignMutation = trpc.hr.assignDepartment.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (err, vars) => {
      // Rollback optimistic update
      setLocalAssignments((prev) => {
        const next = { ...prev };
        if (vars.employeeIds[0]) delete next[vars.employeeIds[0]];
        return next;
      });
      toast.error(`Failed to reassign: ${err.message}`);
    },
  });

  // Merge server data with local optimistic assignments
  const departments: DeptNode[] = useMemo(() => {
    const raw = (data?.departments ?? []) as DeptNode[];
    if (Object.keys(localAssignments).length === 0) return raw;

    // Build a flat map of all employees
    const allEmps: Member[] = [];
    raw.forEach((d) => allEmps.push(...d.members));
    const unassignedRaw = (data?.unassigned ?? []) as Member[];
    unassignedRaw.forEach((e) => allEmps.push(e as Member));

    // Rebuild departments with optimistic assignments
    return raw.map((dept) => {
      const members = allEmps.filter((e) => {
        const override = localAssignments[e.id];
        if (override !== undefined) return override === dept.name;
        return (data?.departments as DeptNode[])?.find((d) => d.id === dept.id)?.members.some((m) => m.id === e.id) ?? false;
      });
      return { ...dept, members, memberCount: members.length };
    });
  }, [data, localAssignments]);

  const unassigned: Member[] = useMemo(() => {
    const raw = (data?.unassigned ?? []) as Member[];
    const allEmps: Member[] = [];
    (data?.departments as DeptNode[] ?? []).forEach((d) => allEmps.push(...d.members));
    raw.forEach((e) => allEmps.push(e as Member));

    if (Object.keys(localAssignments).length === 0) return raw;
    return allEmps.filter((e) => {
      const override = localAssignments[e.id];
      if (override !== undefined) return override === null;
      return raw.some((u) => u.id === e.id);
    });
  }, [data, localAssignments]);

  // Auto-expand all on load
  useEffect(() => {
    if (departments.length > 0 && expandedDepts.size === 0) {
      setExpandedDepts(new Set(departments.map((d) => d.id)));
    }
  }, [departments.length]);

  // Auto-expand matching depts on search
  useEffect(() => {
    if (!search) return;
    const q = search.toLowerCase();
    const ids = departments
      .filter((d) =>
        d.name.toLowerCase().includes(q) ||
        d.members.some((m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) || (m.position ?? "").toLowerCase().includes(q))
      )
      .map((d) => d.id);
    if (ids.length > 0) {
      setExpandedDepts((prev) => { const next = new Set(prev); ids.forEach((id) => next.add(id)); return next; });
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

  const filteredDepts = useMemo(() => {
    if (!search) return departments;
    const q = search.toLowerCase();
    return departments.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.nameAr ?? "").toLowerCase().includes(q) ||
        d.members.some((m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) || (m.position ?? "").toLowerCase().includes(q))
    );
  }, [departments, search]);

  // ─── DnD sensors ────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragStart(event: DragStartEvent) {
    const { data } = event.active;
    if (data.current?.type === "employee") {
      setActiveDragEmp(data.current.emp as Member);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event;
    if (over && over.data.current?.type === "department") {
      setOverDeptId(over.data.current.deptId);
    } else {
      setOverDeptId(null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragEmp(null);
    setOverDeptId(null);

    if (!over) return;
    const empData = active.data.current;
    const dropData = over.data.current;
    if (!empData || !dropData || empData.type !== "employee" || dropData.type !== "department") return;

    const emp = empData.emp as Member;
    const targetDeptId = dropData.deptId as number | "unassigned";
    const targetDeptName = dropData.deptName as string | null;

    // Find current dept
    const currentDept = departments.find((d) => d.members.some((m) => m.id === emp.id));
    const isCurrentlyUnassigned = !currentDept;

    // No-op if dropped on same department
    if (currentDept && targetDeptId === currentDept.id) return;
    if (isCurrentlyUnassigned && targetDeptId === "unassigned") return;

    const newDeptName = targetDeptId === "unassigned" ? null : (targetDeptName ?? null);

    // Optimistic update
    setLocalAssignments((prev) => ({ ...prev, [emp.id]: newDeptName }));

    // Persist
    assignMutation.mutate({
      employeeIds: [emp.id],
      departmentName: newDeptName,
      companyId: activeCompanyId ?? undefined,
    });

    const fromLabel = currentDept?.name ?? "Unassigned";
    const toLabel = newDeptName ?? "Unassigned";
    toast.success(`${emp.firstName} ${emp.lastName} moved from ${fromLabel} → ${toLabel}`);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-6 pt-4 shrink-0">
          <HubBreadcrumb items={organizationTrail("Org chart")} />
        </div>
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
              <p className="text-xs text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>Organization:</span>
                <Link href="/hr/org-structure" className="text-primary hover:underline">
                  Org structure
                </Link>
                <span className="text-muted-foreground/60">·</span>
                <Link href="/hr/departments" className="text-primary hover:underline">
                  Departments
                </Link>
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => refetch()}>
                <RefreshCw size={13} /> Refresh
              </Button>
              {/* Drag Mode Toggle */}
              <Button
                size="sm"
                className={`h-8 gap-1.5 text-xs transition-all ${
                  isDragMode
                    ? "bg-[var(--smartpro-orange)] text-white hover:bg-orange-600"
                    : "border border-border bg-background text-foreground hover:bg-muted"
                }`}
                variant={isDragMode ? "default" : "outline"}
                onClick={() => setIsDragMode((v) => !v)}
              >
                <GripVertical size={13} />
                {isDragMode ? "Drag Mode ON" : "Enable Drag & Drop"}
              </Button>
              <div className="flex rounded-lg border overflow-hidden">
                {([
                  { mode: "grid" as const, icon: LayoutGrid, label: "Grid" },
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

          {/* Drag mode banner */}
          {isDragMode && (
            <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-800 text-sm dark:bg-orange-900/20 dark:border-orange-700/40 dark:text-orange-300">
              <GripVertical size={16} className="shrink-0" />
              <span className="font-medium">Drag &amp; Drop Mode Active</span>
              <span className="text-orange-600 dark:text-orange-400 text-xs">— Grab any employee card and drop it onto a different department to reassign them instantly.</span>
              <ArrowRight size={14} className="shrink-0 ml-auto" />
            </div>
          )}

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
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
            </div>
          ) : departments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-center text-muted-foreground">
              <Network size={48} className="mb-4 opacity-20" />
              <h2 className="text-lg font-semibold">No departments yet</h2>
              <p className="text-sm mt-1">Create departments in the Departments &amp; Positions page first.</p>
            </div>
          ) : viewMode === "grid" ? (
            // ── Grid View ────────────────────────────────────────────────────
            <div className="space-y-3">
              {/* Company root */}
              <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-red-700 text-white mb-6 max-w-sm mx-auto">
                <Building2 size={22} />
                <div>
                  <p className="font-bold text-base">Company</p>
                  <p className="text-xs text-red-200">{totalEmployees} active employees · {departments.length} departments</p>
                </div>
              </div>
              <div className="flex justify-center">
                <div className="w-0.5 h-6 bg-border" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredDepts.map((dept, i) => (
                  <DeptGridCard
                    key={dept.id}
                    dept={dept}
                    idx={i}
                    expanded={expandedDepts.has(dept.id)}
                    onToggle={() => toggleDept(dept.id)}
                    search={search}
                    isDragMode={isDragMode}
                    isOver={overDeptId === dept.id}
                  />
                ))}
              </div>

              {/* Unassigned employees */}
              {(unassigned.length > 0 || isDragMode) && !search && (
                <div className="mt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <UserMinus size={15} className="text-muted-foreground" />
                    <span className="text-sm font-semibold text-muted-foreground">Unassigned Employees</span>
                    <Badge variant="outline" className="text-xs">{unassigned.length}</Badge>
                    {isDragMode && <span className="text-xs text-muted-foreground">(drag to a department above)</span>}
                  </div>
                  <DroppableDeptZone deptId="unassigned" deptName="" isOver={overDeptId === "unassigned"} isDragMode={isDragMode}>
                    <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 p-3 rounded-xl border-2 border-dashed transition-all ${
                      isDragMode && overDeptId === "unassigned"
                        ? "border-[var(--smartpro-orange)] bg-orange-50/50"
                        : "border-border"
                    }`}>
                      {unassigned.length === 0 ? (
                        <div className="col-span-full py-4 text-center text-xs text-muted-foreground">
                          {isDragMode ? "Drop here to unassign from department" : "All employees are assigned"}
                        </div>
                      ) : (
                        (unassigned as Member[]).map((emp) => (
                          <DraggableEmpCard key={emp.id} emp={emp} colorClass="bg-slate-500" isDragMode={isDragMode} />
                        ))
                      )}
                    </div>
                  </DroppableDeptZone>
                </div>
              )}
            </div>

          ) : (
            // ── List View ────────────────────────────────────────────────────
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
                  <DroppableDeptZone key={dept.id} deptId={dept.id} deptName={dept.name} isOver={overDeptId === dept.id} isDragMode={isDragMode}>
                    <div className={`rounded-xl border overflow-hidden transition-all ${
                      isDragMode && overDeptId === dept.id ? "border-[var(--smartpro-orange)] shadow-md" : ""
                    }`}>
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
                          <Badge variant="secondary" className="text-xs">{dept.members.length}</Badge>
                          {isExpanded ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className={`border-t px-5 py-3 ${palette.bg}`}>
                          {isDragMode && (
                            <div className={`mb-3 px-3 py-1.5 rounded-lg text-[11px] text-center font-medium transition-all ${
                              overDeptId === dept.id
                                ? "bg-orange-100 text-orange-700 border border-orange-300"
                                : "bg-muted/50 text-muted-foreground border border-dashed border-border"
                            }`}>
                              {overDeptId === dept.id ? "↓ Drop here to assign" : "Drop employees here"}
                            </div>
                          )}
                          {dept.positions.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {dept.positions.map((p) => (
                                <span key={p.id} className="text-[10px] bg-background border border-border rounded-full px-2 py-0.5">{p.title}</span>
                              ))}
                            </div>
                          )}
                          {visibleMembers.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2">
                              {search ? "No members match" : (isDragMode ? "Drag employees here" : "No members assigned yet")}
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                              {visibleMembers.map((m) => (
                                <DraggableEmpCard key={m.id} emp={m} colorClass={palette.header} isDragMode={isDragMode} highlight={search} />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </DroppableDeptZone>
                );
              })}

              {/* Unassigned */}
              {(unassigned.length > 0 || isDragMode) && !search && (
                <DroppableDeptZone deptId="unassigned" deptName="" isOver={overDeptId === "unassigned"} isDragMode={isDragMode}>
                  <div className={`rounded-xl border overflow-hidden transition-all ${
                    isDragMode && overDeptId === "unassigned" ? "border-[var(--smartpro-orange)] shadow-md" : "border-dashed"
                  }`}>
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
                        {unassigned.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">
                            {isDragMode ? "Drop here to unassign from department" : "All employees are assigned"}
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {(unassigned as Member[]).map((emp) => (
                              <DraggableEmpCard key={emp.id} emp={emp} colorClass="bg-slate-500" isDragMode={isDragMode} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </DroppableDeptZone>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Drag Overlay (floating card while dragging) ── */}
      <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
        {activeDragEmp ? <DragOverlayCard emp={activeDragEmp} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
