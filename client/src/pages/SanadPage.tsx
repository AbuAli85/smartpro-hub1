import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Building2, Plus, Search, Filter, CheckCircle2, Clock, AlertTriangle, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  under_review: "bg-purple-100 text-purple-700",
  processing: "bg-indigo-100 text-indigo-700",
  awaiting_documents: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  completed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  normal: "bg-blue-100 text-blue-600",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

function NewApplicationDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    type: "visa" as const,
    applicantName: "",
    nationality: "",
    passportNumber: "",
    priority: "normal" as const,
    notes: "",
    fees: "",
    dueDate: "",
  });

  const createMutation = trpc.sanad.createApplication.useMutation({
    onSuccess: (data) => {
      toast.success(`Application created: ${data.applicationNumber}`);
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus size={16} /> New Application
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Sanad Application</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Service Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visa">Visa</SelectItem>
                  <SelectItem value="labor_card">Labor Card</SelectItem>
                  <SelectItem value="commercial_registration">Commercial Registration</SelectItem>
                  <SelectItem value="work_permit">Work Permit</SelectItem>
                  <SelectItem value="residence_permit">Residence Permit</SelectItem>
                  <SelectItem value="business_license">Business License</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as any })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Applicant Name *</Label>
            <Input
              placeholder="Full name"
              value={form.applicantName}
              onChange={(e) => setForm({ ...form, applicantName: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nationality</Label>
              <Input
                placeholder="e.g. Omani"
                value={form.nationality}
                onChange={(e) => setForm({ ...form, nationality: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Passport Number</Label>
              <Input
                placeholder="Passport #"
                value={form.passportNumber}
                onChange={(e) => setForm({ ...form, passportNumber: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Fees (OMR)</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={form.fees}
                onChange={(e) => setForm({ ...form, fees: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              placeholder="Additional notes..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>
          <Button
            className="w-full"
            disabled={!form.applicantName || createMutation.isPending}
            onClick={() =>
              createMutation.mutate({
                ...form,
                fees: form.fees ? Number(form.fees) : undefined,
              })
            }
          >
            {createMutation.isPending ? "Creating..." : "Create Application"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SanadPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: applications, refetch } = trpc.sanad.listApplications.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
  });

  const { data: offices } = trpc.sanad.listOffices.useQuery();

  const updateMutation = trpc.sanad.updateApplication.useMutation({
    onSuccess: () => { toast.success("Updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = applications?.filter((app) =>
    !search ||
    (app.applicantName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    app.applicationNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: applications?.length ?? 0,
    pending: applications?.filter((a) => ["submitted", "under_review", "processing"].includes(a.status ?? "")).length ?? 0,
    completed: applications?.filter((a) => a.status === "completed").length ?? 0,
    urgent: applications?.filter((a) => a.priority === "urgent").length ?? 0,
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 size={24} className="text-[var(--smartpro-orange)]" />
            Sanad Offices
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage government service applications and office operations
          </p>
        </div>
        <NewApplicationDialog onSuccess={refetch} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Applications", value: stats.total, icon: <FileText size={18} />, color: "text-blue-600 bg-blue-50" },
          { label: "In Progress", value: stats.pending, icon: <Clock size={18} />, color: "text-amber-600 bg-amber-50" },
          { label: "Completed", value: stats.completed, icon: <CheckCircle2 size={18} />, color: "text-green-600 bg-green-50" },
          { label: "Urgent", value: stats.urgent, icon: <AlertTriangle size={18} />, color: "text-red-600 bg-red-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                {s.icon}
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="applications">
        <TabsList>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="offices">Offices ({offices?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="applications" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or number..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="visa">Visa</SelectItem>
                <SelectItem value="labor_card">Labor Card</SelectItem>
                <SelectItem value="commercial_registration">Commercial Reg.</SelectItem>
                <SelectItem value="work_permit">Work Permit</SelectItem>
                <SelectItem value="residence_permit">Residence Permit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Application #</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Applicant</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Priority</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Due Date</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered?.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-muted-foreground">
                        <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                        No applications found
                      </td>
                    </tr>
                  )}
                  {filtered?.map((app) => (
                    <tr key={app.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{app.applicationNumber}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{app.applicantName}</div>
                        {app.nationality && <div className="text-xs text-muted-foreground">{app.nationality}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="capitalize text-xs">{app.type?.replace(/_/g, " ")}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${priorityColors[app.priority ?? "normal"]}`} variant="outline">
                          {app.priority}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${statusColors[app.status ?? "draft"]}`} variant="outline">
                          {app.status?.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {app.dueDate ? new Date(app.dueDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={app.status ?? "draft"}
                          onValueChange={(v) => updateMutation.mutate({ id: app.id, status: v as any })}
                        >
                          <SelectTrigger className="h-7 text-xs w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="submitted">Submit</SelectItem>
                            <SelectItem value="under_review">Under Review</SelectItem>
                            <SelectItem value="processing">Processing</SelectItem>
                            <SelectItem value="approved">Approve</SelectItem>
                            <SelectItem value="completed">Complete</SelectItem>
                            <SelectItem value="rejected">Reject</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="offices" className="space-y-4">
          {offices?.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <Building2 size={40} className="mx-auto text-muted-foreground mb-3 opacity-40" />
                <h3 className="font-semibold mb-1">No offices registered</h3>
                <p className="text-sm text-muted-foreground">Register your first Sanad office to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {offices?.map((office) => (
                <Card key={office.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Building2 size={18} className="text-blue-600" />
                      </div>
                      <Badge
                        className={office.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}
                        variant="outline"
                      >
                        {office.status}
                      </Badge>
                    </div>
                    <h3 className="font-semibold">{office.name}</h3>
                    {office.city && <p className="text-xs text-muted-foreground mt-1">{office.city}</p>}
                    {office.phone && <p className="text-xs text-muted-foreground">{office.phone}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
