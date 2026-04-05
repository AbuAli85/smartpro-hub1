import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Shield, Calendar, User, Building2, MapPin,
  RefreshCw, XCircle, AlertTriangle, CheckCircle2, Clock, Loader2, FileText
} from "lucide-react";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";
import { DateInput } from "@/components/ui/date-input";

function statusColor(status: string) {
  const s = status?.toLowerCase();
  if (s === "active" || s === "valid") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (s === "expired") return "bg-red-100 text-red-800 border-red-200";
  if (s === "expiring_soon") return "bg-amber-100 text-amber-800 border-amber-200";
  if (s === "pending" || s === "in_grace") return "bg-blue-100 text-blue-800 border-blue-200";
  if (s === "cancelled" || s === "transferred") return "bg-gray-100 text-gray-700 border-gray-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

function InfoRow({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-muted/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium text-foreground text-right max-w-[60%] ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );
}

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function WorkforcePermitDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const permitId = parseInt(params.id || "0");

  const [renewDialog, setRenewDialog] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [renewNote, setRenewNote] = useState("");
  const [cancelNote, setCancelNote] = useState("");
  const [newExpiry, setNewExpiry] = useState("");

  const { data: permit, isLoading, refetch } = trpc.workforce.workPermits.getById.useQuery(
    { workPermitId: permitId },
    { enabled: permitId > 0 }
  );

  const utils = trpc.useUtils();

  // Renewal is handled by creating a compliance case of type "renewal"
  const renewMutation = trpc.workforce.cases.create.useMutation({
    onSuccess: () => {
      toast.success("Renewal case created successfully");
      setRenewDialog(false);
      setRenewNote("");
      setNewExpiry("");
      utils.workforce.workPermits.list.invalidate();
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Failed to submit renewal"),
  });

  // Cancellation is handled by creating a compliance case of type "cancellation"
  const cancelMutation = trpc.workforce.cases.create.useMutation({
    onSuccess: () => {
      toast.success("Cancellation case created");
      setCancelDialog(false);
      setCancelNote("");
      utils.workforce.workPermits.list.invalidate();
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Failed to cancel permit"),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-card px-6 py-4 flex items-center gap-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!permit) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Work permit not found or access denied.</p>
          <Button variant="outline" onClick={() => navigate("/workforce/permits")}>
            Back to Permits
          </Button>
        </div>
      </div>
    );
  }

  const p = permit as any;
  const daysLeft = daysUntil(p.expiryDate);
  const isExpired = daysLeft !== null && daysLeft < 0;
  const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;
  const canRenew = p.status !== "cancelled" && p.status !== "transferred";
  const canCancel = p.status === "active" || p.status === "valid" || p.status === "pending";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/workforce/permits")} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex-1">
            <h1 className="text-lg font-semibold font-mono">{p.permitNumber || `Permit #${permitId}`}</h1>
            <p className="text-xs text-muted-foreground capitalize">
              {p.permitType?.replace(/_/g, " ") || "Work Permit"} · {p.occupationTitleEn || p.occupationCode || "—"}
            </p>
          </div>
          <Badge className={`text-xs border ${statusColor(p.status)}`}>
            {p.status?.replace(/_/g, " ")}
          </Badge>
          <div className="flex flex-wrap gap-2">
            {canRenew && (
              <Button size="sm" variant="outline" onClick={() => setRenewDialog(true)} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Renew
              </Button>
            )}
            {canCancel && (
              <Button size="sm" variant="destructive" onClick={() => setCancelDialog(true)} className="gap-2">
                <XCircle className="w-4 h-4" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {/* Expiry alert */}
        {isExpired && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 flex gap-3 text-sm text-red-800">
            <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Permit Expired</p>
              <p>This work permit expired {Math.abs(daysLeft!)} days ago. Immediate renewal or cancellation is required.</p>
            </div>
          </div>
        )}
        {isExpiringSoon && !isExpired && (
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 flex gap-3 text-sm text-amber-800">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Expiring in {daysLeft} days</p>
              <p>This permit expires on {p.expiryDate}. Initiate renewal to avoid compliance issues.</p>
            </div>
          </div>
        )}

        {/* Key metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[
            {
              label: "Days Remaining",
              value: daysLeft === null ? "N/A" : isExpired ? "Expired" : `${daysLeft}d`,
              icon: Clock,
              color: isExpired ? "text-red-600" : isExpiringSoon ? "text-amber-600" : "text-emerald-600",
            },
            {
              label: "Permit Type",
              value: p.permitType?.replace(/_/g, " ") || "—",
              icon: FileText,
              color: "text-blue-600",
            },
            {
              label: "Renewals",
              value: `${p.renewalCount ?? 0}`,
              icon: RefreshCw,
              color: "text-purple-600",
            },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="shadow-sm">
              <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
                <Icon className={`w-7 h-7 ${color}`} />
                <div>
                  <p className="text-xl font-bold capitalize">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Permit Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <InfoRow label="Permit Number" value={p.permitNumber} mono />
              <InfoRow label="Labour Auth. No." value={p.labourAuthorisationNumber} mono />
              <InfoRow label="Permit Type" value={p.permitType?.replace(/_/g, " ")} />
              <InfoRow label="Status" value={p.status?.replace(/_/g, " ")} />
              <InfoRow label="Issue Date" value={p.issueDate} />
              <InfoRow label="Expiry Date" value={p.expiryDate} />
              <InfoRow label="Duration (months)" value={p.durationMonths?.toString()} />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                Employee & Occupation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <InfoRow label="Civil ID" value={p.civilId} mono />
              <InfoRow label="Occupation Code" value={p.occupationCode} mono />
              <InfoRow label="Occupation (EN)" value={p.occupationTitleEn} />
              <InfoRow label="Occupation (AR)" value={p.occupationTitleAr} />
              <InfoRow label="Skill Level" value={p.skillLevel} />
              <InfoRow label="Activity Code" value={p.activityCode} mono />
              <InfoRow label="Activity (EN)" value={p.activityNameEn} />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                Sponsor / Employer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <InfoRow label="Company Name (EN)" value={p.companyNameEn} />
              <InfoRow label="Company Name (AR)" value={p.companyNameAr} />
              <InfoRow label="CR Number" value={p.crNumber} mono />
              <InfoRow label="Sponsor ID" value={p.sponsorId} mono />
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                Work Location
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <InfoRow label="Governorate" value={p.workLocationGovernorate} />
              <InfoRow label="Wilayat" value={p.workLocationWilayat} />
              <InfoRow label="Area" value={p.workLocationArea} />
            </CardContent>
          </Card>
        </div>

        {/* Renewal history */}
        {p.renewals && p.renewals.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-primary" />
                Renewal History ({p.renewals.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th scope="col" className="text-left px-4 py-2.5 font-medium">Renewal #</th>
                    <th scope="col" className="text-left px-4 py-2.5 font-medium">New Expiry</th>
                    <th scope="col" className="text-left px-4 py-2.5 font-medium">Status</th>
                    <th scope="col" className="text-left px-4 py-2.5 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {p.renewals.map((r: any, idx: number) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2.5">#{idx + 1}</td>
                      <td className="px-4 py-2.5">{r.newExpiryDate || "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge className={`text-xs ${statusColor(r.status)}`}>{r.status}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {r.createdAt ? fmtDate(r.createdAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Renew Dialog */}
      <Dialog open={renewDialog} onOpenChange={setRenewDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" />
              Renew Work Permit
            </DialogTitle>
            <DialogDescription>
              Submit a renewal request for permit <span className="font-mono font-semibold">{p.permitNumber}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="newExpiry">New Expiry Date</Label>
              <DateInput
                id="newExpiry"
                
                value={newExpiry}
                onChange={(e) => setNewExpiry(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="renewNote">Notes (optional)</Label>
              <Textarea
                id="renewNote"
                placeholder="Add any notes about this renewal request..."
                value={renewNote}
                onChange={(e) => setRenewNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewDialog(false)}>Cancel</Button>
            <Button
              onClick={() => renewMutation.mutate({ workPermitId: permitId, caseType: "renewal", notes: renewNote || undefined, dueDate: newExpiry || undefined })}
              disabled={!newExpiry || renewMutation.isPending}
              className="gap-2"
            >
              {renewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Submit Renewal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" />
              Cancel Work Permit
            </DialogTitle>
            <DialogDescription>
              This will mark permit <span className="font-mono font-semibold">{p.permitNumber}</span> as cancelled.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cancelNote">Reason for Cancellation</Label>
              <Textarea
                id="cancelNote"
                placeholder="Provide a reason for cancellation..."
                value={cancelNote}
                onChange={(e) => setCancelNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(false)}>Keep Permit</Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate({ workPermitId: permitId, caseType: "cancellation", notes: cancelNote })}
              disabled={!cancelNote.trim() || cancelMutation.isPending}
              className="gap-2"
            >
              {cancelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
