import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  CreditCard, Check, Zap, Star, Crown, FileText,
  Download, AlertCircle, RefreshCw, X
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

const planIcons: Record<string, React.ReactNode> = {
  basic: <Zap size={20} />,
  professional: <Star size={20} />,
  enterprise: <Crown size={20} />,
};

const planGradients: Record<string, string> = {
  basic: "from-blue-500 to-blue-600",
  professional: "from-purple-500 to-purple-600",
  enterprise: "from-amber-500 to-orange-600",
};

const statusColors: Record<string, string> = {
  issued: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  draft: "bg-gray-100 text-gray-600",
  cancelled: "bg-gray-100 text-gray-500",
};

export default function SubscriptionsPage() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const utils = trpc.useUtils();

  const { data: plans } = trpc.subscriptions.plans.useQuery();
  const { data: currentSub, refetch: refetchSub } = trpc.subscriptions.current.useQuery();
  const { data: invoices, refetch: refetchInvoices } = trpc.subscriptions.invoices.useQuery();

  const subscribeMutation = trpc.subscriptions.subscribe.useMutation({
    onSuccess: () => {
      toast.success("Subscription updated successfully");
      void refetchSub();
      void utils.subscriptions.current.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const cancelMutation = trpc.subscriptions.cancel.useMutation({
    onSuccess: () => {
      toast.success("Subscription cancelled");
      void refetchSub();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const generateInvoice = trpc.subscriptions.generateInvoice.useMutation({
    onSuccess: (data) => {
      toast.success(`Invoice ${data.invoiceNumber} generated`);
      void refetchInvoices();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const markPaid = trpc.subscriptions.markInvoicePaid.useMutation({
    onSuccess: () => {
      toast.success("Invoice marked as paid");
      void refetchInvoices();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const isActive = currentSub?.status === "active";
  const annualDiscount = 0.17; // 17% off annual

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CreditCard size={24} className="text-[var(--smartpro-orange)]" />
          Subscription & Billing
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your plan, billing cycle, and invoices
        </p>
      </div>

      <Tabs defaultValue="plans">
        <TabsList>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="features">Feature Access</TabsTrigger>
        </TabsList>

        {/* ── Plans Tab ── */}
        <TabsContent value="plans" className="mt-4 space-y-5">
          {/* Current Plan Banner */}
          {currentSub && (
            <Card className={`border-l-4 ${isActive ? "border-l-green-500 bg-green-50/30" : "border-l-gray-400 bg-gray-50/30"}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Current Plan</p>
                    <p className="text-lg font-bold capitalize mt-0.5">{currentSub.plan?.name ?? "Free"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {currentSub.billingCycle === "monthly" ? "Billed monthly" : "Billed annually"}
                      {currentSub.currentPeriodEnd && ` · Renews ${fmtDate(currentSub.currentPeriodEnd)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={`${isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`} variant="outline">
                      {currentSub.status}
                    </Badge>
                    {isActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1"
                        onClick={() => cancelMutation.mutate()}
                        disabled={cancelMutation.isPending}
                      >
                        <X size={12} /> Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-3">
            <span className={`text-sm font-medium ${billingCycle === "monthly" ? "text-foreground" : "text-muted-foreground"}`}>Monthly</span>
            <button
              onClick={() => setBillingCycle(billingCycle === "monthly" ? "annual" : "monthly")}
              className={`relative w-12 h-6 rounded-full transition-colors ${billingCycle === "annual" ? "bg-[var(--smartpro-orange)]" : "bg-muted"}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${billingCycle === "annual" ? "translate-x-7" : "translate-x-1"}`} />
            </button>
            <span className={`text-sm font-medium ${billingCycle === "annual" ? "text-foreground" : "text-muted-foreground"}`}>
              Annual <Badge className="bg-green-100 text-green-700 text-[10px] ml-1" variant="outline">Save 17%</Badge>
            </span>
          </div>

          {/* Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {plans?.map((plan) => {
              const isCurrentPlan = currentSub?.planId === plan.id && isActive;
              const planKey = plan.name.toLowerCase();
              const features = (plan.features as string[]) ?? [];
              const price = billingCycle === "annual"
                ? Number(plan.priceAnnual) / 12
                : Number(plan.priceMonthly);

              return (
                <Card
                  key={plan.id}
                  className={`relative overflow-hidden transition-all hover:shadow-lg ${isCurrentPlan ? "ring-2 ring-[var(--smartpro-orange)]" : ""}`}
                >
                  {isCurrentPlan && (
                    <div className="absolute top-3 right-3">
                      <Badge className="bg-[var(--smartpro-orange)] text-white text-xs">Current</Badge>
                    </div>
                  )}
                  {planKey === "professional" && !isCurrentPlan && (
                    <div className="absolute top-3 right-3">
                      <Badge className="bg-purple-600 text-white text-xs">Popular</Badge>
                    </div>
                  )}
                  <div className={`bg-gradient-to-br ${planGradients[planKey] ?? "from-gray-500 to-gray-600"} p-5 text-white`}>
                    <div className="flex items-center gap-2 mb-2">
                      {planIcons[planKey] ?? <Zap size={20} />}
                      <h3 className="font-bold text-lg capitalize">{plan.name}</h3>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">{plan.currency ?? "OMR"} {price.toFixed(2)}</span>
                      <span className="text-white/70 text-sm">/mo</span>
                    </div>
                    {billingCycle === "annual" && (
                      <p className="text-white/80 text-xs mt-1">
                        Billed OMR {Number(plan.priceAnnual).toFixed(2)}/year
                      </p>
                    )}
                    {plan.description && <p className="text-white/80 text-xs mt-2">{plan.description}</p>}
                  </div>
                  <CardContent className="p-5">
                    <div className="text-xs text-muted-foreground mb-3 space-y-1">
                      <div>Up to <strong>{plan.maxUsers}</strong> users</div>
                      <div>Up to <strong>{plan.maxContracts}</strong> contracts</div>
                      <div><strong>{((plan.maxStorage ?? 5120) / 1024).toFixed(0)} GB</strong> storage</div>
                    </div>
                    <ul className="space-y-2 mb-5">
                      {features.slice(0, 6).map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <Check size={13} className="text-green-600 mt-0.5 shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                      {features.length === 0 && (
                        <li className="text-sm text-muted-foreground">All core features included</li>
                      )}
                    </ul>
                    <Button
                      className={`w-full ${!isCurrentPlan ? "bg-[var(--smartpro-orange)] hover:bg-orange-600" : ""}`}
                      variant={isCurrentPlan ? "outline" : "default"}
                      disabled={isCurrentPlan || subscribeMutation.isPending}
                      onClick={() => !isCurrentPlan && subscribeMutation.mutate({ planId: plan.id, billingCycle })}
                    >
                      {isCurrentPlan ? "Current Plan" : subscribeMutation.isPending ? "Processing..." : `Select ${plan.name}`}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}

            {(!plans || plans.length === 0) && (
              <div className="col-span-3 text-center py-12 text-muted-foreground">
                <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
                <p>Loading subscription plans...</p>
              </div>
            )}
          </div>

          {/* Feature Comparison Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Feature Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th scope="col" className="text-left py-2 font-medium text-muted-foreground">Feature</th>
                      <th scope="col" className="text-center py-2 font-medium text-blue-600">Basic</th>
                      <th scope="col" className="text-center py-2 font-medium text-purple-600">Professional</th>
                      <th scope="col" className="text-center py-2 font-medium text-amber-600">Enterprise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { feature: "Sanad Office Management", basic: true, pro: true, ent: true },
                      { feature: "PRO Services", basic: true, pro: true, ent: true },
                      { feature: "Contract Management", basic: "5 contracts", pro: "Unlimited", ent: "Unlimited" },
                      { feature: "HR Module", basic: "10 employees", pro: "50 employees", ent: "Unlimited" },
                      { feature: "CRM", basic: "100 contacts", pro: "Unlimited", ent: "Unlimited" },
                      { feature: "Marketplace Access", basic: true, pro: true, ent: true },
                      { feature: "Analytics Dashboard", basic: false, pro: true, ent: true },
                      { feature: "API Access", basic: false, pro: false, ent: true },
                      { feature: "Priority Support", basic: false, pro: true, ent: true },
                      { feature: "Custom Integrations", basic: false, pro: false, ent: true },
                    ].map((row) => (
                      <tr key={row.feature} className="border-b last:border-0">
                        <td className="py-2.5 text-sm">{row.feature}</td>
                        {[row.basic, row.pro, row.ent].map((val, i) => (
                          <td key={i} className="py-2.5 text-center">
                            {val === true ? (
                              <Check size={16} className="mx-auto text-green-600" />
                            ) : val === false ? (
                              <span className="text-muted-foreground text-xs">—</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">{val}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Invoices Tab ── */}
        <TabsContent value="invoices" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Billing History</h2>
            <Button
              size="sm"
              className="gap-2 bg-[var(--smartpro-orange)] hover:bg-orange-600"
              onClick={() => generateInvoice.mutate()}
              disabled={generateInvoice.isPending || !isActive}
            >
              <RefreshCw size={14} className={generateInvoice.isPending ? "animate-spin" : ""} />
              Generate Invoice
            </Button>
          </div>

          {!isActive && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertCircle size={18} className="text-amber-600 shrink-0" />
                <p className="text-sm text-amber-700">You need an active subscription to generate invoices.</p>
              </CardContent>
            </Card>
          )}

          {!invoices || invoices.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <FileText size={32} className="mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No invoices yet</p>
                {isActive && (
                  <Button size="sm" className="mt-3" onClick={() => generateInvoice.mutate()} disabled={generateInvoice.isPending}>
                    Generate First Invoice
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th scope="col" className="text-left py-2 px-3 font-medium">Invoice #</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Date</th>
                    <th scope="col" className="text-right py-2 px-3 font-medium">Amount</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Due Date</th>
                    <th scope="col" className="text-center py-2 px-3 font-medium">Status</th>
                    <th scope="col" className="text-center py-2 px-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-xs font-medium">{inv.invoiceNumber}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{fmtDate(inv.createdAt)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold">{inv.currency} {Number(inv.amount).toFixed(3)}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {inv.dueDate ? fmtDate(inv.dueDate) : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge className={`text-[10px] capitalize ${statusColors[inv.status] ?? "bg-gray-100 text-gray-600"}`} variant="outline">
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {inv.status === "issued" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50"
                              onClick={() => markPaid.mutate({ invoiceId: inv.id })}
                              disabled={markPaid.isPending}
                            >
                              Mark Paid
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Download">
                            <Download size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Feature Access Tab ── */}
        <TabsContent value="features" className="mt-4 space-y-4">
          <div>
            <h2 className="text-base font-semibold mb-1">Your Plan Features</h2>
            <p className="text-sm text-muted-foreground">
              Features available on your current subscription plan
            </p>
          </div>

          {currentSub?.plan ? (
            <div className="space-y-3">
              <Card className="border-[var(--smartpro-orange)]/30 bg-orange-50/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-[var(--smartpro-orange)]/10 flex items-center justify-center">
                      {planIcons[currentSub.plan.name.toLowerCase()] ?? <Zap size={18} />}
                    </div>
                    <div>
                      <p className="font-semibold capitalize">{currentSub.plan.name} Plan</p>
                      <p className="text-xs text-muted-foreground">
                        {currentSub.plan.maxUsers} users · {currentSub.plan.maxContracts} contracts · {((currentSub.plan.maxStorage ?? 5120) / 1024).toFixed(0)} GB storage
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {((currentSub.plan.features as string[]) ?? []).map((feature, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Check size={13} className="text-green-600 shrink-0" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Max Users", value: currentSub.plan.maxUsers, icon: "👥" },
                  { label: "Max Contracts", value: currentSub.plan.maxContracts, icon: "📄" },
                  { label: "Storage", value: `${((currentSub.plan.maxStorage ?? 5120) / 1024).toFixed(0)} GB`, icon: "💾" },
                  { label: "Plan Status", value: currentSub.status, icon: "✅" },
                ].map((item) => (
                  <Card key={item.label}>
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl mb-1">{item.icon}</div>
                      <p className="text-lg font-bold capitalize">{item.value}</p>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <AlertCircle size={32} className="mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No active subscription</p>
                <p className="text-xs text-muted-foreground mt-1">Select a plan above to unlock features</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
