import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Building2, Briefcase, Plus, Pencil, Trash2, Users } from "lucide-react";

// ── Department Dialog ────────────────────────────────────────────────────────
function DeptDialog({
  open, onClose, initial, employees,
}: {
  open: boolean;
  onClose: () => void;
  initial?: { id: number; name: string; nameAr?: string | null; description?: string | null; headEmployeeId?: number | null };
  employees: { id: number; firstName: string; lastName: string }[];
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(initial?.name ?? "");
  const [nameAr, setNameAr] = useState(initial?.nameAr ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [headId, setHeadId] = useState<string>(initial?.headEmployeeId?.toString() ?? "");

  const create = trpc.orgStructure.createDepartment.useMutation({
    onSuccess: () => { utils.orgStructure.listDepartments.invalidate(); toast.success("Department created"); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.orgStructure.updateDepartment.useMutation({
    onSuccess: () => { utils.orgStructure.listDepartments.invalidate(); toast.success("Department updated"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!name.trim()) return;
    const payload = { name: name.trim(), nameAr: nameAr || undefined, description: description || undefined, headEmployeeId: headId ? Number(headId) : undefined };
    if (initial) update.mutate({ id: initial.id, ...payload });
    else create.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial ? "Edit Department" : "New Department"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Department Name (English) *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Human Resources" />
          </div>
          <div className="space-y-1">
            <Label>Department Name (Arabic)</Label>
            <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="e.g. الموارد البشرية" dir="rtl" />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Department Head</Label>
            <Select value={headId} onValueChange={setHeadId}>
              <SelectTrigger><SelectValue placeholder="Select employee..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id.toString()}>{e.firstName} {e.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || create.isPending || update.isPending}>
            {initial ? "Save Changes" : "Create Department"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Position Dialog ──────────────────────────────────────────────────────────
function PosDialog({
  open, onClose, initial, departments,
}: {
  open: boolean;
  onClose: () => void;
  initial?: { id: number; title: string; titleAr?: string | null; description?: string | null; departmentId?: number | null };
  departments: { id: number; name: string }[];
}) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [titleAr, setTitleAr] = useState(initial?.titleAr ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [deptId, setDeptId] = useState<string>(initial?.departmentId?.toString() ?? "");

  const create = trpc.orgStructure.createPosition.useMutation({
    onSuccess: () => { utils.orgStructure.listPositions.invalidate(); toast.success("Position created"); onClose(); },
    onError: (e) => toast.error(e.message),  });
  const update = trpc.orgStructure.updatePosition.useMutation({
    onSuccess: () => { utils.orgStructure.listPositions.invalidate(); toast.success("Position updated"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!title.trim()) return;
    const payload = { title: title.trim(), titleAr: titleAr || undefined, description: description || undefined, departmentId: deptId && deptId !== "none" ? Number(deptId) : undefined };
    if (initial) update.mutate({ id: initial.id, ...payload });
    else create.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial ? "Edit Position" : "New Position"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Position Title (English) *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Accountant" />
          </div>
          <div className="space-y-1">
            <Label>Position Title (Arabic)</Label>
            <Input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} placeholder="e.g. محاسب أول" dir="rtl" />
          </div>
          <div className="space-y-1">
            <Label>Department</Label>
            <Select value={deptId} onValueChange={setDeptId}>
              <SelectTrigger><SelectValue placeholder="Select department..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!title.trim() || create.isPending || update.isPending}>
            {initial ? "Save Changes" : "Create Position"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function OrgStructurePage() {
  const utils = trpc.useUtils();
  const { data: depts = [], isLoading: deptsLoading } = trpc.orgStructure.listDepartments.useQuery();
  const { data: positions = [], isLoading: posLoading } = trpc.orgStructure.listPositions.useQuery({});
  const { data: employees = [] } = trpc.hr.listEmployees.useQuery({});

  const [deptDialog, setDeptDialog] = useState<{ open: boolean; item?: typeof depts[0] }>({ open: false });
  const [posDialog, setPosDialog] = useState<{ open: boolean; item?: typeof positions[0] }>({ open: false });
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "dept" | "pos"; id: number } | null>(null);

  const deleteDept = trpc.orgStructure.deleteDepartment.useMutation({
    onSuccess: () => { utils.orgStructure.listDepartments.invalidate(); toast.success("Department removed"); setDeleteConfirm(null); },
  });
  const deletePos = trpc.orgStructure.deletePosition.useMutation({
    onSuccess: () => { utils.orgStructure.listPositions.invalidate(); toast.success("Position removed"); setDeleteConfirm(null); },
  });

  const empList = (employees as any)?.employees ?? employees ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organisation Structure</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage departments and job positions for your company.</p>
      </div>

      <Tabs defaultValue="departments">
        <TabsList>
          <TabsTrigger value="departments"><Building2 className="w-4 h-4 mr-2" />Departments ({depts.length})</TabsTrigger>
          <TabsTrigger value="positions"><Briefcase className="w-4 h-4 mr-2" />Positions ({positions.length})</TabsTrigger>
        </TabsList>

        {/* Departments Tab */}
        <TabsContent value="departments" className="mt-4">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">Define your company's departments. Employees are assigned to departments when added.</p>
            <Button onClick={() => setDeptDialog({ open: true })}>
              <Plus className="w-4 h-4 mr-2" />Add Department
            </Button>
          </div>
          {deptsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3].map((i) => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}
            </div>
          ) : depts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No departments yet</p>
              <p className="text-sm">Add your first department to organise your team.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {depts.map((dept) => (
                <Card key={dept.id} className="group">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{dept.name}</CardTitle>
                        {dept.nameAr && <p className="text-sm text-muted-foreground mt-0.5" dir="rtl">{dept.nameAr}</p>}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeptDialog({ open: true, item: dept })}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirm({ type: "dept", id: dept.id })}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {dept.description && <p className="text-xs text-muted-foreground mb-2">{dept.description}</p>}
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="w-3.5 h-3.5" />
                      <span>{dept.employeeCount} employee{dept.employeeCount !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="mt-2">
                      <Badge variant="secondary" className="text-xs">
                        {positions.filter((p) => p.departmentId === dept.id).length} position{positions.filter((p) => p.departmentId === dept.id).length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Positions Tab */}
        <TabsContent value="positions" className="mt-4">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">Define job positions and link them to departments.</p>
            <Button onClick={() => setPosDialog({ open: true })}>
              <Plus className="w-4 h-4 mr-2" />Add Position
            </Button>
          </div>
          {posLoading ? (
            <div className="space-y-2">
              {[1,2,3,4].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}
            </div>
          ) : positions.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No positions yet</p>
              <p className="text-sm">Add job positions to assign to employees.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {positions.map((pos) => {
                const dept = depts.find((d) => d.id === pos.departmentId);
                return (
                  <div key={pos.id} className="flex items-center justify-between p-3 rounded-lg border bg-card group">
                    <div>
                      <p className="font-medium text-sm">{pos.title}</p>
                      {pos.titleAr && <p className="text-xs text-muted-foreground" dir="rtl">{pos.titleAr}</p>}
                      {dept && <Badge variant="outline" className="text-xs mt-1">{dept.name}</Badge>}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPosDialog({ open: true, item: pos })}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirm({ type: "pos", id: pos.id })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <DeptDialog
        open={deptDialog.open}
        onClose={() => setDeptDialog({ open: false })}
        initial={deptDialog.item}
        employees={empList}
      />
      <PosDialog
        open={posDialog.open}
        onClose={() => setPosDialog({ open: false })}
        initial={posDialog.item}
        departments={depts}
      />

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the {deleteConfirm?.type === "dept" ? "department" : "position"}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteConfirm) return;
                if (deleteConfirm.type === "dept") deleteDept.mutate({ id: deleteConfirm.id });
                else deletePos.mutate({ id: deleteConfirm.id });
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
