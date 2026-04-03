/**
 * AttendCheckInPage — Public GPS QR Check-in/Check-out page
 *
 * Route: /attend/:token
 * Access: Public (no auth required to view), but auth required to submit
 *
 * Flow:
 *   1. Page loads with QR token from URL
 *   2. Resolves site name from token (public procedure)
 *   3. Requests GPS location from browser
 *   4. Employee clicks Check In / Check Out
 *   5. Shows confirmation with timestamp
 */
import React, { useState, useEffect } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MapPin, Clock, CheckCircle2, LogIn, LogOut,
  Building2, Wifi, WifiOff, AlertCircle, Loader2,
  Navigation,
} from "lucide-react";

function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

type GeoState = "idle" | "requesting" | "granted" | "denied";

export default function AttendCheckInPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const { user, loading: authLoading } = useAuth();

  const [geoState, setGeoState] = useState<GeoState>("idle");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [done, setDone] = useState<"checked_in" | "checked_out" | null>(null);
  const [doneTime, setDoneTime] = useState<Date | null>(null);

  // Resolve site from token
  const { data: site, isLoading: siteLoading, error: siteError } = trpc.attendance.getSiteByToken.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  // Get today's attendance for this user
  const { data: todayRecord, refetch: refetchToday } = trpc.attendance.myToday.useQuery(
    undefined,
    { enabled: !!user }
  );

  const checkInMutation = trpc.attendance.checkIn.useMutation({
    onSuccess: (record) => {
      setDone("checked_in");
      setDoneTime(new Date(record.checkIn));
      refetchToday();
      toast.success("Checked in successfully!");
    },
    onError: (err) => {
      toast.error(err.message || "Check-in failed");
    },
  });

  const checkOutMutation = trpc.attendance.checkOut.useMutation({
    onSuccess: () => {
      setDone("checked_out");
      setDoneTime(new Date());
      refetchToday();
      toast.success("Checked out successfully!");
    },
    onError: (err) => {
      toast.error(err.message || "Check-out failed");
    },
  });

  // Request GPS on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoState("denied");
      return;
    }
    setGeoState("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoState("granted");
      },
      () => {
        setGeoState("denied");
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const isCheckedIn = !!todayRecord && !todayRecord.checkOut;
  const isMutating = checkInMutation.isPending || checkOutMutation.isPending;

  function handleAction() {
    if (!user) return;
    if (isCheckedIn) {
      checkOutMutation.mutate({
        siteToken: token,
        lat: coords?.lat,
        lng: coords?.lng,
      });
    } else {
      checkInMutation.mutate({
        siteToken: token,
        lat: coords?.lat,
        lng: coords?.lng,
      });
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (siteLoading || authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f0f1a] to-[#1a1a2e] flex items-center justify-center">
        <div className="text-center text-white">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-red-400" />
          <p className="text-white/60">Loading attendance portal…</p>
        </div>
      </div>
    );
  }

  // ── Invalid / inactive QR ──────────────────────────────────────────────────
  if (siteError || !site) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f0f1a] to-[#1a1a2e] flex items-center justify-center p-4">
        <Card className="w-full max-w-sm bg-white/5 border-white/10 text-white text-center">
          <CardContent className="pt-8 pb-8">
            <AlertCircle className="w-14 h-14 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Invalid QR Code</h2>
            <p className="text-white/60 text-sm">
              This QR code is invalid or has been deactivated. Please contact your HR manager.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f0f1a] to-[#1a1a2e] flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          {/* Brand */}
          <div className="mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-500/30">
              <span className="text-white font-black text-2xl">SP</span>
            </div>
            <h1 className="text-white font-bold text-2xl">SmartPRO Hub</h1>
            <p className="text-white/50 text-sm mt-1">Employee Attendance</p>
          </div>

          <Card className="bg-white/5 border-white/10 text-white">
            <CardContent className="pt-6 pb-6">
              <Building2 className="w-10 h-10 text-blue-400 mx-auto mb-3" />
              <h2 className="font-semibold text-lg mb-1">{site.name}</h2>
              {site.location && (
                <p className="text-white/50 text-sm flex items-center justify-center gap-1 mb-4">
                  <MapPin className="w-3 h-3" /> {site.location}
                </p>
              )}
              <p className="text-white/60 text-sm mb-5">
                Please sign in to mark your attendance at this location.
              </p>
              <Button
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold"
                onClick={() => {
                  sessionStorage.setItem("postLoginRedirect", `/attend/${token}`);
                  window.location.href = getLoginUrl();
                }}
              >
                <LogIn className="w-4 h-4 mr-2" />
                Sign In to Continue
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Success confirmation ───────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f0f1a] to-[#1a1a2e] flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-400" />
          </div>
          <h2 className="text-white font-bold text-2xl mb-2">
            {done === "checked_in" ? "Checked In!" : "Checked Out!"}
          </h2>
          <p className="text-white/60 text-sm mb-1">{site.name}</p>
          {site.location && (
            <p className="text-white/40 text-xs flex items-center justify-center gap-1 mb-4">
              <MapPin className="w-3 h-3" /> {site.location}
            </p>
          )}
          <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/10">
            <p className="text-white/50 text-xs uppercase tracking-wide mb-1">Time</p>
            <p className="text-white font-semibold text-lg">{fmtDateTime(doneTime)}</p>
          </div>
          {coords && (
            <p className="text-white/30 text-xs flex items-center justify-center gap-1">
              <Navigation className="w-3 h-3" />
              GPS: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Main check-in/out screen ───────────────────────────────────────────────
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0f1a] to-[#1a1a2e] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-red-500/30">
            <span className="text-white font-black text-lg">SP</span>
          </div>
          <p className="text-white/40 text-xs uppercase tracking-widest">SmartPRO Hub</p>
        </div>

        {/* Site info card */}
        <Card className="bg-white/5 border-white/10 text-white mb-4">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-blue-400" />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-base leading-tight">{site.name}</h2>
                {site.location && (
                  <p className="text-white/50 text-xs flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{site.location}</span>
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Time display */}
        <div className="text-center mb-5">
          <p className="text-white font-bold text-4xl tracking-tight">{timeStr}</p>
          <p className="text-white/40 text-sm mt-1">{dateStr}</p>
        </div>

        {/* GPS status */}
        <div className="flex items-center justify-center gap-2 mb-5">
          {geoState === "requesting" && (
            <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-500/10 gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Locating…
            </Badge>
          )}
          {geoState === "granted" && (
            <Badge variant="outline" className="border-green-500/50 text-green-400 bg-green-500/10 gap-1">
              <Wifi className="w-3 h-3" /> GPS Active
            </Badge>
          )}
          {geoState === "denied" && (
            <Badge variant="outline" className="border-orange-500/50 text-orange-400 bg-orange-500/10 gap-1">
              <WifiOff className="w-3 h-3" /> No GPS (will proceed anyway)
            </Badge>
          )}
        </div>

        {/* Today's status */}
        {todayRecord && (
          <Card className="bg-white/5 border-white/10 text-white mb-4">
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">Check-in</span>
                <span className="font-medium">{fmtTime(todayRecord.checkIn)}</span>
              </div>
              {todayRecord.checkOut && (
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-white/50">Check-out</span>
                  <span className="font-medium">{fmtTime(todayRecord.checkOut)}</span>
                </div>
              )}
              {!todayRecord.checkOut && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-green-400 text-xs">Currently checked in</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Employee greeting */}
        <p className="text-white/40 text-xs text-center mb-4">
          Signed in as <span className="text-white/70">{user.name}</span>
        </p>

        {/* Action button */}
        {todayRecord?.checkOut ? (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <p className="text-white/60 text-sm">Attendance recorded for today</p>
          </div>
        ) : (
          <Button
            className={`w-full h-14 text-lg font-bold rounded-2xl shadow-lg transition-all ${
              isCheckedIn
                ? "bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 shadow-orange-500/30"
                : "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-green-500/30"
            }`}
            onClick={handleAction}
            disabled={isMutating || geoState === "requesting"}
          >
            {isMutating ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : isCheckedIn ? (
              <LogOut className="w-5 h-5 mr-2" />
            ) : (
              <LogIn className="w-5 h-5 mr-2" />
            )}
            {isMutating ? "Processing…" : isCheckedIn ? "Check Out" : "Check In"}
          </Button>
        )}

        <p className="text-white/20 text-xs text-center mt-6">
          SmartPRO Hub · Secure Attendance
        </p>
      </div>
    </div>
  );
}
