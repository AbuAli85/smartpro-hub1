/**
 * CompanySettingsPage
 *
 * Allows the company admin/owner to edit the active company's profile:
 * name (EN + AR), industry, country, city, address, phone, email, website,
 * registration number, tax number, and description.
 *
 * Uses the active company from ActiveCompanyContext so it always edits
 * the currently-selected company.
 */
import React, { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Building2,
  Globe,
  Phone,
  Mail,
  MapPin,
  FileText,
  Save,
  AlertCircle,
  CheckCircle2,
  Briefcase,
  Hash,
} from "lucide-react";

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

const COUNTRIES = [
  { code: "OM", name: "Oman" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "KW", name: "Kuwait" },
  { code: "BH", name: "Bahrain" },
  { code: "QA", name: "Qatar" },
  { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" },
  { code: "PH", name: "Philippines" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
];

export default function CompanySettingsPage() {
  const { activeCompany, loading: companyLoading } = useActiveCompany();

  // Fetch full company details
  const { data: companyData, isLoading: detailsLoading, refetch } = trpc.companies.getById.useQuery(
    { id: activeCompany?.id ?? 0 },
    { enabled: Boolean(activeCompany?.id) }
  );

  const updateMutation = trpc.companies.updateMyCompany.useMutation({
    onSuccess: () => {
      toast.success("Company profile updated successfully");
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update company profile");
    },
  });

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
    taxNumber: "",
    description: "",
  });

  // Populate form when company data loads
  useEffect(() => {
    if (!companyData) return;
    const c = companyData as any;
    setForm({
      name: c.name ?? "",
      nameAr: c.nameAr ?? "",
      industry: c.industry ?? "",
      country: c.country ?? "OM",
      city: c.city ?? "",
      address: c.address ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      website: c.website ?? "",
      registrationNumber: c.registrationNumber ?? "",
      taxNumber: c.taxNumber ?? "",
      description: c.description ?? "",
    });
  }, [companyData]);

  const handleSave = () => {
    if (!activeCompany?.id) return;
    const payload: Record<string, string> = {};
    Object.entries(form).forEach(([k, v]) => {
      if (v !== "") payload[k] = v;
    });
    updateMutation.mutate({ companyId: activeCompany.id, ...payload } as any);
  };

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  if (companyLoading || detailsLoading) {
    return (
      <div className="p-8 space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-4 bg-muted rounded w-64" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  if (!activeCompany) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="mx-auto mb-3 text-muted-foreground" size={40} />
        <p className="text-muted-foreground">No company selected. Please select a company first.</p>
      </div>
    );
  }

  const canEdit = ["owner", "company_admin", "hr_admin"].includes(activeCompany.role ?? "");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 size={22} className="text-primary" />
            Company Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage the profile and details for{" "}
            <span className="font-medium text-foreground">{activeCompany.name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={canEdit ? "default" : "secondary"}>
            {canEdit ? (
              <>
                <CheckCircle2 size={12} className="mr-1" /> Can Edit
              </>
            ) : (
              "View Only"
            )}
          </Badge>
        </div>
      </div>

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 size={16} /> Basic Information
          </CardTitle>
          <CardDescription>Company name, industry, and description</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Company Name (English) *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Falcon Eye Modern Investments"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nameAr">Company Name (Arabic)</Label>
              <Input
                id="nameAr"
                value={form.nameAr}
                onChange={(e) => set("nameAr", e.target.value)}
                placeholder="اسم الشركة بالعربية"
                dir="rtl"
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="industry">
              <Briefcase size={13} className="inline mr-1" />
              Industry
            </Label>
            <Select
              value={form.industry}
              onValueChange={(v) => set("industry", v)}
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select industry..." />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((ind) => (
                  <SelectItem key={ind} value={ind}>
                    {ind}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Brief description of the company's business activities..."
              rows={3}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      {/* Location */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin size={16} /> Location
          </CardTitle>
          <CardDescription>Country, city, and address</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Select
                value={form.country}
                onValueChange={(v) => set("country", v)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City / Governorate</Label>
              <Input
                id="city"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder="e.g. Muscat, Sohar, Salalah"
                disabled={!canEdit}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Full Address</Label>
            <Textarea
              id="address"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Building number, street, area..."
              rows={2}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Phone size={16} /> Contact Details
          </CardTitle>
          <CardDescription>Phone, email, and website</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">
                <Phone size={12} className="inline mr-1" />
                Phone
              </Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+968 2412 3456"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">
                <Mail size={12} className="inline mr-1" />
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="info@company.om"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="website">
                <Globe size={12} className="inline mr-1" />
                Website
              </Label>
              <Input
                id="website"
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
                placeholder="https://www.company.om"
                disabled={!canEdit}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legal & Registration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText size={16} /> Legal & Registration
          </CardTitle>
          <CardDescription>Commercial registration, tax, and official numbers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="registrationNumber">
                <Hash size={12} className="inline mr-1" />
                Commercial Registration (CR) Number
              </Label>
              <Input
                id="registrationNumber"
                value={form.registrationNumber}
                onChange={(e) => set("registrationNumber", e.target.value)}
                placeholder="e.g. 1234567"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="taxNumber">
                <Hash size={12} className="inline mr-1" />
                Tax / VAT Number
              </Label>
              <Input
                id="taxNumber"
                value={form.taxNumber}
                onChange={(e) => set("taxNumber", e.target.value)}
                placeholder="e.g. OM1234567890"
                disabled={!canEdit}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      {canEdit && (
        <div className="flex justify-end gap-3 pt-2">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="gap-2"
          >
            <Save size={15} />
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}

      {!canEdit && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-muted/50 text-muted-foreground text-sm">
          <AlertCircle size={16} />
          You have view-only access. Contact your company admin to make changes.
        </div>
      )}
    </div>
  );
}
