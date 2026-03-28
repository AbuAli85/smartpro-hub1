import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  FileText, ShoppingBag, MessageSquare, CheckCircle2, Clock,
  AlertCircle, Download, Star, Building2, Phone, Mail, Globe
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_review: "bg-amber-100 text-amber-700",
  pending_signature: "bg-blue-100 text-blue-700",
  signed: "bg-green-100 text-green-700",
  active: "bg-emerald-100 text-emerald-700",
  expired: "bg-red-100 text-red-700",
  confirmed: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export default function ClientPortalPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [, navigate] = useLocation();
  const [exportingId, setExportingId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: myCompany } = trpc.companies.myCompany.useQuery();
  const { data: contracts } = trpc.contracts.list.useQuery({});
  const { data: bookings } = trpc.marketplace.listBookings.useQuery();
  const { data: proServices } = trpc.pro.list.useQuery({});

  const activeContracts = (contracts ?? []).filter((c) =>
    ["active", "signed", "pending_signature"].includes(c.status ?? "")
  );
  const pendingBookings = (bookings ?? []).filter((b) => b.status === "pending" || b.status === "confirmed");
  const activeProServices = (proServices ?? []).filter((p) =>
    ["submitted", "in_progress", "under_review"].includes(p.status ?? "")
  );

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Welcome Header */}
      <div className="rounded-2xl bg-gradient-to-br from-[var(--smartpro-navy)] to-[var(--smartpro-blue)] p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {user?.name ?? "Client"}</h1>
            <p className="text-white/70 mt-1 text-sm">Your SmartPRO client portal — manage all your business services in one place</p>
            {myCompany && (
              <div className="flex items-center gap-2 mt-3">
                <Building2 size={14} className="text-white/60" />
                <span className="text-sm text-white/80">{myCompany.company.name}</span>
                <Badge className="bg-white/20 text-white text-xs border-0">{myCompany.member.role}</Badge>
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold">{activeContracts.length + pendingBookings.length + activeProServices.length}</p>
            <p className="text-white/60 text-sm">Active Items</p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Contracts", value: activeContracts.length, icon: <FileText size={18} />, color: "text-blue-600 bg-blue-50", tab: "contracts" },
          { label: "Service Bookings", value: pendingBookings.length, icon: <ShoppingBag size={18} />, color: "text-purple-600 bg-purple-50", tab: "bookings" },
          { label: "PRO Services", value: activeProServices.length, icon: <CheckCircle2 size={18} />, color: "text-green-600 bg-green-50", tab: "pro" },
          { label: "Total Contracts", value: (contracts ?? []).length, icon: <Clock size={18} />, color: "text-amber-600 bg-amber-50", tab: "contracts" },
        ].map((s) => (
          <Card key={s.label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab(s.tab)}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>{s.icon}</div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="pro">PRO Services</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Recent Contracts */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><FileText size={14} /> Recent Contracts</CardTitle>
              </CardHeader>
              <CardContent>
                {(contracts ?? []).slice(0, 4).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No contracts yet</p>
                ) : (
                  <div className="space-y-2">
                    {(contracts ?? []).slice(0, 4).map((c) => (
                      <div key={c.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                        <div>
                          <p className="text-sm font-medium truncate max-w-[180px]">{c.title}</p>
                          <p className="text-xs text-muted-foreground">{c.contractNumber}</p>
                        </div>
                        <Badge className={`text-xs ${statusColors[c.status ?? "draft"] ?? ""}`}>{c.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Bookings */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><ShoppingBag size={14} /> Recent Bookings</CardTitle>
              </CardHeader>
              <CardContent>
                {(bookings ?? []).slice(0, 4).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No bookings yet</p>
                ) : (
                  <div className="space-y-2">
                    {(bookings ?? []).slice(0, 4).map((b) => (
                      <div key={b.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                        <div>
                          <p className="text-sm font-medium">Booking #{b.id}</p>
                          <p className="text-xs text-muted-foreground">
                            {b.scheduledAt ? new Date(b.scheduledAt).toLocaleDateString() : "Not scheduled"}
                          </p>
                        </div>
                        <Badge className={`text-xs ${statusColors[b.status ?? "pending"] ?? ""}`}>{b.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Company Info */}
          {myCompany && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Building2 size={14} /> Your Company</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Company Name</p>
                    <p className="font-semibold mt-0.5">{myCompany.company.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Industry</p>
                    <p className="font-semibold mt-0.5">{myCompany.company.industry ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Country</p>
                    <p className="font-semibold mt-0.5">{myCompany.company.country ?? "Oman"}</p>
                  </div>
                  {myCompany.company.phone && (
                    <div className="flex items-center gap-2">
                      <Phone size={12} className="text-muted-foreground" />
                      <span className="text-sm">{myCompany.company.phone}</span>
                    </div>
                  )}
                  {myCompany.company.email && (
                    <div className="flex items-center gap-2">
                      <Mail size={12} className="text-muted-foreground" />
                      <span className="text-sm">{myCompany.company.email}</span>
                    </div>
                  )}
                  {myCompany.company.website && (
                    <div className="flex items-center gap-2">
                      <Globe size={12} className="text-muted-foreground" />
                      <span className="text-sm">{myCompany.company.website}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Support Card */}
          <Card className="border-dashed border-2 border-muted">
            <CardContent className="p-6 text-center">
              <MessageSquare size={32} className="mx-auto mb-3 text-muted-foreground opacity-50" />
              <h3 className="font-semibold mb-1">Need Help?</h3>
              <p className="text-sm text-muted-foreground mb-3">Our support team is available 24/7 to assist with any questions about your services.</p>
              <div className="flex gap-2 justify-center">
                <Button size="sm" variant="outline" className="gap-2" onClick={() => toast.info("Live chat coming soon")}>
                  <MessageSquare size={14} /> Live Chat
                </Button>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => toast.info("Email support: support@smartpro.om")}>
                  <Mail size={14} /> Email Support
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contracts Tab */}
        <TabsContent value="contracts" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">My Contracts</CardTitle>
            </CardHeader>
            <CardContent>
              {(contracts ?? []).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText size={40} className="mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No contracts found</p>
                  <p className="text-sm mt-1">Contracts you are party to will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(contracts ?? []).map((c) => (
                    <div key={c.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{c.title}</p>
                            <Badge className={`text-xs ${statusColors[c.status ?? "draft"] ?? ""}`}>{c.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{c.contractNumber} · {c.type}</p>
                          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                            {c.partyAName && <span>Party A: {c.partyAName}</span>}
                            {c.partyBName && <span>Party B: {c.partyBName}</span>}
                            {c.value && <span>Value: {c.value} {c.currency}</span>}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {c.status === "pending_signature" && (
                            <Button size="sm" className="gap-1 text-xs h-7 bg-blue-600 hover:bg-blue-700"
                              onClick={() => toast.info("E-signature flow coming soon")}>
                              Sign Now
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="gap-1 text-xs h-7"
                            disabled={exportingId === c.id}
                            onClick={async () => {
                              setExportingId(c.id);
                              try {
                                const result = await utils.contracts.exportHtml.fetch({ id: c.id });
                                const win = window.open("", "_blank");
                                if (win) { win.document.write(result.html); win.document.close(); win.print(); }
                                else toast.error("Pop-up blocked — please allow pop-ups for this site");
                              } catch { toast.error("Export failed"); }
                              finally { setExportingId(null); }
                            }}>
                            <Download size={12} /> {exportingId === c.id ? "Exporting…" : "Export / Print"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bookings Tab */}
        <TabsContent value="bookings" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">My Service Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              {(bookings ?? []).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShoppingBag size={40} className="mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No bookings found</p>
                  <p className="text-sm mt-1">Visit the Marketplace to book services</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(bookings ?? []).map((b) => (
                    <div key={b.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">Booking #{b.id}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Scheduled: {b.scheduledAt ? new Date(b.scheduledAt).toLocaleString() : "TBD"}
                          </p>
                          {b.amount && <p className="text-xs text-muted-foreground">Total: {b.amount} {b.currency ?? "OMR"}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${statusColors[b.status ?? "pending"] ?? ""}`}>{b.status}</Badge>
                          {b.status === "completed" && (
                            <Button size="sm" variant="outline" className="gap-1 text-xs h-7"
                              onClick={() => navigate("/marketplace")}>
                              <Star size={12} /> Leave Review
                            </Button>
                          )}
                        </div>
                      </div>
                      {b.notes && <p className="text-xs text-muted-foreground mt-2 border-t pt-2">{b.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PRO Services Tab */}
        <TabsContent value="pro" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">My PRO Services</CardTitle>
            </CardHeader>
            <CardContent>
              {(proServices ?? []).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <AlertCircle size={40} className="mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No PRO services found</p>
                  <p className="text-sm mt-1">PRO service requests will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(proServices ?? []).map((p) => (
                    <div key={p.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm capitalize">{(p.serviceType ?? "service").replace(/_/g, " ")}</p>
                            <Badge className={`text-xs ${statusColors[p.status ?? "pending"] ?? ""}`}>{p.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Ref: {p.serviceNumber ?? `PRO-${p.id}`}
                          </p>
                          {p.employeeName && <p className="text-xs text-muted-foreground">Applicant: {p.employeeName}</p>}
                          {p.expiryDate && (
                            <p className="text-xs text-amber-600 mt-1">
                              Expires: {new Date(p.expiryDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <Button size="sm" variant="outline" className="gap-1 text-xs h-7"
                          onClick={() => navigate("/pro")}>
                          View Details
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
