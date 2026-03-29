import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Shield, Plus, Search, AlertTriangle, Clock, CheckCircle2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  assigned: "bg-blue-100 text-blue-700",
  in_progress: "bg-indigo-100 text-indigo-700",
  awaiting_documents: "bg-orange-100 text-orange-700",
  submitted_to_authority: "bg-purple-100 text-purple-700",
  approved: "bg-green-100 text-green-700",
  completed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

function NewProServiceDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    serviceType: "visa_processing" as const,
    employeeName: "",
    nationality: "",
    passportNumber: "",
    passportExpiry: "",
    expiryDate: "",
    priority: "normal" as const,
    notes: "",
    fees: "",
    dueDate: "",
  });

  const createMutation = trpc.pro.create.useMutation({
    onSuccess: (data) => {
      toast.success(`PRO service created: ${data.serviceNumber}`);
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus size={16} /> New PRO Service
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New PRO Service Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Service Type</Label>
              <Select value={form.serviceType} onValueChange={(v) => setForm({ ...form, serviceType: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="visa_processing">Visa Processing</SelectItem>
                  <SelectItem value="work_permit">Work Permit</SelectItem>
                  <SelectItem value="labor_card">Labor Card</SelectItem>
                  <SelectItem value="emirates_id">Emirates ID</SelectItem>
                  <SelectItem value="oman_id">Oman ID</SelectItem>
                  <SelectItem value="residence_renewal">Residence Renewal</SelectItem>
                  <SelectItem value="visa_renewal">Visa Renewal</SelectItem>
                  <SelectItem value="permit_renewal">Permit Renewal</SelectItem>
                  <SelectItem value="document_attestation">Document Attestation</SelectItem>
                  <SelectItem value="company_registration">Company Registration</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
            <Label>Employee Name *</Label>
            <Input placeholder="Full name" value={form.employeeName} onChange={(e) => setForm({ ...form, employeeName: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nationality</Label>
              <Input placeholder="e.g. Indian" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Passport Number</Label>
              <Input placeholder="Passport #" value={form.passportNumber} onChange={(e) => setForm({ ...form, passportNumber: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Passport Expiry</Label>
              <Input type="date" value={form.passportExpiry} onChange={(e) => setForm({ ...form, passportExpiry: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Document Expiry Date</Label>
              <Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Fees (OMR)</Label>
              <Input type="number" placeholder="0.00" value={form.fees} onChange={(e) => setForm({ ...form, fees: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea placeholder="Additional notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <Button
            className="w-full"
            disabled={!form.employeeName || createMutation.isPending}
            onClick={() => createMutation.mutate({ ...form, fees: form.fees ? Number(form.fees) : undefined })}
          >
            {createMutation.isPending ? "Creating..." : "Create PRO Service"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ProServicesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: services, refetch } = trpc.pro.list.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
  });
  const { data: expiringDocs } = trpc.pro.expiringDocuments.useQuery({ daysAhead: 60 });

  const updateMutation = trpc.pro.update.useMutation({
    onSuccess: () => { toast.success("Updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = services?.filter((s) =>
    !search ||
    (s.employeeName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    s.serviceNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: services?.length ?? 0,
    pending: services?.filter((s) => ["pending", "assigned", "in_progress"].includes(s.status ?? "")).length ?? 0,
    completed: services?.filter((s) => s.status === "completed").length ?? 0,
    expiringSoon: expiringDocs?.length ?? 0,
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield size={24} className="text-[var(--smartpro-orange)]" />
            PRO Services
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visa processing, work permits, labor cards & document renewals
          </p>
        </div>
        <NewProServiceDialog onSuccess={refetch} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Services", value: stats.total, icon: <Shield size={18} />, color: "text-blue-600 bg-blue-50" },
          { label: "In Progress", value: stats.pending, icon: <Clock size={18} />, color: "text-amber-600 bg-amber-50" },
          { label: "Completed", value: stats.completed, icon: <CheckCircle2 size={18} />, color: "text-green-600 bg-green-50" },
          { label: "Expiring (60d)", value: stats.expiringSoon, icon: <AlertTriangle size={18} />, color: "text-red-600 bg-red-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>{s.icon}</div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="services">
        <TabsList>
          <TabsTrigger value="services">All Services</TabsTrigger>
          <TabsTrigger value="expiring">
            Expiring Documents
            {stats.expiringSoon > 0 && (
              <Badge className="ml-2 bg-red-100 text-red-700 text-xs">{stats.expiringSoon}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by name or number..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="submitted_to_authority">Submitted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Service #</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Employee</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Service Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Priority</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Expiry</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Update Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered?.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-muted-foreground">
                        <Shield size={32} className="mx-auto mb-2 opacity-30" />
                        No PRO services found
                      </td>
                    </tr>
                  )}
                  {filtered?.map((svc) => {
                    const isExpiringSoon = svc.expiryDate && new Date(svc.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                    return (
                      <tr key={svc.id} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{svc.serviceNumber}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{svc.employeeName}</div>
                          {svc.nationality && <div className="text-xs text-muted-foreground">{svc.nationality}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs capitalize">{svc.serviceType?.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3">
                          <Badge className={`text-xs ${svc.priority === "urgent" ? "bg-red-100 text-red-700" : svc.priority === "high" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"}`} variant="outline">
                            {svc.priority}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`text-xs ${statusColors[svc.status ?? "pending"]}`} variant="outline">
                            {svc.status?.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {svc.expiryDate ? (
                            <span className={`text-xs flex items-center gap-1 ${isExpiringSoon ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                              {isExpiringSoon && <AlertTriangle size={12} />}
                              {new Date(svc.expiryDate).toLocaleDateString()}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Select value={svc.status ?? "pending"} onValueChange={(v) => updateMutation.mutate({ id: svc.id, status: v as any })}>
                            <SelectTrigger className="h-7 text-xs w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="assigned">Assigned</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="submitted_to_authority">Submitted</SelectItem>
                              <SelectItem value="approved">Approved</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="expiring" className="space-y-4">
          {expiringDocs?.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <CheckCircle2 size={40} className="mx-auto text-green-500 mb-3" />
                <h3 className="font-semibold">All documents are up to date</h3>
                <p className="text-sm text-muted-foreground">No documents expiring in the next 60 days.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Employee</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Service Type</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Expiry Date</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Days Left</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiringDocs?.map((doc) => {
                      const daysLeft = doc.expiryDate
                        ? Math.ceil((new Date(doc.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                        : null;
                      return (
                        <tr key={doc.id} className="border-b hover:bg-muted/20">
                          <td className="px-4 py-3 font-medium">{doc.employeeName}</td>
                          <td className="px-4 py-3 text-xs capitalize">{doc.serviceType?.replace(/_/g, " ")}</td>
                          <td className="px-4 py-3 text-xs">{doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : "—"}</td>
                          <td className="px-4 py-3">
                            {daysLeft !== null && (
                              <Badge className={`text-xs ${daysLeft <= 7 ? "bg-red-100 text-red-700" : daysLeft <= 30 ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700"}`} variant="outline">
                                {daysLeft}d left
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => updateMutation.mutate({ id: doc.id, status: "in_progress" })}>
                              <RefreshCw size={12} /> Renew
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
