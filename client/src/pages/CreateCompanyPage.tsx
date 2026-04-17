/**
 * CreateCompanyPage
 *
 * A clean, blank form for creating a new company.
 * Accessible from the Company Switcher "+ Add another company" link.
 * After creation, the new company is auto-selected in the switcher.
 */
import { useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Building2, ArrowLeft, Loader2, Globe, Phone, Mail,
  MapPin, Hash, FileText, Briefcase, CheckCircle2
} from "lucide-react";

// ─── Comprehensive Industry List ──────────────────────────────────────────────
const INDUSTRIES = [
  // Investment & Finance
  "Investment & Asset Management",
  "Banking & Financial Services",
  "Insurance",
  "Accounting & Auditing",
  "Financial Consulting",
  // Real Estate & Construction
  "Real Estate",
  "Construction & Contracting",
  "Architecture & Engineering",
  "Interior Design & Fit-Out",
  "Facilities Management",
  // Oil, Gas & Energy
  "Oil & Gas",
  "Energy & Utilities",
  "Renewable Energy",
  "Mining & Quarrying",
  // Technology & Telecom
  "Information Technology (IT)",
  "Telecommunications",
  "Software Development",
  "Cybersecurity",
  "Digital Media & Marketing",
  // Trade & Commerce
  "Retail & E-Commerce",
  "Import & Export",
  "Trading & Distribution",
  "Wholesale",
  "Automotive & Vehicles",
  // Services
  "Cleaning & Facility Services",
  "Security Services",
  "Maintenance & Repair",
  "Catering & Food Services",
  "Laundry & Dry Cleaning",
  "Printing & Packaging",
  // Hospitality & Tourism
  "Hospitality & Hotels",
  "Tourism & Travel",
  "Restaurants & Cafes",
  "Events & Entertainment",
  // Healthcare & Education
  "Healthcare & Medical",
  "Pharmaceuticals",
  "Education & Training",
  "Childcare & Nurseries",
  // Transport & Logistics
  "Transport & Logistics",
  "Shipping & Freight",
  "Aviation",
  "Maritime",
  // Manufacturing & Industry
  "Manufacturing",
  "Food & Beverage Production",
  "Textile & Garments",
  "Furniture & Woodwork",
  "Jewelry & Accessories",
  "Cosmetics & Perfume",
  // Agriculture & Environment
  "Agriculture & Farming",
  "Fishing & Aquaculture",
  "Environmental Services",
  "Waste Management",
  // Professional Services
  "Legal Services",
  "Management Consulting",
  "HR & Recruitment",
  "Public Relations",
  "Research & Development",
  // Government & Non-Profit
  "Government & Public Sector",
  "Non-Profit & NGO",
  "Social Services",
  // Other
  "Other",
];

// ─── Country List (GCC + Common) ─────────────────────────────────────────────
const COUNTRIES = [
  { code: "OM", name: "Oman" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "KW", name: "Kuwait" },
  { code: "QA", name: "Qatar" },
  { code: "BH", name: "Bahrain" },
  { code: "JO", name: "Jordan" },
  { code: "EG", name: "Egypt" },
  { code: "LB", name: "Lebanon" },
  { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" },
  { code: "PH", name: "Philippines" },
  { code: "BD", name: "Bangladesh" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "OTHER", name: "Other" },
];

function parseSafeClientReturn(search: string): string | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const q = new URLSearchParams(raw);
  const r = q.get("return");
  if (!r || !r.startsWith("/") || r.startsWith("//")) return null;
  if (r === "/client" || r.startsWith("/client/")) return r;
  return null;
}

export default function CreateCompanyPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const returnToClient = useMemo(() => parseSafeClientReturn(search), [search]);
  const utils = trpc.useUtils();

  const [form, setForm] = useState({
    name: "",
    nameAr: "",
    industry: "",
    country: "OM",
    city: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    registrationNumber: "",
    description: "",
  });

  const [created, setCreated] = useState<{ id: number; name: string } | null>(null);

  const createMutation = trpc.companies.create.useMutation({
    onSuccess: (data) => {
      setCreated({ id: data.id, name: form.name });
      // Invalidate the companies list so the switcher refreshes
      utils.companies.myCompanies.invalidate();
      utils.companies.myCompany.invalidate();
      // Save the new company ID to localStorage so it auto-selects
      localStorage.setItem("smartpro_active_company_id", String(data.id));
      toast.success(`Company "${form.name}" created successfully!`);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create company");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Company name is required");
      return;
    }
    createMutation.mutate({
      name: form.name.trim(),
      nameAr: form.nameAr.trim() || undefined,
      industry: form.industry || undefined,
      country: form.country,
      city: form.city.trim() || undefined,
      address: form.address.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      website: form.website.trim() || undefined,
      registrationNumber: form.registrationNumber.trim() || undefined,
    });
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // ── Success State ────────────────────────────────────────────────────────────
  if (created) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-10 pb-8 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{created.name}</h2>
              <p className="text-muted-foreground text-sm mt-1">Company created successfully</p>
            </div>
            <p className="text-sm text-muted-foreground">
              You are now the Admin of this company. You can start adding employees,
              setting up payroll, and managing HR from the dashboard.
            </p>
            <div className="flex gap-3 mt-2 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() =>
                  navigate(returnToClient ? `${returnToClient}${returnToClient.includes("?") ? "&" : "?"}welcome=1` : "/dashboard")
                }
              >
                {returnToClient ? "Go to workspace" : "Go to Dashboard"}
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={() => {
                  setCreated(null);
                  setForm({
                    name: "", nameAr: "", industry: "", country: "OM",
                    city: "", address: "", phone: "", email: "", website: "",
                    registrationNumber: "", description: "",
                  });
                }}
              >
                Add Another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1 as any)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-red-600" />
            <span className="font-semibold text-foreground">Add New Company</span>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Create a New Company</h1>
          <p className="text-muted-foreground mt-1">
            Set up a new company workspace. You will be the Admin and can invite your team after creation.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 size={16} className="text-red-600" />
                Basic Information
              </CardTitle>
              <CardDescription>Company name and identity details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Company Name (English) <span className="text-red-500">*</span></Label>
                  <Input
                    id="name"
                    placeholder="e.g. Falcon Eye Modern Investments"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nameAr">Company Name (Arabic)</Label>
                  <Input
                    id="nameAr"
                    placeholder="اسم الشركة بالعربية"
                    dir="rtl"
                    value={form.nameAr}
                    onChange={(e) => update("nameAr", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="industry">Industry / Business Sector</Label>
                <Select value={form.industry} onValueChange={(v) => update("industry", v)}>
                  <SelectTrigger id="industry">
                    <SelectValue placeholder="Select your industry..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {INDUSTRIES.map((ind) => (
                      <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin size={16} className="text-red-600" />
                Location
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="country">Country</Label>
                  <Select value={form.country} onValueChange={(v) => update("country", v)}>
                    <SelectTrigger id="country">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="city">City / Governorate</Label>
                  <Input
                    id="city"
                    placeholder="e.g. Muscat, Salalah, Sohar"
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address">Full Address</Label>
                <Input
                  id="address"
                  placeholder="Street, Building, P.O. Box"
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Phone size={16} className="text-red-600" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    placeholder="+968 XXXX XXXX"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Company Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="info@company.com"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  placeholder="https://www.company.com"
                  value={form.website}
                  onChange={(e) => update("website", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Registration */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Hash size={16} className="text-red-600" />
                Registration Details
              </CardTitle>
              <CardDescription>Optional — you can add these later in Company Settings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                <Label htmlFor="registrationNumber">Commercial Registration (CR) Number</Label>
                <Input
                  id="registrationNumber"
                  placeholder="e.g. 1345155"
                  value={form.registrationNumber}
                  onChange={(e) => update("registrationNumber", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(-1 as any)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !form.name.trim()}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Building2 size={16} className="mr-2" />
                  Create Company
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
