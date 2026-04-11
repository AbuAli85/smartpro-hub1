/**
 * AttendCheckInPage — Smart GPS QR Check-in/Check-out page
 *
 * Route: /attend/:token
 * Access: Public (no auth required to view), but auth required to submit
 *
 * Features:
 *   - Resolves site info (name, type, client, geo-fence, operating hours)
 *   - Live GPS tracking with distance-to-site indicator
 *   - Geo-fence enforcement with visual proximity ring
 *   - Operating hours check with timezone support
 *   - Animated check-in / check-out confirmation
 */
import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { humanCheckInErrorMessage } from "@/lib/checkInErrorMessage";
import { Textarea } from "@/components/ui/textarea";
import {
  MapPin, Clock, CheckCircle2, LogIn, LogOut,
  Building2, ShieldCheck, ShieldX, AlertCircle,
  Loader2, Navigation, WifiOff, Timer, LogOut as CheckOutIcon,
  Send, FileText, CheckCheck,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

const SITE_TYPE_META: Record<string, { label: string; icon: string }> = {
  mall:        { label: "Shopping Mall",       icon: "🏬" },
  brand_store: { label: "Brand / Retail Store",icon: "🛍️" },
  office:      { label: "Office",              icon: "🏢" },
  warehouse:   { label: "Warehouse",           icon: "🏭" },
  client_site: { label: "Client Site",         icon: "📍" },
  showroom:    { label: "Showroom",            icon: "✨" },
  factory:     { label: "Factory",             icon: "⚙️" },
  other:       { label: "Location",            icon: "📌" },
};

// ─── Proximity Ring ───────────────────────────────────────────────────────────
function ProximityRing({
  distanceM, radiusM, inside,
}: { distanceM: number; radiusM: number; inside: boolean }) {
  const pct = Math.min(100, (distanceM / (radiusM * 2)) * 100);
  const color = inside ? "#22c55e" : distanceM < radiusM * 1.5 ? "#f59e0b" : "#ef4444";
  const circumference = 2 * Math.PI * 44;
  const dash = ((100 - pct) / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-32 h-32 mx-auto">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle
          cx="50" cy="50" r="44" fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={dash}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}
        />
      </svg>
      <div className="text-center z-10">
        <p className="text-white font-bold text-lg leading-none">
          {distanceM < 1000 ? `${Math.round(distanceM)}m` : `${(distanceM / 1000).toFixed(1)}km`}
        </p>
        <p className="text-white/50 text-xs mt-0.5">away</p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AttendCheckInPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const { user, loading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [geoLoading, setGeoLoading] = useState(true);
  const [done, setDone] = useState<"checked_in" | "checked_out" | "manual_submitted" | null>(null);
  const [doneTime, setDoneTime] = useState<Date | null>(null);
  const [justification, setJustification] = useState("");
  const [showJustificationForm, setShowJustificationForm] = useState(false);
  const watchRef = useRef<number | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Resolve site from token
  const { data: site, isLoading: siteLoading, error: siteError } = trpc.attendance.getSiteByToken.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  // Today's record — scoped to the site’s company (QR page may not match global company switcher)
  const { data: todayRecord, refetch: refetchToday } = trpc.attendance.myToday.useQuery(
    { companyId: site?.companyId },
    { enabled: !!user && !!site?.companyId },
  );

  const checkInMutation = trpc.attendance.checkIn.useMutation({
    onSuccess: (record) => {
      setDone("checked_in");
      setDoneTime(new Date(record.checkIn));
      refetchToday();
      void utils.attendance.listAttendanceAudit.invalidate();
      void utils.attendance.myManualCheckIns.invalidate();
      void utils.scheduling.getTodayBoard.invalidate();
      void utils.employeePortal.getMyOperationalHints.invalidate();
      void utils.employeePortal.getMyAttendanceRecords.invalidate();
      void utils.employeePortal.getMyAttendanceSummary.invalidate();
    },
    onError: (err) => toast.error(humanCheckInErrorMessage(err.message || "Check-in failed")),
  });

  const checkOutMutation = trpc.attendance.checkOut.useMutation({
    onSuccess: () => {
      setDone("checked_out");
      setDoneTime(new Date());
      refetchToday();
      void utils.attendance.listAttendanceAudit.invalidate();
      void utils.attendance.myManualCheckIns.invalidate();
      void utils.scheduling.getTodayBoard.invalidate();
      void utils.employeePortal.getMyOperationalHints.invalidate();
      void utils.employeePortal.getMyAttendanceRecords.invalidate();
      void utils.employeePortal.getMyAttendanceSummary.invalidate();
    },
    onError: (err) => toast.error(err.message || "Check-out failed"),
  });

  const manualCheckInMutation = trpc.attendance.submitManualCheckIn.useMutation({
    onSuccess: () => {
      setDone("manual_submitted");
      setDoneTime(new Date());
      void utils.attendance.listAttendanceAudit.invalidate();
      void utils.attendance.listManualCheckIns.invalidate();
      void utils.attendance.myManualCheckIns.invalidate();
      void utils.employeePortal.getMyOperationalHints.invalidate();
    },
    onError: (err) => toast.error(err.message || "Request submission failed"),
  });

  function handleManualSubmit() {
    if (!justification.trim() || justification.trim().length < 10) {
      toast.error("Please provide at least 10 characters of justification");
      return;
    }
    manualCheckInMutation.mutate({
      siteToken: token,
      justification: justification.trim(),
      lat: coords?.lat,
      lng: coords?.lng,
      distanceMeters: distanceM != null ? Math.round(distanceM) : undefined,
    });
  }

  // GPS watch
  useEffect(() => {
    if (!navigator.geolocation) { setGeoError(true); setGeoLoading(false); return; }
    setGeoLoading(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoLoading(false);
        setGeoError(false);
      },
      () => { setGeoError(true); setGeoLoading(false); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); };
  }, []);

  const isCheckedIn = !!todayRecord && !todayRecord.checkOut;
  const isMutating = checkInMutation.isPending || checkOutMutation.isPending || manualCheckInMutation.isPending;

  // Geo-fence calculation
  const siteLat = site?.lat != null ? parseFloat(String(site.lat)) : null;
  const siteLng = site?.lng != null ? parseFloat(String(site.lng)) : null;
  const siteRadius = site?.radiusMeters ?? 200;
  const distanceM = coords && siteLat != null && siteLng != null
    ? haversineMeters(coords.lat, coords.lng, siteLat, siteLng)
    : null;
  const insideGeofence = distanceM != null ? distanceM <= siteRadius : true;
  const geoBlocked = site?.enforceGeofence && !insideGeofence && coords != null;

  // Operating hours check
  function isWithinOperatingHours(): boolean {
    if (!site?.enforceHours || !site.operatingHoursStart || !site.operatingHoursEnd) return true;
    try {
      const tz = site.timezone ?? "UTC";
      const localTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(new Date());
      const [h, m] = localTime.split(":").map(Number);
      const current = h * 60 + m;
      const [sh, sm] = site.operatingHoursStart.split(":").map(Number);
      const [eh, em] = site.operatingHoursEnd.split(":").map(Number);
      return current >= sh * 60 + sm && current <= eh * 60 + em;
    } catch { return true; }
  }
  const hoursBlocked = site?.enforceHours && !isWithinOperatingHours();

  const canSubmit = !geoBlocked && !hoursBlocked;

  function handleAction() {
    if (!user || !canSubmit || !site?.companyId) return;
    if (isCheckedIn) {
      checkOutMutation.mutate({
        companyId: site.companyId,
        siteToken: token,
        lat: coords?.lat,
        lng: coords?.lng,
      });
    } else {
      checkInMutation.mutate({ siteToken: token, lat: coords?.lat, lng: coords?.lng });
    }
  }

  const typeMeta = SITE_TYPE_META[site?.siteType ?? "other"] ?? SITE_TYPE_META.other;
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  // ── Loading ────────────────────────────────────────────────────────────────
  if (siteLoading || authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a14] via-[#0f0f1e] to-[#1a0a0a] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-red-400" />
          <p className="text-white/50 text-sm">Loading attendance portal…</p>
        </div>
      </div>
    );
  }

  // ── Invalid QR ─────────────────────────────────────────────────────────────
  if (siteError || !site) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a14] via-[#0f0f1e] to-[#1a0a0a] flex items-center justify-center p-4">
        <div className="w-full max-w-xs text-center">
          <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-white font-bold text-xl mb-2">Invalid QR Code</h2>
          <p className="text-white/50 text-sm">
            This QR code is invalid or the site has been deactivated. Please contact your HR manager.
          </p>
        </div>
      </div>
    );
  }

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a14] via-[#0f0f1e] to-[#1a0a0a] flex items-center justify-center p-4">
        <div className="w-full max-w-xs">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-red-500/30">
              <span className="text-white font-black text-2xl">SP</span>
            </div>
            <h1 className="text-white font-bold text-xl">SmartPRO Hub</h1>
            <p className="text-white/40 text-xs mt-1 uppercase tracking-widest">Employee Attendance</p>
          </div>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-center">
            <span className="text-3xl mb-3 block">{typeMeta.icon}</span>
            <h2 className="text-white font-semibold text-lg mb-1">{site.name}</h2>
            {site.clientName && <p className="text-white/50 text-sm mb-1">{site.clientName}</p>}
            {site.location && (
              <p className="text-white/40 text-xs flex items-center justify-center gap-1 mb-5">
                <MapPin className="w-3 h-3" /> {site.location}
              </p>
            )}
            <Button
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold h-12 rounded-xl"
              onClick={() => {
                sessionStorage.setItem("postLoginRedirect", `/attend/${token}`);
                window.location.href = getLoginUrl();
              }}
            >
              <LogIn className="w-4 h-4 mr-2" /> Sign In to Continue
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Manual request submitted screen ────────────────────────────────────────
  if (done === "manual_submitted") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a14] via-[#0f0f1e] to-[#1a0a0a] flex items-center justify-center p-4">
        <div className="w-full max-w-xs text-center">
          <div className="w-24 h-24 rounded-full bg-amber-500/15 border-2 border-amber-500/60 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-amber-500/20">
            <FileText className="w-12 h-12 text-amber-400" />
          </div>
          <h2 className="text-white font-bold text-2xl mb-2">Request Submitted</h2>
          <p className="text-white/50 text-sm mb-5">
            Your manual check-in request has been sent to HR for review. You will be notified once it is approved.
          </p>
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-left space-y-2 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-white/40 text-xs">Site</span>
              <span className="text-white text-sm font-medium">{site.name}</span>
            </div>
            {site.clientName && (
              <div className="flex items-center justify-between">
                <span className="text-white/40 text-xs">Client</span>
                <span className="text-white text-sm">{site.clientName}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-white/40 text-xs">Submitted at</span>
              <span className="text-white text-sm font-semibold">{fmtDateTime(doneTime)}</span>
            </div>
            {distanceM != null && (
              <div className="flex items-center justify-between">
                <span className="text-white/40 text-xs">Distance</span>
                <span className="text-amber-400 text-sm">{Math.round(distanceM)}m from site</span>
              </div>
            )}
          </div>
          <p className="text-white/30 text-xs">You can close this page.</p>
        </div>
      </div>
    );
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a14] via-[#0f0f1e] to-[#1a0a0a] flex items-center justify-center p-4">
        <div className="w-full max-w-xs text-center">
          <div className="w-24 h-24 rounded-full bg-green-500/15 border-2 border-green-500/60 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-500/20">
            <CheckCircle2 className="w-12 h-12 text-green-400" />
          </div>
          <h2 className="text-white font-bold text-2xl mb-1">
            {done === "checked_in" ? "Checked In!" : "Checked Out!"}
          </h2>
          <p className="text-white/50 text-sm mb-4">
            {done === "checked_in" ? "Your attendance has been recorded." : "Have a great rest of your day!"}
          </p>
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 mb-4 text-left space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-white/40 text-xs">Site</span>
              <span className="text-white text-sm font-medium">{site.name}</span>
            </div>
            {site.clientName && (
              <div className="flex items-center justify-between">
                <span className="text-white/40 text-xs">Client</span>
                <span className="text-white text-sm">{site.clientName}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-white/40 text-xs">Time</span>
              <span className="text-white text-sm font-semibold">{fmtDateTime(doneTime)}</span>
            </div>
            {coords && (
              <div className="flex items-center justify-between">
                <span className="text-white/40 text-xs">GPS</span>
                <span className="text-white/60 text-xs font-mono">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>
              </div>
            )}
          </div>
          <p className="text-white/30 text-xs">You can close this page.</p>
        </div>
      </div>
    );
  }

  // ── Main check-in/out screen ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a14] via-[#0f0f1e] to-[#1a0a0a] flex flex-col items-center justify-center p-4 gap-5">
      {/* Brand */}
      <div className="text-center">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center mx-auto mb-2 shadow-lg shadow-red-500/30">
          <span className="text-white font-black text-sm">SP</span>
        </div>
        <p className="text-white/30 text-xs uppercase tracking-widest">SmartPRO Hub</p>
      </div>

      {/* Site card */}
      <div className="w-full max-w-xs rounded-2xl bg-white/5 border border-white/10 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0 text-lg">
            {typeMeta.icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold leading-tight truncate">{site.name}</p>
            {site.clientName && (
              <p className="text-white/50 text-xs mt-0.5">{site.clientName}</p>
            )}
            {site.location && (
              <p className="text-white/35 text-xs flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{site.location}</span>
              </p>
            )}
          </div>
        </div>
        {(site.operatingHoursStart && site.operatingHoursEnd) && (
          <div className="mt-3 pt-3 border-t border-white/8 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-white/30" />
            <span className="text-white/40 text-xs">
              {site.operatingHoursStart} – {site.operatingHoursEnd}
              {site.timezone ? ` (${site.timezone.split("/")[1]?.replace("_", " ") ?? site.timezone})` : ""}
            </span>
            {hoursBlocked && (
              <Badge className="ml-auto bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Closed</Badge>
            )}
          </div>
        )}
      </div>

      {/* Live clock */}
      <div className="text-center">
        <p className="text-white font-bold text-4xl tracking-tight tabular-nums">{timeStr}</p>
        <p className="text-white/35 text-sm mt-1">{dateStr}</p>
      </div>

      {/* GPS / Geo-fence section */}
      <div className="w-full max-w-xs">
        {geoLoading ? (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            <span className="text-amber-400 text-sm">Locating you…</span>
          </div>
        ) : geoError ? (
          <div className="rounded-xl bg-orange-500/10 border border-orange-500/25 p-3 flex items-start gap-2">
            <WifiOff className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-orange-300 text-sm font-medium">GPS unavailable</p>
              <p className="text-orange-400/70 text-xs mt-0.5">
                {site.enforceGeofence
                  ? "Location is required for this site. Please enable GPS."
                  : "Proceeding without GPS verification."}
              </p>
            </div>
          </div>
        ) : siteLat != null && distanceM != null ? (
          <div className="space-y-3">
            <ProximityRing distanceM={distanceM} radiusM={siteRadius} inside={insideGeofence} />
            <div className="flex items-center justify-center gap-2">
              {insideGeofence ? (
                <Badge className="bg-green-500/15 text-green-400 border-green-500/30 gap-1">
                  <ShieldCheck className="w-3 h-3" /> Within geo-fence
                </Badge>
              ) : (
                <Badge className="bg-red-500/15 text-red-400 border-red-500/30 gap-1">
                  <ShieldX className="w-3 h-3" />
                  {Math.round(distanceM - siteRadius)}m outside boundary
                </Badge>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-2">
            <Navigation className="w-4 h-4 text-green-400" />
            <span className="text-green-400 text-sm">GPS active — no geo-fence set</span>
          </div>
        )}
      </div>

      {/* Geo-fence block: show justification form instead of hard block */}
      {geoBlocked && !isCheckedIn && (
        <div className="w-full max-w-xs space-y-3">
          {!showJustificationForm ? (
            <div className="rounded-xl bg-red-500/10 border border-red-500/25 p-4 text-center">
              <ShieldX className="w-5 h-5 text-red-400 mx-auto mb-2" />
              <p className="text-red-300 text-sm font-semibold">Outside geo-fence</p>
              <p className="text-red-400/70 text-xs mt-1 mb-3">
                You are {Math.round(distanceM! - siteRadius)}m outside the allowed boundary.
                You can submit a manual check-in request for HR approval.
              </p>
              <Button
                size="sm"
                className="w-full bg-amber-600/80 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg"
                onClick={() => setShowJustificationForm(true)}
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" /> Request Manual Check-in
              </Button>
            </div>
          ) : (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-amber-300 text-sm font-semibold">Manual Check-in Request</p>
              </div>
              <p className="text-amber-400/70 text-xs">
                Explain why you are unable to check in from within the geo-fence. HR will review and approve or reject your request.
              </p>
              <Textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="e.g. I am at the client site but the GPS is not accurate due to the mall's indoor signal..."
                className="bg-white/5 border-white/15 text-white placeholder:text-white/25 text-sm resize-none min-h-[90px] rounded-xl"
                maxLength={500}
              />
              <p className="text-white/25 text-xs text-right">{justification.length}/500</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-white/15 text-white/50 hover:text-white text-xs rounded-lg"
                  onClick={() => { setShowJustificationForm(false); setJustification(""); }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg"
                  disabled={justification.trim().length < 10 || manualCheckInMutation.isPending}
                  onClick={handleManualSubmit}
                >
                  {manualCheckInMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <><Send className="w-3.5 h-3.5 mr-1.5" /> Submit Request</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {hoursBlocked && (
        <div className="w-full max-w-xs rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-center">
          <Timer className="w-5 h-5 text-amber-400 mx-auto mb-1" />
          <p className="text-amber-300 text-sm font-medium">Outside operating hours</p>
          <p className="text-amber-400/70 text-xs mt-0.5">
            This site accepts check-ins between {site.operatingHoursStart} – {site.operatingHoursEnd}.
          </p>
        </div>
      )}

      {/* Current status */}
      {isCheckedIn && todayRecord && (
        <div className="w-full max-w-xs rounded-xl bg-green-500/10 border border-green-500/25 p-3 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
          <div>
            <p className="text-green-300 text-sm font-medium">Currently checked in</p>
            <p className="text-green-400/70 text-xs">Since {new Date(todayRecord.checkIn).toLocaleTimeString()}</p>
          </div>
        </div>
      )}

      {/* Action button */}
      <div className="w-full max-w-xs">
        <Button
          className={`w-full h-14 rounded-2xl text-base font-bold shadow-xl transition-all ${
            isCheckedIn
              ? "bg-orange-600 hover:bg-orange-700 shadow-orange-500/25"
              : canSubmit
              ? "bg-red-600 hover:bg-red-700 shadow-red-500/25"
              : "bg-white/10 text-white/40 cursor-not-allowed"
          }`}
          disabled={isMutating || !canSubmit || (geoError && !!site.enforceGeofence)}
          onClick={handleAction}
        >
          {isMutating ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isCheckedIn ? (
            <><CheckOutIcon className="w-5 h-5 mr-2" /> Check Out</>
          ) : (
            <><LogIn className="w-5 h-5 mr-2" /> Check In</>
          )}
        </Button>
        <p className="text-white/25 text-xs text-center mt-3">
          Signed in as <span className="text-white/40">{user.name}</span>
        </p>
      </div>
    </div>
  );
}
