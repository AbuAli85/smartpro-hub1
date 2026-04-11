import { useMemo, useState } from "react";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  CalendarDays,
  MapPin,
  Clock,
  ArrowLeftRight,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  AlertCircle,
  Layers,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type ScheduleGroupEntry = RouterOutputs["scheduling"]["listScheduleGroups"][number];
type ShiftTemplate = RouterOutputs["scheduling"]["listShiftTemplates"][number];

interface ShiftSegment {
  /** Stable local key for React list rendering */
  _key: string;
  shiftTemplateId: string;
}

interface GroupForm {
  employeeUserId: string;
  siteId: string;
  workingDays: number[];
  startDate: string;
  endDate: string;
  notes: string;
  shiftSegments: ShiftSegment[];
}

interface GroupFormErrors {
  employeeUserId?: string;
  siteId?: string;
  workingDays?: string;
  /** Per-segment errors keyed by segment _key */
  segments?: Record<string, string>;
  /** Cross-segment errors (overlap, duplicate) */
  segmentsGlobal?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _keyCounter = 0;
function nextKey(): string {
  return `seg_${++_keyCounter}`;
}

function hhmm(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function shiftsOverlapClient(
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string },
): boolean {
  let aS = hhmm(a.startTime);
  let aE = hhmm(a.endTime);
  let bS = hhmm(b.startTime);
  let bE = hhmm(b.endTime);
  if (aE <= aS) aE += 1440;
  if (bE <= bS) bE += 1440;
  return aS < bE && bS < aE;
}

function shiftHours(s: { startTime: string; endTime: string }): number {
  let start = hhmm(s.startTime);
  let end = hhmm(s.endTime);
  if (end <= start) end += 1440;
  return (end - start) / 60;
}

function workingDayPillClass(on: boolean) {
  return on
    ? "bg-emerald-600 text-white border border-emerald-700 shadow-sm"
    : "bg-muted/70 text-muted-foreground border border-transparent";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const defaultForm: GroupForm = {
  employeeUserId: "",
  siteId: "",
  workingDays: [0, 1, 2, 3, 4],
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
  notes: "",
  shiftSegments: [{ _key: nextKey(), shiftTemplateId: "" }],
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Live summary panel shown below the shift segments builder */
function ShiftSummaryPanel({
  segments,
  shifts,
}: {
  segments: ShiftSegment[];
  shifts: ShiftTemplate[];
}) {
  const shiftById = useMemo(
    () => new Map(shifts.map((s) => [String(s.id), s])),
    [shifts],
  );

  const resolved = segments
    .map((seg) => (seg.shiftTemplateId ? shiftById.get(seg.shiftTemplateId) : undefined))
    .filter((s): s is ShiftTemplate => s != null);

  if (resolved.length === 0) return null;

  const totalHours = resolved.reduce((acc, s) => acc + shiftHours(s), 0);
  const patternLabel = resolved
    .map((s) => `${s.name} (${s.startTime}–${s.endTime})`)
    .join(" + ");

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 space-y-1">
      <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
        <Layers size={13} />
        Schedule summary
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
        <span>
          <strong className="text-foreground">{resolved.length}</strong>{" "}
          shift{resolved.length === 1 ? "" : "s"} per working day
        </span>
        <span>
          <strong className="text-foreground">{totalHours.toFixed(1)}h</strong>{" "}
          planned per day
        </span>
      </div>
      <p className="text-xs text-muted-foreground truncate" title={patternLabel}>
        {patternLabel}
      </p>
    </div>
  );
}

/** Single shift segment row */
function ShiftSegmentRow({
  seg,
  index,
  total,
  shifts,
  error,
  onChangTemplate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  seg: ShiftSegment;
  index: number;
  total: number;
  shifts: ShiftTemplate[];
  error?: string;
  onChangTemplate: (key: string, v: string) => void;
  onRemove: (key: string) => void;
  onMoveUp: (key: string) => void;
  onMoveDown: (key: string) => void;
}) {
  const selected = shifts.find((s) => String(s.id) === seg.shiftTemplateId);

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2 transition-colors",
        error ? "border-destructive bg-destructive/5" : "border-border bg-muted/20",
      )}
    >
      <div className="flex items-center gap-2">
        {/* Drag handle cosmetic */}
        <GripVertical size={15} className="text-muted-foreground/50 shrink-0" />

        <div className="flex-1 min-w-0">
          <Select
            value={seg.shiftTemplateId}
            onValueChange={(v) => onChangTemplate(seg._key, v)}
            disabled={shifts.length === 0}
          >
            <SelectTrigger
              className={cn(
                "w-full min-w-0",
                error && "border-destructive",
              )}
            >
              <SelectValue
                placeholder={
                  shifts.length === 0
                    ? "No shifts available"
                    : "Select shift template…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {shifts.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: s.color ?? "#6366f1" }}
                    />
                    {s.name} — {s.startTime}–{s.endTime}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Reorder buttons */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMoveUp(seg._key)}
            className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
            aria-label="Move shift up"
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => onMoveDown(seg._key)}
            className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
            aria-label="Move shift down"
          >
            <ChevronDown size={13} />
          </button>
        </div>

        {/* Remove */}
        {total > 1 && (
          <button
            type="button"
            onClick={() => onRemove(seg._key)}
            className="p-1 rounded hover:bg-destructive/10 text-destructive shrink-0"
            aria-label="Remove shift segment"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Selected shift time badge */}
      {selected && (
        <div className="flex items-center gap-1.5 px-1">
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ background: selected.color ?? "#6366f1" }}
          />
          <span className="text-xs text-muted-foreground">
            {selected.startTime} – {selected.endTime}
            {selected.gracePeriodMinutes
              ? ` · ${selected.gracePeriodMinutes}min grace`
              : ""}
          </span>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle size={11} />
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EmployeeSchedulesPage() {
  const { activeCompanyId } = useActiveCompany();
  const utils = trpc.useUtils();

  // ── Modal state ──
  const [open, setOpen] = useState(false);
  /** null = create new; number = editing existing group; "legacy:{id}" = editing legacy row */
  const [editTarget, setEditTarget] = useState<null | number | string>(null);
  const [form, setForm] = useState<GroupForm>(defaultForm);
  const [fieldErrors, setFieldErrors] = useState<GroupFormErrors>({});

  // ── Delete state ──
  /** "group:{id}" | "legacy:{id}" */
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // ── Requests panel ──
  const [shiftReqFilter, setShiftReqFilter] = useState<string>("pending");
  const [adminNoteId, setAdminNoteId] = useState<number | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [showRequestsPanel, setShowRequestsPanel] = useState(true);

  // ── Calendar panel ──
  const [adminCalView, setAdminCalView] = useState<"calendar" | "list">("calendar");
  const [adminCalMonth, setAdminCalMonth] = useState(() => new Date().getMonth());
  const [adminCalYear, setAdminCalYear] = useState(() => new Date().getFullYear());
  const [adminCalSelectedDay, setAdminCalSelectedDay] = useState<string | null>(null);
  const [showCalPanel, setShowCalPanel] = useState(true);

  // ── Data queries ──
  const { data: groups = [], isLoading } = trpc.scheduling.listScheduleGroups.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: !!activeCompanyId },
  );

  const { data: shifts = [] } = trpc.scheduling.listShiftTemplates.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: !!activeCompanyId },
  );

  const { data: sitesData } = trpc.attendance.listSites.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: !!activeCompanyId },
  );
  const sites = sitesData ?? [];

  const { data: employeesData } = trpc.hr.listEmployees.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: !!activeCompanyId },
  );
  const employees = employeesData ?? [];

  // ── Mutations ──
  function invalidate() {
    utils.scheduling.listScheduleGroups.invalidate();
    utils.scheduling.listEmployeeSchedules.invalidate();
    utils.scheduling.getTodayBoard.invalidate();
  }

  const assignGroupMut = trpc.scheduling.assignScheduleGroup.useMutation({
    onSuccess: () => { invalidate(); setOpen(false); toast.success("Schedule assigned"); },
    onError: (e) => toast.error(e.message),
  });

  const updateGroupMut = trpc.scheduling.updateScheduleGroup.useMutation({
    onSuccess: () => { invalidate(); setOpen(false); toast.success("Schedule updated"); },
    onError: (e) => toast.error(e.message),
  });

  // Legacy single-row mutations (backward compat)
  const updateLegacyMut = trpc.scheduling.updateSchedule.useMutation({
    onSuccess: () => { invalidate(); setOpen(false); toast.success("Schedule updated"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteGroupMut = trpc.scheduling.deleteScheduleGroup.useMutation({
    onSuccess: () => { invalidate(); setDeleteTarget(null); toast.success("Schedule group removed"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteLegacyMut = trpc.scheduling.deleteSchedule.useMutation({
    onSuccess: () => { invalidate(); setDeleteTarget(null); toast.success("Schedule removed"); },
    onError: (e) => toast.error(e.message),
  });

  // ── Shift requests ──
  const { data: shiftRequestsData } = trpc.shiftRequests.adminList.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: !!activeCompanyId },
  );
  const approveShiftReq = trpc.shiftRequests.approve.useMutation({
    onSuccess: () => { utils.shiftRequests.adminList.invalidate(); toast.success("Request approved"); setAdminNoteId(null); setAdminNote(""); },
    onError: (e) => toast.error(e.message),
  });
  const rejectShiftReq = trpc.shiftRequests.reject.useMutation({
    onSuccess: () => { utils.shiftRequests.adminList.invalidate(); toast.success("Request rejected"); setAdminNoteId(null); setAdminNote(""); },
    onError: (e) => toast.error(e.message),
  });

  // ── Open-modal helpers ──
  function openCreate() {
    setEditTarget(null);
    setForm({ ...defaultForm, shiftSegments: [{ _key: nextKey(), shiftTemplateId: "" }] });
    setFieldErrors({});
    setOpen(true);
  }

  function openEditGroup(entry: ScheduleGroupEntry) {
    if (entry.type !== "group") return;
    setEditTarget(entry.groupId);
    setFieldErrors({});
    setForm({
      employeeUserId: String(entry.employeeUserId),
      siteId: String(entry.siteId),
      workingDays: entry.workingDays.split(",").map(Number),
      startDate: entry.startDate,
      endDate: entry.endDate ?? "",
      notes: entry.notes ?? "",
      shiftSegments: entry.shifts.map((s) => ({
        _key: nextKey(),
        shiftTemplateId: String(s.shiftTemplateId),
      })),
    });
    setOpen(true);
  }

  function openEditLegacy(entry: ScheduleGroupEntry) {
    if (entry.type !== "legacy") return;
    setEditTarget(`legacy:${entry.scheduleId}`);
    setFieldErrors({});
    setForm({
      employeeUserId: String(entry.employeeUserId),
      siteId: String(entry.siteId),
      workingDays: entry.workingDays.split(",").map(Number),
      startDate: entry.startDate,
      endDate: entry.endDate ?? "",
      notes: entry.notes ?? "",
      shiftSegments: entry.shifts.map((s) => ({
        _key: nextKey(),
        shiftTemplateId: String(s.shiftTemplateId),
      })),
    });
    setOpen(true);
  }

  function openDelete(entry: ScheduleGroupEntry) {
    if (entry.type === "group") setDeleteTarget(`group:${entry.groupId}`);
    else setDeleteTarget(`legacy:${entry.scheduleId}`);
  }

  // ── Form field handlers ──
  function toggleDay(d: number) {
    setFieldErrors((e) => ({ ...e, workingDays: undefined }));
    setForm((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(d)
        ? prev.workingDays.filter((x) => x !== d)
        : [...prev.workingDays, d].sort(),
    }));
  }

  function addSegment() {
    setForm((prev) => ({
      ...prev,
      shiftSegments: [...prev.shiftSegments, { _key: nextKey(), shiftTemplateId: "" }],
    }));
  }

  function removeSegment(key: string) {
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (next.segments) {
        const s = { ...next.segments };
        delete s[key];
        next.segments = s;
      }
      return next;
    });
    setForm((prev) => ({
      ...prev,
      shiftSegments: prev.shiftSegments.filter((s) => s._key !== key),
    }));
  }

  function changeSegmentTemplate(key: string, v: string) {
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (next.segments) {
        const s = { ...next.segments };
        delete s[key];
        next.segments = s;
      }
      next.segmentsGlobal = undefined;
      return next;
    });
    setForm((prev) => ({
      ...prev,
      shiftSegments: prev.shiftSegments.map((s) =>
        s._key === key ? { ...s, shiftTemplateId: v } : s,
      ),
    }));
  }

  function moveSegment(key: string, dir: "up" | "down") {
    setForm((prev) => {
      const arr = [...prev.shiftSegments];
      const idx = arr.findIndex((s) => s._key === key);
      if (idx < 0) return prev;
      const target = dir === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= arr.length) return prev;
      [arr[idx], arr[target]] = [arr[target]!, arr[idx]!];
      return { ...prev, shiftSegments: arr };
    });
  }

  // ── Client-side validation ──
  function validateForm(): boolean {
    const err: GroupFormErrors = {};

    if (!form.employeeUserId) err.employeeUserId = "Select an employee.";
    if (!form.siteId) err.siteId = "Select an attendance site.";
    if (form.workingDays.length === 0) err.workingDays = "Select at least one working day.";

    const segErrors: Record<string, string> = {};
    const seenIds = new Set<string>();

    for (const seg of form.shiftSegments) {
      if (!seg.shiftTemplateId) {
        segErrors[seg._key] = "Select a shift template.";
        continue;
      }
      if (seenIds.has(seg.shiftTemplateId)) {
        segErrors[seg._key] = "Duplicate shift template.";
      }
      seenIds.add(seg.shiftTemplateId);
    }

    if (Object.keys(segErrors).length > 0) {
      err.segments = segErrors;
    } else if (form.shiftSegments.length > 1) {
      // Client-side overlap check
      const shiftMap = new Map(shifts.map((s) => [String(s.id), s]));
      const resolved = form.shiftSegments
        .map((s) => shiftMap.get(s.shiftTemplateId))
        .filter((s): s is ShiftTemplate => s != null);

      for (let i = 0; i < resolved.length; i++) {
        for (let j = i + 1; j < resolved.length; j++) {
          if (shiftsOverlapClient(resolved[i]!, resolved[j]!)) {
            err.segmentsGlobal = `"${resolved[i]!.name}" (${resolved[i]!.startTime}–${resolved[i]!.endTime}) overlaps "${resolved[j]!.name}" (${resolved[j]!.startTime}–${resolved[j]!.endTime}).`;
          }
        }
      }
    }

    if (Object.keys(err).length > 0) {
      setFieldErrors(err);
      toast.error("Please fix the highlighted fields.");
      return false;
    }
    setFieldErrors({});
    return true;
  }

  // ── Submit ──
  function handleSubmit() {
    if (!validateForm()) return;
    if (!activeCompanyId) { toast.error("No active company"); return; }

    const shiftTemplateIds = form.shiftSegments.map((s) => Number(s.shiftTemplateId));
    const workingDays = form.workingDays;
    const commonPayload = {
      companyId: activeCompanyId,
      employeeUserId: Number(form.employeeUserId),
      siteId: Number(form.siteId),
      workingDays,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      notes: form.notes || undefined,
    };

    if (editTarget === null) {
      // Create new group
      assignGroupMut.mutate({ ...commonPayload, shiftTemplateIds });
    } else if (typeof editTarget === "number") {
      // Update existing group
      updateGroupMut.mutate({ groupId: editTarget, ...commonPayload, shiftTemplateIds });
    } else if (typeof editTarget === "string" && editTarget.startsWith("legacy:")) {
      // Update legacy single-row via old procedure
      const id = Number(editTarget.replace("legacy:", ""));
      updateLegacyMut.mutate({
        id,
        companyId: activeCompanyId,
        siteId: Number(form.siteId),
        shiftTemplateId: shiftTemplateIds[0],
        workingDays,
        startDate: form.startDate,
        endDate: form.endDate || null,
        notes: form.notes || undefined,
      });
    }
  }

  function handleDelete() {
    if (!deleteTarget || !activeCompanyId) return;
    if (deleteTarget.startsWith("group:")) {
      deleteGroupMut.mutate({ groupId: Number(deleteTarget.replace("group:", "")), companyId: activeCompanyId });
    } else {
      deleteLegacyMut.mutate({ id: Number(deleteTarget.replace("legacy:", "")), companyId: activeCompanyId });
    }
  }

  const isPending =
    assignGroupMut.isPending || updateGroupMut.isPending || updateLegacyMut.isPending;

  // ── Group by employee for the listing ──
  const groupedByEmployee = useMemo(() => {
    const map = new Map<number, ScheduleGroupEntry[]>();
    for (const entry of groups) {
      const k = entry.employeeUserId;
      const arr = map.get(k) ?? [];
      arr.push(entry);
      map.set(k, arr);
    }
    return Array.from(map.entries())
      .map(([employeeUserId, entries]) => {
        const name = entries[0]?.employee?.name?.trim() || "Unknown";
        return { employeeUserId, name, entries };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [groups]);

  const isEditing = editTarget !== null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="text-primary" size={24} />
            Employee Schedules
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Assign shift templates and working days to employees
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus size={16} /> Assign Schedule
        </Button>
      </div>

      {/* ── Schedule list ── */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-20" />
            </Card>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <CalendarDays size={40} className="opacity-30" />
            <p className="font-medium">No schedules assigned yet</p>
            <Button onClick={openCreate} variant="outline" className="mt-2 gap-2">
              <Plus size={16} /> Assign First Schedule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedByEmployee.map((empGroup) => (
            <Card key={empGroup.employeeUserId} className="overflow-hidden shadow-sm">
              {/* Employee header row */}
              <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/40">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="text-xs font-semibold">
                    {getInitials(empGroup.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{empGroup.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {empGroup.entries.length} roster assignment{empGroup.entries.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <CardContent className="p-0 divide-y">
                {empGroup.entries.map((entry) => (
                  <ScheduleEntryCard
                    key={entry.type === "group" ? `g-${entry.groupId}` : `l-${entry.scheduleId}`}
                    entry={entry}
                    onEdit={entry.type === "group" ? () => openEditGroup(entry) : () => openEditLegacy(entry)}
                    onDelete={() => openDelete(entry)}
                  />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ══ SHIFT CHANGE & TIME OFF REQUESTS REVIEW ════════════════════════════ */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowRequestsPanel((p) => !p)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-primary" />
              Shift Change & Time Off Requests
              {(() => {
                const pending = (shiftRequestsData ?? []).filter((r: any) => r.status === "pending").length;
                return pending > 0 ? (
                  <span className="ml-1 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">{pending}</span>
                ) : null;
              })()}
            </CardTitle>
            {showRequestsPanel ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
          </div>
          {showRequestsPanel && (
            <div className="flex gap-1.5 mt-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
              {(["pending", "all", "approved", "rejected"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setShiftReqFilter(f)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    shiftReqFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {f === "pending" && (shiftRequestsData ?? []).filter((r: any) => r.status === "pending").length > 0 && (
                    <span className="ml-1 bg-amber-500 text-white rounded-full px-1 text-[10px]">
                      {(shiftRequestsData ?? []).filter((r: any) => r.status === "pending").length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </CardHeader>
        {showRequestsPanel && (
          <CardContent className="pt-0">
            <ShiftRequestsList
              allReqs={(shiftRequestsData ?? []) as any[]}
              filter={shiftReqFilter}
              adminNoteId={adminNoteId}
              adminNote={adminNote}
              onSetAdminNoteId={setAdminNoteId}
              onSetAdminNote={setAdminNote}
              onApprove={(id, note) => approveShiftReq.mutate({ id, adminNotes: note || undefined })}
              onReject={(id, note) => rejectShiftReq.mutate({ id, adminNotes: note || "No reason provided" })}
            />
          </CardContent>
        )}
      </Card>

      {/* ══ Admin Requests Calendar Overview ═══════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowCalPanel((p) => !p)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Requests Calendar Overview</CardTitle>
              <span className="text-xs text-muted-foreground ml-1">— all employees</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                {(["calendar", "list"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setAdminCalView(v)}
                    className={`text-xs px-2 py-1 rounded ${adminCalView === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    {v === "calendar" ? "Calendar" : "List"}
                  </button>
                ))}
              </div>
              {showCalPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>
        </CardHeader>
        {showCalPanel && (
          <CardContent className="pt-0">
            <RequestsCalendar
              allReqs={(shiftRequestsData ?? []) as any[]}
              view={adminCalView}
              month={adminCalMonth}
              year={adminCalYear}
              selectedDay={adminCalSelectedDay}
              onMonthChange={(m, y) => { setAdminCalMonth(m); setAdminCalYear(y); }}
              onSelectDay={setAdminCalSelectedDay}
            />
          </CardContent>
        )}
      </Card>

      {/* ══ Assign / Edit Dialog ════════════════════════════════════════════════ */}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setFieldErrors({});
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Schedule" : "Assign Schedule"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update roster details and shift segments for this assignment."
                : "Assign one or more shifts under one grouped roster. Employee · site · working days are shared across all shifts."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Employee */}
            <div className="space-y-1.5">
              <Label htmlFor="sched-employee">Employee *</Label>
              <Select
                value={form.employeeUserId}
                onValueChange={(v) => {
                  setFieldErrors((e) => ({ ...e, employeeUserId: undefined }));
                  setForm((f) => ({ ...f, employeeUserId: v }));
                }}
                disabled={employees.length === 0 || (isEditing && typeof editTarget === "number")}
              >
                <SelectTrigger
                  id="sched-employee"
                  className={cn("w-full", fieldErrors.employeeUserId && "border-destructive")}
                >
                  <SelectValue placeholder={employees.length === 0 ? "No employees" : "Select employee…"} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => (
                    <SelectItem key={e.userId ?? e.id} value={String(e.userId ?? e.id)}>
                      {e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.employeeUserId && (
                <p className="text-xs text-destructive">{fieldErrors.employeeUserId}</p>
              )}
              {employees.length === 0 && (
                <p className="text-xs text-muted-foreground">Add employees under HR → Employees first.</p>
              )}
            </div>

            {/* Site */}
            <div className="space-y-1.5">
              <Label htmlFor="sched-site">Attendance Site *</Label>
              <Select
                value={form.siteId}
                onValueChange={(v) => {
                  setFieldErrors((e) => ({ ...e, siteId: undefined }));
                  setForm((f) => ({ ...f, siteId: v }));
                }}
                disabled={sites.length === 0}
              >
                <SelectTrigger
                  id="sched-site"
                  className={cn("w-full", fieldErrors.siteId && "border-destructive")}
                >
                  <SelectValue placeholder={sites.length === 0 ? "No sites — create under Attendance Sites" : "Select site…"} />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.siteId && (
                <p className="text-xs text-destructive">{fieldErrors.siteId}</p>
              )}
            </div>

            {/* Shift segments builder */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  Shift Segments *{" "}
                  <span className="font-normal text-muted-foreground text-xs">
                    ({form.shiftSegments.length} shift{form.shiftSegments.length === 1 ? "" : "s"})
                  </span>
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={addSegment}
                  disabled={shifts.length === 0}
                >
                  <Plus size={12} /> Add shift
                </Button>
              </div>

              <div className="space-y-2">
                {form.shiftSegments.map((seg, idx) => (
                  <ShiftSegmentRow
                    key={seg._key}
                    seg={seg}
                    index={idx}
                    total={form.shiftSegments.length}
                    shifts={shifts}
                    error={fieldErrors.segments?.[seg._key]}
                    onChangTemplate={changeSegmentTemplate}
                    onRemove={removeSegment}
                    onMoveUp={(k) => moveSegment(k, "up")}
                    onMoveDown={(k) => moveSegment(k, "down")}
                  />
                ))}
              </div>

              {fieldErrors.segmentsGlobal && (
                <div className="flex items-start gap-1.5 p-2 rounded-lg bg-destructive/10 border border-destructive/30">
                  <AlertCircle size={13} className="text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{fieldErrors.segmentsGlobal}</p>
                </div>
              )}

              {shifts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Create shift templates under Shift Templates first.
                </p>
              )}

              {/* Live summary */}
              <ShiftSummaryPanel segments={form.shiftSegments} shifts={shifts} />
            </div>

            {/* Working Days */}
            <div className="space-y-1.5">
              <Label>Working Days *</Label>
              <div className="flex gap-2 flex-wrap" role="group" aria-label="Working days of week">
                {DAYS.map((d) => {
                  const on = form.workingDays.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(d.value)}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
                        on
                          ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
                          : "bg-background text-foreground border-border hover:bg-muted",
                      )}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              {fieldErrors.workingDays && (
                <p className="text-xs text-destructive">{fieldErrors.workingDays}</p>
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Start Date *</Label>
                <DateInput
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">DD/MM/YYYY · stored YYYY-MM-DD</p>
              </div>
              <div className="space-y-1.5">
                <Label>End Date (optional)</Label>
                <DateInput
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Leave blank for open-ended</p>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input
                placeholder="Any notes about this schedule…"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isEditing ? "Save Changes" : "Assign Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Delete Confirmation ══════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.startsWith("group:") ? "Remove Schedule Group?" : "Remove Schedule?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.startsWith("group:")
                ? "This will deactivate the entire roster group and all its shift assignments. Existing attendance records are preserved."
                : "This will deactivate the schedule assignment. Existing attendance records are preserved."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── ScheduleEntryCard ────────────────────────────────────────────────────────

function ScheduleEntryCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: ScheduleGroupEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const workingDayNums = entry.workingDays.split(",").map(Number);
  const isGroup = entry.type === "group";

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex-1 min-w-0 space-y-2.5">
        {/* Shift badges */}
        <div className="flex flex-wrap items-center gap-2">
          {isGroup && entry.shifts.length > 1 && (
            <Badge variant="outline" className="text-xs gap-1 border-primary/30 text-primary">
              <Layers size={11} />
              {entry.shifts.length} shifts
            </Badge>
          )}
          {entry.shifts.map((s) =>
            s.shift ? (
              <Badge
                key={s.scheduleId}
                style={{ backgroundColor: s.shift.color ?? "#6366f1", color: "white" }}
                className="text-xs"
              >
                {s.shift.name}
              </Badge>
            ) : null,
          )}
          {!entry.isActive && (
            <Badge variant="secondary" className="text-xs">Inactive</Badge>
          )}
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {entry.site && (
            <span className="flex items-center gap-1">
              <MapPin size={11} /> {entry.site.name}
            </span>
          )}
          {entry.shifts.map((s) =>
            s.shift ? (
              <span key={s.scheduleId} className="flex items-center gap-1">
                <Clock size={11} />
                {s.shift.startTime}–{s.shift.endTime}
              </span>
            ) : null,
          )}
        </div>

        {/* Date range */}
        <p className="text-xs text-muted-foreground">
          From <strong className="text-foreground">{entry.startDate}</strong>
          {entry.endDate ? ` to ${entry.endDate}` : " (ongoing)"}
        </p>

        {/* Working day pills */}
        <div className="flex flex-wrap gap-1" aria-label="Working days">
          {DAYS.map((d) => (
            <span
              key={d.value}
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium border",
                workingDayPillClass(workingDayNums.includes(d.value)),
              )}
            >
              {d.label}
            </span>
          ))}
        </div>

        {/* Shift segment detail list (for multi-shift groups) */}
        {isGroup && entry.shifts.length > 1 && (
          <div className="space-y-1 pt-1">
            {entry.shifts.map((s, idx) =>
              s.shift ? (
                <div key={s.scheduleId} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/70 w-4">{idx + 1}.</span>
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ background: s.shift.color ?? "#6366f1" }}
                  />
                  <span className="font-medium text-foreground">{s.shift.name}</span>
                  <span>{s.shift.startTime} – {s.shift.endTime}</span>
                  {s.shift.gracePeriodMinutes ? (
                    <span className="text-muted-foreground/70">·{s.shift.gracePeriodMinutes}min grace</span>
                  ) : null}
                </div>
              ) : null,
            )}
          </div>
        )}

        {entry.notes && (
          <p className="text-xs text-muted-foreground italic">{entry.notes}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 gap-1 sm:flex-col sm:items-end">
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={onEdit}>
          <Pencil size={14} /> Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={onDelete}
        >
          <Trash2 size={14} /> Remove
        </Button>
      </div>
    </div>
  );
}

// ─── ShiftRequestsList ────────────────────────────────────────────────────────

function ShiftRequestsList({
  allReqs,
  filter,
  adminNoteId,
  adminNote,
  onSetAdminNoteId,
  onSetAdminNote,
  onApprove,
  onReject,
}: {
  allReqs: any[];
  filter: string;
  adminNoteId: number | null;
  adminNote: string;
  onSetAdminNoteId: (id: number | null) => void;
  onSetAdminNote: (v: string) => void;
  onApprove: (id: number, note: string) => void;
  onReject: (id: number, note: string) => void;
}) {
  const filtered = filter === "all" ? allReqs : allReqs.filter((r) => r.status === filter);
  const typeLabels: Record<string, string> = {
    shift_change: "Shift Change", time_off: "Time Off",
    early_leave: "Early Leave", late_arrival: "Late Arrival", day_swap: "Day Swap",
  };
  const statusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    approved: "bg-green-100 text-green-700 border-green-200",
    rejected: "bg-red-100 text-red-700 border-red-200",
    cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  };

  if (filtered.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 opacity-20" />
        <p className="text-sm">{filter === "pending" ? "No pending requests" : "No requests found"}</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {filtered.map((req: any) => (
        <div key={req.id} className="py-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{req.employeeName ?? "Employee"}</span>
                <span className="text-xs text-muted-foreground">• {typeLabels[req.requestType] ?? req.requestType}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColors[req.status] ?? "bg-muted text-muted-foreground"}`}>
                  {req.status?.charAt(0).toUpperCase() + req.status?.slice(1)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {req.requestedDate}
                {req.requestedEndDate && req.requestedEndDate !== req.requestedDate ? ` → ${req.requestedEndDate}` : ""}
                {req.requestedTime ? ` at ${req.requestedTime}` : ""}
              </p>
              <p className="text-xs mt-0.5 text-foreground/80">{req.reason}</p>
              {req.adminNotes && (
                <p className="text-xs mt-1 text-primary italic">Your note: {req.adminNotes}</p>
              )}
              {adminNoteId === req.id && (
                <div className="mt-2 space-y-1.5">
                  <Textarea
                    rows={2}
                    placeholder="Add a note (optional)…"
                    value={adminNote}
                    onChange={(e) => onSetAdminNote(e.target.value)}
                    className="text-xs"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="gap-1 h-7 text-xs bg-green-600 hover:bg-green-700"
                      onClick={() => onApprove(req.id, adminNote)}>
                      <Check size={12} /> Approve
                    </Button>
                    <Button size="sm" variant="destructive" className="gap-1 h-7 text-xs"
                      onClick={() => onReject(req.id, adminNote)}>
                      <X size={12} /> Reject
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => { onSetAdminNoteId(null); onSetAdminNote(""); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
            {req.status === "pending" && adminNoteId !== req.id && (
              <div className="flex gap-1.5 shrink-0">
                <Button size="sm" className="gap-1 h-7 text-xs bg-green-600 hover:bg-green-700"
                  onClick={() => { onSetAdminNoteId(req.id); onSetAdminNote(""); }}>
                  <Check size={12} /> Review
                </Button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── RequestsCalendar ─────────────────────────────────────────────────────────

function RequestsCalendar({
  allReqs,
  view,
  month,
  year,
  selectedDay,
  onMonthChange,
  onSelectDay,
}: {
  allReqs: any[];
  view: "calendar" | "list";
  month: number;
  year: number;
  selectedDay: string | null;
  onMonthChange: (m: number, y: number) => void;
  onSelectDay: (d: string | null) => void;
}) {
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dotColors: Record<string, string> = {
    pending: "bg-amber-400", approved: "bg-green-500", rejected: "bg-red-400", cancelled: "bg-gray-300",
  };
  const badgeColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700", approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700", cancelled: "bg-gray-100 text-gray-500",
  };
  const typeLabels: Record<string, string> = {
    shift_change: "Shift Change", time_off: "Time Off",
    early_leave: "Early Leave", late_arrival: "Late Arrival", day_swap: "Day Swap",
  };

  const dayMap: Record<string, any[]> = {};
  allReqs.forEach((r) => {
    const start = r.requestedDate;
    const end = r.requestedEndDate || start;
    const cur = new Date(start);
    const endD = new Date(end);
    while (cur <= endD) {
      const key = cur.toISOString().split("T")[0];
      if (!dayMap[key]) dayMap[key] = [];
      dayMap[key].push(r);
      cur.setDate(cur.getDate() + 1);
    }
  });

  function prevMonth() {
    if (month === 0) onMonthChange(11, year - 1);
    else onMonthChange(month - 1, year);
  }
  function nextMonth() {
    if (month === 11) onMonthChange(0, year + 1);
    else onMonthChange(month + 1, year);
  }

  if (view === "list") {
    const sorted = [...allReqs].sort((a, b) => (b.requestedDate ?? "").localeCompare(a.requestedDate ?? ""));
    return (
      <div className="space-y-2">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No requests yet</p>
        ) : sorted.map((r: any) => (
          <div key={r.id} className="flex items-center gap-3 p-2 rounded-lg border">
            <div className={`w-2 h-2 rounded-full shrink-0 ${dotColors[r.status] ?? "bg-gray-300"}`} />
            <div className="flex-1 min-w-0">
              <span className="font-medium text-sm">{r.employeeName ?? "Employee"}</span>
              <span className="text-xs text-muted-foreground ml-2">{typeLabels[r.requestType] ?? r.requestType}</span>
              <span className="text-xs text-muted-foreground ml-2">
                {r.requestedDate}{r.requestedEndDate && r.requestedEndDate !== r.requestedDate ? ` → ${r.requestedEndDate}` : ""}
              </span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColors[r.status] ?? "bg-gray-100 text-gray-500"}`}>
              {r.status?.charAt(0).toUpperCase() + r.status?.slice(1)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-1 rounded hover:bg-muted">
          <ChevronLeft size={16} />
        </button>
        <span className="font-semibold text-sm">{MONTH_NAMES[month]} {year}</span>
        <button onClick={nextMonth} className="p-1 rounded hover:bg-muted">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="flex gap-4 mb-3 flex-wrap">
        {(["approved", "pending", "rejected", "cancelled"] as const).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${dotColors[s]}`} />
            <span className="text-xs text-muted-foreground capitalize">{s}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
          const reqs = dayMap[dateStr] ?? [];
          const isToday = dateStr === new Date().toISOString().split("T")[0];
          const isSelected = selectedDay === dateStr;
          const statusSet = Array.from(new Set<string>(reqs.map((r: any) => r.status as string)));
          return (
            <div
              key={day}
              onClick={() => onSelectDay(isSelected ? null : dateStr)}
              className={`min-h-[52px] p-1 rounded-lg border cursor-pointer transition-colors ${
                isSelected ? "border-primary bg-primary/5" :
                isToday ? "border-primary/40 bg-primary/5" :
                reqs.length > 0 ? "border-border hover:border-primary/30 bg-muted/30" :
                "border-transparent hover:bg-muted/20"
              }`}
            >
              <div className={`text-xs font-medium mb-1 ${isToday ? "text-primary" : "text-foreground/70"}`}>{day}</div>
              <div className="flex flex-wrap gap-0.5">
                {statusSet.map((s) => (
                  <div key={s} className={`w-2 h-2 rounded-full ${dotColors[s] ?? "bg-gray-300"}`} title={s} />
                ))}
              </div>
              {reqs.length > 1 && <div className="text-[10px] text-muted-foreground mt-0.5">{reqs.length}</div>}
            </div>
          );
        })}
      </div>
      {selectedDay && dayMap[selectedDay] && (
        <div className="mt-4 p-3 border rounded-lg bg-muted/30">
          <p className="text-sm font-semibold mb-2">{selectedDay}</p>
          <div className="space-y-2">
            {dayMap[selectedDay].map((r: any) => (
              <div key={r.id} className="flex items-start gap-2 p-2 bg-background rounded border">
                <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${dotColors[r.status] ?? "bg-gray-300"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{r.employeeName ?? "Employee"}</span>
                    <span className="text-xs text-muted-foreground">{typeLabels[r.requestType] ?? r.requestType}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.reason}</p>
                  {r.adminNotes && <p className="text-xs text-primary mt-0.5 italic">Note: {r.adminNotes}</p>}
                  {r.attachmentUrl && (
                    <a href={r.attachmentUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 underline mt-0.5 block">
                      View attachment
                    </a>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${badgeColors[r.status] ?? "bg-gray-100 text-gray-500"}`}>
                  {r.status?.charAt(0).toUpperCase() + r.status?.slice(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
