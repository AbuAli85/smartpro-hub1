import { useState } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, MapPin, Phone, Mail, Globe, Clock, Shield, CheckCircle,
  Star, Building2, FileText, Briefcase, Scale, Stamp, Users,
  Send, ChevronRight, Calendar, DollarSign, Timer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const PROVIDER_TYPE_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  pro_office:    { label: "PRO Office",     icon: Briefcase },
  typing_centre: { label: "Typing Centre",  icon: FileText  },
  admin_bureau:  { label: "Admin Bureau",   icon: Building2 },
  legal_services:{ label: "Legal Services", icon: Scale     },
  attestation:   { label: "Attestation",    icon: Stamp     },
  visa_services: { label: "Visa Services",  icon: Globe     },
  business_setup:{ label: "Business Setup", icon: Users     },
  other:         { label: "Other",          icon: Building2 },
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  work_permit: "Work Permit",
  work_permit_renewal: "Work Permit Renewal",
  work_permit_cancellation: "Work Permit Cancellation",
  labor_card: "Labour Card",
  labor_card_renewal: "Labour Card Renewal",
  residence_visa: "Residence Visa",
  residence_visa_renewal: "Residence Visa Renewal",
  visit_visa: "Visit Visa",
  exit_reentry: "Exit/Re-entry Permit",
  commercial_registration: "Commercial Registration",
  commercial_registration_renewal: "CR Renewal",
  business_license: "Business Licence",
  document_typing: "Document Typing",
  document_translation: "Document Translation",
  document_attestation: "Document Attestation",
  pasi_registration: "PASI Registration",
  omanisation_report: "Omanisation Report",
  other: "Other",
};

function StarRating({ rating, count }: { rating: number | string | null; count?: number }) {
  const r = Number(rating ?? 0);
  return (
    <div className="flex items-center gap-1">
      {[1,2,3,4,5].map((s) => (
        <Star key={s} className={`h-4 w-4 ${s <= Math.round(r) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
      ))}
      <span className="text-sm text-muted-foreground ml-1">
        {r > 0 ? r.toFixed(1) : "No ratings yet"}
        {count !== undefined && count > 0 ? ` · ${count} reviews` : ""}
      </span>
    </div>
  );
}

interface RequestDialogProps {
  open: boolean;
  onClose: () => void;
  officeId: number;
  officeName: string;
  services: any[];
}

function RequestServiceDialog({ open, onClose, officeId, officeName, services }: RequestDialogProps) {
  const [form, setForm] = useState({
    contactName: "", contactPhone: "", contactEmail: "",
    companyName: "", companyCr: "", serviceType: "",
    serviceCatalogueId: "", message: "",
  });

  const submitMutation = trpc.sanad.submitServiceRequest.useMutation({
    onSuccess: () => {
      toast.success("Request sent! The centre will contact you shortly.");
      onClose();
      setForm({ contactName: "", contactPhone: "", contactEmail: "", companyName: "", companyCr: "", serviceType: "", serviceCatalogueId: "", message: "" });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!form.contactName || !form.contactPhone || !form.serviceType) {
      toast.error("Please fill in your name, phone, and service type.");
      return;
    }
    submitMutation.mutate({
      officeId,
      contactName: form.contactName,
      contactPhone: form.contactPhone,
      contactEmail: form.contactEmail || undefined,
      companyName: form.companyName || undefined,
      companyCr: form.companyCr || undefined,
      serviceType: form.serviceType,
      serviceCatalogueId: form.serviceCatalogueId ? Number(form.serviceCatalogueId) : undefined,
      message: form.message || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Request Service from {officeName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Your Name *</Label>
              <Input placeholder="Full name" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone Number *</Label>
              <Input placeholder="+968 XXXX XXXX" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email (optional)</Label>
            <Input type="email" placeholder="your@email.com" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Company Name</Label>
              <Input placeholder="Your company" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>CR Number</Label>
              <Input placeholder="1234567" value={form.companyCr} onChange={(e) => setForm({ ...form, companyCr: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Service Type *</Label>
            <Select value={form.serviceType} onValueChange={(v) => setForm({ ...form, serviceType: v, serviceCatalogueId: "" })}>
              <SelectTrigger>
                <SelectValue placeholder="Select a service" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {services.length > 0 && form.serviceType && (
            (() => {
              const matching = (services as any[]).filter((s: any) => s.serviceType === form.serviceType && s.isActive);
              return matching.length > 0 ? (
                <div className="space-y-1.5">
                  <Label>Specific Service Package (optional)</Label>
                  <Select value={form.serviceCatalogueId} onValueChange={(v) => setForm({ ...form, serviceCatalogueId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a package" />
                    </SelectTrigger>
                    <SelectContent>
                      {(matching as any[]).map((s: any) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.serviceName} — OMR {Number(s.priceOmr).toFixed(3)} ({s.processingDays}d)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null;
            })()
          )}
          <div className="space-y-1.5">
            <Label>Message (optional)</Label>
            <Textarea placeholder="Describe your requirements…" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
            <Send className="h-4 w-4 mr-2" />
            {submitMutation.isPending ? "Sending…" : "Send Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SanadCentreProfilePage() {
  const { id } = useParams<{ id: string }>();
  const officeId = Number(id);
  const [requestOpen, setRequestOpen] = useState(false);

  const { data: profileData, isLoading } = trpc.sanad.getPublicProfile.useQuery({ officeId }, { enabled: !!officeId });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-48 rounded-xl" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
        <h2 className="text-xl font-semibold mb-2">Centre not found</h2>
        <p className="text-muted-foreground mb-4">This service centre does not exist or is not publicly listed.</p>
        <Link href="/sanad/marketplace">
          <Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Marketplace</Button>
        </Link>
      </div>
    );
  }

  const office = profileData.office;
  const catalogue = profileData.catalogue ?? [];
  const reviews = profileData.reviews ?? [];
  const typeInfo = PROVIDER_TYPE_LABELS[office.providerType] ?? PROVIDER_TYPE_LABELS.other;
  const TypeIcon = typeInfo.icon;
  const services: string[] = Array.isArray((office as any).services) ? (office as any).services : [];
  const activeCatalogue = (catalogue as any[]).filter((c: any) => c.isActive);

  return (
    <div className="min-h-screen bg-background">
      {/* Back nav */}
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <Link href="/sanad/marketplace">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="h-4 w-4" /> Back to Marketplace
          </button>
        </Link>
      </div>

      {/* Hero card */}
      <div className="max-w-4xl mx-auto px-4 mb-6">
        <div className="bg-gradient-to-r from-gray-950 to-gray-800 rounded-2xl p-6 text-white">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
                {office.logoUrl
                  ? <img src={office.logoUrl} alt={office.name} className="h-14 w-14 rounded-xl object-cover" />
                  : <TypeIcon className="h-8 w-8 text-white" />}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl font-bold">{office.name}</h1>
                  {!!(office.isVerified) && (
                    <div className="flex items-center gap-1 bg-green-500/20 border border-green-400/30 rounded-full px-2 py-0.5">
                      <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                      <span className="text-green-300 text-xs">Verified</span>
                    </div>
                  )}
                </div>
                {office.nameAr && <p className="text-white/70 text-sm mb-2" dir="rtl">{office.nameAr}</p>}
                <Badge className="bg-white/10 text-white border-white/20 text-xs">
                  <TypeIcon className="h-3 w-3 mr-1" />
                  {typeInfo.label}
                </Badge>
              </div>
            </div>
            <Button
              onClick={() => setRequestOpen(true)}
              className="bg-red-600 hover:bg-red-700 text-white flex-shrink-0"
            >
              <Send className="h-4 w-4 mr-2" />
              Request Service
            </Button>
          </div>

          {/* Rating & quick stats */}
          <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap gap-6">
            <div>
              <StarRating rating={(office as any).avgRating ?? office.rating} count={(office as any).totalReviews ?? 0} />
            </div>
            {office.totalOrders !== undefined && (
              <div className="flex items-center gap-1.5 text-sm text-gray-300">
                <CheckCircle className="h-4 w-4 text-green-400" />
                {office.totalOrders} orders completed
              </div>
            )}
            {(office as any).responseTimeHours && (
              <div className="flex items-center gap-1.5 text-sm text-gray-300">
                <Timer className="h-4 w-4 text-amber-400" />
                Responds within {(office as any).responseTimeHours}h
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content grid */}
      <div className="max-w-4xl mx-auto px-4 pb-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: contact & info */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(office.governorate || office.city) && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span>{[office.city, office.governorate, office.location].filter(Boolean).join(", ")}</span>
                </div>
              )}
              {office.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a href={`tel:${office.phone}`} className="hover:text-red-600">{office.phone}</a>
                </div>
              )}
              {office.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a href={`mailto:${office.email}`} className="hover:text-red-600 truncate">{office.email}</a>
                </div>
              )}
              {office.website && (
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a href={office.website} target="_blank" rel="noreferrer" className="hover:text-red-600 truncate">{office.website}</a>
                </div>
              )}
              {office.openingHours && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>{office.openingHours}</span>
                </div>
              )}
              {office.contactPerson && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>{office.contactPerson}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {office.licenseNumber && (
            <Card>
              <CardContent className="pt-4 text-sm space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Shield className="h-4 w-4" />
                  <span className="font-medium text-foreground">Licence No.</span>
                </div>
                <p className="font-mono text-xs bg-muted px-2 py-1 rounded">{office.licenseNumber}</p>
              </CardContent>
            </Card>
          )}

          {services.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Services Offered</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {services.map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs">
                      {SERVICE_TYPE_LABELS[s] ?? s}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: description + catalogue */}
        <div className="md:col-span-2 space-y-4">
          {(office.description || (office as any).descriptionAr) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">About This Centre</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-3">
                {office.description && <p>{office.description}</p>}
                {(office as any).descriptionAr && (
                  <p dir="rtl" className="text-right">{(office as any).descriptionAr}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Service catalogue */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Services &amp; Pricing
                {activeCatalogue.length > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">{activeCatalogue.length} services</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeCatalogue.length === 0 ? (
                <p className="text-sm text-muted-foreground">No service packages listed yet. Contact the centre directly for pricing.</p>
              ) : (
                <div className="space-y-3">
                  {(activeCatalogue as any[]).map((item: any) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border hover:border-red-200 hover:bg-red-50/30 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{item.serviceName}</p>
                        {item.serviceNameAr && (
                          <p className="text-xs text-muted-foreground" dir="rtl">{item.serviceNameAr}</p>
                        )}
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {SERVICE_TYPE_LABELS[item.serviceType] ?? item.serviceType}
                          </Badge>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {item.processingDays} working days
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center gap-1 text-sm font-semibold text-foreground">
                          <DollarSign className="h-3.5 w-3.5 text-green-600" />
                          OMR {Number(item.priceOmr).toFixed(3)}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-red-600 mt-1 h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setRequestOpen(true)}
                        >
                          Request <ChevronRight className="h-3 w-3 ml-0.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* CTA */}
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-5 text-white flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold">Ready to get started?</p>
              <p className="text-sm text-gray-300">Send a service request and the centre will contact you within {(office as any).responseTimeHours ?? 24} hours.</p>
            </div>
            <Button onClick={() => setRequestOpen(true)} className="bg-red-600 hover:bg-red-700 text-white flex-shrink-0">
              <Send className="h-4 w-4 mr-2" /> Request Service
            </Button>
          </div>
        </div>
      </div>

      <RequestServiceDialog
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        officeId={officeId}
        officeName={office.name}
        services={catalogue}
      />
    </div>
  );
}
