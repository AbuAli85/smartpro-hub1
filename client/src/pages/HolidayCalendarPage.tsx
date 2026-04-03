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

const HOLIDAY_TYPE_CONFIG = {
  public: { label: "Public Holiday", icon: Globe, color: "bg-red-100 text-red-700 border-red-200" },
  company: { label: "Company Holiday", icon: Building2, color: "bg-blue-100 text-blue-700 border-blue-200" },
  optional: { label: "Optional", icon: Star, color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface HolidayForm {
  name: string;
  holidayDate: string;
  type: "public" | "company" | "optional";
  isRecurringYearly: boolean;
  notes: string;
}

const defaultForm: HolidayForm = {
  name: "",
  holidayDate: new Date().toISOString().slice(0, 10),
  type: "public",
  isRecurringYearly: false,
  notes: "",
};

export default function HolidayCalendarPage() {
  const { activeCompanyId } = useActiveCompany();
  const utils = trpc.useUtils();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<HolidayForm>(defaultForm);
  const [seeding, setSeeding] = useState(false);

  const { data: holidays = [], isLoading } = trpc.scheduling.listHolidays.useQuery(
    { companyId: activeCompanyId ?? undefined, year },
    { enabled: !!activeCompanyId }
  );

  const addMut = trpc.scheduling.addHoliday.useMutation({
    onSuccess: () => {
      utils.scheduling.listHolidays.invalidate();
      setOpen(false);
      toast.success("Holiday added");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.scheduling.deleteHoliday.useMutation({
    onSuccess: () => {
      utils.scheduling.listHolidays.invalidate();
      setDeleteId(null);
      toast.success("Holiday removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const seedMut = trpc.scheduling.seedOmanHolidays.useMutation({
    onSuccess: (data) => {
      utils.scheduling.listHolidays.invalidate();
      setSeeding(false);
      toast.success(`${data.seeded} Oman public holidays added for ${year}`);
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
      toast.error("Please fill all required fields");
      return;
    }
    addMut.mutate({ companyId: activeCompanyId, ...form });
  }

  // Group holidays by month
  const byMonth: Record<number, typeof holidays> = {};
  for (const h of holidays) {
    const m = new Date(h.holidayDate + "T12:00:00Z").getMonth();
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(h);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="text-primary" size={24} />
            Holiday Calendar
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage public and company holidays — attendance is not required on these days
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
            Seed Oman Holidays
          </Button>
          <Button onClick={() => { setForm(defaultForm); setOpen(true); }} className="gap-2">
            <Plus size={16} /> Add Holiday
          </Button>
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex gap-3 flex-wrap">
        {Object.entries(HOLIDAY_TYPE_CONFIG).map(([type, cfg]) => {
          const count = holidays.filter((h) => h.type === type).length;
          return (
            <div key={type} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${cfg.color}`}>
              <cfg.icon size={12} />
              {cfg.label}: {count}
            </div>
          );
        })}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-muted text-xs font-medium text-muted-foreground">
          Total: {holidays.length} days
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
            <p className="font-medium">No holidays for {year}</p>
            <p className="text-sm">Add holidays manually or use the "Seed Oman Holidays" button</p>
            <div className="flex gap-2 mt-2">
              <Button onClick={handleSeed} variant="outline" className="gap-2" disabled={seeding}>
                <Sparkles size={14} /> Seed Oman Holidays
              </Button>
              <Button onClick={() => { setForm(defaultForm); setOpen(true); }} className="gap-2">
                <Plus size={16} /> Add Holiday
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {MONTHS.map((month, idx) => {
            const monthHolidays = byMonth[idx];
            if (!monthHolidays?.length) return null;
            return (
              <Card key={idx}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide text-sm">
                    {month} {year}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {monthHolidays.map((h) => {
                    const cfg = HOLIDAY_TYPE_CONFIG[h.type as keyof typeof HOLIDAY_TYPE_CONFIG] ?? HOLIDAY_TYPE_CONFIG.public;
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
                            {new Date(h.holidayDate + "T12:00:00Z").getDate()}
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase">
                            {new Date(h.holidayDate + "T12:00:00Z").toLocaleDateString("en", { weekday: "short" })}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{h.name}</span>
                            {isToday && <Badge className="text-[10px] py-0">Today</Badge>}
                            {h.isRecurringYearly && (
                              <Badge variant="outline" className="text-[10px] py-0">Yearly</Badge>
                            )}
                          </div>
                          {h.notes && (
                            <p className="text-xs text-muted-foreground mt-0.5">{h.notes}</p>
                          )}
                        </div>
                        <Badge className={`text-[10px] border ${cfg.color}`} variant="outline">
                          <cfg.icon size={10} className="mr-1" />
                          {cfg.label}
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
            <DialogTitle>Add Holiday</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Holiday Name *</Label>
              <Input
                placeholder="e.g. National Day"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input
                type="date"
                value={form.holidayDate}
                onChange={(e) => setForm({ ...form, holidayDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as "public" | "company" | "optional" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public Holiday</SelectItem>
                  <SelectItem value="company">Company Holiday</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Recurring Yearly</Label>
                <p className="text-xs text-muted-foreground">Repeat this holiday every year</p>
              </div>
              <Switch
                checked={form.isRecurringYearly}
                onCheckedChange={(v) => setForm({ ...form, isRecurringYearly: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input
                placeholder="Any additional notes..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.name || !form.holidayDate || addMut.isPending}>
              Add Holiday
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Holiday?</AlertDialogTitle>
            <AlertDialogDescription>
              This holiday will be removed from the calendar. Attendance records will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMut.mutate({ id: deleteId, companyId: activeCompanyId ?? undefined })}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
