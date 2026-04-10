import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Building2, CheckCircle,
  DollarSign, Calendar, Search, X, Shield, Globe, Phone, Mail,
  Clock, MapPin, Save, Users, Loader2, UserMinus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Link } from "wouter";
import { fmtDateTime } from "@/lib/dateUtils";

const SERVICE_TYPES = [
  { value: "work_permit", label: "Work Permit" },
  { value: "work_permit_renewal", label: "Work Permit Renewal" },
  { value: "work_permit_cancellation", label: "Work Permit Cancellation" },
  { value: "labor_card", label: "Labour Card" },
  { value: "labor_card_renewal", label: "Labour Card Renewal" },
  { value: "residence_visa", label: "Residence Visa" },
  { value: "residence_visa_renewal", label: "Residence Visa Renewal" },
  { value: "visit_visa", label: "Visit Visa" },
  { value: "exit_reentry", label: "Exit/Re-entry Permit" },
  { value: "commercial_registration", label: "Commercial Registration" },
  { value: "commercial_registration_renewal", label: "Commercial Registration Renewal" },
  { value: "business_license", label: "Commercial Registration (Licence)" },
  { value: "document_typing", label: "Document Typing" },
  { value: "document_translation", label: "Document Translation" },
  { value: "document_attestation", label: "Document Attestation" },
  { value: "pasi_registration", label: "PASI Registration" },
  { value: "omanisation_report", label: "Omanisation Report" },
  { value: "other", label: "Other" },
];

const PROVIDER_TYPES = [
  { value: "pro_office", label: "PRO Office" },
  { value: "typing_centre", label: "Typing Centre" },
  { value: "admin_bureau", label: "Admin Bureau" },
  { value: "legal_services", label: "Legal Services" },
  { value: "attestation", label: "Attestation" },
  { value: "visa_services", label: "Visa Services" },
  { value: "business_setup", label: "Business Setup" },
  { value: "other", label: "Other" },
];

const GOVERNORATES = [
  "Muscat","Dhofar","Musandam","Al Buraimi","Ad Dakhiliyah",
  "Al Batinah North","Al Batinah South","Ash Sharqiyah North",
  "Ash Sharqiyah South","Ad Dhahirah","Al Wusta",
];

function governorateSelectValue(g: string): string {
  const t = g.trim();
  return t === "" ? "__none__" : t;
}

const EMPTY_CATALOGUE_FORM = {
  serviceName: "", serviceNameAr: "", serviceType: "",
  priceOmr: "", processingDays: "3",
  description: "", descriptionAr: "",
};

const EMPTY_PROFILE_FORM = {
  name: "", nameAr: "", providerType: "pro_office",
  description: "", descriptionAr: "",
  licenseNumber: "", city: "", governorate: "",
  location: "", phone: "", email: "", website: "",
  contactPerson: "", openingHours: "", languages: "Arabic,English",
  responseTimeHours: "24", isPublicListed: "1",
};

function mapOfficeToProfileForm(data: Record<string, unknown>) {
  return {
    name: String(data.name ?? ""),
    nameAr: String(data.nameAr ?? ""),
    providerType: String(data.providerType ?? "pro_office"),
    description: String(data.description ?? ""),
    descriptionAr: String(data.descriptionAr ?? ""),
    licenseNumber: String(data.licenseNumber ?? ""),
    city: String(data.city ?? ""),
    governorate: String(data.governorate ?? ""),
    location: String(data.location ?? ""),
    phone: String(data.phone ?? ""),
    email: String(data.email ?? ""),
    website: String(data.website ?? ""),
    contactPerson: String(data.contactPerson ?? ""),
    openingHours: String(data.openingHours ?? ""),
    languages: String(data.languages ?? "Arabic,English"),
    responseTimeHours: String(data.responseTimeHours ?? 24),
    isPublicListed: String(Number(data.isPublicListed ?? 0) === 1 ? "1" : "0"),
  };
}

export default function SanadCatalogueAdminPage() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_CATALOGUE_FORM });
  const [profileForm, setProfileForm] = useState({ ...EMPTY_PROFILE_FORM });
  /** Hydrate local profile form once per office id (avoid overwriting edits on refetch). */
  const hydratedOfficeIdRef = useRef<number | null>(null);

  // Fetch the company's own Sanad office profile
  const {
    data: myOffice,
    isLoading: officeLoading,
    error: officeError,
  } = trpc.sanad.getMyOfficeProfile.useQuery(undefined);

  useEffect(() => {
    if (!myOffice?.id) return;
    if (hydratedOfficeIdRef.current === myOffice.id) return;
    hydratedOfficeIdRef.current = myOffice.id;
    setProfileForm(mapOfficeToProfileForm(myOffice as unknown as Record<string, unknown>));
  }, [myOffice]);

  const { data: catalogue = [], isLoading: catalogueLoading } = trpc.sanad.getServiceCatalogue.useQuery(
    { officeId: myOffice?.id ?? 0 },
    { enabled: !!myOffice?.id }
  );

  const { data: goLiveReadiness } = trpc.sanad.officeGoLiveReadiness.useQuery(
    { officeId: myOffice?.id ?? 0 },
    { enabled: !!myOffice?.id },
  );

  const saveProfileMutation = trpc.sanad.upsertOfficeProfile.useMutation({
    onSuccess: async () => {
      toast.success("Profile saved successfully.");
      await utils.sanad.getMyOfficeProfile.invalidate();
      const fresh = await utils.sanad.getMyOfficeProfile.fetch(undefined);
      if (fresh) {
        setProfileForm(mapOfficeToProfileForm(fresh as unknown as Record<string, unknown>));
      }
      await utils.sanad.officeGoLiveReadiness.invalidate();
      void utils.sanad.listProviders.invalidate();
      void utils.sanad.partnerOnboardingWorkspace.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const addMutation = trpc.sanad.addCatalogueItem.useMutation({
    onSuccess: () => {
      toast.success("Service added to catalogue.");
      void utils.sanad.getServiceCatalogue.invalidate();
      void utils.sanad.officeGoLiveReadiness.invalidate();
      void utils.sanad.partnerOnboardingWorkspace.invalidate();
      setAddOpen(false);
      setForm({ ...EMPTY_CATALOGUE_FORM });
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.sanad.updateCatalogueItem.useMutation({
    onSuccess: () => {
      toast.success("Service updated.");
      void utils.sanad.getServiceCatalogue.invalidate();
      void utils.sanad.officeGoLiveReadiness.invalidate();
      void utils.sanad.partnerOnboardingWorkspace.invalidate();
      setEditItem(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleMutation = trpc.sanad.toggleCatalogueItem.useMutation({
    onSuccess: () => {
      void utils.sanad.getServiceCatalogue.invalidate();
      void utils.sanad.officeGoLiveReadiness.invalidate();
      void utils.sanad.partnerOnboardingWorkspace.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.sanad.deleteCatalogueItem.useMutation({
    onSuccess: () => {
      toast.success("Service removed.");
      void utils.sanad.getServiceCatalogue.invalidate();
      void utils.sanad.officeGoLiveReadiness.invalidate();
      void utils.sanad.partnerOnboardingWorkspace.invalidate();
      setDeleteId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const filtered = catalogue.filter((c) =>
    !search ||
    c.serviceName.toLowerCase().includes(search.toLowerCase()) ||
    (c.serviceNameAr ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = () => {
    if (!form.serviceName || !form.serviceType || !form.priceOmr) {
      toast.error("Service name, type, and price are required.");
      return;
    }
    addMutation.mutate({
      officeId: myOffice?.id ?? 0,
      serviceName: form.serviceName,
      serviceNameAr: form.serviceNameAr || undefined,
      serviceType: form.serviceType,
      priceOmr: form.priceOmr,
      processingDays: Number(form.processingDays),
      description: form.description || undefined,
      descriptionAr: form.descriptionAr || undefined,
    });
  };

  const handleUpdate = () => {
    if (!editItem) return;
    updateMutation.mutate({
      id: editItem.id,
      serviceName: editItem.serviceName,
      serviceNameAr: editItem.serviceNameAr || undefined,
      serviceType: editItem.serviceType,
      priceOmr: String(editItem.priceOmr),
      processingDays: Number(editItem.processingDays),
      description: editItem.description || undefined,
      descriptionAr: editItem.descriptionAr || undefined,
    });
  };

  const handleSaveProfile = () => {
    if (!myOffice?.id) {
      toast.error("No SANAD office is linked to your account yet.");
      return;
    }
    if (!profileForm.name || !profileForm.providerType) {
      toast.error("Centre name and type are required.");
      return;
    }
    saveProfileMutation.mutate({
      officeId: myOffice.id,
      name: profileForm.name,
      nameAr: profileForm.nameAr || undefined,
      providerType: profileForm.providerType as any,
      description: profileForm.description || undefined,
      descriptionAr: profileForm.descriptionAr || undefined,
      licenseNumber: profileForm.licenseNumber || undefined,
      city: profileForm.city || undefined,
      governorate: profileForm.governorate || undefined,
      location: profileForm.location || undefined,
      phone: profileForm.phone || undefined,
      email: profileForm.email || undefined,
      website: profileForm.website || undefined,
      contactPerson: profileForm.contactPerson || undefined,
      openingHours: profileForm.openingHours || undefined,
      languages: profileForm.languages || undefined,
      responseTimeHours: Number(profileForm.responseTimeHours) || 24,
      isPublicListed: profileForm.isPublicListed === "1" ? 1 : 0,
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Sanad Centre Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your public profile and services catalogue on the SmartPRO marketplace.
          </p>
        </div>
        {myOffice && (
          <div className="flex flex-wrap items-center gap-2">
            {(myOffice as any).isPublicListed === 1 ? (
              <Badge className="bg-green-100 text-green-700 border-green-200">
                <CheckCircle className="h-3 w-3 mr-1" /> Listed
              </Badge>
            ) : (
              <Badge variant="secondary">Not Listed</Badge>
            )}
          </div>
        )}
      </div>

      {officeLoading && (
        <div className="space-y-4 max-w-4xl">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {!officeLoading && !myOffice && (
        <Card className="mb-6 border-dashed max-w-4xl">
          <CardContent className="py-8 text-center space-y-3">
            {officeError ? (
              <p className="text-sm text-destructive">{officeError.message}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  No SANAD office is linked to your SmartPRO account yet. Use partner onboarding after your invite, or ask SmartPRO
                  operations to connect your centre.
                </p>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/sanad/partner-onboarding">Open partner onboarding</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {myOffice && (
      <>
      <Tabs defaultValue="profile">
        <TabsList className="mb-6">
          <TabsTrigger value="profile">Centre Profile</TabsTrigger>
          <TabsTrigger value="team" className="gap-1">
            <Users className="h-3.5 w-3.5" />
            Team
          </TabsTrigger>
          <TabsTrigger value="catalogue">
            Services Catalogue
            {catalogue.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{catalogue.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="requests">Service Requests</TabsTrigger>
        </TabsList>

        {/* ── PROFILE TAB ── */}
        <TabsContent value="profile">
            <div className="space-y-6">
              {goLiveReadiness && (
                <Card className="border-dashed">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-primary" /> Marketplace readiness
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    {(myOffice as { isPublicListed?: number })?.isPublicListed === 1 ? (
                      goLiveReadiness.marketplaceAsListed.ready ? (
                        <p className="text-emerald-700 dark:text-emerald-400">Your centre meets the public marketplace bar.</p>
                      ) : (
                        <div>
                          <p className="text-amber-800 dark:text-amber-200 text-xs font-medium mb-1">
                            Listed offices must stay discoverable — fix the following:
                          </p>
                          <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                            {goLiveReadiness.marketplaceAsListed.reasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )
                    ) : goLiveReadiness.goLiveReadiness.ready ? (
                      <p className="text-emerald-700 dark:text-emerald-400">
                        You can turn on marketplace listing when you are ready (toggle below).
                      </p>
                    ) : (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Before going public, complete:</p>
                        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                          {goLiveReadiness.goLiveReadiness.reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Active catalogue items:{" "}
                      <span className="font-medium tabular-nums">{goLiveReadiness.activeCatalogueCount}</span>
                    </p>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Building2 className="h-4 w-4" /> Basic Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Centre Name (English) *</Label>
                      <Input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} placeholder="Al Noor PRO Services" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Centre Name (Arabic)</Label>
                      <Input value={profileForm.nameAr} onChange={(e) => setProfileForm({ ...profileForm, nameAr: e.target.value })} placeholder="خدمات النور للعلاقات العامة" dir="rtl" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Provider Type *</Label>
                      <Select value={profileForm.providerType} onValueChange={(v) => setProfileForm({ ...profileForm, providerType: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PROVIDER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Licence Number</Label>
                      <Input value={profileForm.licenseNumber} onChange={(e) => setProfileForm({ ...profileForm, licenseNumber: e.target.value })} placeholder="MoCIIP-XXXXX" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description (English)</Label>
                    <Textarea value={profileForm.description} onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })} rows={3} placeholder="Describe your centre's expertise and experience…" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description (Arabic)</Label>
                    <Textarea value={profileForm.descriptionAr} onChange={(e) => setProfileForm({ ...profileForm, descriptionAr: e.target.value })} rows={3} dir="rtl" placeholder="وصف مركزكم بالعربية…" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <MapPin className="h-4 w-4" /> Location &amp; Contact
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>City</Label>
                      <Input value={profileForm.city} onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })} placeholder="Muscat" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Governorate</Label>
                      <Select
                        value={governorateSelectValue(profileForm.governorate)}
                        onValueChange={(v) =>
                          setProfileForm({ ...profileForm, governorate: v === "__none__" ? "" : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select governorate" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Not selected —</SelectItem>
                          {profileForm.governorate.trim() !== "" &&
                            !GOVERNORATES.includes(profileForm.governorate.trim()) && (
                              <SelectItem value={profileForm.governorate.trim()}>
                                {profileForm.governorate.trim()} (saved value)
                              </SelectItem>
                            )}
                          {GOVERNORATES.map((g) => (
                            <SelectItem key={g} value={g}>
                              {g}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Full Address</Label>
                    <Input value={profileForm.location} onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })} placeholder="Building, Street, Area" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label><Phone className="h-3.5 w-3.5 inline mr-1" />Phone</Label>
                      <Input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="+968 XXXX XXXX" />
                    </div>
                    <div className="space-y-1.5">
                      <Label><Mail className="h-3.5 w-3.5 inline mr-1" />Email</Label>
                      <Input type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} placeholder="info@centre.om" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label><Globe className="h-3.5 w-3.5 inline mr-1" />Website</Label>
                      <Input value={profileForm.website} onChange={(e) => setProfileForm({ ...profileForm, website: e.target.value })} placeholder="https://yourcentre.om" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Contact Person</Label>
                      <Input value={profileForm.contactPerson} onChange={(e) => setProfileForm({ ...profileForm, contactPerson: e.target.value })} placeholder="Manager name" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label><Clock className="h-3.5 w-3.5 inline mr-1" />Opening Hours</Label>
                      <Input value={profileForm.openingHours} onChange={(e) => setProfileForm({ ...profileForm, openingHours: e.target.value })} placeholder="Sun–Thu 8am–5pm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Response Time (hours)</Label>
                      <Input type="number" min={1} max={72} value={profileForm.responseTimeHours} onChange={(e) => setProfileForm({ ...profileForm, responseTimeHours: e.target.value })} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Shield className="h-4 w-4" /> Marketplace Visibility
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="text-sm font-medium">List on Public Marketplace</p>
                      <p className="text-xs text-muted-foreground">Allow companies to find and contact your centre through the SmartPRO marketplace</p>
                    </div>
                    <Select value={profileForm.isPublicListed} onValueChange={(v) => setProfileForm({ ...profileForm, isPublicListed: v })}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Listed</SelectItem>
                        <SelectItem value="0">Hidden</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} disabled={saveProfileMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
                  <Save className="h-4 w-4 mr-2" />
                  {saveProfileMutation.isPending ? "Saving…" : "Save Profile"}
                </Button>
              </div>
            </div>
        </TabsContent>

        <TabsContent value="team">
          <OfficeTeamTab officeId={myOffice?.id} />
        </TabsContent>

        {/* ── CATALOGUE TAB ── */}
        <TabsContent value="catalogue">
          <div className="flex items-center justify-between mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search services…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-8" />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button onClick={() => setAddOpen(true)} className="bg-red-600 hover:bg-red-700 text-white">
              <Plus className="h-4 w-4 mr-2" /> Add Service
            </Button>
          </div>

          {catalogueLoading ? (
            <div className="space-y-3">
              {[1,2,3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 border rounded-xl">
              <DollarSign className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <h3 className="font-semibold mb-1">No services yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Add your services and pricing to attract clients on the marketplace.</p>
              <Button onClick={() => setAddOpen(true)} className="bg-red-600 hover:bg-red-700 text-white">
                <Plus className="h-4 w-4 mr-2" /> Add First Service
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((item) => (
                <div key={item.id} className={`flex items-start justify-between gap-3 p-4 rounded-lg border transition-colors ${item.isActive ? "bg-background" : "bg-muted/30 opacity-60"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-sm">{item.serviceName}</p>
                      {!item.isActive && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                    </div>
                    {item.serviceNameAr && <p className="text-xs text-muted-foreground" dir="rtl">{item.serviceNameAr}</p>}
                    {item.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{item.description}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      <Badge variant="outline" className="text-xs">
                        {SERVICE_TYPES.find((s) => s.value === item.serviceType)?.label ?? item.serviceType}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />{item.processingDays}d
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right mr-2">
                      <p className="text-sm font-semibold">OMR {Number(item.priceOmr).toFixed(3)}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleMutation.mutate({ id: item.id, isActive: !item.isActive })} aria-label={item.isActive ? "Deactivate item" : "Activate item"}>
                      {item.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditItem({ ...item })} aria-label="Edit catalogue item">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(item.id)} aria-label="Delete catalogue item">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── REQUESTS TAB ── */}
        <TabsContent value="requests">
          <ServiceRequestsTab officeId={myOffice?.id} />
        </TabsContent>
      </Tabs>

      {/* Add Service Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Service to Catalogue</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Service Name (EN) *</Label>
                <Input value={form.serviceName} onChange={(e) => setForm({ ...form, serviceName: e.target.value })} placeholder="Work Permit Renewal" />
              </div>
              <div className="space-y-1.5">
                <Label>Service Name (AR)</Label>
                <Input value={form.serviceNameAr} onChange={(e) => setForm({ ...form, serviceNameAr: e.target.value })} dir="rtl" placeholder="تجديد تصريح العمل" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Service Type *</Label>
                <Select
                  value={form.serviceType.trim() === "" ? "__none__" : form.serviceType}
                  onValueChange={(v) => setForm({ ...form, serviceType: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Select type —</SelectItem>
                    {SERVICE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Price (OMR) *</Label>
                <Input type="number" step="0.001" min="0" value={form.priceOmr} onChange={(e) => setForm({ ...form, priceOmr: e.target.value })} placeholder="25.000" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Processing Time (working days)</Label>
              <Input type="number" min={1} max={90} value={form.processingDays} onChange={(e) => setForm({ ...form, processingDays: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What's included in this service…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {addMutation.isPending ? "Adding…" : "Add Service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Service Dialog */}
      {editItem && (
        <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Edit Service</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Service Name (EN) *</Label>
                  <Input value={editItem.serviceName} onChange={(e) => setEditItem({ ...editItem, serviceName: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Service Name (AR)</Label>
                  <Input value={editItem.serviceNameAr ?? ""} onChange={(e) => setEditItem({ ...editItem, serviceNameAr: e.target.value })} dir="rtl" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Service Type *</Label>
                  <Select value={editItem.serviceType} onValueChange={(v) => setEditItem({ ...editItem, serviceType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Price (OMR) *</Label>
                  <Input type="number" step="0.001" min="0" value={editItem.priceOmr} onChange={(e) => setEditItem({ ...editItem, priceOmr: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Processing Days</Label>
                <Input type="number" min={1} max={90} value={editItem.processingDays} onChange={(e) => setEditItem({ ...editItem, processingDays: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea rows={2} value={editItem.description ?? ""} onChange={(e) => setEditItem({ ...editItem, description: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
                {updateMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Service</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the service from your catalogue. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
      )}
    </div>
  );
}

function OfficeTeamTab({ officeId }: { officeId?: number }) {
  const utils = trpc.useUtils();
  const [userSearch, setUserSearch] = useState("");
  const [pickUserId, setPickUserId] = useState<number | null>(null);
  const [newRole, setNewRole] = useState<"owner" | "manager" | "staff">("staff");

  const members = trpc.sanad.listSanadOfficeMembers.useQuery(
    { officeId: officeId ?? 0 },
    { enabled: !!officeId },
  );
  const searchUsers = trpc.sanad.searchUsersForSanadRoster.useQuery(
    { query: userSearch.trim(), officeId: officeId ?? undefined },
    { enabled: !!officeId && userSearch.trim().length >= 2 },
  );

  const addMember = trpc.sanad.addSanadOfficeMember.useMutation({
    onSuccess: () => {
      toast.success("Team member added");
      setUserSearch("");
      setPickUserId(null);
      void members.refetch();
      void utils.sanad.partnerOnboardingWorkspace.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMember = trpc.sanad.removeSanadOfficeMember.useMutation({
    onSuccess: () => {
      toast.success("Access removed");
      void members.refetch();
      void utils.sanad.partnerOnboardingWorkspace.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateRole = trpc.sanad.updateSanadOfficeMemberRole.useMutation({
    onSuccess: () => {
      void members.refetch();
      void utils.sanad.partnerOnboardingWorkspace.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!officeId) {
    return (
      <p className="text-sm text-muted-foreground border rounded-lg p-6 text-center">
        No office loaded. Complete SANAD onboarding to manage team access.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" /> Add people by SmartPRO account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Search by name or email, pick a user, choose a role, then add. Only owners can add other owners; platform admins can assign owners.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Search name or email…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="flex-1"
            />
            <Select value={newRole} onValueChange={(v) => setNewRole(v as typeof newRole)}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              disabled={pickUserId == null || addMember.isPending}
              onClick={() => pickUserId != null && addMember.mutate({ officeId, userId: pickUserId, role: newRole })}
            >
              {addMember.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add member"}
            </Button>
          </div>
          {searchUsers.isFetching ? (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </p>
          ) : searchUsers.data && searchUsers.data.length > 0 ? (
            <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
              {searchUsers.data.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/60 ${pickUserId === u.id ? "bg-muted" : ""}`}
                  onClick={() => setPickUserId(u.id)}
                >
                  <span className="font-medium">{u.name ?? "—"}</span>
                  <span className="text-muted-foreground text-xs block">{u.email}</span>
                </button>
              ))}
            </div>
          ) : userSearch.trim().length >= 2 ? (
            <p className="text-xs text-muted-foreground">No users match.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Current access</CardTitle>
        </CardHeader>
        <CardContent>
          {members.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !members.data?.length ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <div className="space-y-2">
              {members.data.map((m) => (
                <div
                  key={m.userId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{m.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={m.role}
                      onValueChange={(v) =>
                        updateRole.mutate({ officeId, userId: m.userId, role: v as typeof m.role })
                      }
                    >
                      <SelectTrigger className="h-8 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      aria-label="Remove member"
                      onClick={() => removeMember.mutate({ officeId, userId: m.userId })}
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ServiceRequestsTab({ officeId }: { officeId?: number }) {
  const utils = trpc.useUtils();
  const { data: requests = [], isLoading } = trpc.sanad.listServiceRequests.useQuery(
    { officeId: officeId ?? 0 },
    { enabled: !!officeId }
  );

  const updateStatusMutation = trpc.sanad.updateServiceRequestStatus.useMutation({
    onSuccess: () => utils.sanad.listServiceRequests.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const STATUS_COLORS: Record<string, string> = {
    new: "bg-blue-100 text-blue-700",
    contacted: "bg-amber-100 text-amber-700",
    in_progress: "bg-purple-100 text-purple-700",
    completed: "bg-green-100 text-green-700",
    declined: "bg-red-100 text-red-700",
  };

  if (isLoading) return <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  if (requests.length === 0) {
    return (
      <div className="text-center py-16 border rounded-xl">
        <Mail className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
        <h3 className="font-semibold mb-1">No requests yet</h3>
        <p className="text-sm text-muted-foreground">Service requests from companies will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((req) => (
        <div key={req.id} className="p-4 rounded-lg border space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="font-medium text-sm">{req.contactName}</p>
                <Badge className={`text-xs ${STATUS_COLORS[req.status] ?? ""}`}>{req.status.replace("_", " ")}</Badge>
              </div>
              {req.companyName && <p className="text-xs text-muted-foreground">{req.companyName}{req.companyCr ? ` · CR: ${req.companyCr}` : ""}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                Service: <strong>{req.serviceType.replace(/_/g, " ")}</strong>
                {req.contactPhone && ` · ${req.contactPhone}`}
                {req.contactEmail && ` · ${req.contactEmail}`}
              </p>
              {req.message && <p className="text-xs text-muted-foreground mt-1 italic">"{req.message}"</p>}
            </div>
            <Select
              value={req.status}
              onValueChange={(v) => updateStatusMutation.mutate({ id: req.id, status: v as any })}
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["new","contacted","in_progress","completed","declined"].map((s) => (
                  <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Received: {fmtDateTime(req.createdAt)}
          </p>
        </div>
      ))}
    </div>
  );
}
