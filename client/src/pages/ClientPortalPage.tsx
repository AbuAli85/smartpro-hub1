import { useState, useEffect } from "react";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  FileText, CreditCard, Shield, Building2, ShoppingBag,
  Bell, MessageSquare, LayoutDashboard, AlertTriangle, CheckCircle2,
  Clock, XCircle, Download, Send, ChevronRight, Star, Eye, User,
  PlusCircle, FolderOpen, CalendarClock, Zap, Users2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ─── Helpers ──────────────────────────────────────────────────────────────────


function fmtOMR(n: number | string | null | undefined) {
  return `OMR ${Number(n ?? 0).toFixed(3)}`;
}

function severityColor(s: string) {
  if (s === "critical") return "bg-red-100 text-red-700 border-red-200";
  if (s === "high") return "bg-orange-100 text-orange-700 border-orange-200";
  if (s === "medium") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700",
    signed: "bg-emerald-100 text-emerald-700",
    pending_signature: "bg-blue-100 text-blue-700",
    draft: "bg-gray-100 text-gray-600",
    expired: "bg-red-100 text-red-700",
    terminated: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-500",
    pending: "bg-amber-100 text-amber-700",
    paid: "bg-emerald-100 text-emerald-700",
    overdue: "bg-red-100 text-red-700",
    waived: "bg-gray-100 text-gray-500",
    confirmed: "bg-emerald-100 text-emerald-700",
    completed: "bg-blue-100 text-blue-700",
    in_progress: "bg-blue-100 text-blue-700",
    assigned: "bg-blue-100 text-blue-700",
    submitted_to_authority: "bg-purple-100 text-purple-700",
    awaiting_documents: "bg-amber-100 text-amber-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700",
    action_required: "bg-red-100 text-red-700",
    in_review: "bg-purple-100 text-purple-700",
    submitted: "bg-purple-100 text-purple-700",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
}

function CaseIcon({ status }: { status: string }) {
  if (["approved", "completed", "signed", "paid"].includes(status))
    return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (["rejected", "cancelled", "terminated"].includes(status))
    return <XCircle className="w-4 h-4 text-red-500" />;
  if (["action_required"].includes(status))
    return <AlertTriangle className="w-4 h-4 text-red-500" />;
  return <Clock className="w-4 h-4 text-amber-500" />;
}

function KPICard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Sub-Tab Components ──────────────────────────────────────────────────────

const SERVICE_TYPES = [
  "Work Permit Application",
  "Work Permit Renewal",
  "Residence Visa Application",
  "Residence Visa Renewal",
  "PASI Registration",
  "PASI Contribution Query",
  "Labour Card Issuance",
  "Labour Card Renewal",
  "CR Amendment",
  "Municipality Permit",
  "Employment Contract Attestation",
  "Exit Re-Entry Visa",
  "Final Exit Visa",
  "Salary Certificate",
  "Other Government Service",
];

function ServiceRequestTab() {
  const [serviceType, setServiceType] = useState("");
  const [description, setDescription] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [urgency, setUrgency] = useState<"normal" | "urgent" | "critical">("normal");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const submitMutation = trpc.clientPortal.submitServiceRequest.useMutation({
    onSuccess: (data) => {
      setSubmitted(data.referenceNumber);
      setServiceType(""); setDescription(""); setContactName(""); setContactPhone(""); setContactEmail("");
      toast.success(`Service request submitted! Ref: ${data.referenceNumber}`);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="max-w-2xl space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Zap size={16} className="text-[var(--smartpro-orange)]" />
            Submit a New Service Request
          </CardTitle>
          <p className="text-sm text-muted-foreground">Our PRO team will contact you within 2 business hours. All requests are tracked with a reference number.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {submitted && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">Request Submitted Successfully</p>
                <p className="text-xs text-emerald-700">Reference: <span className="font-mono font-bold">{submitted}</span> — Our team will contact you shortly.</p>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Service Type *</label>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select service type..." /></SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Urgency Level *</label>
            <div className="flex gap-2 mt-1">
              {(["normal", "urgent", "critical"] as const).map(u => (
                <button key={u} onClick={() => setUrgency(u)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    urgency === u
                      ? u === "critical" ? "bg-red-600 text-white border-red-600"
                        : u === "urgent" ? "bg-orange-500 text-white border-orange-500"
                        : "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}>
                  {u.charAt(0).toUpperCase() + u.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description *</label>
            <Textarea className="mt-1" rows={4} placeholder="Describe your request in detail. Include employee names, passport numbers, or any relevant reference numbers..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact Name *</label>
              <Input className="mt-1" placeholder="Your name" value={contactName} onChange={e => setContactName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact Phone *</label>
              <Input className="mt-1" placeholder="+968 XXXX XXXX" value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email (optional)</label>
            <Input className="mt-1" type="email" placeholder="your@email.com" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
          </div>
          <Button
            className="w-full gap-2"
            disabled={!serviceType || !description.trim() || !contactName.trim() || !contactPhone.trim() || submitMutation.isPending}
            onClick={() => submitMutation.mutate({ serviceType, description, contactName, contactPhone, contactEmail: contactEmail || undefined, urgency })}
          >
            <Send className="w-4 h-4" />
            {submitMutation.isPending ? "Processing..." : "Submit Service Request"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function MyDocumentsTab() {
  const { data: docs, isLoading } = trpc.clientPortal.listMyDocuments.useQuery();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">My Documents</h3>
        <Badge variant="secondary">{docs?.length ?? 0} documents</Badge>
      </div>
      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : !docs?.length ? (
        <Card className="border-0 shadow-sm"><CardContent className="py-10 text-center text-muted-foreground"><FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="text-sm">No documents found for your company.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <Card key={`${doc.category}-${doc.id}`} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      doc.category === "Contract" ? "bg-blue-100" : "bg-purple-100"
                    }`}>
                      <FileText className={`w-4 h-4 ${doc.category === "Contract" ? "text-blue-600" : "text-purple-600"}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{(doc as any).title ?? String((doc as any).type ?? "")}</p>
                      <p className="text-xs text-muted-foreground">{doc.category} · {fmtDate(doc.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs ${statusBadge(doc.status ?? "pending")}`}>{doc.status ?? "pending"}</Badge>
                    {doc.url && (
                      <a href={doc.url} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Download className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Download</span>
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function UpcomingRenewalsTab() {
  const [, navigate] = useLocation();
  const { data: renewals, isLoading, refetch } = trpc.clientPortal.getUpcomingRenewals.useQuery();
  const [renewTarget, setRenewTarget] = useState<{ id: number; label: string } | null>(null);
  const [renewNotes, setRenewNotes] = useState("");
  const requestRenewal = trpc.engagements.requestRenewal.useMutation({
    onSuccess: (r) => {
      toast.success("Renewal request submitted");
      setRenewTarget(null);
      setRenewNotes("");
      refetch();
      navigate(`/engagements/${r.engagementId}`);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Upcoming Renewals</h3>
        <Badge variant="secondary">{renewals?.length ?? 0} items</Badge>
      </div>
      <Dialog open={renewTarget != null} onOpenChange={(o) => !o && setRenewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request renewal</DialogTitle>
            <DialogDescription>
              {renewTarget?.label ?? ""} — SmartPRO will open a tracked engagement and follow up.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            placeholder="Notes for our team (required)…"
            value={renewNotes}
            onChange={(e) => setRenewNotes(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewTarget(null)}>Cancel</Button>
            <Button
              disabled={!renewNotes.trim() || requestRenewal.isPending || !renewTarget}
              onClick={() => {
                if (!renewTarget) return;
                requestRenewal.mutate({ workPermitId: renewTarget.id, notes: renewNotes.trim() });
              }}
            >
              {requestRenewal.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : !renewals?.length ? (
        <Card className="border-0 shadow-sm"><CardContent className="py-10 text-center text-muted-foreground"><CalendarClock className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="text-sm">No renewals due in the next 90 days.</p><p className="text-xs mt-1">All permits and documents are up to date.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {renewals.map((r) => (
            <Card key={r.id} className={`border-0 shadow-sm ${
              (r.daysRemaining ?? 999) <= 14 ? "border-l-4 border-l-red-500" :
              (r.daysRemaining ?? 999) <= 30 ? "border-l-4 border-l-orange-500" :
              "border-l-4 border-l-amber-400"
            }`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      (r.daysRemaining ?? 999) <= 14 ? "bg-red-100" :
                      (r.daysRemaining ?? 999) <= 30 ? "bg-orange-100" : "bg-amber-100"
                    }`}>
                      <CalendarClock className={`w-4 h-4 ${
                        (r.daysRemaining ?? 999) <= 14 ? "text-red-600" :
                        (r.daysRemaining ?? 999) <= 30 ? "text-orange-600" : "text-amber-600"
                      }`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{r.type} — {r.reference}</p>
                      <p className="text-xs text-muted-foreground">Expires: {fmtDate(r.expiryDate)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs ${
                      (r.daysRemaining ?? 999) <= 14 ? "bg-red-100 text-red-700" :
                      (r.daysRemaining ?? 999) <= 30 ? "bg-orange-100 text-orange-700" :
                      "bg-amber-100 text-amber-700"
                    }`}>
                      {r.daysRemaining != null ? `${r.daysRemaining}d left` : "Expiring"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={() => {
                        setRenewNotes("");
                        setRenewTarget({ id: r.id, label: `${r.type} — ${r.reference}` });
                      }}
                    >
                      <Send className="w-3 h-3" />
                      Request Renewal
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

type StaffingInvoice = RouterOutputs["clientPortal"]["getMyStaffingInvoice"];

function StaffingInvoiceTab({
  data,
  isLoading,
  month,
  onMonthChange,
}: {
  data: StaffingInvoice | undefined;
  isLoading: boolean;
  month: string;
  onMonthChange: (m: string) => void;
}) {
  const fmt = (n: number) =>
    `OMR ${n.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

  const handleExportCsv = () => {
    if (!data?.groups?.length) return;
    const rows: string[][] = [
      ["Site", "Promoter", "Billable Days", "Billable Hours", "Daily Rate (OMR)", "Amount (OMR)"],
    ];
    for (const g of data.groups) {
      for (const p of g.promoters) {
        rows.push([
          g.siteName,
          p.employeeName,
          String(p.billableDays),
          String(p.billableHours),
          g.dailyRateOmr.toFixed(3),
          p.amountOmr.toFixed(3),
        ]);
      }
      rows.push([
        g.siteName,
        "SUBTOTAL",
        String(g.totalBillableDays),
        String(g.totalBillableHours),
        g.dailyRateOmr.toFixed(3),
        g.totalAmountOmr.toFixed(3),
      ]);
    }
    rows.push(["GRAND TOTAL", "", "", "", "", (data.grandTotalOmr ?? 0).toFixed(3)]);
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, "\"\"")}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staffing-invoice-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  if (data?.hasNoSites) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-12 text-center text-muted-foreground">
          <Users2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No promoter deployments found</p>
          <p className="text-sm mt-1">
            Contact your account manager to set up staffing assignments for your locations.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Input
            type="month"
            value={month}
            onChange={(e) => onMonthChange(e.target.value)}
            className="w-40 h-8 text-sm"
          />
          <span className="text-sm text-muted-foreground">
            {data?.groups?.length ?? 0} site{(data?.groups?.length ?? 0) !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {(data?.grandTotalOmr ?? 0) > 0 && (
            <span className="text-sm font-semibold">{fmt(data?.grandTotalOmr ?? 0)}</span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCsv}
            disabled={!data?.groups?.length}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Empty month */}
      {!data?.groups?.length && !data?.hasNoSites && (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-10 text-center text-muted-foreground">
            <p>No staffing records for {month}.</p>
            <p className="text-xs mt-1">Try a different month or contact your account manager.</p>
          </CardContent>
        </Card>
      )}

      {/* Invoice groups */}
      {data?.groups?.map((g) => (
        <Card key={g.siteId} className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">{g.siteName}</CardTitle>
                {g.clientName && (
                  <p className="text-xs text-muted-foreground mt-0.5">{g.clientName}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">{fmt(g.totalAmountOmr)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {g.totalBillableDays} days × {fmt(g.dailyRateOmr)}/day
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {g.dailyRateOmr === 0 && (
              <p className="text-xs text-amber-600 mb-2">
                Daily rate pending — contact your account manager for the contracted rate.
              </p>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted-foreground border-b">
                  <th className="text-left py-1.5 font-medium">Promoter</th>
                  <th className="text-right py-1.5 font-medium">Days</th>
                  <th className="text-right py-1.5 font-medium">Hours</th>
                  <th className="text-right py-1.5 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {g.promoters.map((p) => (
                  <tr key={p.employeeId} className="border-b border-muted/40">
                    <td className="py-1.5">{p.employeeName}</td>
                    <td className="text-right py-1.5 tabular-nums">{p.billableDays}</td>
                    <td className="text-right py-1.5 tabular-nums text-muted-foreground">{p.billableHours}h</td>
                    <td className="text-right py-1.5 tabular-nums font-medium">{fmt(p.amountOmr)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="pt-2">Subtotal</td>
                  <td className="text-right pt-2 tabular-nums">{g.totalBillableDays}</td>
                  <td className="text-right pt-2 tabular-nums text-muted-foreground">{g.totalBillableHours}h</td>
                  <td className="text-right pt-2 tabular-nums">{fmt(g.totalAmountOmr)}</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      ))}

      {/* Grand total footer */}
      {(data?.groups?.length ?? 0) > 1 && (
        <div className="flex justify-end">
          <div className="text-right bg-muted/40 rounded-lg px-4 py-2.5">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Grand total</p>
            <p className="text-lg font-bold">{fmt(data?.grandTotalOmr ?? 0)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClientPortalPage() {
  const { t } = useTranslation("clientPortal");
  const { t: te } = useTranslation("engagements");
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("dashboard");
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const [staffingMonth, setStaffingMonth] = useState(currentMonth);

  useEffect(() => {
    const q = new URLSearchParams(location.split("?")[1] ?? "");
    const tab = q.get("tab");
    const allowed = new Set([
      "dashboard", "contracts", "invoices", "staffing", "pro-services", "gov-cases", "bookings",
      "alerts", "messages", "service-request", "my-documents", "renewals",
    ]);
    if (tab && allowed.has(tab)) setActiveTab(tab);
  }, [location]);
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgCategory, setMsgCategory] = useState<"general" | "billing" | "contract" | "pro_service" | "government_case" | "technical">("general");
  const [paymentFocus, setPaymentFocus] = useState<RouterOutputs["clientPortal"]["listInvoices"]["items"][number] | null>(null);

  const { data: dashboard, isLoading: dashLoading } = trpc.clientPortal.getDashboard.useQuery();
  const { data: contractsData } = trpc.clientPortal.listContracts.useQuery({ pageSize: 50 });
  const { data: invoicesData } = trpc.clientPortal.listInvoices.useQuery({ pageSize: 50 });
  const { data: staffingInvoice, isLoading: staffingLoading } =
    trpc.clientPortal.getMyStaffingInvoice.useQuery(
      { month: staffingMonth },
      { retry: false },
    );
  const { data: proServicesData } = trpc.clientPortal.listProServices.useQuery({ pageSize: 50 });
  const { data: govCasesData } = trpc.clientPortal.listGovernmentCases.useQuery({ pageSize: 50 });
  const [ratingBooking, setRatingBooking] = useState<any | null>(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingReview, setRatingReview] = useState("");
  const { data: bookingsData, refetch: refetchBookings } = trpc.clientPortal.listBookings.useQuery({ pageSize: 50 });
  const submitReview = trpc.marketplace.submitReview.useMutation({
    onSuccess: () => {
      toast.success("Rating submitted! Thank you.");
      setRatingBooking(null); setRatingValue(0); setRatingReview("");
      refetchBookings();
    },
    onError: (e) => toast.error(e.message),
  });
  const { data: alertsData } = trpc.clientPortal.getExpiryAlerts.useQuery({ daysAhead: 90 });
  const { data: unifiedMessages, refetch: refetchUnifiedMessages } = trpc.engagements.listUnifiedMessages.useQuery(
    undefined,
    { retry: false },
  );
  const { data: engWidget } = trpc.engagements.list.useQuery({ page: 1, pageSize: 5 });

  const sendMessage = trpc.engagements.sendMessage.useMutation({
    onSuccess: () => {
      toast.success("Message sent to SmartPRO team");
      setMsgSubject(""); setMsgBody("");
      refetchUnifiedMessages();
    },
    onError: (e) => toast.error(e.message),
  });

  const markRead = trpc.engagements.markMessageRead.useMutation({
    onSuccess: () => refetchUnifiedMessages(),
  });

  const linkInvoiceEngagement = trpc.engagements.createFromSource.useMutation({
    onSuccess: async (r) => {
      toast.success("Engagement linked to this invoice");
      setPaymentFocus(null);
      await utils.engagements.list.invalidate();
      navigate(`/engagements/${r.engagementId}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const kpis = dashboard?.kpis;
  const company = dashboard?.company;
  const criticalAlerts = (alertsData?.items ?? []).filter(a => a.severity === "critical").length;
  const overdueInvoices = (invoicesData?.items ?? []).filter(i => i.effectiveStatus === "overdue").length;
  const pendingSig = (contractsData?.items ?? []).filter(c => c.status === "pending_signature").length;
  const unreadMsgs = (unifiedMessages?.items ?? []).filter((m) =>
    m.source === "legacy_notification" ? !m.isRead : m.author === "platform" ? m.readAt == null : false,
  ).length;

  const navItems = [
    { id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { id: "contracts", label: t("nav.contracts"), icon: FileText, badge: pendingSig },
    { id: "invoices", label: t("nav.invoices"), icon: CreditCard, badge: overdueInvoices },
    { id: "staffing", label: t("nav.staffing", "Staffing"), icon: Users2 },
    { id: "pro-services", label: t("nav.proServices"), icon: Shield },
    { id: "gov-cases", label: t("nav.govCases"), icon: Building2 },
    { id: "bookings", label: t("nav.bookings"), icon: ShoppingBag },
    { id: "alerts", label: t("nav.alerts"), icon: Bell, badge: criticalAlerts },
    { id: "messages", label: t("nav.messages"), icon: MessageSquare, badge: unreadMsgs },
    { id: "service-request", label: t("nav.newRequest"), icon: PlusCircle },
    { id: "my-documents", label: t("nav.myDocuments"), icon: FolderOpen },
    { id: "renewals", label: t("nav.renewals"), icon: CalendarClock },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Portal Header */}
      <div className="border-b bg-card px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--smartpro-orange)] flex items-center justify-center shadow-sm">
              <User className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-black text-foreground leading-tight tracking-tight">
                {t("header.title")}
              </h1>
              <p className="text-xs text-muted-foreground">
                {company?.name ?? "Your Company"} · {user?.name} · {t("header.region")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {criticalAlerts > 0 && (
              <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 text-xs">
                <AlertTriangle className="w-3 h-3" />
                {criticalAlerts} {t("header.critical")}
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
              {t("header.backToDashboard")}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Tab Nav */}
          <div className="mb-6 overflow-x-auto pb-1">
            <TabsList className="h-auto p-1 gap-0.5 bg-muted/50 inline-flex">
              {navItems.map(item => (
                <TabsTrigger key={item.id} value={item.id} className="flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm relative">
                  <item.icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* ─── Dashboard ─── */}
          <TabsContent value="dashboard" className="space-y-6">
            {dashLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : (
              <>
                <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-[var(--smartpro-orange)]/12 via-background to-background p-6 md:p-8 shadow-sm">
                  <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-[var(--smartpro-orange)]/10 blur-2xl" aria-hidden />
                  <div className="relative">
                    <h2 className="text-xl md:text-2xl font-black tracking-tight text-foreground">
                      {t("landing.welcome", { name: user?.name ?? "" })}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{t("landing.subtitle")}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <KPICard icon={FileText} label={t("landing.kpiActiveContracts")} value={kpis?.activeContracts ?? 0} color="bg-blue-100 text-blue-600" />
                  <KPICard icon={Building2} label={t("landing.kpiOpenGovCases")} value={kpis?.openCases ?? 0} color="bg-purple-100 text-purple-600" />
                  <KPICard icon={CreditCard} label={t("landing.kpiPendingInvoices")} value={kpis?.pendingInvoices ?? 0} sub={fmtOMR(kpis?.totalPendingOMR)} color="bg-amber-100 text-amber-600" />
                  <KPICard icon={Bell} label={t("landing.kpiExpiringPermits")} value={kpis?.expiringPermits ?? 0} sub={t("landing.kpiExpiringPermitsSub")} color="bg-red-100 text-red-600" />
                  <KPICard icon={Shield} label={t("landing.kpiActivePro")} value={kpis?.activeProServices ?? 0} color="bg-emerald-100 text-emerald-600" />
                  <KPICard icon={AlertTriangle} label={t("landing.kpiExpiringContracts")} value={kpis?.expiringContracts ?? 0} sub={t("landing.kpiExpiringContractsSub")} color="bg-orange-100 text-orange-600" />
                </div>

                {/* Quick Actions */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3"><CardTitle className="text-base">{t("landing.quickActions")}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: t("landing.qaContracts"), tab: "contracts", icon: FileText, color: "bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200" },
                        { label: t("landing.qaInvoices"), tab: "invoices", icon: CreditCard, color: "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200" },
                        { label: t("landing.qaCases"), tab: "gov-cases", icon: Building2, color: "bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200" },
                        { label: t("landing.qaContact"), tab: "messages", icon: MessageSquare, color: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200" },
                      ].map(a => (
                        <button key={a.tab} onClick={() => setActiveTab(a.tab)}
                          className={`flex items-center gap-3 p-4 rounded-xl border transition-colors text-left ${a.color}`}>
                          <a.icon className="w-5 h-5 flex-shrink-0" />
                          <span className="text-sm font-medium">{a.label}</span>
                          <ChevronRight className="w-4 h-4 ml-auto" />
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-base">{te("portalWidgetTitle")}</CardTitle>
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/engagements">{te("portalWidgetCta")}</Link>
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {(engWidget?.items ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">{te("portalWidgetEmpty")}</p>
                    ) : (
                      <ul className="space-y-2">
                        {(engWidget?.items ?? []).slice(0, 5).map((e) => (
                          <li key={e.id}>
                            <Link href={`/engagements/${e.id}`} className="text-sm font-medium text-primary hover:underline">
                              {e.title}
                            </Link>
                            <p className="text-xs text-muted-foreground capitalize">{e.status.replace(/_/g, " ")}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                {/* Expiry preview */}
                {(alertsData?.items ?? []).length > 0 && (
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Bell className="w-4 h-4 text-amber-500" /> {t("landing.expiryPreview")}
                      </CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => setActiveTab("alerts")}>
                        {t("landing.viewAll")} <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(alertsData?.items ?? []).slice(0, 5).map((alert, i) => (
                          <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${severityColor(alert.severity)}`}>
                            <div>
                              <p className="text-sm font-medium">{alert.label}</p>
                              <p className="text-xs opacity-75">{alert.reference}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold">{alert.daysLeft}d</p>
                              <p className="text-xs opacity-75">{fmtDate(alert.expiryDate)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* ─── Contracts ─── */}
          <TabsContent value="contracts" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your Contracts</h2>
              <div className="flex flex-wrap gap-2">
                {pendingSig > 0 && <Badge className="bg-blue-100 text-blue-700">{pendingSig} need signature</Badge>}
                <Badge variant="outline">{contractsData?.items.length ?? 0} total</Badge>
              </div>
            </div>
            {(contractsData?.items ?? []).length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No contracts found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {(contractsData?.items ?? []).map(c => (
                  <Card key={c.id} className={`border-0 shadow-sm hover:shadow-md transition-shadow ${c.status === "pending_signature" ? "ring-1 ring-blue-300" : ""}`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold text-foreground truncate">{c.title}</h3>
                            <Badge className={`text-xs ${statusBadge(c.status ?? "draft")}`}>
                              {(c.status ?? "draft").replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            <span>Type: {c.type?.replace(/_/g, " ") ?? "—"}</span>
                            {c.value && <span>Value: {fmtOMR(c.value)}</span>}
                            {c.endDate && (
                              <span className={c.daysToExpiry != null && c.daysToExpiry <= 30 ? "text-red-600 font-medium" : ""}>
                                Expires: {fmtDate(c.endDate)}
                                {c.daysToExpiry != null && c.daysToExpiry > 0 && ` (${c.daysToExpiry}d)`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {c.status === "pending_signature" && (
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs" asChild>
                              <Link href={`/contracts/${c.id}/sign`}>Sign now</Link>
                            </Button>
                          )}
                          {c.pdfUrl && (
                            <Button variant="outline" size="sm" asChild>
                              <a href={c.pdfUrl} target="_blank" rel="noopener noreferrer">
                                <Download className="w-3.5 h-3.5 mr-1" /> PDF
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── Invoices ─── */}
          <TabsContent value="invoices" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Billing & Invoices</h2>
              <div className="flex flex-wrap gap-2">
                {overdueInvoices > 0 && <Badge className="bg-red-100 text-red-700">{overdueInvoices} overdue</Badge>}
                <Badge variant="outline">{invoicesData?.items.length ?? 0} total</Badge>
              </div>
            </div>
            {(invoicesData?.items ?? []).length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No invoices found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {(invoicesData?.items ?? []).map(inv => (
                  <Card key={inv.id} className={`border-0 shadow-sm ${inv.effectiveStatus === "overdue" ? "border-l-4 border-l-red-500" : inv.effectiveStatus === "pending" ? "border-l-4 border-l-amber-400" : ""}`}>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-sm font-semibold">{inv.invoiceLabel}</span>
                            <Badge className={`text-xs ${statusBadge(inv.effectiveStatus)}`}>{inv.effectiveStatus}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Period: {inv.billingMonth}/{inv.billingYear}
                            {inv.paidAt && ` · Paid: ${fmtDate(inv.paidAt)}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-foreground">{fmtOMR(inv.amountOmr)}</p>
                          {["pending", "overdue"].includes(inv.effectiveStatus) && (
                            <Button
                              size="sm"
                              className="mt-2 bg-primary text-primary-foreground text-xs"
                              onClick={() => setPaymentFocus(inv)}
                            >
                              Payment options
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="staffing" className="space-y-4">
            <StaffingInvoiceTab
              data={staffingInvoice}
              isLoading={staffingLoading}
              month={staffingMonth}
              onMonthChange={setStaffingMonth}
            />
          </TabsContent>

          {/* ─── PRO Services ─── */}
          <TabsContent value="pro-services" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">PRO Service Applications</h2>
              <Badge variant="outline">{proServicesData?.items.length ?? 0} total</Badge>
            </div>
            {(proServicesData?.items ?? []).length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No PRO service applications found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {(proServicesData?.items ?? []).map(svc => {
                  const PRO_STAGES = [
                    { key: "pending",                 label: "Received",         icon: "📋", desc: "Request received by SmartPRO",          eta: "Same day" },
                    { key: "assigned",                label: "Officer Assigned", icon: "👤", desc: "PRO officer assigned to your case",       eta: "1 business day" },
                    { key: "in_progress",             label: "Processing",       icon: "⚙️", desc: "Officer is processing your application",  eta: "2–5 business days" },
                    { key: "submitted_to_authority",  label: "Submitted",        icon: "🏛️", desc: "Submitted to government authority",        eta: "3–10 business days" },
                    { key: "approved",                label: "Approved",         icon: "✅", desc: "Application approved — collecting docs",   eta: "1–2 business days" },
                  ];
                  const allSteps = ["pending", "assigned", "in_progress", "awaiting_documents", "submitted_to_authority", "approved", "completed"];
                  const currentIdx = allSteps.indexOf(svc.status ?? "pending");
                  const isCompleted = ["completed", "approved"].includes(svc.status ?? "");
                  const isRejected = ["rejected", "cancelled"].includes(svc.status ?? "");
                  const progressPct = isCompleted ? 100 : isRejected ? 0 : Math.round((currentIdx / (allSteps.length - 1)) * 100);
                  const activeStageIdx = PRO_STAGES.findIndex(s => s.key === svc.status);
                  const displayStageIdx = activeStageIdx >= 0 ? activeStageIdx
                    : Math.min(Math.floor(currentIdx * PRO_STAGES.length / allSteps.length), PRO_STAGES.length - 1);
                  return (
                    <Card key={svc.id} className="border-0 shadow-sm overflow-hidden">
                      {/* Top accent bar */}
                      <div className={`h-1 w-full ${isCompleted ? "bg-emerald-500" : isRejected ? "bg-red-400" : "bg-gradient-to-r from-orange-400 to-orange-600"}`}
                        style={isCompleted || isRejected ? undefined : { backgroundSize: `${progressPct}% 100%`, backgroundRepeat: "no-repeat" }} />
                      <CardContent className="p-5">
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="font-semibold text-base">{svc.serviceType?.replace(/_/g, " ") ?? "PRO Service"}</h3>
                              <Badge className={`text-xs ${statusBadge(svc.status ?? "pending")}`}>
                                {(svc.status ?? "pending").replace(/_/g, " ")}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                              {svc.employeeName && <span>👤 {svc.employeeName}</span>}
                              {svc.dueDate && <span>📅 Due: {fmtDate(svc.dueDate)}</span>}
                              <span className="font-mono">Ref: SP-{String(svc.id).padStart(5, "0")}</span>
                            </div>
                          </div>
                          <CaseIcon status={svc.status ?? "pending"} />
                        </div>

                        {/* Progress bar */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                            <span>Application Progress</span>
                            <span className="font-semibold">{progressPct}%</span>
                          </div>
                          <Progress value={progressPct} className="h-2" />
                        </div>

                        {/* 5-stage tracker */}
                        {!isRejected && (
                          <div className="grid grid-cols-5 gap-1">
                            {PRO_STAGES.map((stage, i) => {
                              const done = i < displayStageIdx || isCompleted;
                              const active = i === displayStageIdx && !isCompleted;
                              return (
                                <div key={stage.key} className="flex flex-col items-center gap-1 text-center">
                                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-all ${
                                    done ? "bg-emerald-100 ring-2 ring-emerald-400"
                                    : active ? "bg-orange-100 ring-2 ring-orange-400 shadow-md"
                                    : "bg-muted"
                                  }`}>
                                    {done ? "✅" : stage.icon}
                                  </div>
                                  <span className={`text-[10px] font-medium leading-tight ${
                                    done ? "text-emerald-700" : active ? "text-orange-700" : "text-muted-foreground"
                                  }`}>{stage.label}</span>
                                  {active && (
                                    <span className="text-[9px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full border border-orange-200 leading-tight">
                                      {stage.eta}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {!isCompleted && !isRejected && (
                          <p className="text-xs text-muted-foreground mt-3 bg-muted/50 rounded-lg px-3 py-2">
                            {PRO_STAGES[displayStageIdx]?.desc ?? "Processing your request"}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ─── Government Cases ─── */}
          <TabsContent value="gov-cases" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Government Cases</h2>
              <Badge variant="outline">{govCasesData?.items.length ?? 0} total</Badge>
            </div>
            {(govCasesData?.items ?? []).length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No government cases found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {(govCasesData?.items ?? []).map(c => (
                  <Card key={c.id} className={`border-0 shadow-sm ${c.caseStatus === "action_required" ? "ring-1 ring-red-300" : ""}`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold">{c.caseType?.replace(/_/g, " ") ?? "Government Case"}</h3>
                            <Badge className={`text-xs ${statusBadge(c.caseStatus ?? "draft")}`}>
                              {(c.caseStatus ?? "draft").replace(/_/g, " ")}
                            </Badge>
                            {c.caseStatus === "action_required" && (
                              <Badge className="bg-red-100 text-red-700 text-xs animate-pulse">Action Required</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap mb-3">
                            <span>Ref: #{c.id}</span>
                            <span>Created: {fmtDate(c.createdAt)}</span>
                            {c.governmentReference && <span>Gov Ref: {c.governmentReference}</span>}
                          </div>
                          {c.taskProgress.total > 0 && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>Task Progress</span>
                                <span>{c.taskProgress.completed}/{c.taskProgress.total}</span>
                              </div>
                              <Progress value={c.taskProgress.pct} className="h-1.5" />
                            </div>
                          )}
                        </div>
                        <CaseIcon status={c.caseStatus ?? "draft"} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── Bookings ─── */}
          <TabsContent value="bookings" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Marketplace Bookings</h2>
              <Badge variant="outline">{bookingsData?.items.length ?? 0} total</Badge>
            </div>
            {(bookingsData?.items ?? []).length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No bookings found</p>
                  <Button className="mt-4 text-sm" asChild>
                    <Link href="/marketplace">Browse Marketplace</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {(bookingsData?.items ?? []).map(b => (
                  <Card key={b.id} className="border-0 shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold">{b.providerName ?? "Service Provider"}</h3>
                            <Badge className={`text-xs ${statusBadge(b.status ?? "pending")}`}>
                              {(b.status ?? "pending").replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            <span>Category: {b.providerCategory ?? "—"}</span>
                            {b.scheduledAt && <span>Scheduled: {fmtDate(b.scheduledAt)}</span>}
                            {b.amount && <span>Amount: {fmtOMR(b.amount)}</span>}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {b.status === "completed" && !b.rating && (
                            <Button variant="outline" size="sm" className="gap-1 text-xs"
                              onClick={() => { setRatingBooking(b); setRatingValue(0); setRatingReview(""); }}>
                              <Star className="w-3 h-3" /> Rate
                            </Button>
                          )}
                          {b.rating && (
                            <div className="flex items-center gap-1 text-xs text-amber-600">
                              {[...Array(5)].map((_, i) => (
                                <Star key={i} className={`w-3 h-3 ${i < (b.rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                              ))}
                            </div>
                          )}
                          <CaseIcon status={b.status ?? "pending"} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── Expiry Alerts ─── */}
          <TabsContent value="alerts" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Expiry Alerts</h2>
              <div className="flex flex-wrap gap-2">
                {criticalAlerts > 0 && <Badge className="bg-red-100 text-red-700">{criticalAlerts} critical</Badge>}
                <Badge variant="outline">{alertsData?.items.length ?? 0} total</Badge>
              </div>
            </div>
            {(alertsData?.items ?? []).length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="py-12 text-center">
                  <Bell className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
                  <p className="text-emerald-600 font-medium">All documents are up to date!</p>
                  <p className="text-sm text-muted-foreground mt-1">No expiries within the next 90 days</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {(alertsData?.items ?? []).map((alert, i) => (
                  <Card key={i} className={`border-0 shadow-sm border-l-4 ${
                    alert.severity === "critical" ? "border-l-red-500" :
                    alert.severity === "high" ? "border-l-orange-500" :
                    alert.severity === "medium" ? "border-l-amber-500" : "border-l-emerald-500"
                  }`}>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-foreground">{alert.label}</h3>
                            <Badge className={`text-xs ${severityColor(alert.severity)}`}>{alert.severity}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Ref: {alert.reference} · Expires: {fmtDate(alert.expiryDate)}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-2xl font-bold ${
                            alert.severity === "critical" ? "text-red-600" :
                            alert.severity === "high" ? "text-orange-600" :
                            alert.severity === "medium" ? "text-amber-600" : "text-emerald-600"
                          }`}>{alert.daysLeft}</p>
                          <p className="text-xs text-muted-foreground">days left</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── Messages ─── */}
          <TabsContent value="messages" className="space-y-4">
            <h2 className="text-lg font-semibold">Messages to SmartPRO Team</h2>

            {/* Compose */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="w-4 h-4" /> New Message
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input placeholder="Subject" value={msgSubject} onChange={e => setMsgSubject(e.target.value)} />
                  <Select value={msgCategory} onValueChange={v => setMsgCategory(v as typeof msgCategory)}>
                    <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      {(["general", "billing", "contract", "pro_service", "government_case", "technical"] as const).map(c => (
                        <SelectItem key={c} value={c}>{c.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea placeholder="Describe your question or issue..." value={msgBody} onChange={e => setMsgBody(e.target.value)} rows={4} />
                <Button
                  disabled={!msgSubject.trim() || !msgBody.trim() || sendMessage.isPending}
                  onClick={() =>
                    sendMessage.mutate({
                      subject: `[${msgCategory}] ${msgSubject.trim()}`,
                      body: msgBody.trim(),
                    })
                  }
                  className="gap-2"
                >
                  <Send className="w-4 h-4" />
                  {sendMessage.isPending ? "Sending..." : "Send Message"}
                </Button>
              </CardContent>
            </Card>

            {/* History */}
            <div className="space-y-3">
              {(unifiedMessages?.items ?? []).length === 0 ? (
                <Card className="border-0 shadow-sm">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No messages yet. Send your first message above.</p>
                  </CardContent>
                </Card>
              ) : (
                (unifiedMessages?.items ?? []).map((msg) => {
                  const isLegacy = msg.source === "legacy_notification";
                  const unread = isLegacy ? !msg.isRead : msg.author === "platform" && msg.readAt == null;
                  const key = `${msg.source}-${msg.id}`;
                  const title = isLegacy ? msg.subject : msg.subject ?? (msg.author === "platform" ? "SmartPRO" : "You");
                  const body = isLegacy ? msg.body : msg.body;
                  return (
                    <Card key={key} className={`border-0 shadow-sm ${unread ? "border-l-4 border-l-blue-500" : ""}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {isLegacy ? "History" : msg.author}
                              </Badge>
                              <p className="font-medium text-sm">{title}</p>
                              {unread && <Badge className="bg-blue-100 text-blue-700 text-xs">New</Badge>}
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-4 whitespace-pre-wrap">{body}</p>
                            <p className="text-xs text-muted-foreground mt-1">{fmtDate(msg.createdAt)}</p>
                          </div>
                          {unread && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                markRead.mutate({ messageId: msg.id, legacyNotification: isLegacy })
                              }
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* ── Service Request Tab ── */}
          <TabsContent value="service-request" className="space-y-4">
            <ServiceRequestTab />
          </TabsContent>

          {/* ── My Documents Tab ── */}
          <TabsContent value="my-documents" className="space-y-4">
            <MyDocumentsTab />
          </TabsContent>

          {/* ── Upcoming Renewals Tab ── */}
          <TabsContent value="renewals" className="space-y-4">
            <UpcomingRenewalsTab />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={paymentFocus != null} onOpenChange={(open) => !open && setPaymentFocus(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment — {paymentFocus?.invoiceLabel}</DialogTitle>
            <DialogDescription>
              Amount {fmtOMR(paymentFocus?.amountOmr)} · Period {paymentFocus?.billingMonth}/{paymentFocus?.billingYear}
              {paymentFocus?.effectiveStatus === "overdue" ? " · Overdue" : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              In-app card checkout is only available when your workspace has a linked client-service invoice and
              payment gateway. PRO billing cycles are normally settled per your contract (bank transfer, cheque, or
              agreed channel).
            </p>
            <p>Use your invoice reference when remitting, then send proof or questions via Messages.</p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!paymentFocus) return;
                void navigator.clipboard.writeText(
                  `${paymentFocus.invoiceLabel} · ${fmtOMR(paymentFocus.amountOmr)} · ${paymentFocus.billingMonth}/${paymentFocus.billingYear}`,
                );
                toast.success("Copied to clipboard");
              }}
            >
              Copy invoice details
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (!paymentFocus) return;
                setActiveTab("messages");
                setMsgSubject(`Payment: ${paymentFocus.invoiceLabel}`);
                setPaymentFocus(null);
              }}
            >
              Message billing team
            </Button>
            <Button
              variant="default"
              disabled={!paymentFocus || linkInvoiceEngagement.isPending}
              onClick={() => {
                if (!paymentFocus) return;
                linkInvoiceEngagement.mutate({ sourceType: "pro_billing_cycle", sourceId: paymentFocus.id });
              }}
            >
              Track in engagements
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Rating Dialog ─── */}
      {ratingBooking && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold">Rate Your Experience</h3>
            <p className="text-sm text-muted-foreground">{ratingBooking.providerName ?? "Service Provider"}</p>
            <div className="flex items-center gap-2 justify-center">
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setRatingValue(n)} className="focus:outline-none">
                  <Star className={`w-8 h-8 transition-colors ${
                    n <= ratingValue ? "fill-amber-400 text-amber-400" : "text-gray-300 hover:text-amber-300"
                  }`} />
                </button>
              ))}
            </div>
            {ratingValue > 0 && (
              <p className="text-center text-sm font-medium text-amber-600">
                {["Poor","Fair","Good","Very Good","Excellent"][ratingValue-1]}
              </p>
            )}
            <textarea
              className="w-full border rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              rows={3}
              placeholder="Share your experience (optional)..."
              value={ratingReview}
              onChange={e => setRatingReview(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors"
                onClick={() => setRatingBooking(null)}
              >Cancel</button>
              <button
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                disabled={ratingValue === 0 || submitReview.isPending}
                onClick={() => submitReview.mutate({ bookingId: ratingBooking.id, rating: ratingValue, review: ratingReview || undefined })}
              >{submitReview.isPending ? "Processing..." : "Submit Rating"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
