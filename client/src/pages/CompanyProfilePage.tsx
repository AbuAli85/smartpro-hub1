import { useState, useEffect } from "react";
import { Building2, FileText, Landmark, Users, BarChart3, Pencil, Save, X, CheckCircle2, AlertCircle, Globe, Phone, Mail, MapPin, Calendar, Hash } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Industry list ─────────────────────────────────────────────────────────────
const INDUSTRIES = [
  "Oil & Gas", "Construction", "Trading & Retail", "Information Technology",
  "Financial Services", "Healthcare", "Education", "Hospitality & Tourism",
  "Manufacturing", "Logistics & Transport", "Real Estate", "Consulting",
  "Engineering", "Agriculture", "Telecommunications", "Media & Entertainment",
  "Government & Public Sector", "Non-Profit", "Other",
];

// ─── Omani Banks ───────────────────────────────────────────────────────────────
const OMAN_BANKS = [
  "Bank Muscat", "Bank Dhofar", "National Bank of Oman", "Ahli Bank",
  "Oman Arab Bank", "HSBC Oman", "Standard Chartered Oman", "Sohar International",
  "Bank Nizwa", "Al Izz Islamic Bank", "Habib Bank", "Qatar National Bank",
  "First Abu Dhabi Bank", "Other",
];

function InfoRow({ label, value, icon: Icon }: { label: string; value?: string | null; icon?: React.ElementType }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      {Icon && <Icon size={15} className="text-muted-foreground mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground mt-0.5 break-words">{value || <span className="text-muted-foreground italic">Not set</span>}</p>
      </div>
    </div>
  );
}

function EditField({ label, name, value, onChange, type = "text", placeholder, textarea }: {
  label: string; name: string; value: string;
  onChange: (name: string, value: string) => void;
  type?: string; placeholder?: string; textarea?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      {textarea ? (
        <Textarea
          value={value}
          onChange={e => onChange(name, e.target.value)}
          placeholder={placeholder}
          className="resize-none text-sm"
          rows={3}
        />
      ) : (
        <Input
          type={type}
          value={value}
          onChange={e => onChange(name, e.target.value)}
          placeholder={placeholder}
          className="text-sm"
        />
      )}
    </div>
  );
}

function SelectField({ label, name, value, onChange, options }: {
  label: string; name: string; value: string;
  onChange: (name: string, value: string) => void;
  options: string[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      <select
        value={value}
        onChange={e => onChange(name, e.target.value)}
        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">— Select —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

type CompanyForm = {
  name: string; nameAr: string; industry: string; city: string; address: string;
  phone: string; email: string; website: string; description: string;
  registrationNumber: string; taxNumber: string;
  crNumber: string; occiNumber: string; municipalityLicenceNumber: string;
  laborCardNumber: string; pasiNumber: string;
  bankName: string; bankAccountNumber: string; bankIban: string;
  omanisationTarget: string; foundedYear: string;
};

const EMPTY: CompanyForm = {
  name: "", nameAr: "", industry: "", city: "", address: "", phone: "", email: "",
  website: "", description: "", registrationNumber: "", taxNumber: "",
  crNumber: "", occiNumber: "", municipalityLicenceNumber: "", laborCardNumber: "", pasiNumber: "",
  bankName: "", bankAccountNumber: "", bankIban: "", omanisationTarget: "", foundedYear: "",
};

export default function CompanyProfilePage() {
  const { data: membership, isLoading } = trpc.companies.myCompany.useQuery();
  const { data: employeeStats } = trpc.hr.listEmployees.useQuery({ status: "active" });
  const updateMutation = trpc.companies.update.useMutation({
    onSuccess: () => { toast.success("Company profile saved"); setEditing(null); utils.companies.myCompany.invalidate(); },
    onError: (e) => toast.error(e.message || "Failed to save"),
  });
  const utils = trpc.useUtils();

  const company = membership?.company;
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyForm>(EMPTY);

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name ?? "",
        nameAr: (company as any).nameAr ?? "",
        industry: company.industry ?? "",
        city: company.city ?? "",
        address: company.address ?? "",
        phone: company.phone ?? "",
        email: company.email ?? "",
        website: company.website ?? "",
        description: (company as any).description ?? "",
        registrationNumber: company.registrationNumber ?? "",
        taxNumber: company.taxNumber ?? "",
        crNumber: (company as any).crNumber ?? "",
        occiNumber: (company as any).occiNumber ?? "",
        municipalityLicenceNumber: (company as any).municipalityLicenceNumber ?? "",
        laborCardNumber: (company as any).laborCardNumber ?? "",
        pasiNumber: (company as any).pasiNumber ?? "",
        bankName: (company as any).bankName ?? "",
        bankAccountNumber: (company as any).bankAccountNumber ?? "",
        bankIban: (company as any).bankIban ?? "",
        omanisationTarget: (company as any).omanisationTarget ?? "",
        foundedYear: (company as any).foundedYear ?? "",
      });
    }
  }, [company]);

  const f = (name: string, value: string) => setForm(p => ({ ...p, [name]: value }));

  const save = (section: string) => {
    if (!company) return;
    const payload: any = { id: company.id };
    if (section === "general") {
      Object.assign(payload, { name: form.name, nameAr: form.nameAr, industry: form.industry, city: form.city, address: form.address, phone: form.phone, email: form.email, website: form.website, description: form.description, foundedYear: form.foundedYear ? Number(form.foundedYear) : undefined });
    } else if (section === "legal") {
      Object.assign(payload, { registrationNumber: form.registrationNumber, taxNumber: form.taxNumber, crNumber: form.crNumber, occiNumber: form.occiNumber, municipalityLicenceNumber: form.municipalityLicenceNumber, laborCardNumber: form.laborCardNumber, pasiNumber: form.pasiNumber });
    } else if (section === "bank") {
      Object.assign(payload, { bankName: form.bankName, bankAccountNumber: form.bankAccountNumber, bankIban: form.bankIban });
    } else if (section === "omanisation") {
      Object.assign(payload, { omanisationTarget: form.omanisationTarget ? Number(form.omanisationTarget) : undefined });
    }
    updateMutation.mutate(payload);
  };

  // Omanisation calculation
  const totalEmployees = employeeStats?.length ?? 0;
  const omaniEmployees = employeeStats?.filter((e: any) => e.nationality?.toLowerCase() === "omani" || e.nationality?.toLowerCase() === "oman").length ?? 0;
  const omanisationActual = totalEmployees > 0 ? Math.round((omaniEmployees / totalEmployees) * 100) : 0;
  const omanisationTarget = Number((company as any)?.omanisationTarget ?? 0);

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  );

  if (!company) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Building2 size={40} className="text-muted-foreground" />
      <p className="text-muted-foreground">No company found. Please create a company first.</p>
    </div>
  );

  // Profile completeness
  const fields = [form.name, form.industry, form.city, form.phone, form.email, form.crNumber, form.occiNumber, form.bankName, form.bankAccountNumber];
  const filled = fields.filter(Boolean).length;
  const completeness = Math.round((filled / fields.length) * 100);

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shrink-0">
            <Building2 size={28} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{company.name}</h1>
            {(company as any).nameAr && <p className="text-sm text-muted-foreground mt-0.5" dir="rtl">{(company as any).nameAr}</p>}
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="outline" className="text-xs">{company.industry || "Industry not set"}</Badge>
              <Badge variant={company.status === "active" ? "default" : "secondary"} className="text-xs capitalize">{company.status}</Badge>
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Profile completeness</p>
          <p className="text-2xl font-bold text-foreground">{completeness}%</p>
          <Progress value={completeness} className="w-28 h-1.5 mt-1" />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Employees", value: totalEmployees, icon: Users },
          { label: "Omani Employees", value: omaniEmployees, icon: Users },
          { label: "Omanisation %", value: `${omanisationActual}%`, icon: BarChart3 },
          { label: "Target %", value: omanisationTarget ? `${omanisationTarget}%` : "Not set", icon: BarChart3 },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-3">
            <div className="flex items-center gap-2">
              <Icon size={16} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="text-xl font-bold text-foreground mt-1">{value}</p>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general">
        <TabsList className="w-full sm:w-auto flex-wrap h-auto gap-1">
          <TabsTrigger value="general" className="gap-1.5"><Building2 size={13} /> General</TabsTrigger>
          <TabsTrigger value="legal" className="gap-1.5"><FileText size={13} /> Legal & Licences</TabsTrigger>
          <TabsTrigger value="bank" className="gap-1.5"><Landmark size={13} /> Bank Details</TabsTrigger>
          <TabsTrigger value="omanisation" className="gap-1.5"><BarChart3 size={13} /> Omanisation</TabsTrigger>
        </TabsList>

        {/* ── General Info ── */}
        <TabsContent value="general" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">General Information</CardTitle>
                <CardDescription className="text-xs">Company identity, contact details, and description</CardDescription>
              </div>
              {editing === "general" ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(null)} disabled={updateMutation.isPending}><X size={13} className="mr-1" />Cancel</Button>
                  <Button size="sm" onClick={() => save("general")} disabled={updateMutation.isPending}><Save size={13} className="mr-1" />Save</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setEditing("general")}><Pencil size={13} className="mr-1" />Edit</Button>
              )}
            </CardHeader>
            <CardContent>
              {editing === "general" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <EditField label="Company Name (English)" name="name" value={form.name} onChange={f} placeholder="Falcon Eye Modern Investment" />
                  <EditField label="Company Name (Arabic)" name="nameAr" value={form.nameAr} onChange={f} placeholder="فالكون آي للاستثمار الحديث" />
                  <SelectField label="Industry" name="industry" value={form.industry} onChange={f} options={INDUSTRIES} />
                  <EditField label="Founded Year" name="foundedYear" value={form.foundedYear} onChange={f} type="number" placeholder="2010" />
                  <EditField label="City" name="city" value={form.city} onChange={f} placeholder="Muscat" />
                  <EditField label="Phone" name="phone" value={form.phone} onChange={f} placeholder="+968 2XXX XXXX" />
                  <EditField label="Email" name="email" value={form.email} onChange={f} type="email" placeholder="info@company.om" />
                  <EditField label="Website" name="website" value={form.website} onChange={f} placeholder="https://www.company.om" />
                  <div className="md:col-span-2">
                    <EditField label="Address" name="address" value={form.address} onChange={f} placeholder="Building No., Street, Wilayat, Governorate" textarea />
                  </div>
                  <div className="md:col-span-2">
                    <EditField label="Company Description" name="description" value={form.description} onChange={f} placeholder="Brief description of the company's business activities..." textarea />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  <div>
                    <InfoRow label="Company Name (English)" value={company.name} icon={Building2} />
                    <InfoRow label="Company Name (Arabic)" value={(company as any).nameAr} icon={Building2} />
                    <InfoRow label="Industry" value={company.industry} icon={Hash} />
                    <InfoRow label="Founded Year" value={(company as any).foundedYear?.toString()} icon={Calendar} />
                    <InfoRow label="Description" value={(company as any).description} icon={FileText} />
                  </div>
                  <div>
                    <InfoRow label="City" value={company.city} icon={MapPin} />
                    <InfoRow label="Address" value={company.address} icon={MapPin} />
                    <InfoRow label="Phone" value={company.phone} icon={Phone} />
                    <InfoRow label="Email" value={company.email} icon={Mail} />
                    <InfoRow label="Website" value={company.website} icon={Globe} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Legal & Licences ── */}
        <TabsContent value="legal" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Legal Documents & Licences</CardTitle>
                <CardDescription className="text-xs">CR, OCCI, Municipality, Labour Card, PASI, and Tax numbers</CardDescription>
              </div>
              {editing === "legal" ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(null)} disabled={updateMutation.isPending}><X size={13} className="mr-1" />Cancel</Button>
                  <Button size="sm" onClick={() => save("legal")} disabled={updateMutation.isPending}><Save size={13} className="mr-1" />Save</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setEditing("legal")}><Pencil size={13} className="mr-1" />Edit</Button>
              )}
            </CardHeader>
            <CardContent>
              {editing === "legal" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <EditField label="Commercial Registration (CR) Number" name="crNumber" value={form.crNumber} onChange={f} placeholder="e.g. 1234567" />
                  <EditField label="OCCI Membership Number" name="occiNumber" value={form.occiNumber} onChange={f} placeholder="e.g. 12345" />
                  <EditField label="Municipality Licence Number" name="municipalityLicenceNumber" value={form.municipalityLicenceNumber} onChange={f} placeholder="e.g. MUN-2024-XXXXX" />
                  <EditField label="Labour Card Number" name="laborCardNumber" value={form.laborCardNumber} onChange={f} placeholder="e.g. LC-XXXXX" />
                  <EditField label="PASI Registration Number" name="pasiNumber" value={form.pasiNumber} onChange={f} placeholder="e.g. PASI-XXXXX" />
                  <EditField label="Tax Registration Number (TRN)" name="taxNumber" value={form.taxNumber} onChange={f} placeholder="e.g. OM-VAT-XXXXX" />
                  <EditField label="Other Registration Number" name="registrationNumber" value={form.registrationNumber} onChange={f} placeholder="Optional" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  <div>
                    <InfoRow label="CR Number" value={(company as any).crNumber} icon={FileText} />
                    <InfoRow label="OCCI Number" value={(company as any).occiNumber} icon={FileText} />
                    <InfoRow label="Municipality Licence" value={(company as any).municipalityLicenceNumber} icon={FileText} />
                    <InfoRow label="Labour Card Number" value={(company as any).laborCardNumber} icon={FileText} />
                  </div>
                  <div>
                    <InfoRow label="PASI Number" value={(company as any).pasiNumber} icon={FileText} />
                    <InfoRow label="Tax Registration (TRN)" value={company.taxNumber} icon={FileText} />
                    <InfoRow label="Other Registration" value={company.registrationNumber} icon={FileText} />
                  </div>
                </div>
              )}
              {/* Completeness indicators */}
              {editing !== "legal" && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Document Status</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "CR", value: (company as any).crNumber },
                      { label: "OCCI", value: (company as any).occiNumber },
                      { label: "Municipality", value: (company as any).municipalityLicenceNumber },
                      { label: "Labour Card", value: (company as any).laborCardNumber },
                      { label: "PASI", value: (company as any).pasiNumber },
                      { label: "TRN", value: company.taxNumber },
                    ].map(({ label, value }) => (
                      <div key={label} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${value ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800" : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"}`}>
                        {value ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Bank Details ── */}
        <TabsContent value="bank" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Bank Details</CardTitle>
                <CardDescription className="text-xs">Company bank account for payroll and WPS compliance</CardDescription>
              </div>
              {editing === "bank" ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(null)} disabled={updateMutation.isPending}><X size={13} className="mr-1" />Cancel</Button>
                  <Button size="sm" onClick={() => save("bank")} disabled={updateMutation.isPending}><Save size={13} className="mr-1" />Save</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setEditing("bank")}><Pencil size={13} className="mr-1" />Edit</Button>
              )}
            </CardHeader>
            <CardContent>
              {editing === "bank" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SelectField label="Bank Name" name="bankName" value={form.bankName} onChange={f} options={OMAN_BANKS} />
                  <EditField label="Account Number" name="bankAccountNumber" value={form.bankAccountNumber} onChange={f} placeholder="e.g. 0123456789" />
                  <div className="md:col-span-2">
                    <EditField label="IBAN" name="bankIban" value={form.bankIban} onChange={f} placeholder="e.g. OM91XXXX0000000000000000" />
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <InfoRow label="Bank Name" value={(company as any).bankName} icon={Landmark} />
                  <InfoRow label="Account Number" value={(company as any).bankAccountNumber} icon={Hash} />
                  <InfoRow label="IBAN" value={(company as any).bankIban} icon={Hash} />
                </div>
              )}
              {!(company as any).bankName && editing !== "bank" && (
                <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-start gap-2">
                  <AlertCircle size={15} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">Bank details are required for WPS (Wage Protection System) payroll processing. Please add your company bank account.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Omanisation ── */}
        <TabsContent value="omanisation" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Omanisation Compliance</CardTitle>
                <CardDescription className="text-xs">Track your Omanisation target vs. actual ratio</CardDescription>
              </div>
              {editing === "omanisation" ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(null)} disabled={updateMutation.isPending}><X size={13} className="mr-1" />Cancel</Button>
                  <Button size="sm" onClick={() => save("omanisation")} disabled={updateMutation.isPending}><Save size={13} className="mr-1" />Save</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setEditing("omanisation")}><Pencil size={13} className="mr-1" />Edit</Button>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {editing === "omanisation" ? (
                <EditField label="Omanisation Target (%)" name="omanisationTarget" value={form.omanisationTarget} onChange={f} type="number" placeholder="e.g. 35" />
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-card border border-border text-center">
                      <p className="text-3xl font-bold text-foreground">{omanisationActual}%</p>
                      <p className="text-xs text-muted-foreground mt-1">Current Omanisation</p>
                    </div>
                    <div className="p-4 rounded-xl bg-card border border-border text-center">
                      <p className="text-3xl font-bold text-foreground">{omanisationTarget ? `${omanisationTarget}%` : "—"}</p>
                      <p className="text-xs text-muted-foreground mt-1">Target</p>
                    </div>
                    <div className={`p-4 rounded-xl border text-center ${omanisationActual >= omanisationTarget && omanisationTarget > 0 ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800" : "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"}`}>
                      <p className={`text-3xl font-bold ${omanisationActual >= omanisationTarget && omanisationTarget > 0 ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>
                        {omanisationTarget > 0 ? (omanisationActual >= omanisationTarget ? "✓ Met" : `${omanisationTarget - omanisationActual}% gap`) : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Status</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>Actual: {omanisationActual}%</span>
                      {omanisationTarget > 0 && <span>Target: {omanisationTarget}%</span>}
                    </div>
                    <Progress value={omanisationActual} className="h-3" />
                    {omanisationTarget > 0 && (
                      <div className="relative h-0">
                        <div className="absolute top-[-12px] w-0.5 h-3 bg-red-500" style={{ left: `${Math.min(omanisationTarget, 100)}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <InfoRow label="Total Employees" value={totalEmployees.toString()} icon={Users} />
                    <InfoRow label="Omani Employees" value={omaniEmployees.toString()} icon={Users} />
                    <InfoRow label="Expatriate Employees" value={(totalEmployees - omaniEmployees).toString()} icon={Users} />
                    <InfoRow label="Omanisation Target" value={omanisationTarget ? `${omanisationTarget}%` : "Not set"} icon={BarChart3} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
