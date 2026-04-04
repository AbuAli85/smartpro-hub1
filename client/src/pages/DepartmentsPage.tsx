import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Building2, Plus, Pencil, Trash2, Users, Briefcase, ChevronRight, Search, LayoutGrid, List,
} from "lucide-react";

// ─── Department Card ──────────────────────────────────────────────────────────

function DeptCard({
  dept,
  onEdit,
  onDelete,
  onSelect,
  isSelected,
}: {
  dept: { id: number; name: string; description?: string | null; employeeCount: number };
  onEdit: () => void;
  onDelete: () => void;
  onSelect: () => void;
  isSelected: boolean;
}) {
  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${isSelected ? "ring-2 ring-primary" : ""}`}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 size={18} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{dept.name}</p>
              {dept.description && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{dept.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
            >
              <Pencil size={13} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <Trash2 size={13} />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t">
          <Users size={13} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{dept.employeeCount} employee{dept.employeeCount !== 1 ? "s" : ""}</span>
          <ChevronRight size={12} className="text-muted-foreground ml-auto" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Position Row ─────────────────────────────────────────────────────────────

function PositionRow({
  pos,
  onDelete,
}: {
  pos: { id: number; title: string; description?: string | null; departmentId?: number | null };
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 group">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
          <Briefcase size={13} className="text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">{pos.title}</p>
          {pos.description && <p className="text-xs text-muted-foreground">{pos.description}</p>}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onDelete}
      >
        <Trash2 size={13} />
      </Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DepartmentsPage() {
  const { activeCompanyId } = useActiveCompany();
  const utils = trpc.useUtils();

  // Queries
  const { data: departments = [], isLoading: deptsLoading } = trpc.hr.listDepartments.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );
  const { data: employees = [] } = trpc.hr.listEmployees.useQuery(
    { status: "active", companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );

  // Selected department for positions panel
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
  const selectedDept = departments.find((d) => d.id === selectedDeptId);

  const { data: positions = [], isLoading: posLoading } = trpc.hr.listPositions.useQuery(
    { departmentId: selectedDeptId ?? undefined, companyId: activeCompanyId ?? undefined },
    { enabled: selectedDeptId != null }
  );

  // Mutations
  const createDept = trpc.hr.createDepartment.useMutation({
    onSuccess: () => { toast.success("Department created"); utils.hr.listDepartments.invalidate(); setDeptDialog(false); resetDeptForm(); },
    onError: (e) => toast.error(e.message),
  });
  const updateDept = trpc.hr.updateDepartment.useMutation({
    onSuccess: () => { toast.success("Department updated"); utils.hr.listDepartments.invalidate(); setDeptDialog(false); resetDeptForm(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteDept = trpc.hr.deleteDepartment.useMutation({
    onSuccess: () => { toast.success("Department deleted"); utils.hr.listDepartments.invalidate(); if (selectedDeptId) setSelectedDeptId(null); },
    onError: (e) => toast.error(e.message),
  });
  const createPos = trpc.hr.createPosition.useMutation({
    onSuccess: () => { toast.success("Position created"); utils.hr.listPositions.invalidate(); setPosDialog(false); resetPosForm(); },
    onError: (e) => toast.error(e.message),
  });
  const deletePos = trpc.hr.deletePosition.useMutation({
    onSuccess: () => { toast.success("Position deleted"); utils.hr.listPositions.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  // Department form
  const [deptDialog, setDeptDialog] = useState(false);
  const [editingDept, setEditingDept] = useState<typeof departments[0] | null>(null);
  const [deptForm, setDeptForm] = useState({ name: "", description: "", headEmployeeId: "" });
  const resetDeptForm = () => { setDeptForm({ name: "", description: "", headEmployeeId: "" }); setEditingDept(null); };

  const openEditDept = (dept: typeof departments[0]) => {
    setEditingDept(dept);
    setDeptForm({ name: dept.name, description: dept.description ?? "", headEmployeeId: dept.headEmployeeId ? String(dept.headEmployeeId) : "" });
    setDeptDialog(true);
  };

  const handleSaveDept = () => {
    if (!deptForm.name.trim()) return toast.error("Department name is required");
    const payload = {
      name: deptForm.name.trim(),
      description: deptForm.description.trim() || undefined,
      headEmployeeId: deptForm.headEmployeeId ? Number(deptForm.headEmployeeId) : undefined,
      companyId: activeCompanyId ?? undefined,
    };
    if (editingDept) {
      updateDept.mutate({ id: editingDept.id, ...payload });
    } else {
      createDept.mutate(payload);
    }
  };

  // Position form
  const [posDialog, setPosDialog] = useState(false);
  const [posForm, setPosForm] = useState({ title: "", description: "" });
  const resetPosForm = () => setPosForm({ title: "", description: "" });

  const handleSavePos = () => {
    if (!posForm.title.trim()) return toast.error("Position title is required");
    if (!selectedDeptId) return toast.error("Please select a department first");
    createPos.mutate({
      title: posForm.title.trim(),
      description: posForm.description.trim() || undefined,
      departmentId: selectedDeptId,
      companyId: activeCompanyId ?? undefined,
    });
  };

  // Search
  const [search, setSearch] = useState("");
  const filtered = departments.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 size={24} className="text-primary" />
            Departments & Positions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your company's organisational structure
          </p>
        </div>
        <Button onClick={() => { resetDeptForm(); setDeptDialog(true); }} className="gap-2">
          <Plus size={16} /> Add Department
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Building2 size={16} className="text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Departments</p>
              <p className="text-xl font-bold">{departments.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Users size={16} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Employees</p>
              <p className="text-xl font-bold">{employees.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Building2 size={16} className="text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Staffed Depts</p>
              <p className="text-xl font-bold">{departments.filter((d) => d.employeeCount > 0).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Briefcase size={16} className="text-purple-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg per Dept</p>
              <p className="text-xl font-bold">
                {departments.length > 0 ? Math.round(employees.length / departments.length) : 0}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main content: departments grid + positions panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Departments grid */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search departments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>

          {deptsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-10 text-center">
                <Building2 size={32} className="mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold mb-1">No departments yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create your first department to organise your team.
                </p>
                <Button size="sm" onClick={() => { resetDeptForm(); setDeptDialog(true); }} className="gap-2">
                  <Plus size={14} /> Add Department
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map((dept) => (
                <DeptCard
                  key={dept.id}
                  dept={dept}
                  isSelected={selectedDeptId === dept.id}
                  onSelect={() => setSelectedDeptId(selectedDeptId === dept.id ? null : dept.id)}
                  onEdit={() => openEditDept(dept)}
                  onDelete={() => {
                    if (confirm(`Delete department "${dept.name}"? This cannot be undone.`)) {
                      deleteDept.mutate({ id: dept.id, companyId: activeCompanyId ?? undefined });
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Positions panel */}
        <div>
          <Card className="sticky top-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Briefcase size={15} />
                  {selectedDept ? `${selectedDept.name} — Positions` : "Positions"}
                </CardTitle>
                {selectedDeptId && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setPosDialog(true)}>
                    <Plus size={12} /> Add
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!selectedDeptId ? (
                <div className="py-8 text-center">
                  <Briefcase size={28} className="mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">Select a department to view its positions</p>
                </div>
              ) : posLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
                </div>
              ) : positions.length === 0 ? (
                <div className="py-8 text-center">
                  <Briefcase size={28} className="mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground mb-3">No positions defined yet</p>
                  <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => setPosDialog(true)}>
                    <Plus size={12} /> Add Position
                  </Button>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {positions.map((pos) => (
                    <PositionRow
                      key={pos.id}
                      pos={pos}
                      onDelete={() => {
                        if (confirm(`Delete position "${pos.title}"?`)) {
                          deletePos.mutate({ id: pos.id, companyId: activeCompanyId ?? undefined });
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Department Dialog */}
      <Dialog open={deptDialog} onOpenChange={(open) => { if (!open) resetDeptForm(); setDeptDialog(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDept ? "Edit Department" : "Add Department"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Department Name *</Label>
              <Input
                placeholder="e.g. Human Resources"
                value={deptForm.name}
                onChange={(e) => setDeptForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of this department's function..."
                value={deptForm.description}
                onChange={(e) => setDeptForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Department Head (optional)</Label>
              <Select
                value={deptForm.headEmployeeId || "none"}
                onValueChange={(v) => setDeptForm((f) => ({ ...f, headEmployeeId: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department head" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={String(emp.id)}>
                      {emp.firstName} {emp.lastName}
                      {emp.position ? ` · ${emp.position}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetDeptForm(); setDeptDialog(false); }}>Cancel</Button>
            <Button
              onClick={handleSaveDept}
              disabled={createDept.isPending || updateDept.isPending}
            >
              {editingDept ? "Save Changes" : "Create Department"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Position Dialog */}
      <Dialog open={posDialog} onOpenChange={(open) => { if (!open) resetPosForm(); setPosDialog(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Position{selectedDept ? ` to ${selectedDept.name}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Position Title *</Label>
              <Input
                placeholder="e.g. Senior Software Engineer"
                value={posForm.title}
                onChange={(e) => setPosForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of this role..."
                value={posForm.description}
                onChange={(e) => setPosForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetPosForm(); setPosDialog(false); }}>Cancel</Button>
            <Button onClick={handleSavePos} disabled={createPos.isPending}>
              Add Position
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
