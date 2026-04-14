import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Clock, CalendarDays } from "lucide-react";

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#64748b",
];

interface ShiftForm {
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  gracePeriodMinutes: number;
  color: string;
}

const defaultForm: ShiftForm = {
  name: "",
  startTime: "08:00",
  endTime: "17:00",
  breakMinutes: 0,
  gracePeriodMinutes: 15,
  color: "#6366f1",
};

export default function ShiftTemplatesPage() {
  const { activeCompanyId } = useActiveCompany();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<ShiftForm>(defaultForm);

  const { data: shifts = [], isLoading } = trpc.scheduling.listShiftTemplates.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: !!activeCompanyId }
  );

  const createMut = trpc.scheduling.createShiftTemplate.useMutation({
    onSuccess: () => {
      utils.scheduling.listShiftTemplates.invalidate();
      setOpen(false);
      toast.success("Shift template created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.scheduling.updateShiftTemplate.useMutation({
    onSuccess: () => {
      utils.scheduling.listShiftTemplates.invalidate();
      setOpen(false);
      toast.success("Shift template updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.scheduling.deleteShiftTemplate.useMutation({
    onSuccess: () => {
      utils.scheduling.listShiftTemplates.invalidate();
      setDeleteId(null);
      toast.success("Shift template deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  function openCreate() {
    setEditId(null);
    setForm(defaultForm);
    setOpen(true);
  }

  function openEdit(s: typeof shifts[0]) {
    setEditId(s.id);
    setForm({
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      breakMinutes: (s as { breakMinutes?: number }).breakMinutes ?? 0,
      gracePeriodMinutes: s.gracePeriodMinutes,
      color: s.color ?? "#6366f1",
    });
    setOpen(true);
  }

  function handleSubmit() {
    if (!activeCompanyId) return;
    if (editId) {
      updateMut.mutate({ id: editId, companyId: activeCompanyId, ...form });
    } else {
      createMut.mutate({ companyId: activeCompanyId, ...form });
    }
  }

  function formatDuration(start: string, end: string) {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="text-primary" size={24} />
            Shift Templates
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Define reusable work shift patterns for your company
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus size={16} /> New Shift
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-32" />
            </Card>
          ))}
        </div>
      ) : shifts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <CalendarDays size={40} className="opacity-30" />
            <p className="font-medium">No shift templates yet</p>
            <p className="text-sm">Create your first shift template to get started</p>
            <Button onClick={openCreate} variant="outline" className="mt-2 gap-2">
              <Plus size={16} /> Create Shift Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shifts.map((s) => (
            <Card key={s.id} className="relative overflow-hidden group hover:shadow-md transition-shadow">
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ backgroundColor: s.color ?? "#6366f1" }}
              />
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: s.color ?? "#6366f1" }}
                    />
                    <CardTitle className="text-base">{s.name}</CardTitle>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}>
                      <Pencil size={13} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(s.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Clock size={14} className="text-muted-foreground" />
                  <span className="font-medium">{s.startTime} – {s.endTime}</span>
                  <Badge variant="secondary" className="text-xs ml-auto">
                    {formatDuration(s.startTime, s.endTime)}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-1.5">
                  <p>
                    Break (deducted from worked time):{" "}
                    <span className="font-medium text-foreground">
                      {(s as { breakMinutes?: number }).breakMinutes ?? 0} min
                    </span>
                  </p>
                  <p>
                    On-time window: first{" "}
                    <span className="font-medium text-foreground">{s.gracePeriodMinutes} min</span> after start (late after
                    that).
                  </p>
                  <p className="text-[11px] leading-snug">
                    Completion vs early leave uses the shared 80% worked rule for closed punches (checkout policy).
                  </p>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {s.activeScheduleAssignmentCount ?? 0} active roster
                    {(s.activeScheduleAssignmentCount ?? 0) === 1 ? " link" : " links"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Shift Template" : "New Shift Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                placeholder="e.g. Morning Shift"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Break duration (minutes)</Label>
              <Input
                type="number"
                min={0}
                max={120}
                value={form.breakMinutes}
                onChange={(e) => setForm({ ...form, breakMinutes: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                Subtracted from worked hours on monthly reports (unpaid break within the shift).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Grace Period (minutes)</Label>
              <Input
                type="number"
                min={0}
                max={120}
                value={form.gracePeriodMinutes}
                onChange={(e) => setForm({ ...form, gracePeriodMinutes: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                Employees checking in within this window are counted as on-time
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="w-7 h-7 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: c,
                      borderColor: form.color === c ? "black" : "transparent",
                      transform: form.color === c ? "scale(1.2)" : "scale(1)",
                    }}
                    onClick={() => setForm({ ...form, color: c })}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.name || createMut.isPending || updateMut.isPending}
            >
              {editId ? "Save Changes" : "Create Shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shift Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the shift template. Existing schedules using it will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMut.mutate({ id: deleteId, companyId: activeCompanyId ?? undefined })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
