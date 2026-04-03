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
import { toast } from "sonner";
import { Megaphone, Plus, Trash2, Users, User, Bell, AlertTriangle, Clock } from "lucide-react";

type AnnType = "announcement" | "request" | "alert" | "reminder";

const TYPE_CONFIG: Record<AnnType, { label: string; icon: React.ReactNode; color: string }> = {
  announcement: { label: "Announcement", icon: <Megaphone className="w-3.5 h-3.5" />, color: "bg-blue-100 text-blue-700" },
  request: { label: "Request", icon: <Bell className="w-3.5 h-3.5" />, color: "bg-purple-100 text-purple-700" },
  alert: { label: "Alert", icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "bg-red-100 text-red-700" },
  reminder: { label: "Reminder", icon: <Clock className="w-3.5 h-3.5" />, color: "bg-amber-100 text-amber-700" },
};

function ComposeDialog({
  open, onClose, employees,
}: {
  open: boolean;
  onClose: () => void;
  employees: { id: number; firstName: string; lastName: string; department?: string | null }[];
}) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<AnnType>("announcement");
  const [targetId, setTargetId] = useState<string>("all");

  const create = trpc.announcements.createAnnouncement.useMutation({
    onSuccess: () => {
      utils.announcements.listAnnouncements.invalidate();
      toast.success("Sent successfully");
      onClose();
      setTitle(""); setBody(""); setType("announcement"); setTargetId("all");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSend = () => {
    if (!title.trim() || !body.trim()) return;
    create.mutate({
      title: title.trim(),
      body: body.trim(),
      type,
      targetEmployeeId: targetId !== "all" ? Number(targetId) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Compose Message</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as AnnType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Send To</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id.toString()}>
                      {e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Subject *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Office closed on Friday" />
          </div>
          <div className="space-y-1">
            <Label>Message *</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Write your message here..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={!title.trim() || !body.trim() || create.isPending}>
            Send Message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AnnouncementsPage() {
  const utils = trpc.useUtils();
  const [composeOpen, setComposeOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: announcements = [], isLoading } = trpc.announcements.listAnnouncements.useQuery({});
  const { data: employees = [] } = trpc.hr.listEmployees.useQuery({});

  const deleteAnn = trpc.announcements.deleteAnnouncement.useMutation({
    onSuccess: () => { utils.announcements.listAnnouncements.invalidate(); toast.success("Deleted"); setDeleteConfirm(null); },
  });

  const empList = (employees as any)?.employees ?? employees ?? [];

  const filtered = (announcements as any[]).filter((a) => {
    if (filterType !== "all" && a.type !== filterType) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Announcements & Requests</h1>
          <p className="text-muted-foreground text-sm mt-1">Send messages, requests, alerts, and reminders to your team.</p>
        </div>
        <Button onClick={() => setComposeOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />Compose
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(TYPE_CONFIG).map(([k, v]) => {
          const count = (announcements as any[]).filter((a) => a.type === k).length;
          return (
            <Card key={k} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setFilterType(filterType === k ? "all" : k)}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <span className={`p-1.5 rounded-md ${v.color}`}>{v.icon}</span>
                  <div>
                    <p className="text-lg font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground">{v.label}s</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No messages yet</p>
          <p className="text-sm">Compose a message to send to your team.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ann: any) => {
            const tc = TYPE_CONFIG[ann.type as AnnType] ?? TYPE_CONFIG.announcement;
            const isExpanded = expanded === ann.id;
            return (
              <Card key={ann.id} className="group">
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${tc.color}`}>
                          {tc.icon}{tc.label}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          {ann.targetEmployeeId ? <><User className="w-3 h-3" />{ann.targetEmployeeName}</> : <><Users className="w-3 h-3" />All Employees</>}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(ann.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <CardTitle className="text-base mt-1">{ann.title}</CardTitle>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirm(ann.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  <p className={`text-sm text-muted-foreground ${isExpanded ? "" : "line-clamp-2"}`}>{ann.body}</p>
                  {ann.body.length > 120 && (
                    <button
                      className="text-xs text-primary mt-1 hover:underline"
                      onClick={() => setExpanded(isExpanded ? null : ann.id)}
                    >
                      {isExpanded ? "Show less" : "Read more"}
                    </button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ComposeDialog open={composeOpen} onClose={() => setComposeOpen(false)} employees={empList} />

      <AlertDialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the message. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm !== null && deleteAnn.mutate({ id: deleteConfirm })}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
