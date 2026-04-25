/**
 * AttendanceSitesPage — Smart map-powered attendance site management
 *
 * Route: /hr/attendance-sites
 * Access: company_admin, hr_admin
 *
 * Features:
 *   - Create / edit sites with Google Maps location picker
 *   - Geo-fence radius slider with live circle preview on map
 *   - Site type classification (Mall, Brand Store, Office, Warehouse, etc.)
 *   - Client / brand name for outsourced deployments
 *   - Operating hours with timezone support
 *   - QR code generation and copy link
 *   - Live attendance board with auto-refresh
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { MapView } from "@/components/Map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  MapPin, Plus, QrCode, Users, Clock, Building2,
  ShieldCheck, Copy, Edit2, ToggleLeft, ToggleRight,
  Navigation, Crosshair, CheckCircle2, XCircle, Calendar,
  FileText, AlertTriangle, ThumbsUp, ThumbsDown, ArrowLeft,
} from "lucide-react";
import { Link } from "wouter";
import { DateInput } from "@/components/ui/date-input";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { useTranslation } from "react-i18next";
import { muscatCalendarYmdNow } from "@shared/attendanceMuscatTime";

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type SiteType = "mall" | "brand_store" | "office" | "warehouse" | "client_site" | "showroom" | "factory" | "other";

const SITE_TYPE_META: Record<SiteType, { label: string; color: string }> = {
  mall:        { label: "Shopping Mall",        color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  brand_store: { label: "Brand / Retail Store", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  office:      { label: "Office",               color: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300" },
  warehouse:   { label: "Warehouse",            color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  client_site: { label: "Client Site",          color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  showroom:    { label: "Showroom",             color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  factory:     { label: "Factory",              color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  other:       { label: "Other",                color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300" },
};

const TIMEZONES = [
  "Asia/Muscat", "Asia/Dubai", "Asia/Riyadh", "Asia/Kuwait",
  "Asia/Bahrain", "Asia/Qatar", "Asia/Baghdad", "Africa/Cairo",
  "Europe/London", "UTC",
];

interface SiteFormData {
  name: string;
  location: string;
  lat: number | null;
  lng: number | null;
  radiusMeters: number;
  enforceGeofence: boolean;
  siteType: SiteType;
  clientName: string;
  dailyRateOmr: number;
  operatingHoursStart: string;
  operatingHoursEnd: string;
  timezone: string;
  enforceHours: boolean;
  billingCustomerId: number | null;
}

const DEFAULT_FORM: SiteFormData = {
  name: "", location: "", lat: null, lng: null,
  radiusMeters: 200, enforceGeofence: false,
  siteType: "office", clientName: "", dailyRateOmr: 0,
  operatingHoursStart: "08:00", operatingHoursEnd: "18:00",
  timezone: "Asia/Muscat", enforceHours: false,
  billingCustomerId: null,
};

// â”€â”€â”€ Map Location Picker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MapLocationPicker({
  lat, lng, radius,
  onLocationChange,
}: {
  lat: number | null;
  lng: number | null;
  radius: number;
  onLocationChange: (lat: number, lng: number, address?: string) => void;
}) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const drawCircle = useCallback((map: google.maps.Map, pos: google.maps.LatLng, r: number) => {
    if (circleRef.current) circleRef.current.setMap(null);
    circleRef.current = new google.maps.Circle({
      map, center: pos, radius: r,
      fillColor: "#ef4444", fillOpacity: 0.15,
      strokeColor: "#ef4444", strokeWeight: 2, strokeOpacity: 0.8,
    });
  }, []);

  const placeMarker = useCallback((map: google.maps.Map, pos: google.maps.LatLng) => {
    if (markerRef.current) markerRef.current.map = null;
    markerRef.current = new google.maps.marker.AdvancedMarkerElement({ map, position: pos, title: "Site" });
  }, []);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    if (lat != null && lng != null) {
      const pos = new google.maps.LatLng(lat, lng);
      map.setCenter(pos); map.setZoom(17);
      placeMarker(map, pos); drawCircle(map, pos, radius);
    } else {
      map.setCenter({ lat: 23.5880, lng: 58.3829 }); map.setZoom(12);
    }
    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const pos = e.latLng;
      placeMarker(map, pos); drawCircle(map, pos, radius);
      new google.maps.Geocoder().geocode({ location: pos }, (results, status) => {
        const addr = status === "OK" && results?.[0] ? results[0].formatted_address : undefined;
        onLocationChange(pos.lat(), pos.lng(), addr);
      });
    });
    if (searchRef.current) {
      const ac = new google.maps.places.Autocomplete(searchRef.current, {
        fields: ["geometry", "formatted_address", "name"],
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place.geometry?.location) return;
        const pos = place.geometry.location;
        map.setCenter(pos); map.setZoom(17);
        placeMarker(map, pos); drawCircle(map, pos, radius);
        onLocationChange(pos.lat(), pos.lng(), place.formatted_address ?? place.name);
      });
    }
  }, [lat, lng, radius, placeMarker, drawCircle, onLocationChange]);

  // Redraw circle when radius changes
  useEffect(() => {
    if (mapRef.current && lat != null && lng != null) {
      drawCircle(mapRef.current, new google.maps.LatLng(lat, lng), radius);
    }
  }, [radius, lat, lng, drawCircle]);

  const useMyLocation = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition((p) => {
      const pos = new google.maps.LatLng(p.coords.latitude, p.coords.longitude);
      mapRef.current!.setCenter(pos); mapRef.current!.setZoom(17);
      placeMarker(mapRef.current!, pos); drawCircle(mapRef.current!, pos, radius);
      new google.maps.Geocoder().geocode({ location: pos }, (results, status) => {
        const addr = status === "OK" && results?.[0] ? results[0].formatted_address : undefined;
        onLocationChange(p.coords.latitude, p.coords.longitude, addr);
      });
    }, () => toast.error("Could not get your location"));
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input ref={searchRef} placeholder="Search for a mall, office, or address..." className="flex-1" />
        <Button type="button" variant="outline" size="icon" onClick={useMyLocation} title="Use my location">
          <Navigation className="h-4 w-4" />
        </Button>
      </div>
      <MapView
        className="h-60 rounded-lg border"
        initialCenter={{ lat: 23.5880, lng: 58.3829 }}
        initialZoom={12}
        onMapReady={handleMapReady}
      />
      {lat != null && lng != null && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Crosshair className="h-3 w-3" /> {lat.toFixed(6)}, {lng.toFixed(6)}
        </p>
      )}
    </div>
  );
}

// â”€â”€â”€ Site Form Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SiteFormDialog({
  open, onClose, editSite, companyId, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  editSite?: any;
  companyId: number | null;
  onSuccess: () => void;
}) {
  const { t } = useTranslation("hr");
  const [form, setForm] = useState<SiteFormData>(DEFAULT_FORM);
  const [tab, setTab] = useState("basic");

  useEffect(() => {
    if (open) {
      if (editSite) {
        setForm({
          name: editSite.name ?? "",
          location: editSite.location ?? "",
          lat: editSite.lat != null ? parseFloat(editSite.lat) : null,
          lng: editSite.lng != null ? parseFloat(editSite.lng) : null,
          radiusMeters: editSite.radiusMeters ?? 200,
          enforceGeofence: editSite.enforceGeofence ?? false,
          siteType: (editSite.siteType as SiteType) ?? "office",
          clientName: editSite.clientName ?? "",
          dailyRateOmr: Number(editSite.dailyRateOmr ?? 0),
          operatingHoursStart: editSite.operatingHoursStart ?? "08:00",
          operatingHoursEnd: editSite.operatingHoursEnd ?? "18:00",
          timezone: editSite.timezone ?? "Asia/Muscat",
          enforceHours: editSite.enforceHours ?? false,
          billingCustomerId: editSite.billingCustomerId ?? null,
        });
      } else {
        setForm(DEFAULT_FORM);
      }
      setTab("basic");
    }
  }, [editSite, open]);

  const { data: billingCustomersList } = trpc.deploymentEconomics.billingCustomers.list.useQuery(
    {},
    { enabled: open }
  );

  const createMutation = trpc.attendance.createSite.useMutation({
    onSuccess: () => { toast.success(t("attendance.sites.toast.siteCreated")); onSuccess(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.attendance.updateSite.useMutation({
    onSuccess: () => { toast.success(t("attendance.sites.toast.siteUpdated")); onSuccess(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const handleSave = () => {
    if (!form.name.trim()) { toast.error(t("attendance.sites.toast.validationError")); return; }
    const payload = {
      name: form.name.trim(),
      location: form.location || undefined,
      lat: form.lat,
      lng: form.lng,
      radiusMeters: form.radiusMeters,
      enforceGeofence: form.enforceGeofence,
      siteType: form.siteType,
      clientName: form.clientName || undefined,
      dailyRateOmr: form.dailyRateOmr,
      operatingHoursStart: form.operatingHoursStart || undefined,
      operatingHoursEnd: form.operatingHoursEnd || undefined,
      timezone: form.timezone,
      enforceHours: form.enforceHours,
      billingCustomerId: form.billingCustomerId,
    };
    if (editSite) {
      updateMutation.mutate({ siteId: editSite.id, ...payload });
    } else {
      if (companyId == null) {
        toast.error(t("attendance.sites.toast.noCompanyError"));
        return;
      }
      createMutation.mutate({ companyId, ...payload });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editSite ? t("attendance.sites.siteForm.editTitle") : t("attendance.sites.siteForm.newTitle")}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="basic">{t("attendance.sites.siteForm.tabBasic")}</TabsTrigger>
            <TabsTrigger value="location">{t("attendance.sites.siteForm.tabLocation")}</TabsTrigger>
            <TabsTrigger value="hours">{t("attendance.sites.siteForm.tabHours")}</TabsTrigger>
          </TabsList>

          {/* Tab 1: Basic Info */}
          <TabsContent value="basic" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Site Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Lulu Hypermarket — Electronics Promotions"
              />
            </div>
            <div className="space-y-2">
              <Label>Site Type</Label>
              <Select value={form.siteType} onValueChange={(v) => setForm((f) => ({ ...f, siteType: v as SiteType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(SITE_TYPE_META) as [SiteType, typeof SITE_TYPE_META[SiteType]][]).map(([v, m]) => (
                    <SelectItem key={v} value={v}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Client / Brand Name</Label>
              <Input
                value={form.clientName}
                onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                placeholder="e.g. Samsung, LG, Panasonic"
              />
              <p className="text-xs text-muted-foreground">For outsourced promoters — the brand they represent at this site.</p>
            </div>
            <div className="space-y-2">
              <Label>Billing Customer</Label>
              <Select
                value={form.billingCustomerId != null ? String(form.billingCustomerId) : "__none__"}
                onValueChange={(v) => setForm((f) => ({ ...f, billingCustomerId: v === "__none__" ? null : Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not linked" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Not linked —</SelectItem>
                  {(billingCustomersList ?? []).map((bc) => (
                    <SelectItem key={bc.id} value={String(bc.id)}>
                      {bc.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used for attendance billing and client approval reports.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Daily Rate (OMR)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">OMR</span>
                <Input
                  type="number"
                  min={0}
                  max={9999}
                  step={0.001}
                  value={form.dailyRateOmr}
                  onChange={(e) => setForm((f) => ({ ...f, dailyRateOmr: Number(e.target.value) }))}
                  className="pl-12"
                  placeholder="0.000"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Contracted daily rate for this site. Used in monthly invoice summaries (optional, reporting only).
              </p>
            </div>
          </TabsContent>

          {/* Tab 2: Location & Geo-fence */}
          <TabsContent value="location" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Pin Location on Map</Label>
              <p className="text-xs text-muted-foreground">Search or click on the map to pin the site. The red circle shows the geo-fence boundary.</p>
              <MapLocationPicker
                lat={form.lat}
                lng={form.lng}
                radius={form.radiusMeters}
                onLocationChange={(lat, lng, addr) => setForm((f) => ({ ...f, lat, lng, location: addr ?? f.location }))}
              />
            </div>

            {form.lat != null ? (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Geo-fence Radius</Label>
                    <span className="text-sm font-semibold text-primary">{form.radiusMeters}m</span>
                  </div>
                  <Slider
                    value={[form.radiusMeters]}
                    onValueChange={([v]) => setForm((f) => ({ ...f, radiusMeters: v }))}
                    min={30} max={2000} step={10}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>30m (tight)</span><span>500m</span><span>2000m (wide)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Recommended: 100–300m for indoor malls, 300–500m for outdoor sites.</p>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium text-sm">Enforce geo-fence</p>
                    <p className="text-xs text-muted-foreground">
                      Block check-ins from outside the radius. Employees cannot clock in unless they are within the geo-fence boundary.
                    </p>
                  </div>
                  <Switch checked={form.enforceGeofence} onCheckedChange={(v) => setForm((f) => ({ ...f, enforceGeofence: v }))} />
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                <MapPin className="h-6 w-6 mx-auto mb-2 opacity-40" />
                Pin a location on the map above to enable geo-fence settings.
              </div>
            )}
          </TabsContent>

          {/* Tab 3: Hours & Settings */}
          <TabsContent value="hours" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={form.timezone} onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Opening Time</Label>
                <Input type="time" value={form.operatingHoursStart} onChange={(e) => setForm((f) => ({ ...f, operatingHoursStart: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Closing Time</Label>
                <Input type="time" value={form.operatingHoursEnd} onChange={(e) => setForm((f) => ({ ...f, operatingHoursEnd: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium text-sm">Enforce Operating Hours</p>
                <p className="text-xs text-muted-foreground">Block check-ins outside operating hours</p>
              </div>
              <Switch checked={form.enforceHours} onCheckedChange={(v) => setForm((f) => ({ ...f, enforceHours: v }))} />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t("attendance.sites.siteForm.cancel")}</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("attendance.sites.siteForm.saving") : editSite ? t("attendance.sites.siteForm.saveChanges") : t("attendance.sites.siteForm.createSite")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// â”€â”€â”€ QR Code Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function QrCodeDialog({ site, onClose }: { site: any; onClose: () => void }) {
  const checkInUrl = `${window.location.origin}/attend/${site.qrToken}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(checkInUrl)}`;
  const meta = SITE_TYPE_META[site.siteType as SiteType] ?? SITE_TYPE_META.other;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>QR Code</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="text-center">
            <p className="font-semibold">{site.name}</p>
            {site.clientName && <p className="text-sm text-muted-foreground">{site.clientName}</p>}
            {Number(site.dailyRateOmr ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">OMR {Number(site.dailyRateOmr).toFixed(3)}/day</p>
            )}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block ${meta.color}`}>
              {meta.label}
            </span>
          </div>
          <img src={qrUrl} alt="QR Code" className="rounded-lg border p-2 bg-white w-56 h-56" />
          {site.enforceGeofence && site.lat && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> Geo-fence active – {site.radiusMeters}m radius
            </p>
          )}
          {site.operatingHoursStart && site.operatingHoursEnd && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> {site.operatingHoursStart} – {site.operatingHoursEnd} ({site.timezone})
            </p>
          )}
          <p className="text-xs text-center text-muted-foreground break-all">{checkInUrl.length > 55 ? checkInUrl.slice(0, 55) + "..." : checkInUrl}</p>
          <p className="text-xs text-center text-muted-foreground">Post this QR at the site. Employees may need location permission enabled.</p>
          <div className="flex gap-2 w-full">
            <Button variant="outline" className="flex-1" onClick={() => { navigator.clipboard.writeText(checkInUrl); toast.success("Link copied!"); }}>
              <Copy className="h-4 w-4 mr-1" /> Copy Link
            </Button>
            <Button className="flex-1" onClick={() => window.open(qrUrl, "_blank")}>
              Download QR
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function AttendanceSitesPage() {
  const { t } = useTranslation("hr");
  const [showForm, setShowForm] = useState(false);
  const [editSite, setEditSite] = useState<any>(null);
  const [qrSite, setQrSite] = useState<any>(null);
  const [mainTab, setMainTab] = useState("sites");
  const [historyDate, setHistoryDate] = useState(() => muscatCalendarYmdNow());
  const [reviewingRequest, setReviewingRequest] = useState<any>(null);
  const [reviewNote, setReviewNote] = useState("");

  const utils = trpc.useUtils();
  const { activeCompanyId } = useActiveCompany();
  const { data: sites = [], isLoading } = trpc.attendance.listSites.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: board = [] } = trpc.attendance.adminBoard.useQuery(
    {
      companyId: activeCompanyId ?? undefined,
      date: muscatCalendarYmdNow(),
    },
    { refetchInterval: 30000, enabled: activeCompanyId != null },
  );
  const { data: historyBoard = [] } = trpc.attendance.adminBoard.useQuery(
    { companyId: activeCompanyId ?? undefined, date: historyDate },
    { enabled: activeCompanyId != null },
  );

  const toggleMutation = trpc.attendance.toggleSite.useMutation({
    onSuccess: () => utils.attendance.listSites.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const checkedInNow = board.filter((r) => r.record != null && !r.record.checkOut);

  const { data: manualRequests = [], refetch: refetchManual } = trpc.attendance.listManualCheckIns.useQuery(
    { companyId: activeCompanyId ?? undefined, status: "pending" },
    { enabled: mainTab === "manual" && activeCompanyId != null },
  );

  const approveMutation = trpc.attendance.approveManualCheckIn.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.sites.toast.approved"));
      refetchManual();
      setReviewingRequest(null);
      setReviewNote("");
      void utils.attendance.listAttendanceAudit.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const rejectMutation = trpc.attendance.rejectManualCheckIn.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.sites.toast.rejected"));
      refetchManual();
      setReviewingRequest(null);
      setReviewNote("");
      void utils.attendance.listAttendanceAudit.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <Link href="/hr/attendance-setup" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={13} /> Setup Overview
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("attendance.sites.pageTitle")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("attendance.sites.pageSubtitle")}
          </p>
        </div>
        <Button
          onClick={() => {
            if (activeCompanyId == null) {
              toast.error(t("attendance.sites.toast.noCompanyError"));
              return;
            }
            setEditSite(null);
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" /> {t("attendance.sites.newSiteBtn")}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{checkedInNow.length}</p>
                <p className="text-xs text-muted-foreground">{t("attendance.sites.stats.checkedInNow")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{sites.filter((s) => s.isActive).length}</p>
                <p className="text-xs text-muted-foreground">{t("attendance.sites.stats.activeSites")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{board.length}</p>
                <p className="text-xs text-muted-foreground">{t("attendance.sites.stats.recordsToday")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          <TabsTrigger value="sites">{t("attendance.sites.tabs.sitesQr")}</TabsTrigger>
          <TabsTrigger value="live">
            {t("attendance.sites.tabs.liveBoard")}
            {checkedInNow.length > 0 && (
              <Badge className="ml-2 bg-green-500 text-white text-xs px-1.5 py-0">{checkedInNow.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">{t("attendance.sites.tabs.history")}</TabsTrigger>
          <TabsTrigger value="manual" className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> {t("attendance.sites.tabs.manual")}
            {manualRequests.length > 0 && (
              <Badge className="ml-1 bg-amber-500 text-white text-xs px-1.5 py-0">{manualRequests.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* â”€â”€ Sites Tab â”€â”€ */}
        <TabsContent value="sites" className="pt-4">
          {activeCompanyId == null ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
              {t("attendance.sites.empty.noCompany")}
            </div>
          ) : isLoading ? (
            <div className="text-center py-12 text-muted-foreground">{t("attendance.sites.empty.loading")}</div>
          ) : sites.length === 0 ? (
            <div className="text-center py-16 border border-dashed rounded-xl">
              <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{t("attendance.sites.empty.noSitesTitle")}</p>
              <p className="text-sm text-muted-foreground mb-4">
                {t("attendance.sites.empty.noSitesHint")}
              </p>
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-2" /> {t("attendance.sites.empty.noSitesBtn")}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {sites.map((site) => {
                const meta = SITE_TYPE_META[site.siteType as SiteType] ?? SITE_TYPE_META.other;
                return (
                  <div key={site.id} className={`rounded-xl border bg-card p-4 space-y-3 ${!site.isActive ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.color}`}>
                            {meta.label}
                          </span>
                          {!site.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                        </div>
                        <h3 className="font-semibold truncate">{site.name}</h3>
                        {site.clientName && (
                          <p className="text-xs text-muted-foreground">{site.clientName}</p>
                        )}
                        {Number(site.dailyRateOmr ?? 0) > 0 && (
                          <span className="text-xs text-muted-foreground">
                            OMR {Number(site.dailyRateOmr).toFixed(3)}/day
                          </span>
                        )}
                      </div>
                    </div>

                    {site.location && (
                      <p className="text-xs text-muted-foreground flex items-start gap-1">
                        <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{site.location}</span>
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                      {site.lat != null && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted flex items-center gap-1">
                          <Crosshair className="h-3 w-3" /> {site.radiusMeters}m radius
                        </span>
                      )}
                      {site.enforceGeofence && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" /> Geo-fence ON
                        </span>
                      )}
                      {site.operatingHoursStart && site.operatingHoursEnd && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {site.operatingHoursStart} – {site.operatingHoursEnd}
                          {site.enforceHours && <ShieldCheck className="h-3 w-3 text-amber-600 ml-0.5" />}
                        </span>
                      )}
                    </div>

                    {/* Readiness badges */}
                    <div className="flex flex-wrap gap-1">
                      {site.lat == null ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:border-amber-700 dark:text-amber-300">
                          No location set
                        </span>
                      ) : null}
                      {site.lat != null && !site.enforceGeofence ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">
                          Geo-fence off
                        </span>
                      ) : null}
                      {Number(site.dailyRateOmr ?? 0) > 0 && site.billingCustomerId == null ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:border-amber-700 dark:text-amber-300">
                          No billing customer
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t">
                      <Button size="sm" className="flex-1" onClick={() => setQrSite(site)}>
                        <QrCode className="h-3.5 w-3.5 mr-1" /> QR Code
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setEditSite(site); setShowForm(true); }}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        onClick={() => toggleMutation.mutate({ siteId: site.id, isActive: !site.isActive })}
                        title={site.isActive ? "Deactivate" : "Activate"}
                      >
                        {site.isActive
                          ? <ToggleRight className="h-3.5 w-3.5 text-green-600" />
                          : <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* â”€â”€ Live Board Tab â”€â”€ */}
        <TabsContent value="live" className="pt-4">
          {board.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl space-y-2">
              <Users className="h-8 w-8 mx-auto opacity-30" />
              <p>{t("attendance.sites.empty.noLiveBoardRecords")}</p>
              <p className="text-xs max-w-md mx-auto">
                This list shows raw clock events. For scheduled employees and phase-based status (upcoming, absent only after shift end), use HR â†’ Attendance â†’ Today&apos;s Board.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Employee</th>
                    <th className="text-left px-4 py-3 font-medium">Site</th>
                    <th className="text-left px-4 py-3 font-medium">Check in</th>
                    <th className="text-left px-4 py-3 font-medium">Check out</th>
                    <th className="text-left px-4 py-3 font-medium">Duration</th>
                    <th className="text-left px-4 py-3 font-medium">Source</th>
                    <th className="text-left px-4 py-3 font-medium">Geo</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {board.map((row: any) => (
                    <tr key={row.record!.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium">{row.employee.firstName} {row.employee.lastName}</p>
                        <p className="text-xs text-muted-foreground">{row.employee.position ?? row.employee.department}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{row.record!.siteName ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{new Date(row.record!.checkIn).toLocaleTimeString()}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{row.record!.checkOut ? new Date(row.record!.checkOut).toLocaleTimeString() : "—"}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">{row.durationMinutes != null ? `${row.durationMinutes}m` : "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{row.methodLabel ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">
                        {row.hasCheckInGeo ? (
                          <span className="text-emerald-600 flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" /> In</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {row.record.checkOut && row.hasCheckOutGeo && (
                          <span className="text-muted-foreground ml-1">· Out</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.record.checkOut ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <XCircle className="h-3.5 w-3.5" /> Checked out
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Active
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* â”€â”€ History Tab â”€â”€ */}
        <TabsContent value="history" className="pt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Label>Date</Label>
            <DateInput
              
              value={historyDate}
              onChange={(e) => setHistoryDate(e.target.value)}
              className="w-44"
            />
            <span className="text-sm text-muted-foreground">{historyBoard.length} records</span>
          </div>
          {historyBoard.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground border border-dashed rounded-xl">
              {t("attendance.sites.empty.noHistoryRecords")}
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Employee</th>
                    <th className="text-left px-4 py-3 font-medium">Site</th>
                    <th className="text-left px-4 py-3 font-medium">Check In</th>
                    <th className="text-left px-4 py-3 font-medium">Check Out</th>
                    <th className="text-left px-4 py-3 font-medium">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historyBoard.filter((row) => row.record != null).map((row) => {
                    const hours = row.record!.checkOut
                      ? ((new Date(row.record!.checkOut).getTime() - new Date(row.record!.checkIn).getTime()) / 3600000).toFixed(1)
                      : null;
                    return (
                      <tr key={row.record!.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <p className="font-medium">{row.employee.firstName} {row.employee.lastName}</p>
                          <p className="text-xs text-muted-foreground">{row.employee.position ?? row.employee.department}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{row.record!.siteName ?? "—"}</td>
                        <td className="px-4 py-3">{new Date(row.record!.checkIn).toLocaleTimeString()}</td>
                        <td className="px-4 py-3">{row.record!.checkOut ? new Date(row.record!.checkOut).toLocaleTimeString() : "—"}</td>
                        <td className="px-4 py-3">{hours ? `${hours}h` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* â”€â”€ Manual Check-in Requests Tab â”€â”€ */}
        <TabsContent value="manual" className="pt-4">
          {manualRequests.length === 0 ? (
            <div className="text-center py-16 border border-dashed rounded-xl">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{t("attendance.sites.empty.noManualRequests")}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("attendance.sites.empty.noManualRequestsHint")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {manualRequests.map((req: any) => (
                <div key={req.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Pending Review
                        </Badge>
                        {req.distanceMeters != null && (
                          <span className="text-xs text-muted-foreground">
                            {req.distanceMeters}m from site
                          </span>
                        )}
                      </div>
                      <p className="font-semibold">{req.employeeName ?? `Employee #${req.employeeUserId}`}</p>
                      <p className="text-xs text-muted-foreground">{req.siteName ?? "Unknown site"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(req.requestedAt).toLocaleString("en-GB")}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => { setReviewingRequest(req); setReviewNote(""); }}
                      >
                        <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Review
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted-foreground mb-1 font-medium">Employee justification:</p>
                    <p className="text-sm bg-muted/50 rounded-lg p-3 italic">"{req.justification}"</p>
                  </div>
                  {req.lat != null && req.lng != null && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> GPS: {parseFloat(req.lat).toFixed(5)}, {parseFloat(req.lng).toFixed(5)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      {reviewingRequest && (
        <Dialog open onOpenChange={() => { setReviewingRequest(null); setReviewNote(""); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("attendance.sites.reviewDialog.title")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
                <p><span className="text-muted-foreground">Employee:</span> {reviewingRequest.employeeName ?? `#${reviewingRequest.employeeUserId}`}</p>
                <p><span className="text-muted-foreground">Site:</span> {reviewingRequest.siteName ?? "—"}</p>
                <p><span className="text-muted-foreground">Requested at:</span> {new Date(reviewingRequest.requestedAt).toLocaleString("en-GB")}</p>
                {reviewingRequest.distanceMeters != null && (
                  <p><span className="text-muted-foreground">Distance from site:</span> <span className="text-amber-600 font-medium">{reviewingRequest.distanceMeters}m</span></p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Employee justification:</p>
                <p className="text-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 italic">
                  "{reviewingRequest.justification}"
                </p>
              </div>
              <div>
                <Label className="text-sm">{t("attendance.sites.reviewDialog.reviewNoteLabel")}</Label>
                <Textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Add a note for the employee..."
                  className="mt-1 resize-none min-h-[70px]"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                disabled={rejectMutation.isPending}
                onClick={() =>
                  activeCompanyId != null &&
                  rejectMutation.mutate({
                    companyId: activeCompanyId,
                    requestId: reviewingRequest.id,
                    adminNote: reviewNote || "Request rejected by admin",
                  })}
              >
                {rejectMutation.isPending ? t("attendance.sites.reviewDialog.rejecting") : <><ThumbsDown className="h-4 w-4 mr-1.5" /> {t("attendance.sites.reviewDialog.reject")}</>}
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={approveMutation.isPending}
                onClick={() =>
                  activeCompanyId != null &&
                  approveMutation.mutate({
                    companyId: activeCompanyId,
                    requestId: reviewingRequest.id,
                    adminNote: reviewNote || undefined,
                  })}
              >
                {approveMutation.isPending ? t("attendance.sites.reviewDialog.approving") : <><ThumbsUp className="h-4 w-4 mr-1.5" /> {t("attendance.sites.reviewDialog.approve")}</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialogs */}
      {showForm && (
        <SiteFormDialog
          open={showForm}
          onClose={() => { setShowForm(false); setEditSite(null); }}
          editSite={editSite}
          companyId={activeCompanyId}
          onSuccess={() => utils.attendance.listSites.invalidate()}
        />
      )}
      {qrSite && <QrCodeDialog site={qrSite} onClose={() => setQrSite(null)} />}
    </div>
  );
}
