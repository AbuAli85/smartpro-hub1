import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { muscatCalendarYmdNow } from "@shared/attendanceMuscatTime";
import { formatAttendanceMonthDisplay, parseAttendanceYmdSafely } from "@/lib/dateUtils";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, CalendarDays, Globe, Building2, Star, Sparkles } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";

const HOLIDAY_TYPE_ICONS = {
  public: { icon: Globe, color: "bg-red-100 text-red-700 border-red-200" },
  company: { icon: Building2, color: "bg-blue-100 text-blue-700 border-blue-200" },
  optional: { icon: Star, color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
} as const;

interface HolidayForm {
  name: string;
  holidayDate: string;
  type: "public" | "company" | "optional";
  isRecurringYearly: boolean;
  notes: string;
}

function makeDefaultForm(): HolidayForm {
  return {
    name: "",
    holidayDate: muscatCalendarYmdNow(),
    type: "public",
    isRecurringYearly: false,
    notes: "",
  };
}

export default function HolidayCalendarPage() {
  const { t, i18n } = useTranslation("hr");
  const { activeCompanyId } = useActiveCompany();
  const utils = trpc.useUtils();
  const [year, setYear] = useState(() => parseInt(muscatCalendarYmdNow().slice(0, 4), 10));
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<HolidayForm>(makeDefaultForm);
  const [seeding, setSeeding] = useState(false);

  const { data: holidays = [], isLoading } = trpc.scheduling.listHolidays.useQuery(
    { companyId: activeCompanyId ?? undefined, year },
    { enabled: !!activeCompanyId }
  );

  const addMut = trpc.scheduling.addHoliday.useMutation({
    onSuccess: () => {
      utils.scheduling.listHolidays.invalidate();
      setOpen(false);
      toast.success(t("attendance.holidays.toast.added"));
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.scheduling.deleteHoliday.useMutation({
    onSuccess: () => {
      utils.scheduling.listHolidays.invalidate();
      setDeleteId(null);
      toast.success(t("attendance.holidays.toast.removed"));
    },
    onError: (e) => toast.error(e.message),
  });

  const seedMut = trpc.scheduling.seedOmanHolidays.useMutation({
    onSuccess: (data) => {
      utils.scheduling.listHolidays.invalidate();
      setSeeding(false);
      toast.success(t("attendance.holidays.seedSuccess", { count: data.seeded, year }));
    },
    onError: (e) => {
      setSeeding(false);
      toast.error(e.message);
    },
  });

  function handleSeed() {
    if (!activeCompanyId) return;
    setSeeding(true);
    seedMut.mutate({ companyId: activeCompanyId, year });
  }

  function handleSubmit() {
    if (!activeCompanyId || !form.name || !form.holidayDate) {
      toast.error(t("attendance.holidays.toast.validationError"));
      return;
    }
    addMut.mutate({ companyId: activeCompanyId, ...form });
  }

  // Group holidays by month — parse directly from YYYY-MM-DD to avoid UTC boundary shifts
  const byMonth: Record<number, typeof holidays> = {};
  for (const h of holidays) {
    const m = parseInt(h.holidayDate.split("-")[1]!, 10) - 1; // 0-based month
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(h);
  }

  const today = muscatCalendarYmdNow();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="text-primary" size={24} />
            {t("attendance.holidays.pageTitle")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("attendance.holidays.pageSubtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border rounded-lg overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => setYear((y) => y - 1)}
            >
              ‹
            </Button>
            <span className="px-3 text-sm font-semibold">{year}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => setYear((y) => y + 1)}
            >
              ›
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleSeed}
            disabled={seeding}
          >
            <Sparkles size={14} />
            {t("attendance.holidays.seedBtn")}
          </Button>
          <Button onClick={() => { setForm(makeDefaultForm()); setOpen(true); }} className="gap-2">
            <Plus size={16} /> {t("attendance.holidays.addBtn")}
          </Button>
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex gap-3 flex-wrap">
        {(["public", "company", "optional"] as const).map((type) => {
          const cfg = HOLIDAY_TYPE_ICONS[type];
          const count = holidays.filter((h) => h.type === type).length;
          return (
            <div key={type} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${cfg.color}`}>
              <cfg.icon size={12} />
              {t(`attendance.holidays.types.${type}`)}: {count}
            </div>
          );
        })}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-muted text-xs font-medium text-muted-foreground">
          {t("attendance.holidays.total", { count: holidays.length })}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-24" />
            </Card>
          ))}
        </div>
      ) : holidays.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <CalendarDays size={40} className="opacity-30" />
            <p className="font-medium">{t("attendance.holidays.noHolidaysTitle", { year })}</p>
            <p className="text-sm">{t("attendance.holidays.noHolidaysHint")}</p>
            <div className="flex gap-2 mt-2">
              <Button onClick={handleSeed} variant="outline" className="gap-2" disabled={seeding}>
                <Sparkles size={14} /> {t("attendance.holidays.seedBtn")}
              </Button>
              <Button onClick={() => { setForm(makeDefaultForm()); setOpen(true); }} className="gap-2">
                <Plus size={16} /> {t("attendance.holidays.addBtn")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from({ length: 12 }, (_, idx) => {
            const monthHolidays = byMonth[idx];
            if (!monthHolidays?.length) return null;
            return (
              <Card key={idx}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide text-sm">
                    {formatAttendanceMonthDisplay(year, idx + 1, i18n.language)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {monthHolidays.map((h) => {
                    const cfg = HOLIDAY_TYPE_ICONS[h.type as keyof typeof HOLIDAY_TYPE_ICONS] ?? HOLIDAY_TYPE_ICONS.public;
                    const isPast = h.holidayDate < today;
                    const isToday = h.holidayDate === today;
                    return (
                      <div
                        key={h.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border group transition-colors ${
                          isToday ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50"
                        } ${isPast ? "opacity-60" : ""}`}
                      >
                        <div className="w-12 text-center">
                          <div className="text-lg font-bold leading-none">
                            {parseInt(h.holidayDate.split("-")[2]!, 10)}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase">
                            {new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Asia/Muscat" }).format(
                              parseAttendanceYmdSafely(h.holidayDate) ?? new Date()
                            )}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{h.name}</span>
                            {isToday && <Badge className="text-[10px] py-0">{t("attendance.holidays.today")}</Badge>}
                            {h.isRecurringYearly && (
                              <Badge variant="outline" className="text-[10px] py-0">{t("attendance.holidays.yearlyBadge")}</Badge>
                            )}
                          </div>
                          {h.notes && (
                            <p className="text-xs text-muted-foreground mt-0.5">{h.notes}</p>
                          )}
                        </div>
                        <Badge className={`text-[10px] border ${cfg.color}`} variant="outline">
                          <cfg.icon size={10} className="mr-1" />
                          {t(`attendance.holidays.types.${h.type as "public" | "company" | "optional"}`)}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(h.id)}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Holiday Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("attendance.holidays.addDialog.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t("attendance.holidays.addDialog.nameLabel")}</Label>
              <Input
                placeholder={t("attendance.holidays.addDialog.namePlaceholder")}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("attendance.holidays.addDialog.dateLabel")}</Label>
              <DateInput

                value={form.holidayDate}
                onChange={(e) => setForm({ ...form, holidayDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("attendance.holidays.addDialog.typeLabel")}</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as "public" | "company" | "optional" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">{t("attendance.holidays.types.public")}</SelectItem>
                  <SelectItem value="company">{t("attendance.holidays.types.company")}</SelectItem>
                  <SelectItem value="optional">{t("attendance.holidays.types.optional")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("attendance.holidays.addDialog.recurringLabel")}</Label>
                <p className="text-xs text-muted-foreground">{t("attendance.holidays.addDialog.recurringHint")}</p>
              </div>
              <Switch
                checked={form.isRecurringYearly}
                onCheckedChange={(v) => setForm({ ...form, isRecurringYearly: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("attendance.holidays.addDialog.notesLabel")}</Label>
              <Input
                placeholder={t("attendance.holidays.addDialog.notesPlaceholder")}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("attendance.holidays.addDialog.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!form.name || !form.holidayDate || addMut.isPending}>
              {t("attendance.holidays.addDialog.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("attendance.holidays.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("attendance.holidays.deleteDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("attendance.holidays.deleteDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMut.mutate({ id: deleteId, companyId: activeCompanyId ?? undefined })}
            >
              {t("attendance.holidays.deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
