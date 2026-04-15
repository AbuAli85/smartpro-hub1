import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
  ChevronRight, ChevronLeft, UserCheck, BarChart3, TrendingUp, X, Palette,
  Layers, Globe, Shield, Wrench, HeartPulse, BookOpen, Truck,
  DollarSign, Megaphone, Code2, FlaskConical, Headphones,
  UserPlus, UserMinus, CheckCircle2,
} from "lucide-react";
import { HubBreadcrumb } from "@/components/hub/HubBreadcrumb";
import { organizationTrail } from "@/components/hub/hubCrumbs";

// ─── Color palette ────────────────────────────────────────────────────────────
const DEPT_COLORS = [
  { value: "blue",    dot: "bg-blue-500",    header: "bg-blue-600",    classes: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-400/40" },
  { value: "emerald", dot: "bg-emerald-500",  header: "bg-emerald-600",  classes: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/40" },
  { value: "amber",   dot: "bg-amber-500",    header: "bg-amber-500",    classes: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/40" },
  { value: "violet",  dot: "bg-violet-500",   header: "bg-violet-600",   classes: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-400/40" },
  { value: "rose",    dot: "bg-rose-500",     header: "bg-rose-600",     classes: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-400/40" },
  { value: "cyan",    dot: "bg-cyan-500",     header: "bg-cyan-600",     classes: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-400/40" },
  { value: "orange",  dot: "bg-orange-500",   header: "bg-orange-500",   classes: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-400/40" },
  { value: "teal",    dot: "bg-teal-500",     header: "bg-teal-600",     classes: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-400/40" },
  { value: "slate",   dot: "bg-slate-500",    header: "bg-slate-600",    classes: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-400/40" },
];

// ─── Icon palette ─────────────────────────────────────────────────────────────
const DEPT_ICONS = [
  { value: "building",   Icon: Building2,   label: "General" },
  { value: "users",      Icon: Users,        label: "People" },
  { value: "dollar",     Icon: DollarSign,   label: "Finance" },
  { value: "shield",     Icon: Shield,       label: "Legal" },
  { value: "wrench",     Icon: Wrench,       label: "Ops" },
  { value: "layers",     Icon: Layers,       label: "Product" },
  { value: "code",       Icon: Code2,        label: "Tech" },
  { value: "megaphone",  Icon: Megaphone,    label: "Mktg" },
  { value: "globe",      Icon: Globe,        label: "Intl" },
  { value: "truck",      Icon: Truck,        label: "Logistics" },
  { value: "flask",      Icon: FlaskConical, label: "R&D" },
  { value: "heart",      Icon: HeartPulse,   label: "Health" },
  { value: "book",       Icon: BookOpen,     label: "Training" },
  { value: "headphones", Icon: Headphones,   label: "Support" },
  { value: "briefcase",  Icon: Briefcase,    label: "Business" },
];

function getDeptColorEntry(c?: string | null) {
  return DEPT_COLORS.find((x) => x.value === c) ?? DEPT_COLORS[0];
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
    <Card className="border shadow-sm">
      <CardContent className="p-3 flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground leading-tight">{label}</p>
          <p className="text-2xl font-bold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Department Row ───────────────────────────────────────────────────────────
function DeptRow({
  dept, isSelected, headName, onSelect, onEdit, onDelete, isRtl,
}: {
  dept: Dept; isSelected: boolean; headName?: string;
  onSelect: () => void; onEdit: () => void; onDelete: () => void;
  isRtl: boolean;
}) {
  const { t } = useTranslation("hr");
  const DeptIcon = getDeptIcon((dept as any).icon);
  const colorEntry = getDeptColorEntry((dept as any).color);

  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all border ${
        isSelected
          ? "bg-primary/5 border-primary/30 shadow-sm"
          : "border-transparent hover:bg-muted/50 hover:border-border"
      }`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
        isSelected ? `${colorEntry.classes}` : "bg-muted"
      }`}>
        <DeptIcon size={16} className={isSelected ? "" : "text-muted-foreground"} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm truncate">{dept.name}</p>
          {dept.nameAr && (
            <span className="text-xs text-muted-foreground" dir="rtl">{dept.nameAr}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users size={11} />{" "}
            {t("departmentsPage.row.employeeCount", { count: dept.employeeCount })}
          </span>
          {headName && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <UserCheck size={11} /> {headName}
            </span>
          )}
        </div>
      </div>
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
        {isRtl ? (
          <ChevronLeft size={14} className={`text-muted-foreground transition-transform ${isSelected ? "rotate-90 text-primary" : ""}`} />
        ) : (
          <ChevronRight size={14} className={`text-muted-foreground transition-transform ${isSelected ? "rotate-90 text-primary" : ""}`} />
        )}
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
  open: boolean; onClose: () => void; initial?: Dept;
  employees: Employee[]; companyId?: number | null;
}) {
  const { t } = useTranslation("hr");
  const utils = trpc.useUtils();

  // Reset all state when dialog opens/closes or initial changes
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [description, setDescription] = useState("");
  const [headId, setHeadId] = useState<string>("none");
  const [color, setColor] = useState("blue");
  const [iconVal, setIconVal] = useState("building");
  const [submitted, setSubmitted] = useState(false);

  // Populate fields when editing an existing dept
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setNameAr(initial?.nameAr ?? "");
      setDescription(initial?.description ?? "");
      setHeadId(initial?.headEmployeeId?.toString() ?? "none");
      setColor((initial as any)?.color ?? "blue");
      setIconVal((initial as any)?.icon ?? "building");
      setSubmitted(false);
    }
  }, [open, initial]);

  const nameError = submitted && !name.trim();
  const colorEntry = getDeptColorEntry(color);
  const PreviewIcon = getDeptIcon(iconVal);

  const create = trpc.hr.createDepartment.useMutation({
    onSuccess: () => { utils.hr.listDepartments.invalidate(); toast.success(t("departmentsPage.toasts.deptCreated")); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.hr.updateDepartment.useMutation({
    onSuccess: () => { utils.hr.listDepartments.invalidate(); toast.success(t("departmentsPage.toasts.deptUpdated")); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    setSubmitted(true);
    if (!name.trim()) return toast.error(t("departmentsPage.toasts.nameRequired"));
    const payload = {
      name: name.trim(),
      nameAr: nameAr.trim() || undefined,
      description: description.trim() || undefined,
      headEmployeeId: headId && headId !== "none" ? Number(headId) : undefined,
      color,
      icon: iconVal,
      companyId: companyId ?? undefined,
    };
    if (initial) update.mutate({ id: initial.id, ...payload });
    else create.mutate(payload);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Coloured header — uses Tailwind class via inline style fallback for dynamic colours */}
        <div className={`px-6 pt-5 pb-4 border-b shrink-0 ${colorEntry.header} text-white`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl border-2 border-white/30 flex items-center justify-center shrink-0 bg-white/20">
              <PreviewIcon size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight text-white">
                {initial ? t("departmentsPage.deptForm.editTitle") : t("departmentsPage.deptForm.newTitle")}
              </h2>
              <p className="text-xs text-white/70 mt-0.5">
                {initial
                  ? t("departmentsPage.deptForm.editSubtitle", { name: initial.name })
                  : t("departmentsPage.deptForm.newSubtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          {/* Names row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("departmentsPage.deptForm.englishName")} <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("departmentsPage.deptForm.namePlaceholderEn")}
                className={nameError ? "border-destructive ring-1 ring-destructive" : ""}
                autoFocus={!initial}
              />
              {nameError && <p className="text-xs text-destructive mt-0.5">{t("departmentsPage.deptForm.nameRequired")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("departmentsPage.deptForm.arabicName")}</Label>
              <Input
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder={t("departmentsPage.deptForm.namePlaceholderAr")}
                dir="rtl"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("departmentsPage.deptForm.description")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t("departmentsPage.deptForm.descriptionPlaceholder")}
              className="resize-none"
            />
          </div>

          {/* Department Head */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <UserCheck size={11} /> {t("departmentsPage.deptForm.head")}
            </Label>
            {employees.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
                <Users size={14} className="shrink-0" />
                <span>{t("departmentsPage.deptForm.noEmployeesForHead")}</span>
              </div>
            ) : (
              <Select value={headId} onValueChange={setHeadId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("departmentsPage.deptForm.headPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("departmentsPage.deptForm.noHead")}</SelectItem>
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

          {/* Colour picker */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Palette size={11} /> {t("departmentsPage.deptForm.colour")}
            </Label>
            <div className="flex flex-wrap gap-2">
              {DEPT_COLORS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.value.charAt(0).toUpperCase() + opt.value.slice(1)}
                  onClick={() => setColor(opt.value)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${opt.dot} ${
                    color === opt.value
                      ? "border-foreground scale-110 shadow-md ring-2 ring-offset-1 ring-foreground/30"
                      : "border-transparent opacity-60 hover:opacity-100 hover:scale-105"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Icon picker */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("departmentsPage.deptForm.icon")}</Label>
            <div className="grid grid-cols-5 gap-2">
              {DEPT_ICONS.map(({ value, Icon, label }) => (
                <button
                  key={value}
                  type="button"
                  title={label}
                  onClick={() => setIconVal(value)}
                  className={`h-14 rounded-lg flex flex-col items-center justify-center gap-1 transition-all border text-[11px] font-medium ${
                    iconVal === value
                      ? `${colorEntry.classes} border-current`
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon size={18} />
                  <span className="leading-none truncate w-full text-center px-1">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-muted/20 flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isPending}>{t("departmentsPage.deptForm.cancel")}</Button>
          <Button
            onClick={handleSave}
            disabled={isPending}
            className="min-w-[150px] bg-red-700 hover:bg-red-800 text-white border-0"
          >
            {isPending
              ? (initial ? t("departmentsPage.deptForm.saving") : t("departmentsPage.deptForm.creating"))
              : initial ? t("departmentsPage.deptForm.save") : t("departmentsPage.deptForm.create")}
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
  open: boolean; onClose: () => void;
  departmentId: number; departmentName: string; companyId?: number | null;
}) {
  const { t } = useTranslation("hr");
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [description, setDescription] = useState("");

  const create = trpc.hr.createPosition.useMutation({
    onSuccess: () => {
      utils.hr.listPositions.invalidate();
      toast.success(t("departmentsPage.toasts.posCreated"));
      onClose();
      setTitle(""); setTitleAr(""); setDescription("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!title.trim()) return toast.error(t("departmentsPage.toasts.posTitleRequired"));
    create.mutate({
      title: title.trim(),
      titleAr: titleAr.trim() || undefined,
      description: description.trim() || undefined,
      departmentId,
      companyId: companyId ?? undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("departmentsPage.positionForm.title", { department: departmentName })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t("departmentsPage.positionForm.titleEn")} <span className="text-destructive">*</span></Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("departmentsPage.positionForm.placeholderEn")} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>{t("departmentsPage.positionForm.titleAr")}</Label>
            <Input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} placeholder={t("departmentsPage.positionForm.placeholderAr")} dir="rtl" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("departmentsPage.positionForm.description")}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder={t("departmentsPage.positionForm.descPlaceholder")} className="resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("departmentsPage.positionForm.cancel")}</Button>
          <Button onClick={handleSave} disabled={!title.trim() || create.isPending}
            className="bg-red-700 hover:bg-red-800 text-white border-0">
            {create.isPending ? t("departmentsPage.positionForm.creating") : t("departmentsPage.positionForm.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Assign Employee Dialog ──────────────────────────────────────────────────
function AssignEmployeeDialog({
  open, onClose, dept, allEmployees, companyId,
}: {
  open: boolean; onClose: () => void;
  dept: Dept; allEmployees: Employee[]; companyId?: number | null;
}) {
  const { t } = useTranslation("hr");
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Employees NOT yet in this department
  const unassigned = useMemo(() =>
    allEmployees.filter((e) =>
      (e.department ?? "") !== dept.name &&
      (`${e.firstName} ${e.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
       (e.position ?? "").toLowerCase().includes(search.toLowerCase()))
    ), [allEmployees, dept.name, search]);

  const assign = trpc.hr.assignDepartment.useMutation({
    onSuccess: (res) => {
      utils.hr.listDepartments.invalidate();
      utils.hr.listDepartmentMembers.invalidate();
      utils.hr.listEmployees.invalidate();
      toast.success(t("departmentsPage.toasts.assigned", { count: res.updated, department: dept.name }));
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleAssign = () => {
    if (selected.size === 0) return toast.error(t("departmentsPage.toasts.selectEmployees"));
    assign.mutate({ employeeIds: Array.from(selected), departmentName: dept.name, companyId: companyId ?? undefined });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-md p-0 flex flex-col max-h-[85vh]">
        <div className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserPlus size={16} className="text-red-700" />
            {t("departmentsPage.assignDialog.title", { department: dept.name })}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">{t("departmentsPage.assignDialog.subtitle")}</p>
          <div className="relative mt-3">
            <Search size={13} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="ps-8 h-8 text-sm" placeholder={t("departmentsPage.assignDialog.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {unassigned.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users size={28} className="mx-auto mb-2 opacity-25" />
              <p className="text-sm">{search ? t("departmentsPage.assignDialog.noMatch") : t("departmentsPage.assignDialog.allAssigned")}</p>
            </div>
          ) : (
            unassigned.map((emp) => (
              <button
                key={emp.id}
                type="button"
                onClick={() => toggle(emp.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                  selected.has(emp.id) ? "bg-red-700/10 border border-red-700/30" : "hover:bg-muted border border-transparent"
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center shrink-0">
                  {emp.firstName[0]}{emp.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{emp.firstName} {emp.lastName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {emp.position ?? "No position"}
                    {emp.department ? ` · Currently: ${emp.department}` : " · Unassigned"}
                  </p>
                </div>
                {selected.has(emp.id) && <CheckCircle2 size={16} className="text-red-700 shrink-0" />}
              </button>
            ))
          )}
        </div>
        <div className="px-5 py-3 border-t bg-muted/20 flex items-center justify-between shrink-0 gap-2">
          <span className="text-xs text-muted-foreground">
            {selected.size > 0 ? t("departmentsPage.assignDialog.selected", { count: selected.size }) : t("departmentsPage.assignDialog.noneSelected")}
          </span>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={onClose}>{t("departmentsPage.assignDialog.cancel")}</Button>
            <Button size="sm" disabled={selected.size === 0 || assign.isPending}
              className="bg-red-700 hover:bg-red-800 text-white border-0 gap-1.5"
              onClick={handleAssign}>
              <UserPlus size={13} />
              {assign.isPending ? t("departmentsPage.assignDialog.assigning") : t("departmentsPage.assignDialog.assignCount", { count: selected.size })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DepartmentsPage() {
  const { t, i18n } = useTranslation("hr");
  const { t: tNav } = useTranslation("nav");
  const { activeCompanyId } = useActiveCompany();
  const utils = trpc.useUtils();
  const isRtl = i18n.dir() === "rtl";

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

  // Members of the selected department
  const { data: deptMembers = [], isLoading: membersLoading } = trpc.hr.listDepartmentMembers.useQuery(
    { departmentName: selectedDept?.name ?? "", companyId: activeCompanyId ?? undefined },
    { enabled: !!selectedDept }
  );

  const [rightTab, setRightTab] = useState<"positions" | "members">("members");

  const deleteDept = trpc.hr.deleteDepartment.useMutation({
    onSuccess: () => {
      utils.hr.listDepartments.invalidate();
      toast.success(t("departmentsPage.toasts.deptDeleted"));
      setDeleteTarget(null);
      if (selectedDeptId) setSelectedDeptId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const deletePos = trpc.hr.deletePosition.useMutation({
    onSuccess: () => { utils.hr.listPositions.invalidate(); toast.success(t("departmentsPage.toasts.posDeleted")); setDeleteTarget(null); },
    onError: (e) => toast.error(e.message),
  });
  const removeMember = trpc.hr.assignDepartment.useMutation({
    onSuccess: () => {
      utils.hr.listDepartments.invalidate();
      utils.hr.listDepartmentMembers.invalidate();
      utils.hr.listEmployees.invalidate();
      toast.success(t("departmentsPage.toasts.removedMember"));
    },
    onError: (e) => toast.error(e.message),
  });

  const [deptDialog, setDeptDialog] = useState<{ open: boolean; item?: Dept }>({ open: false });
  const [posDialog, setPosDialog] = useState(false);
  const [assignDialog, setAssignDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "dept" | "pos"; id: number; name: string } | null>(null);

  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((d) => {
      const nameHit = d.name.toLowerCase().includes(q);
      const descHit = (d.description ?? "").toLowerCase().includes(q);
      const arHit = d.nameAr ? d.nameAr.includes(search.trim()) : false;
      return nameHit || descHit || arHit;
    });
  }, [departments, search]);

  const staffedDepts = departments.filter((d) => d.employeeCount > 0).length;
  const avgPerDept = departments.length > 0
    ? Math.round(employees.length / departments.length * 10) / 10
    : 0;

  const getHeadName = (headId?: number | null) => {
    if (!headId) return undefined;
    const emp = employees.find((e) => e.id === headId);
    return emp ? `${emp.firstName} ${emp.lastName}` : undefined;
  };

  return (
    <div className="p-6 space-y-5" dir={i18n.dir()}>
      <HubBreadcrumb items={organizationTrail(tNav("departments"), tNav)} />
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <Building2 size={24} className="text-red-700 shrink-0" />
            {t("departmentsPage.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("departmentsPage.subtitle")}
          </p>
        </div>
        <Button
          onClick={() => setDeptDialog({ open: true })}
          className="gap-2 bg-red-700 hover:bg-red-800 text-white border-0 shrink-0 self-start"
        >
          <Plus size={16} /> {t("departmentsPage.addDepartment")}
        </Button>
      </div>

      {/* Stats — compact row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Building2 size={18} className="text-blue-500" />}
          label={t("departmentsPage.stats.departments")} value={departments.length}
          color="bg-blue-500/10"
        />
        <StatCard
          icon={<Users size={18} className="text-emerald-500" />}
          label={t("departmentsPage.stats.totalEmployees")} value={employees.length}
          color="bg-emerald-500/10"
        />
        <StatCard
          icon={<BarChart3 size={18} className="text-amber-500" />}
          label={t("departmentsPage.stats.staffedDepts")} value={staffedDepts}
          color="bg-amber-500/10"
        />
        <StatCard
          icon={<TrendingUp size={18} className="text-violet-500" />}
          label={t("departmentsPage.stats.avgPerDept")} value={avgPerDept || t("departmentsPage.stats.dash")}
          color="bg-violet-500/10"
        />
      </div>

      {/* Main content: list + detail — order follows reading direction (detail follows list in DOM for screen readers) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Department list — 7/12 */}
        <div className="lg:col-span-7 space-y-3 min-w-0">
          <div className="relative">
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              className="ps-9"
              placeholder={t("departmentsPage.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t("departmentsPage.searchPlaceholder")}
            />
            {search && (
              <button
                type="button"
                className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground rounded p-0.5"
                onClick={() => setSearch("")}
                aria-label={t("departmentsPage.clearSearch")}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {deptsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
              <Building2 size={40} className="mx-auto mb-3 opacity-25" />
              <p className="font-medium">
                {search ? t("departmentsPage.list.searchEmptyTitle") : t("departmentsPage.list.emptyTitle")}
              </p>
              <p className="text-sm mt-1">
                {search ? t("departmentsPage.list.searchEmptyHint") : t("departmentsPage.list.emptyHint")}
              </p>
              {!search && (
                <Button
                  className="mt-4 gap-2 bg-red-700 hover:bg-red-800 text-white border-0"
                  onClick={() => setDeptDialog({ open: true })}
                >
                  <Plus size={15} /> {t("departmentsPage.addDepartment")}
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
                  isRtl={isRtl}
                />
              ))}
            </div>
          )}
        </div>

        {/* Members + Positions panel — 5/12 */}
        <div className="lg:col-span-5 min-w-0">
          <div className="border rounded-xl overflow-hidden h-full min-h-[320px] flex flex-col">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-sm truncate max-w-[min(180px,50vw)]">
                  {selectedDept ? selectedDept.name : t("departmentsPage.detail.panelTitle")}
                </span>
                {selectedDept && (
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {rightTab === "members"
                      ? t("departmentsPage.detail.membersBadge", { count: deptMembers.length })
                      : t("departmentsPage.detail.rolesBadge", { count: positions.length })}
                  </Badge>
                )}
              </div>
              {selectedDept && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {rightTab === "members" ? (
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setAssignDialog(true)}>
                      <UserPlus size={12} /> {t("departmentsPage.detail.assign")}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setPosDialog(true)}>
                      <Plus size={12} /> {t("departmentsPage.detail.addRole")}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Tab switcher */}
            {selectedDept && (
              <div className="flex border-b">
                <button
                  type="button"
                  className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    rightTab === "members" ? "border-b-2 border-red-700 text-red-700" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setRightTab("members")}
                >
                  <Users size={12} /> {t("departmentsPage.detail.members")}
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    rightTab === "positions" ? "border-b-2 border-red-700 text-red-700" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setRightTab("positions")}
                >
                  <Briefcase size={12} /> {t("departmentsPage.detail.positions")}
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-2">
              {!selectedDept ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center text-muted-foreground px-2">
                  <Building2 size={32} className="mb-3 opacity-25" />
                  <p className="text-sm font-medium">{t("departmentsPage.detail.noneSelectedTitle")}</p>
                  <p className="text-xs mt-1">{t("departmentsPage.detail.noneSelectedHint")}</p>
                </div>
              ) : rightTab === "members" ? (
                // ── Members tab ──────────────────────────────────────────
                membersLoading ? (
                  <div className="space-y-2 p-2">
                    {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}
                  </div>
                ) : deptMembers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-10 text-center text-muted-foreground px-2">
                    <Users size={28} className="mb-3 opacity-25" />
                    <p className="text-sm font-medium">{t("departmentsPage.detail.noMembers")}</p>
                    <p className="text-xs mt-1">{t("departmentsPage.detail.noMembersHint")}</p>
                    <Button size="sm" className="mt-3 gap-1.5 bg-red-700 hover:bg-red-800 text-white border-0" onClick={() => setAssignDialog(true)}>
                      <UserPlus size={13} /> {t("departmentsPage.detail.assignEmployees")}
                    </Button>
                  </div>
                ) : (
                  <div>
                    {(deptMembers as any[]).map((emp) => (
                      <div key={emp.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/40 group transition-colors">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center shrink-0">
                          {emp.firstName?.[0]}{emp.lastName?.[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{emp.firstName} {emp.lastName}</p>
                          <p className="text-xs text-muted-foreground truncate">{emp.position ?? "No position"}</p>
                        </div>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          title="Remove from department"
                          onClick={() => removeMember.mutate({ employeeIds: [emp.id], departmentName: null, companyId: activeCompanyId ?? undefined })}
                        >
                          <UserMinus size={13} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                // ── Positions tab ─────────────────────────────────────────
                posLoading ? (
                  <div className="space-y-2 p-2">
                    {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted animate-pulse rounded-lg" />)}
                  </div>
                ) : positions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-10 text-center text-muted-foreground px-2">
                    <Briefcase size={28} className="mb-3 opacity-25" />
                    <p className="text-sm font-medium">{t("departmentsPage.detail.noPositions")}</p>
                    <p className="text-xs mt-1">{t("departmentsPage.detail.noPositionsHint")}</p>
                    <Button size="sm" className="mt-3 gap-1.5 bg-red-700 hover:bg-red-800 text-white border-0" onClick={() => setPosDialog(true)}>
                      <Plus size={13} /> {t("departmentsPage.detail.addPosition")}
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
                )
              )}
            </div>

            {selectedDept && (
              <div className="border-t px-4 py-2.5 bg-muted/20 flex items-center gap-2 flex-wrap">
                <UserCheck size={13} className="text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">
                  {t("departmentsPage.detail.headLabel")}:{" "}
                  <span className="font-medium text-foreground">
                    {getHeadName(selectedDept.headEmployeeId) ?? t("departmentsPage.detail.headNotAssigned")}
                  </span>
                </span>
                <span className="ms-auto text-xs text-muted-foreground tabular-nums">
                  {t("departmentsPage.detail.footerMembers", { count: deptMembers.length })}
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

      {/* Assign Employee Dialog */}
      {assignDialog && selectedDept && (
        <AssignEmployeeDialog
          open={assignDialog}
          onClose={() => setAssignDialog(false)}
          dept={selectedDept}
          allEmployees={employees}
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
              {deleteTarget?.type === "dept" ? t("departmentsPage.delete.deptTitle") : t("departmentsPage.delete.posTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                {t("departmentsPage.delete.confirm", { name: deleteTarget?.name ?? "" })}
              </span>
              {deleteTarget?.type === "dept" && (
                <span className="block">{t("departmentsPage.delete.deptExtra")}</span>
              )}
              <span className="block">{t("departmentsPage.delete.irreversible")}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("departmentsPage.delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                if (deleteTarget.type === "dept") deleteDept.mutate({ id: deleteTarget.id });
                else deletePos.mutate({ id: deleteTarget.id });
              }}
            >
              {t("departmentsPage.delete.confirmBtn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
