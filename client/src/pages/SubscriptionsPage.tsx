import { trpc } from "@/lib/trpc";
import { CreditCard, Check, Zap, Star, Crown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

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

export default function SubscriptionsPage() {
  const { data: plans } = trpc.subscriptions.plans.useQuery();
  const { data: currentSub } = trpc.subscriptions.current.useQuery();

  const subscribeMutation = trpc.subscriptions.subscribe.useMutation({
    onSuccess: () => toast.success("Subscription updated successfully"),
    onError: (e: { message: string }) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CreditCard size={24} className="text-[var(--smartpro-orange)]" />
          Subscription Plans
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Choose the right plan for your business needs
        </p>
      </div>

      {/* Current Plan */}
      {currentSub && (
        <Card className="border-[var(--smartpro-orange)] bg-orange-50/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Current Plan</p>
                <p className="text-lg font-bold capitalize mt-0.5">{currentSub.plan?.name ?? "Free"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {currentSub.billingCycle === "monthly" ? "Billed monthly" : "Billed annually"}
                  {currentSub.currentPeriodEnd && ` · Renews ${new Date(currentSub.currentPeriodEnd).toLocaleDateString()}`}
                </p>
              </div>
              <Badge className={`${currentSub.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`} variant="outline">
                {currentSub.status}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans?.map((plan) => {
          const isCurrentPlan = currentSub?.planId === plan.id;
          const planKey = plan.name.toLowerCase();
          const features = (plan.features as string[]) ?? [];

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
              <div className={`bg-gradient-to-br ${planGradients[planKey] ?? "from-gray-500 to-gray-600"} p-5 text-white`}>
                <div className="flex items-center gap-2 mb-2">
                  {planIcons[planKey] ?? <Zap size={20} />}
                  <h3 className="font-bold text-lg capitalize">{plan.name}</h3>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{plan.currency ?? "OMR"} {Number(plan.priceMonthly).toLocaleString()}</span>
                  <span className="text-white/70 text-sm">/mo</span>
                </div>
                {plan.description && <p className="text-white/80 text-xs mt-2">{plan.description}</p>}
              </div>
              <CardContent className="p-5">
                <ul className="space-y-2.5 mb-5">
                  {features.slice(0, 8).map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check size={14} className="text-green-600 mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                  {features.length === 0 && (
                    <li className="text-sm text-muted-foreground">All core features included</li>
                  )}
                </ul>
                <Button
                  className="w-full"
                  variant={isCurrentPlan ? "outline" : "default"}
                  disabled={isCurrentPlan || subscribeMutation.isPending}
                  onClick={() => !isCurrentPlan && subscribeMutation.mutate({ planId: plan.id, billingCycle: "monthly" })}
                >
                  {isCurrentPlan ? "Current Plan" : subscribeMutation.isPending ? "Processing..." : `Upgrade to ${plan.name}`}
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

      {/* Feature Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feature Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-muted-foreground">Feature</th>
                  <th className="text-center py-2 font-medium text-blue-600">Basic</th>
                  <th className="text-center py-2 font-medium text-purple-600">Professional</th>
                  <th className="text-center py-2 font-medium text-amber-600">Enterprise</th>
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
    </div>
  );
}
