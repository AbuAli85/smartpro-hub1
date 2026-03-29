import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  FileText, CreditCard, Shield, Building2, ShoppingBag,
  Bell, MessageSquare, LayoutDashboard, AlertTriangle, CheckCircle2,
  Clock, XCircle, Download, Send, ChevronRight, Star, Eye, User,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-OM", { day: "2-digit", month: "short", year: "numeric" });
}

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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClientPortalPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgCategory, setMsgCategory] = useState<"general" | "billing" | "contract" | "pro_service" | "government_case" | "technical">("general");

  const { data: dashboard, isLoading: dashLoading } = trpc.clientPortal.getDashboard.useQuery();
  const { data: contractsData } = trpc.clientPortal.listContracts.useQuery({ pageSize: 50 });
  const { data: invoicesData } = trpc.clientPortal.listInvoices.useQuery({ pageSize: 50 });
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
  const { data: messagesData, refetch: refetchMessages } = trpc.clientPortal.listMessages.useQuery({ pageSize: 50 });

  const sendMessage = trpc.clientPortal.sendMessage.useMutation({
    onSuccess: () => {
      toast.success("Message sent to SmartPRO team");
      setMsgSubject(""); setMsgBody("");
      refetchMessages();
    },
    onError: (e) => toast.error(e.message),
  });

  const markRead = trpc.clientPortal.markMessageRead.useMutation({
    onSuccess: () => refetchMessages(),
  });

  const kpis = dashboard?.kpis;
  const company = dashboard?.company;
  const criticalAlerts = (alertsData?.items ?? []).filter(a => a.severity === "critical").length;
  const overdueInvoices = (invoicesData?.items ?? []).filter(i => i.effectiveStatus === "overdue").length;
  const pendingSig = (contractsData?.items ?? []).filter(c => c.status === "pending_signature").length;
  const unreadMsgs = (messagesData?.items ?? []).filter(m => !m.isRead).length;

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "contracts", label: "Contracts", icon: FileText, badge: pendingSig },
    { id: "invoices", label: "Invoices", icon: CreditCard, badge: overdueInvoices },
    { id: "pro-services", label: "PRO Services", icon: Shield },
    { id: "gov-cases", label: "Gov Cases", icon: Building2 },
    { id: "bookings", label: "Bookings", icon: ShoppingBag },
    { id: "alerts", label: "Alerts", icon: Bell, badge: criticalAlerts },
    { id: "messages", label: "Messages", icon: MessageSquare, badge: unreadMsgs },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Portal Header */}
      <div className="border-b bg-card px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground leading-tight">Client Portal</h1>
              <p className="text-xs text-muted-foreground">
                {company?.name ?? "Your Company"} · {user?.name}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {criticalAlerts > 0 && (
              <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 text-xs">
                <AlertTriangle className="w-3 h-3" />
                {criticalAlerts} Critical
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
              ← Dashboard
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
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <KPICard icon={FileText} label="Active Contracts" value={kpis?.activeContracts ?? 0} color="bg-blue-100 text-blue-600" />
                  <KPICard icon={Building2} label="Open Gov Cases" value={kpis?.openCases ?? 0} color="bg-purple-100 text-purple-600" />
                  <KPICard icon={CreditCard} label="Pending Invoices" value={kpis?.pendingInvoices ?? 0} sub={fmtOMR(kpis?.totalPendingOMR)} color="bg-amber-100 text-amber-600" />
                  <KPICard icon={Bell} label="Expiring Permits" value={kpis?.expiringPermits ?? 0} sub="within 30 days" color="bg-red-100 text-red-600" />
                  <KPICard icon={Shield} label="Active PRO Services" value={kpis?.activeProServices ?? 0} color="bg-emerald-100 text-emerald-600" />
                  <KPICard icon={AlertTriangle} label="Expiring Contracts" value={kpis?.expiringContracts ?? 0} sub="within 30 days" color="bg-orange-100 text-orange-600" />
                </div>

                {/* Quick Actions */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3"><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: "View Contracts", tab: "contracts", icon: FileText, color: "bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200" },
                        { label: "Pay Invoices", tab: "invoices", icon: CreditCard, color: "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200" },
                        { label: "Track Cases", tab: "gov-cases", icon: Building2, color: "bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200" },
                        { label: "Contact Us", tab: "messages", icon: MessageSquare, color: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200" },
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

                {/* Expiry preview */}
                {(alertsData?.items ?? []).length > 0 && (
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Bell className="w-4 h-4 text-amber-500" /> Upcoming Expiries
                      </CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => setActiveTab("alerts")}>
                        View All <ChevronRight className="w-3 h-3 ml-1" />
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
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                              onClick={() => toast.info("E-signature flow — coming in Step 10")}>
                              Sign Now
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
                            <Button size="sm" className="mt-2 bg-primary text-primary-foreground text-xs"
                              onClick={() => toast.info("Online payment integration coming soon. Please contact your account manager.")}>
                              Pay Now
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
                  const steps = ["pending", "assigned", "in_progress", "awaiting_documents", "submitted_to_authority", "approved", "completed"];
                  const currentIdx = steps.indexOf(svc.status ?? "pending");
                  return (
                    <Card key={svc.id} className="border-0 shadow-sm">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="font-semibold">{svc.serviceType?.replace(/_/g, " ") ?? "PRO Service"}</h3>
                              <Badge className={`text-xs ${statusBadge(svc.status ?? "pending")}`}>
                                {(svc.status ?? "pending").replace(/_/g, " ")}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap mb-3">
                              {svc.employeeName && <span>Employee: {svc.employeeName}</span>}
                              {svc.dueDate && <span>Due: {fmtDate(svc.dueDate)}</span>}
                              <span>Ref: #{svc.id}</span>
                            </div>
                            {/* Progress dots */}
                            <div className="flex flex-wrap items-center gap-1">
                              {steps.slice(0, 6).map((step, i) => {
                                const done = i < currentIdx;
                                const active = i === currentIdx;
                                return (
                                  <div key={step} className="flex flex-wrap items-center gap-1">
                                    <div className={`w-2.5 h-2.5 rounded-full transition-colors ${done ? "bg-emerald-500" : active ? "bg-blue-500 ring-2 ring-blue-200" : "bg-muted"}`} />
                                    {i < 5 && <div className={`h-0.5 w-5 transition-colors ${done ? "bg-emerald-500" : "bg-muted"}`} />}
                                  </div>
                                );
                              })}
                              <span className="text-xs text-muted-foreground ml-2 capitalize">
                                {(svc.status ?? "pending").replace(/_/g, " ")}
                              </span>
                            </div>
                          </div>
                          <CaseIcon status={svc.status ?? "pending"} />
                        </div>
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
                  <Button className="mt-4 text-sm" onClick={() => navigate("/marketplace")}>Browse Marketplace</Button>
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
                  onClick={() => sendMessage.mutate({ subject: msgSubject, message: msgBody, category: msgCategory })}
                  className="gap-2"
                >
                  <Send className="w-4 h-4" />
                  {sendMessage.isPending ? "Sending..." : "Send Message"}
                </Button>
              </CardContent>
            </Card>

            {/* History */}
            <div className="space-y-3">
              {(messagesData?.items ?? []).length === 0 ? (
                <Card className="border-0 shadow-sm">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No messages yet. Send your first message above.</p>
                  </CardContent>
                </Card>
              ) : (
                (messagesData?.items ?? []).map(msg => (
                  <Card key={msg.id} className={`border-0 shadow-sm ${!msg.isRead ? "border-l-4 border-l-blue-500" : ""}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-sm">{msg.title}</p>
                            {!msg.isRead && <Badge className="bg-blue-100 text-blue-700 text-xs">New</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{msg.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">{fmtDate(msg.createdAt)}</p>
                        </div>
                        {!msg.isRead && (
                          <Button variant="ghost" size="sm" onClick={() => markRead.mutate({ messageId: msg.id })}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

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
              >{submitReview.isPending ? "Submitting..." : "Submit Rating"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
