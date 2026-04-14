import { useState } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, MapPin, Phone, Mail, Globe, Clock, Shield, CheckCircle,
  Star, Building2, FileText, Briefcase, Scale, Stamp, Users,
  Send, ChevronRight, Calendar, DollarSign, Timer, ThumbsUp, MessageSquare, PenLine,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
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
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";

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
  commercial_registration_renewal: "Commercial Registration Renewal",
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
    <div className="flex flex-wrap items-center gap-1">
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
  companyId: number | null;
}

function RequestServiceDialog({ open, onClose, officeId, officeName, services, companyId }: RequestDialogProps) {
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
    if (companyId == null) {
      toast.error("Select a company workspace in the header, then try again.");
      return;
    }
    if (!form.contactName || !form.contactPhone || !form.serviceType) {
      toast.error("Please fill in your name, phone, and service type.");
      return;
    }
    submitMutation.mutate({
      companyId,
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

// ─── Write Review Dialog ─────────────────────────────────────────────────────
function WriteReviewDialog({
  officeId,
  companyId,
  onClose,
  onDone,
}: {
  officeId: number;
  companyId: number | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({ overallRating: 5, speedRating: 4, qualityRating: 4, communicationRating: 4, reviewTitle: "", reviewBody: "" });
  const submit = trpc.ratings.submitRating.useMutation({
    onSuccess: () => { toast.success("Review submitted! Thank you for your feedback."); onDone(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const StarPicker = ({ label, field }: { label: string; field: keyof typeof form }) => (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {[1,2,3,4,5].map(s => (
          <button key={s} type="button" onClick={() => setForm(f => ({ ...f, [field]: s }))}>
            <Star className={`h-5 w-5 transition-colors ${s <= (form[field] as number) ? "fill-amber-400 text-amber-400" : "text-gray-300 hover:text-amber-300"}`} />
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Write a Review</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StarPicker label="Overall" field="overallRating" />
            <StarPicker label="Speed" field="speedRating" />
            <StarPicker label="Quality" field="qualityRating" />
            <StarPicker label="Communication" field="communicationRating" />
          </div>
          <div className="space-y-1.5">
            <Label>Review Title (optional)</Label>
            <Input placeholder="Summarise your experience" value={form.reviewTitle} onChange={e => setForm(f => ({ ...f, reviewTitle: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Your Review (optional)</Label>
            <Textarea placeholder="Describe your experience with this centre..." rows={4} value={form.reviewBody} onChange={e => setForm(f => ({ ...f, reviewBody: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (companyId == null) {
                toast.error("Select a company workspace before submitting a review.");
                return;
              }
              submit.mutate({
                officeId,
                companyId,
                ...form,
                reviewTitle: form.reviewTitle || undefined,
                reviewBody: form.reviewBody || undefined,
              });
            }}
            disabled={submit.isPending || companyId == null}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {submit.isPending ? "Processing..." : "Submit Review"}
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
  const [reviewOpen, setReviewOpen] = useState(false);
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const utils = trpc.useUtils();

  const { data: profileData, isLoading } = trpc.sanad.getPublicProfile.useQuery({ officeId }, { enabled: !!officeId });
  const { data: ratingsData } = trpc.ratings.getOfficeRatings.useQuery({ officeId, limit: 10 }, { enabled: !!officeId });
  const { data: myRating } = trpc.ratings.getMyRating.useQuery(
    { officeId, companyId: activeCompanyId ?? undefined },
    { enabled: !!officeId && !!user && activeCompanyId != null },
  );
  const markHelpful = trpc.ratings.markHelpful.useMutation({ onSuccess: () => utils.ratings.getOfficeRatings.invalidate() });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-48 rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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
                <div className="flex flex-wrap items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a href={`tel:${office.phone}`} className="hover:text-red-600">{office.phone}</a>
                </div>
              )}
              {office.email && (
                <div className="flex flex-wrap items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a href={`mailto:${office.email}`} className="hover:text-red-600 truncate">{office.email}</a>
                </div>
              )}
              {office.website && (
                <div className="flex flex-wrap items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a href={office.website} target="_blank" rel="noreferrer" className="hover:text-red-600 truncate">{office.website}</a>
                </div>
              )}
              {office.openingHours && (
                <div className="flex flex-wrap items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>{office.openingHours}</span>
                </div>
              )}
              {office.contactPerson && (
                <div className="flex flex-wrap items-center gap-2">
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

          {/* Customer Reviews */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Customer Reviews
                  {ratingsData?.total ? <Badge variant="secondary" className="text-xs">{ratingsData.total}</Badge> : null}
                </CardTitle>
                {user && !myRating && (
                  <Button size="sm" variant="outline" onClick={() => setReviewOpen(true)}>
                    <PenLine className="h-3.5 w-3.5 mr-1" /> Write a Review
                  </Button>
                )}
                {myRating && <Badge className="bg-green-100 text-green-700 text-xs">You reviewed this centre</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              {/* Aggregate */}
              {ratingsData?.aggregate && (
                <div className="mb-4 p-3 rounded-lg bg-muted/50 flex flex-wrap gap-4 items-center">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-amber-500">{ratingsData.aggregate.avgOverall?.toFixed(1) ?? "—"}</p>
                    <div className="flex gap-0.5 justify-center mt-0.5">
                      {[1,2,3,4,5].map(s => <Star key={s} className={`h-3.5 w-3.5 ${s <= Math.round(ratingsData.aggregate!.avgOverall ?? 0) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{ratingsData.aggregate.total} reviews</p>
                  </div>
                  <div className="flex-1 space-y-1 min-w-[140px]">
                    {[5,4,3,2,1].map(s => (
                      <div key={s} className="flex flex-wrap items-center gap-2">
                        <span className="text-xs w-4 text-right">{s}</span>
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full" style={{ width: ratingsData.aggregate?.total ? `${((ratingsData.aggregate?.distribution[s as 1|2|3|4|5] ?? 0) / ratingsData.aggregate.total) * 100}%` : "0%" }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-4">{ratingsData.aggregate?.distribution[s as 1|2|3|4|5] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                  {ratingsData.aggregate?.avgSpeed && (
                    <div className="text-xs space-y-1">
                      <p className="text-muted-foreground">Speed: <span className="font-medium text-foreground">{ratingsData.aggregate.avgSpeed?.toFixed(1)}</span></p>
                      {ratingsData.aggregate?.avgQuality && <p className="text-muted-foreground">Quality: <span className="font-medium text-foreground">{ratingsData.aggregate.avgQuality?.toFixed(1)}</span></p>}
                      {ratingsData.aggregate?.avgComm && <p className="text-muted-foreground">Comm: <span className="font-medium text-foreground">{ratingsData.aggregate.avgComm?.toFixed(1)}</span></p>}
                    </div>
                  )}
                </div>
              )}
              {/* Review list */}
              {!ratingsData?.ratings.length ? (
                <div className="text-center py-8">
                  <Star className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No reviews yet. Be the first to review this centre.</p>
                  {user && !myRating && (
                    <Button size="sm" className="mt-3 bg-red-600 hover:bg-red-700 text-white" onClick={() => setReviewOpen(true)}>
                      <PenLine className="h-3.5 w-3.5 mr-1" /> Write a Review
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {ratingsData.ratings.map(r => (
                    <div key={r.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex gap-0.5 mb-1">
                            {[1,2,3,4,5].map(s => <Star key={s} className={`h-3.5 w-3.5 ${s <= r.overallRating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />)}
                          </div>
                          {r.reviewTitle && <p className="font-medium text-sm">{r.reviewTitle}</p>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          {r.isVerified && <Badge className="bg-blue-100 text-blue-700 text-xs mb-1">Verified</Badge>}
                          <p className="text-xs text-muted-foreground">{fmtDate(r.createdAt)}</p>
                        </div>
                      </div>
                      {r.reviewBody && <p className="text-sm text-muted-foreground">{r.reviewBody}</p>}
                      <div className="flex items-center justify-between pt-1">
                        <p className="text-xs text-muted-foreground">— {r.companyName ?? r.reviewerName ?? "Anonymous"}</p>
                        <button
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => markHelpful.mutate({ ratingId: r.id })}
                        >
                          <ThumbsUp className="h-3 w-3" /> {r.helpfulCount > 0 ? r.helpfulCount : "Helpful"}
                        </button>
                      </div>
                      {r.replies.length > 0 && (
                        <div className="mt-2 pl-3 border-l-2 border-muted">
                          {r.replies.map(reply => (
                            <div key={reply.id} className="text-xs">
                              <span className="font-medium">{reply.replierName ?? "Centre"}: </span>
                              <span className="text-muted-foreground">{reply.replyBody}</span>
                            </div>
                          ))}
                        </div>
                      )}
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
        companyId={activeCompanyId}
      />
      {reviewOpen && (
        <WriteReviewDialog
          officeId={officeId}
          companyId={activeCompanyId}
          onClose={() => setReviewOpen(false)}
          onDone={() => utils.ratings.getOfficeRatings.invalidate()}
        />
      )}
    </div>
  );
}
