import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";
import { Building2, Users, CheckCircle2, ArrowRight, ArrowLeft, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const STEPS = [
  { id: 1, title: "Company Details", icon: <Building2 size={20} />, description: "Tell us about your company" },
  { id: 2, title: "Team Setup", icon: <Users size={20} />, description: "Configure your team" },
  { id: 3, title: "Choose Plan", icon: <Zap size={20} />, description: "Select a subscription plan" },
  { id: 4, title: "All Done!", icon: <CheckCircle2 size={20} />, description: "Your workspace is ready" },
];

const INDUSTRIES = [
  "Technology", "Finance & Banking", "Healthcare", "Construction & Real Estate",
  "Retail & E-Commerce", "Manufacturing", "Logistics & Transport", "Education",
  "Hospitality & Tourism", "Oil & Gas", "Government", "Other",
];

const COUNTRIES = ["Oman", "UAE", "Saudi Arabia", "Kuwait", "Bahrain", "Qatar"];

function parseInviteEmails(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,;]+/)) {
    const t = part.trim().toLowerCase();
    if (!t || !t.includes("@")) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export default function OnboardingPage() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [companyId, setCompanyId] = useState<number | null>(null);

  const [company, setCompany] = useState({
    name: "", industry: "", country: "Oman", phone: "", email: "", website: "", size: "1-10",
  });
  const [inviteEmails, setInviteEmails] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("professional");

  const { data: plans } = trpc.companies.subscriptionPlans.useQuery();
  const createCompanyMutation = trpc.companies.create.useMutation({
    onSuccess: (data: { id?: number; success?: boolean; teammatesAdded?: number }) => {
      if (data.id) setCompanyId(data.id);
      if (data.teammatesAdded && data.teammatesAdded > 0) {
        toast.success(`${data.teammatesAdded} teammate(s) with existing accounts were added to your workspace.`);
      } else if (parseInviteEmails(inviteEmails).length > 0) {
        toast.message("Invite list saved for reference — teammates must have a SmartPRO account before they can be added automatically. Use Company Admin → Members to add them later.");
      }
      setStep(3);
    },
    onError: (e) => toast.error(e.message),
  });

  const subscribeMutation = trpc.subscriptions.subscribe.useMutation({
    onSuccess: () => setStep(4),
    onError: (e) => toast.error(e.message),
  });

  const handleCompanySubmit = () => {
    if (!company.name.trim()) { toast.error("Company name is required"); return; }
    if (!company.industry) { toast.error("Please select an industry"); return; }
    const inviteList = parseInviteEmails(inviteEmails);
    createCompanyMutation.mutate({
      name: company.name,
      industry: company.industry,
      country: company.country,
      phone: company.phone || undefined,
      email: company.email || undefined,
      website: company.website || undefined,
      inviteEmails: inviteList.length > 0 ? inviteList : undefined,
    });
  };

  const handleSubscribe = () => {
    const plan = (plans ?? []).find((p: { id: number; slug: string | null }) => p.slug === selectedPlan);
    if (!plan || !companyId) { toast.error("Please select a plan"); return; }
    subscribeMutation.mutate({ planId: plan.id, billingCycle: "monthly" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[var(--smartpro-navy)] to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-white">
            <div className="w-10 h-10 rounded-xl bg-[var(--smartpro-orange)] flex items-center justify-center font-bold text-lg">S</div>
            <span className="text-2xl font-bold">SmartPRO</span>
          </div>
          <p className="text-white/60 mt-2 text-sm">Set up your business workspace in minutes</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                step === s.id ? "bg-[var(--smartpro-orange)] text-white" :
                step > s.id ? "bg-green-500 text-white" : "bg-white/10 text-white/50"
              }`}>
                {step > s.id ? <CheckCircle2 size={12} /> : s.icon}
                <span className="hidden sm:inline">{s.title}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`w-6 h-0.5 ${step > s.id ? "bg-green-500" : "bg-white/20"}`} />}
            </div>
          ))}
        </div>

        <Card className="shadow-2xl border-0">
          <CardContent className="p-8">
            {/* Step 1: Company Details */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Company Details</h2>
                  <p className="text-muted-foreground text-sm mt-1">Tell us about your organization</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <Label>Company Name *</Label>
                    <Input placeholder="e.g. Muscat Trading LLC" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Industry *</Label>
                    <Select value={company.industry} onValueChange={(v) => setCompany({ ...company, industry: v })}>
                      <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                      <SelectContent>{INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Country</Label>
                    <Select value={company.country} onValueChange={(v) => setCompany({ ...company, country: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Company Size</Label>
                    <Select value={company.size} onValueChange={(v) => setCompany({ ...company, size: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-10">1–10 employees</SelectItem>
                        <SelectItem value="11-50">11–50 employees</SelectItem>
                        <SelectItem value="51-200">51–200 employees</SelectItem>
                        <SelectItem value="201-500">201–500 employees</SelectItem>
                        <SelectItem value="500+">500+ employees</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Business Email</Label>
                    <Input type="email" placeholder="info@company.com" value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input placeholder="+968 XXXX XXXX" value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Website</Label>
                    <Input placeholder="https://company.com" value={company.website} onChange={(e) => setCompany({ ...company, website: e.target.value })} />
                  </div>
                </div>
                <Button className="w-full gap-2" onClick={() => setStep(2)}>
                  Continue <ArrowRight size={16} />
                </Button>
              </div>
            )}

            {/* Step 2: Team Setup */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Team Setup</h2>
                  <p className="text-muted-foreground text-sm mt-1">Invite team members to your workspace (optional)</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Invite by Email</Label>
                  <textarea
                    className="w-full border rounded-lg p-3 text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--smartpro-orange)]"
                    placeholder="Enter email addresses, one per line&#10;colleague@company.com&#10;manager@company.com"
                    value={inviteEmails}
                    onChange={(e) => setInviteEmails(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Users who already have a SmartPRO account are added to your company immediately. Others can be invited from Company Admin after they sign up.
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-sm">
                  <p className="font-medium mb-2">Creating workspace for:</p>
                  <p className="text-muted-foreground">{company.name} · {company.industry} · {company.country}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" className="gap-2" onClick={() => setStep(1)}>
                    <ArrowLeft size={16} /> Back
                  </Button>
                  <Button className="flex-1 gap-2" disabled={createCompanyMutation.isPending} onClick={handleCompanySubmit}>
                    {createCompanyMutation.isPending ? "Creating..." : <><span>Create Workspace</span><ArrowRight size={16} /></>}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Choose Plan */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold">Choose Your Plan</h2>
                  <p className="text-muted-foreground text-sm mt-1">Start with any plan — upgrade anytime</p>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {(plans ?? []).map((plan: { id: number; name: string; slug: string; description: string | null; priceMonthly: string; priceAnnual: string }) => (
                    <div key={plan.id}
                      className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${selectedPlan === plan.slug ? "border-[var(--smartpro-orange)] bg-orange-50" : "border-border hover:border-muted-foreground"}`}
                      onClick={() => setSelectedPlan(plan.slug ?? "")}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{plan.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold">{plan.priceMonthly === "0.00" ? "Free" : `${plan.priceMonthly} OMR`}</p>
                          {plan.priceMonthly !== "0.00" && <p className="text-xs text-muted-foreground">/month</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <Button className="w-full gap-2" disabled={subscribeMutation.isPending} onClick={handleSubscribe}>
                  {subscribeMutation.isPending ? "Activating..." : <><span>Activate Plan</span><ArrowRight size={16} /></>}
                </Button>
              </div>
            )}

            {/* Step 4: Done */}
            {step === 4 && (
              <div className="text-center space-y-6 py-4">
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={40} className="text-green-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Workspace Ready!</h2>
                  <p className="text-muted-foreground mt-2">
                    <strong>{company.name}</strong> has been set up successfully. Your team can now access all SmartPRO modules.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-left">
                  {[
                    { label: "Sanad Offices", desc: "Government services" },
                    { label: "PRO Services", desc: "Visa & permits" },
                    { label: "Contracts", desc: "Document management" },
                    { label: "HR Module", desc: "Team management" },
                  ].map((f) => (
                    <div key={f.label} className="bg-muted/50 rounded-lg p-3">
                      <p className="font-medium text-sm">{f.label}</p>
                      <p className="text-xs text-muted-foreground">{f.desc}</p>
                    </div>
                  ))}
                </div>
                <Button className="w-full gap-2" size="lg" onClick={() => navigate("/dashboard")}>
                  Go to Dashboard <ArrowRight size={16} />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
