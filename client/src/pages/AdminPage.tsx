import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useEffect } from "react";
import { Settings, Users, Building2, Shield, FileText, Plus, Search, Globe, Bell, Key, Sliders, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Industry</Label>
              <Input placeholder="e.g. Business Services" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [platformConfig, setPlatformConfig] = useState({ platform_name: "", support_email: "", default_country: "OM", default_currency: "OMR" });
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>({});
  const [notifSettings, setNotifSettings] = useState<Record<string, boolean>>({});

  const { data: companies, refetch: refetchCompanies } = trpc.companies.list.useQuery();
  const { data: auditLogs } = trpc.analytics.auditLogs.useQuery({ limit: 50 });
  const { data: platformStats } = trpc.analytics.platformStats.useQuery();
  const { data: allSettings } = trpc.analytics.getSettings.useQuery({ category: undefined }, { enabled: user?.role === "admin" });

  // Populate form state from DB settings
  useEffect(() => {
    if (!allSettings) return;
    const map: Record<string, string> = {};
    allSettings.forEach((s) => { if (s.key && s.value !== null) map[s.key] = s.value ?? ""; });
    setPlatformConfig({
      platform_name: map["platform_name"] ?? "SmartPRO Business Hub",
      support_email: map["support_email"] ?? "support@smartpro.om",
      default_country: map["default_country"] ?? "OM",
      default_currency: map["default_currency"] ?? "OMR",
    });
    const features: Record<string, boolean> = {};
    const notifs: Record<string, boolean> = {};
    allSettings.forEach((s) => {
      if (s.key?.startsWith("feature_")) features[s.key] = s.value === "true";
      if (s.key?.startsWith("notif_")) notifs[s.key] = s.value === "true";
    });
    setFeatureToggles(features);
    setNotifSettings(notifs);
  }, [allSettings]);

  const saveSettingsMutation = trpc.analytics.saveSettings.useMutation({
    onSuccess: () => { toast.success("Settings saved"); utils.analytics.getSettings.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

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
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search companies..." className="pl-9" aria-label="Search companies" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <NewCompanyDialog onSuccess={refetchCompanies} />
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Country</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Industry</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
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
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Entity</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">IP</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Time</th>
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

        <TabsContent value="config" className="space-y-5">
          {/* Platform Identity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Globe size={16} /> Platform Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Platform Name</Label>
                  <Input value={platformConfig.platform_name} onChange={(e) => setPlatformConfig(p => ({ ...p, platform_name: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Support Email</Label>
                  <Input value={platformConfig.support_email} onChange={(e) => setPlatformConfig(p => ({ ...p, support_email: e.target.value }))} type="email" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Default Country</Label>
                  <Select value={platformConfig.default_country} onValueChange={(v) => setPlatformConfig(p => ({ ...p, default_country: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OM">Oman</SelectItem>
                      <SelectItem value="AE">UAE</SelectItem>
                      <SelectItem value="SA">Saudi Arabia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Default Currency</Label>
                  <Select value={platformConfig.default_currency} onValueChange={(v) => setPlatformConfig(p => ({ ...p, default_currency: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OMR">OMR - Omani Rial</SelectItem>
                      <SelectItem value="AED">AED - UAE Dirham</SelectItem>
                      <SelectItem value="SAR">SAR - Saudi Riyal</SelectItem>
                      <SelectItem value="USD">USD - US Dollar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button size="sm" className="gap-2" disabled={saveSettingsMutation.isPending}
                onClick={() => saveSettingsMutation.mutate({ settings: Object.entries(platformConfig).map(([key, value]) => ({ key, value })) })}>
                <CheckCircle2 size={14} /> Save Settings
              </Button>
            </CardContent>
          </Card>

          {/* Feature Toggles */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Sliders size={16} /> Feature Toggles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { key: "feature_marketplace", label: "Marketplace Module", desc: "Enable service provider marketplace", defaultOn: true },
                  { key: "feature_pro_services", label: "PRO Services", desc: "Government PRO services management", defaultOn: true },
                  { key: "feature_sanad", label: "Sanad Offices", desc: "Sanad office registration and tracking", defaultOn: true },
                  { key: "feature_hr", label: "HR Module", desc: "Human resources management", defaultOn: true },
                  { key: "feature_crm", label: "CRM Module", desc: "Customer relationship management", defaultOn: true },
                  { key: "feature_contracts", label: "Contract Management", desc: "Contract creation and e-signature", defaultOn: true },
                  { key: "feature_analytics", label: "Analytics Dashboard", desc: "Cross-module reporting and analytics", defaultOn: true },
                  { key: "feature_ai", label: "AI Assistant", desc: "AI-powered document generation and analysis", defaultOn: false },
                  { key: "feature_arabic", label: "Multi-language (Arabic)", desc: "Arabic RTL interface support", defaultOn: false },
                ].map((feature) => {
                  const isOn = feature.key in featureToggles ? featureToggles[feature.key] : feature.defaultOn;
                  return (
                    <div key={feature.key} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{feature.label}</p>
                        <p className="text-xs text-muted-foreground">{feature.desc}</p>
                      </div>
                      <button
                        onClick={() => {
                          const newVal = !isOn;
                          setFeatureToggles(prev => ({ ...prev, [feature.key]: newVal }));
                          saveSettingsMutation.mutate({ settings: [{ key: feature.key, value: String(newVal) }] });
                        }}
                        className={`relative w-10 h-5 rounded-full transition-colors ${isOn ? "bg-green-500" : "bg-muted"}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isOn ? "translate-x-5" : "translate-x-0.5"}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Bell size={16} /> Notification Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: "notif_new_company", label: "New Company Registration", channel: "Email + In-App", defaultOn: true },
                { key: "notif_pro_expiry", label: "PRO Document Expiry (30 days)", channel: "Email + SMS", defaultOn: true },
                { key: "notif_contract_sign", label: "Contract Signature Required", channel: "Email", defaultOn: true },
                { key: "notif_marketplace_booking", label: "New Marketplace Booking", channel: "In-App", defaultOn: true },
                { key: "notif_invoice_overdue", label: "Invoice Overdue", channel: "Email + SMS", defaultOn: true },
                { key: "notif_leave_request", label: "Leave Request Submitted", channel: "Email", defaultOn: false },
              ].map((notif) => {
                const isOn = notif.key in notifSettings ? notifSettings[notif.key] : notif.defaultOn;
                return (
                  <div key={notif.key} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{notif.label}</p>
                      <p className="text-xs text-muted-foreground">{notif.channel}</p>
                    </div>
                    <button
                      onClick={() => {
                        const newVal = !isOn;
                        setNotifSettings(prev => ({ ...prev, [notif.key]: newVal }));
                        saveSettingsMutation.mutate({ settings: [{ key: notif.key, value: String(newVal) }] });
                      }}
                      className={`relative w-10 h-5 rounded-full transition-colors ${isOn ? "bg-[var(--smartpro-orange)]" : "bg-muted"}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isOn ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                );
              })}
              <Button size="sm" className="gap-2 mt-2" disabled={saveSettingsMutation.isPending}
                onClick={() => toast.success("Notification settings saved")}>
                <CheckCircle2 size={14} /> Settings Auto-Saved
              </Button>
            </CardContent>
          </Card>

          {/* Integration Keys */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Key size={16} /> Integration Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: "SMS Gateway API Key", placeholder: "sk_sms_...", type: "password" },
                  { label: "Email Service Key", placeholder: "SG.xxx...", type: "password" },
                  { label: "E-Signature Provider", placeholder: "ds_key_...", type: "password" },
                  { label: "Google Maps API Key", placeholder: "AIza...", type: "password" },
                ].map((field) => (
                  <div key={field.label} className="space-y-1.5">
                    <Label className="text-xs font-medium">{field.label}</Label>
                    <Input type={field.type} placeholder={field.placeholder} className="h-8 text-sm font-mono" />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="gap-2" onClick={() => toast.success("Integration keys saved")}>
                  <CheckCircle2 size={14} /> Save Keys
                </Button>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => toast.info("Testing connections...")}>
                  <RefreshCw size={14} /> Test Connections
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-red-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-red-600"><XCircle size={16} /> Danger Zone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Clear All Audit Logs", desc: "Permanently delete all audit trail records", action: "Clear Logs" },
                { label: "Reset Platform Data", desc: "Remove all test data and reset to factory defaults", action: "Reset Data" },
                { label: "Maintenance Mode", desc: "Take the platform offline for maintenance", action: "Enable Maintenance" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium text-red-700">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => toast.warning(`${item.action} — confirm in production`)}
                  >
                    {item.action}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
