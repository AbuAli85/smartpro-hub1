import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { Settings, Users, Building2, Shield, FileText, AlertTriangle, Plus, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

function NewCompanyDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    legalName: "",
    registrationNumber: "",
    country: "OM",
    city: "",
    phone: "",
    email: "",
    industry: "",
  });

  const createMutation = trpc.companies.create.useMutation({
    onSuccess: () => { toast.success("Company created"); setOpen(false); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><Plus size={16} /> New Company</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Create New Company</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Company Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Legal Name</Label>
            <Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Registration Number</Label>
              <Input value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Select value={form.country} onValueChange={(v) => setForm({ ...form, country: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OM">Oman</SelectItem>
                  <SelectItem value="AE">UAE</SelectItem>
                  <SelectItem value="SA">Saudi Arabia</SelectItem>
                  <SelectItem value="BH">Bahrain</SelectItem>
                  <SelectItem value="KW">Kuwait</SelectItem>
                  <SelectItem value="QA">Qatar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Industry</Label>
              <Input placeholder="e.g. Business Services" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <Button className="w-full" disabled={!form.name || createMutation.isPending}
            onClick={() => createMutation.mutate(form)}>
            {createMutation.isPending ? "Creating..." : "Create Company"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const { data: companies, refetch: refetchCompanies } = trpc.companies.list.useQuery();
  const { data: auditLogs } = trpc.analytics.auditLogs.useQuery({ limit: 50 });
  const { data: platformStats } = trpc.analytics.platformStats.useQuery();

  const updateCompanyMutation = trpc.companies.update.useMutation({
    onSuccess: () => { toast.success("Company updated"); refetchCompanies(); },
    onError: (e) => toast.error(e.message),
  });

  const filteredCompanies = companies?.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  if (user?.role !== "admin") {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <Shield size={40} className="mx-auto text-muted-foreground mb-3 opacity-40" />
            <h3 className="font-semibold text-lg mb-2">Access Restricted</h3>
            <p className="text-sm text-muted-foreground">
              You need administrator privileges to access this section.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings size={24} className="text-[var(--smartpro-orange)]" />
          Admin Control Panel
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Platform administration and system management</p>
      </div>

      {/* Platform Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Companies", value: platformStats?.companies ?? 0, icon: <Building2 size={18} />, color: "text-blue-600 bg-blue-50" },
          { label: "Users", value: platformStats?.users ?? 0, icon: <Users size={18} />, color: "text-purple-600 bg-purple-50" },
          { label: "Contracts", value: platformStats?.contracts ?? 0, icon: <FileText size={18} />, color: "text-orange-600 bg-orange-50" },
          { label: "PRO Services", value: platformStats?.proServices ?? 0, icon: <Shield size={18} />, color: "text-green-600 bg-green-50" },
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

      <Tabs defaultValue="companies">
        <TabsList>
          <TabsTrigger value="companies">Companies ({companies?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          <TabsTrigger value="config">System Config</TabsTrigger>
        </TabsList>

        <TabsContent value="companies" className="space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search companies..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <NewCompanyDialog onSuccess={refetchCompanies} />
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Country</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Industry</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompanies?.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-muted-foreground">
                        <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                        No companies found
                      </td>
                    </tr>
                  )}
                  {filteredCompanies?.map((company) => (
                    <tr key={company.id} className="border-b hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium">{company.name}</div>
                        {company.email && <div className="text-xs text-muted-foreground">{company.email}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs">{company.country ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">{company.industry ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${company.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`} variant="outline">
                          {company.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(company.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <Select value={company.status ?? "active"} onValueChange={(v) => updateCompanyMutation.mutate({ id: company.id, status: v as any })}>
                          <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="suspended">Suspend</SelectItem>
                            <SelectItem value="inactive">Deactivate</SelectItem>
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

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText size={16} />
                Recent Audit Logs
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Entity</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">IP</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs?.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-muted-foreground">
                        No audit logs yet
                      </td>
                    </tr>
                  )}
                  {auditLogs?.map((log) => (
                    <tr key={log.id} className="border-b hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <Badge className="text-xs bg-blue-50 text-blue-700" variant="outline">{log.action}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs capitalize">{log.entityType?.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3 text-xs">{log.userId ?? "System"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{log.ipAddress ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: "Platform Settings", desc: "Configure global platform settings, branding, and defaults", icon: <Settings size={20} /> },
              { title: "Email Templates", desc: "Manage notification and alert email templates", icon: <FileText size={20} /> },
              { title: "Subscription Plans", desc: "Configure SaaS subscription tiers and features", icon: <Shield size={20} /> },
              { title: "Integration Settings", desc: "Manage third-party integrations and API keys", icon: <Building2 size={20} /> },
            ].map((item) => (
              <Card key={item.title} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                      {item.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{item.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="mt-3 w-full text-xs"
                    onClick={() => toast.info("Configuration panel coming soon")}>
                    Configure
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
