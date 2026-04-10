import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Search, MapPin, Star, Phone, Clock, Shield, CheckCircle,
  ChevronRight, Building2, FileText, Briefcase, Scale, Stamp,
  Globe, Users, Filter, X, ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const PROVIDER_TYPE_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pro_office:    { label: "PRO Office",     icon: Briefcase, color: "bg-red-100 text-red-700 border-red-200" },
  typing_centre: { label: "Typing Centre",  icon: FileText,  color: "bg-gray-100 text-gray-700 border-gray-200" },
  admin_bureau:  { label: "Admin Bureau",   icon: Building2, color: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  legal_services:{ label: "Legal Services", icon: Scale,     color: "bg-stone-100 text-stone-700 border-stone-200" },
  attestation:   { label: "Attestation",    icon: Stamp,     color: "bg-neutral-100 text-neutral-700 border-neutral-200" },
  visa_services: { label: "Visa Services",  icon: Globe,     color: "bg-slate-100 text-slate-700 border-slate-200" },
  business_setup:{ label: "Business Setup", icon: Users,     color: "bg-gray-100 text-gray-800 border-gray-200" },
  other:         { label: "Other",          icon: Building2, color: "bg-gray-100 text-gray-600 border-gray-200" },
};

const GOVERNORATES = [
  "Muscat","Dhofar","Musandam","Al Buraimi","Ad Dakhiliyah",
  "Al Batinah North","Al Batinah South","Ash Sharqiyah North",
  "Ash Sharqiyah South","Ad Dhahirah","Al Wusta",
];

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
        <Star key={s} className={`h-3.5 w-3.5 ${s <= Math.round(r) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
      ))}
      <span className="text-xs text-muted-foreground ml-1">
        {r > 0 ? r.toFixed(1) : "New"}{count !== undefined && count > 0 ? ` (${count})` : ""}
      </span>
    </div>
  );
}

function ProviderCard({ office }: { office: any }) {
  const typeInfo = PROVIDER_TYPE_LABELS[office.providerType] ?? PROVIDER_TYPE_LABELS.other;
  const TypeIcon = typeInfo.icon;
  const services: string[] = Array.isArray(office.services) ? office.services : [];

  return (
    <Link href={`/sanad/centre/${office.id}`}>
      <Card className="group cursor-pointer hover:shadow-lg transition-all duration-200 border hover:border-red-200 h-full">
        <CardContent className="p-0">
          <div className="relative bg-gradient-to-r from-gray-900 to-gray-700 rounded-t-lg p-4 pb-8">
            <div className="flex items-start justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
                  {office.logoUrl
                    ? <img src={office.logoUrl} alt={office.name} className="h-10 w-10 rounded-lg object-cover" />
                    : <TypeIcon className="h-6 w-6 text-white" />}
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm leading-tight line-clamp-1">{office.name}</h3>
                  {office.nameAr && (
                    <p className="text-white/70 text-xs mt-0.5" dir="rtl">{office.nameAr}</p>
                  )}
                </div>
              </div>
              {(office.isVerified === 1 || office.isVerified === true) && (
                <div className="flex items-center gap-1 bg-green-500/20 border border-green-400/30 rounded-full px-2 py-0.5">
                  <CheckCircle className="h-3 w-3 text-green-400" />
                  <span className="text-green-300 text-xs">Verified</span>
                </div>
              )}
            </div>
          </div>

          <div className="px-4 -mt-4 mb-3">
            <Badge className={`text-xs border ${typeInfo.color} shadow-sm`}>
              <TypeIcon className="h-3 w-3 mr-1" />
              {typeInfo.label}
            </Badge>
          </div>

          <div className="px-4 pb-4 space-y-3">
            <StarRating rating={office.avgRating ?? office.rating} count={office.totalReviews ?? 0} />

            <div className="space-y-1.5">
              {(office.governorate || office.city) && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{[office.city, office.governorate].filter(Boolean).join(", ")}</span>
                </div>
              )}
              {office.phone && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{office.phone}</span>
                </div>
              )}
              {office.openingHours && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{office.openingHours}</span>
                </div>
              )}
              {office.responseTimeHours && (
                <div className="flex items-center gap-1.5 text-xs text-green-600">
                  <Shield className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>Responds within {office.responseTimeHours}h</span>
                </div>
              )}
            </div>

            {services.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {services.slice(0, 3).map((s) => (
                  <span key={s} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                    {SERVICE_TYPE_LABELS[s] ?? s}
                  </span>
                ))}
                {services.length > 3 && (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                    +{services.length - 3} more
                  </span>
                )}
              </div>
            )}

            <div className="pt-1 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{office.totalOrders ?? 0} orders</span>
              <div className="flex items-center gap-1 text-xs text-red-600 font-medium group-hover:gap-2 transition-all">
                View Profile <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ProviderCardSkeleton() {
  return (
    <Card className="h-full">
      <CardContent className="p-0">
        <Skeleton className="h-24 rounded-t-lg rounded-b-none" />
        <div className="px-4 pt-4 pb-4 space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-40" />
          <div className="flex flex-wrap gap-1">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SanadMarketplacePage() {
  const [search, setSearch] = useState("");
  const [governorate, setGovernorate] = useState("all");
  const [wilayat, setWilayat] = useState("");
  const [providerType, setProviderType] = useState("all");
  const [minRating, setMinRating] = useState("any");
  const [showFilters, setShowFilters] = useState(false);

  const { data: providers = [], isLoading } = trpc.sanad.listPublicProviders.useQuery({
    search: search.trim() || undefined,
    governorate: governorate !== "all" ? governorate : undefined,
    wilayat: wilayat.trim() || undefined,
    providerType: providerType !== "all" ? (providerType as any) : undefined,
    minRating: minRating !== "any" ? Number(minRating) : undefined,
    publicListedOnly: true,
  });

  const activeFilterCount = [
    governorate !== "all",
    Boolean(wilayat.trim()),
    providerType !== "all",
    minRating !== "any",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setGovernorate("all");
    setWilayat("");
    setProviderType("all");
    setMinRating("any");
    setSearch("");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-500 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-white rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 py-16 text-center">
          <div className="inline-flex items-center gap-2 bg-red-600/20 border border-red-500/30 rounded-full px-4 py-1.5 text-sm text-red-300 mb-6">
            <Shield className="h-4 w-4" />
            Licensed &amp; Verified Service Providers
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            Sanad Services Marketplace
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto mb-8">
            Find trusted PRO offices, typing centres, and admin bureaus across Oman.
            Compare services, check ratings, and request help — all in one place.
          </p>
          <div className="flex flex-wrap justify-center gap-8 text-sm text-gray-400">
            <div className="flex flex-wrap items-center gap-2">
              <Building2 className="h-4 w-4 text-red-400" />
              <span><strong className="text-white">{providers.length}</strong> registered centres</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <span><strong className="text-white">{providers.filter((p) => p.isVerified).length}</strong> verified</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <MapPin className="h-4 w-4 text-amber-400" />
              <span><strong className="text-white">{GOVERNORATES.length}</strong> governorates covered</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky search bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, city, or service…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-8"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              variant="outline" size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={showFilters || activeFilterCount > 0 ? "border-red-500 text-red-600" : ""}
            >
              <Filter className="h-4 w-4 mr-1.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-1.5 bg-red-600 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t">
              <Select value={governorate} onValueChange={setGovernorate}>
                <SelectTrigger className="w-44 h-8 text-xs">
                  <SelectValue placeholder="All Governorates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Governorates</SelectItem>
                  {GOVERNORATES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>

              <Input
                className="w-44 h-8 text-xs"
                placeholder="Wilayat / city"
                value={wilayat}
                onChange={(e) => setWilayat(e.target.value)}
              />

              <Select value={providerType} onValueChange={setProviderType}>
                <SelectTrigger className="w-44 h-8 text-xs">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(PROVIDER_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={minRating} onValueChange={setMinRating}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue placeholder="Any Rating" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Rating</SelectItem>
                  <SelectItem value="4">4★ &amp; above</SelectItem>
                  <SelectItem value="3">3★ &amp; above</SelectItem>
                  <SelectItem value="2">2★ &amp; above</SelectItem>
                </SelectContent>
              </Select>

              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs text-muted-foreground">
                  <X className="h-3 w-3 mr-1" /> Clear all
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Results grid */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${providers.length} service provider${providers.length !== 1 ? "s" : ""} found`}
          </p>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-xs text-red-600 hover:underline flex items-center gap-1">
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <ProviderCardSkeleton key={i} />)}
          </div>
        ) : providers.length === 0 ? (
          <div className="text-center py-20">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <h3 className="text-lg font-semibold mb-2">No providers found</h3>
            <p className="text-muted-foreground text-sm mb-4">
              {search || activeFilterCount > 0 ? "Try adjusting your search or filters." : "No service providers are listed yet."}
            </p>
            {(search || activeFilterCount > 0) && (
              <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {providers.map((office) => <ProviderCard key={office.id} office={office} />)}
          </div>
        )}

        {/* CTA for Sanad centres */}
        {!isLoading && (
          <div className="mt-12 bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-8 text-white text-center">
            <h2 className="text-2xl font-bold mb-2">Are you a Sanad centre?</h2>
            <p className="text-gray-300 mb-6 max-w-lg mx-auto">
              Join the SmartPRO marketplace for free. Get discovered by thousands of companies across Oman and manage all your clients in one platform.
            </p>
            <Link href="/sanad/catalogue-admin">
              <Button className="bg-red-600 hover:bg-red-700 text-white">
                Register Your Centre <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
