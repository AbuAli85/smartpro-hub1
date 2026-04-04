import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Building2, Plus, Pencil, Trash2, Users, Briefcase, Search,
  ChevronRight, UserCheck, BarChart3, TrendingUp, X, Palette,
  Layers, Globe, Shield, Wrench, HeartPulse, BookOpen, Truck,
  DollarSign, Megaphone, Code2, FlaskConical, Headphones,
} from "lucide-react";

// ─── Dept color & icon palettes ───────────────────────────────────────────────
const DEPT_COLORS = [
  { value: "blue",    dot: "bg-blue-500",    classes: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-400/40" },
  { value: "emerald", dot: "bg-emerald-500",  classes: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-400/40" },
  { value: "amber",   dot: "bg-amber-500",    classes: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-400/40" },
  { value: "violet",  dot: "bg-violet-500",   classes: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-400/40" },
  { value: "rose",    dot: "bg-rose-500",     classes: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-400/40" },
  { value: "cyan",    dot: "bg-cyan-500",     classes: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-400/40" },
  { value: "orange",  dot: "bg-orange-500",   classes: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-400/40" },
  { value: "teal",    dot: "bg-teal-500",     classes: "bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-400/40" },
  { value: "slate",   dot: "bg-slate-500",    classes: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-400/40" },
];
const DEPT_ICONS = [
  { value: "building",   Icon: Building2,   label: "General" },
  { value: "users",      Icon: Users,        label: "People" },
  { value: "dollar",     Icon: DollarSign,   label: "Finance" },
  { value: "shield",     Icon: Shield,       label: "Legal" },
  { value: "wrench",     Icon: Wrench,       label: "Operations" },
  { value: "layers",     Icon: Layers,       label: "Product" },
  { value: "code",       Icon: Code2,        label: "Tech" },
  { value: "megaphone",  Icon: Megaphone,    label: "Marketing" },
  { value: "globe",      Icon: Globe,        label: "International" },
  { value: "truck",      Icon: Truck,        label: "Logistics" },
  { value: "flask",      Icon: FlaskConical, label: "R&D" },
  { value: "heart",      Icon: HeartPulse,   label: "Health" },
  { value: "book",       Icon: BookOpen,     label: "Training" },
  { value: "headphones", Icon: Headphones,   label: "Support" },
  { value: "briefcase",  Icon: Briefcase,    label: "Business" },
];
function getDeptColorClasses(c?: string | null) {
  return DEPT_COLORS.find((x) => x.value === c)?.classes ?? DEPT_COLORS[0].classes;
}
function getDeptIcon(v?: string | null) {
  return DEPT_ICONS.find((x) => x.value === v)?.Icon ?? Building2;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Dept = {
  id: number;
  name: string;
  nameAr?: string | null;
  description?: string | null;
  headEmployeeId?: number | null;
  employeeCount: number;
};

type Position = {
  id: number;
  title: string;
  titleAr?: string | null;
  description?: string | null;
  departmentId?: number | null;
};

type Employee = {
  id: number;
  firstName: string;
  lastName: string;
  department?: string | null;
  position?: string | null;
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Department Row ───────────────────────────────────────────────────────────
function DeptRow({
  dept,
  isSelected,
  headName,
  onSelect,
  onEdit,
  onDelete,
}: {
  dept: Dept;
  isSelected: boolean;
  headName?: string;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all border ${
        isSelected
          ? "bg-primary/5 border-primary/30 shadow-sm"
          : "border-transparent hover:bg-muted/50 hover:border-border"
      }`}
    >
      {/* Icon */}
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? "bg-primary/15" : "bg-muted"}`}>
        <Building2 size={16} className={isSelected ? "text-primary" : "text-muted-foreground"} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm truncate">{dept.name}</p>
          {dept.nameAr && (
            <span className="text-xs text-muted-foreground" dir="rtl">{dept.nameAr}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users size={11} /> {dept.employeeCount} employee{dept.employeeCount !== 1 ? "s" : ""}
          </span>
          {headName && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <UserCheck size={11} /> {headName}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost" size="icon" className="h-7 w-7 opacity-60 hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
        >
          <Pencil size={13} />
        </Button>
        <Button
          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive opacity-60 hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >
          <Trash2 size={13} />
        </Button>
        <ChevronRight size={14} className={`text-muted-foreground transition-transform ${isSelected ? "rotate-90 text-primary" : ""}`} />
      </div>
    </div>
  );
}

// ─── Position Item ────────────────────────────────────────────────────────────
function PositionItem({ pos, onDelete }: { pos: Position; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/40 group transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Briefcase size={13} className="text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{pos.title}</p>
          {pos.titleAr && <p className="text-xs text-muted-foreground" dir="rtl">{pos.titleAr}</p>}
          {pos.description && <p className="text-xs text-muted-foreground truncate">{pos.description}</p>}
        </div>
      </div>
      <Button
        variant="ghost" size="icon"
        className="h-7 w-7 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={onDelete}
      >
        <Trash2 size={13} />
      </Button>
    </div>
  );
}

// ─── Dept Dialog ──────────────────────────────────────────────────────────────
function DeptDialog({
  open, onClose, initial, employees, companyId,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Dept;
  employees: Employee[];
  companyId?: number | null;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(initial?.name ?? "");
  const [nameAr, setNameAr] = useState(initial?.nameAr ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [headId, setHeadId] = useState<string>(initial?.headEmployeeId?.toString() ?? "");
  const [color, setColor] = useState("blue");
  const [iconVal, setIconVal] = useState("building");
  const [touched, setTouched] = useState(false);

  const nameError = touched && !name.trim();
  const colorClasses = getDeptColorClasses(color);
  const PreviewIcon = getDeptIcon(iconVal);

  const create = trpc.hr.createDepartment.useMutation({
    onSuccess: () => { utils.hr.listDepartments.invalidate(); toast.success("Department created"); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.hr.updateDepartment.useMutation({
    onSuccess: () => { utils.hr.listDepartments.invalidate(); toast.success("Department updated"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    setTouched(true);
    if (!name.trim()) return toast.error("Department name is required");
    const payload = {
      name: name.trim(),
      nameAr: nameAr.trim() || undefined,
      description: description.trim() || undefined,
      headEmployeeId: headId && headId !== "none" ? Number(headId) : undefined,
      companyId: companyId ?? undefined,
    };
    if (initial) update.mutate({ id: initial.id, ...payload });
    else create.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        {/* Coloured header */}
        <div className={`px-6 pt-5 pb-4 border-b ${colorClasses}`}>
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center shrink-0 bg-background/60 ${colorClasses}`}>
              <PreviewIcon size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">
                {initial ? "Edit Department" : "New Department"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {initial ? `Editing: ${initial.name}` : "Define a new department for your organisation"}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Names row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                English Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => { setName(e.target.value); if (touched) setTouched(true); }}
                onBlur={() => setTouched(true)}
                placeholder="e.g. Human Resources"
                className={nameError ? "border-destructive ring-1 ring-destructive" : ""}
                autoFocus
              />
              {nameError && <p className="text-xs text-destructive mt-0.5">Name is required</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Arabic Name</Label>
              <Input
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder="الموارد البشرية"
                dir="rtl"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief description of this department's role and responsibilities..."
              className="resize-none"
            />
          </div>

          {/* Department Head */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <UserCheck size={11} /> Department Head
            </Label>
            {employees.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
                <Users size={14} />
                <span>No employees yet — assign a head after adding employees</span>
              </div>
            ) : (
              <Select value={headId || "none"} onValueChange={setHeadId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department head..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Head Assigned</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id.toString()}>
                      {e.firstName} {e.lastName}
                      {e.position ? ` · ${e.position}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Colour & Icon pickers */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Palette size={11} /> Colour
              </Label>
              <div className="flex flex-wrap gap-2">
                {DEPT_COLORS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    title={opt.value}
                    onClick={() => setColor(opt.value)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${opt.dot} ${
                      color === opt.value
                        ? "border-foreground scale-125 shadow-md"
                        : "border-transparent opacity-50 hover:opacity-90 hover:scale-110"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Icon</Label>
              <div className="flex flex-wrap gap-1">
                {DEPT_ICONS.map(({ value, Icon, label }) => (
                  <button
                    key={value}
                    type="button"
                    title={label}
                    onClick={() => setIconVal(value)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all border ${
                      iconVal === value
                        ? `${colorClasses} border-current scale-110`
                        : "border-border text-muted-foreground hover:bg-muted hover:scale-105"
                    }`}
                  >
                    <Icon size={13} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-muted/20 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || create.isPending || update.isPending}
            className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[150px]"
          >
            {create.isPending || update.isPending
              ? (initial ? "Saving..." : "Creating...")
              : initial ? "Save Changes" : "Create Department"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Position Dialog ──────────────────────────────────────────────────────────
function PosDialog({
  open, onClose, departmentId, departmentName, companyId,
}: {
  open: boolean;
  onClose: () => void;
  departmentId: number;
  departmentName: string;
  companyId?: number | null;
}) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [description, setDescription] = useState("");

  const create = trpc.hr.createPosition.useMutation({
    onSuccess: () => {
      utils.hr.listPositions.invalidate();
      toast.success("Position created");
      onClose();
      setTitle(""); setTitleAr(""); setDescription("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!title.trim()) return toast.error("Position title is required");
    create.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      departmentId,
      companyId: companyId ?? undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Position to {departmentName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Position Title (English) <span className="text-destructive">*</span></Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Accountant" />
          </div>
          <div className="space-y-1.5">
            <Label>Position Title (Arabic)</Label>
            <Input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} placeholder="e.g. محاسب أول" dir="rtl" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Brief description of this role..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!title.trim() || create.isPending}>
            {create.isPending ? "Creating..." : "Create Position"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DepartmentsPage() {
  const { activeCompanyId } = useActiveCompany();
  const utils = trpc.useUtils();

  const { data: departments = [], isLoading: deptsLoading } = trpc.hr.listDepartments.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );
  const { data: allEmployees = [] } = trpc.hr.listEmployees.useQuery(
    { status: "active", companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );
  const employees: Employee[] = useMemo(() => {
    const raw = allEmployees as any;
    return Array.isArray(raw?.employees) ? raw.employees : Array.isArray(raw) ? raw : [];
  }, [allEmployees]);

  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
  const selectedDept = departments.find((d) => d.id === selectedDeptId) ?? null;

  const { data: positions = [], isLoading: posLoading } = trpc.hr.listPositions.useQuery(
    { departmentId: selectedDeptId ?? undefined, companyId: activeCompanyId ?? undefined },
    { enabled: selectedDeptId != null }
  );

  // Delete mutations
  const deleteDept = trpc.hr.deleteDepartment.useMutation({
    onSuccess: () => {
      utils.hr.listDepartments.invalidate();
      toast.success("Department deleted");
      setDeleteTarget(null);
      if (selectedDeptId) setSelectedDeptId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const deletePos = trpc.hr.deletePosition.useMutation({
    onSuccess: () => { utils.hr.listPositions.invalidate(); toast.success("Position deleted"); setDeleteTarget(null); },
    onError: (e) => toast.error(e.message),
  });

  // Dialogs
  const [deptDialog, setDeptDialog] = useState<{ open: boolean; item?: Dept }>({ open: false });
  const [posDialog, setPosDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "dept" | "pos"; id: number; name: string } | null>(null);

  // Search
  const [search, setSearch] = useState("");
  const filtered = useMemo(() =>
    departments.filter((d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.description ?? "").toLowerCase().includes(search.toLowerCase())
    ), [departments, search]);

  // Stats
  const staffedDepts = departments.filter((d) => d.employeeCount > 0).length;
  const avgPerDept = departments.length > 0
    ? Math.round(employees.length / departments.length * 10) / 10
    : 0;

  // Head name lookup
  const getHeadName = (headId?: number | null) => {
    if (!headId) return undefined;
    const emp = employees.find((e) => e.id === headId);
    return emp ? `${emp.firstName} ${emp.lastName}` : undefined;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <Building2 size={24} className="text-primary" />
            Departments & Positions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage departments, assign heads, and define job positions
          </p>
        </div>
        <Button onClick={() => setDeptDialog({ open: true })} className="gap-2">
          <Plus size={16} /> Add Department
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Building2 size={18} className="text-blue-500" />}
          label="Departments" value={departments.length}
          color="bg-blue-500/10"
        />
        <StatCard
          icon={<Users size={18} className="text-emerald-500" />}
          label="Total Employees" value={employees.length}
          color="bg-emerald-500/10"
        />
        <StatCard
          icon={<BarChart3 size={18} className="text-amber-500" />}
          label="Staffed Depts" value={staffedDepts}
          color="bg-amber-500/10"
        />
        <StatCard
          icon={<TrendingUp size={18} className="text-violet-500" />}
          label="Avg per Dept" value={avgPerDept}
          color="bg-violet-500/10"
        />
      </div>

      {/* Main content: dept list + positions panel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: Department list */}
        <div className="lg:col-span-3 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search departments..."
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

          {/* List */}
          {deptsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
              <Building2 size={40} className="mx-auto mb-3 opacity-25" />
              <p className="font-medium">
                {search ? "No departments match your search" : "No departments yet"}
              </p>
              <p className="text-sm mt-1">
                {search ? "Try a different search term" : "Add your first department to organise your team"}
              </p>
              {!search && (
                <Button className="mt-4 gap-2" onClick={() => setDeptDialog({ open: true })}>
                  <Plus size={15} /> Add Department
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((dept) => (
                <DeptRow
                  key={dept.id}
                  dept={dept}
                  isSelected={selectedDeptId === dept.id}
                  headName={getHeadName(dept.headEmployeeId)}
                  onSelect={() => setSelectedDeptId(selectedDeptId === dept.id ? null : dept.id)}
                  onEdit={() => setDeptDialog({ open: true, item: dept })}
                  onDelete={() => setDeleteTarget({ type: "dept", id: dept.id, name: dept.name })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: Positions panel */}
        <div className="lg:col-span-2">
          <div className="border rounded-xl overflow-hidden h-full min-h-[300px] flex flex-col">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Briefcase size={15} className="text-muted-foreground" />
                <span className="font-semibold text-sm">
                  {selectedDept ? `${selectedDept.name} — Positions` : "Positions"}
                </span>
                {selectedDept && positions.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{positions.length}</Badge>
                )}
              </div>
              {selectedDept && (
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setPosDialog(true)}>
                  <Plus size={12} /> Add Position
                </Button>
              )}
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-2">
              {!selectedDept ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center text-muted-foreground">
                  <Briefcase size={32} className="mb-3 opacity-25" />
                  <p className="text-sm font-medium">Select a department</p>
                  <p className="text-xs mt-1">Click a department on the left to view its positions</p>
                </div>
              ) : posLoading ? (
                <div className="space-y-2 p-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted animate-pulse rounded-lg" />)}
                </div>
              ) : positions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center text-muted-foreground">
                  <Briefcase size={28} className="mb-3 opacity-25" />
                  <p className="text-sm font-medium">No positions yet</p>
                  <p className="text-xs mt-1">Add positions to define roles in this department</p>
                  <Button size="sm" className="mt-3 gap-1.5" onClick={() => setPosDialog(true)}>
                    <Plus size={13} /> Add Position
                  </Button>
                </div>
              ) : (
                <div>
                  {(positions as Position[]).map((pos) => (
                    <PositionItem
                      key={pos.id}
                      pos={pos}
                      onDelete={() => setDeleteTarget({ type: "pos", id: pos.id, name: pos.title })}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Panel footer: dept head info */}
            {selectedDept && (
              <div className="border-t px-4 py-2.5 bg-muted/20 flex items-center gap-2">
                <UserCheck size={13} className="text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">
                  Head:{" "}
                  <span className="font-medium text-foreground">
                    {getHeadName(selectedDept.headEmployeeId) ?? "Not assigned"}
                  </span>
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {selectedDept.employeeCount} employee{selectedDept.employeeCount !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Department Dialog */}
      {deptDialog.open && (
        <DeptDialog
          open={deptDialog.open}
          onClose={() => setDeptDialog({ open: false })}
          initial={deptDialog.item}
          employees={employees}
          companyId={activeCompanyId}
        />
      )}

      {/* Position Dialog */}
      {posDialog && selectedDept && (
        <PosDialog
          open={posDialog}
          onClose={() => setPosDialog(false)}
          departmentId={selectedDept.id}
          departmentName={selectedDept.name}
          companyId={activeCompanyId}
        />
      )}

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.type === "dept" ? "Department" : "Position"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
              {deleteTarget?.type === "dept" && " Employees assigned to this department will not be deleted, but their department assignment will be cleared."}
              {" "}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                if (deleteTarget.type === "dept") deleteDept.mutate({ id: deleteTarget.id });
                else deletePos.mutate({ id: deleteTarget.id });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
