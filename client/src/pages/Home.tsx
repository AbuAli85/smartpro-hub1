import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import {
  ArrowRight, Shield, FileText, Users, Building2, BarChart3,
  CheckCircle2, Globe, Briefcase, Star, ChevronRight,
  ShoppingBag, Banknote, Clock, Award, Phone, Mail, MapPin,
  TrendingUp, Lock, Zap, RefreshCw
} from "lucide-react";

const MODULES = [
  {
    icon: <Building2 size={24} />,
    color: "bg-blue-100 text-blue-700",
    title: "Sanad Office Management",
    desc: "Manage government service centres across Oman — track applications, staff, and performance in real time.",
    tag: "Government",
  },
  {
    icon: <Shield size={24} />,
    color: "bg-violet-100 text-violet-700",
    title: "PRO & Visa Services",
    desc: "End-to-end management of work permits, residence visas, labour cards, PASI registration, and MHRSD filings.",
    tag: "Compliance",
  },
  {
    icon: <Users size={24} />,
    color: "bg-emerald-100 text-emerald-700",
    title: "HR & Workforce Hub",
    desc: "Employee records, leave management, payroll engine, PASI deductions, WPS submissions, and Omanisation tracking.",
    tag: "Human Resources",
  },
  {
    icon: <FileText size={24} />,
    color: "bg-orange-100 text-orange-700",
    title: "Smart Contracts",
    desc: "Draft, negotiate, and digitally sign contracts with full audit trail, version control, and e-signature support.",
    tag: "Legal",
  },
  {
    icon: <ShoppingBag size={24} />,
    color: "bg-pink-100 text-pink-700",
    title: "Service Marketplace",
    desc: "Connect with verified PRO service providers across Muscat, Salalah, Sohar, and all GCC markets.",
    tag: "Marketplace",
  },
  {
    icon: <Banknote size={24} />,
    color: "bg-teal-100 text-teal-700",
    title: "Billing & Payroll Engine",
    desc: "Automated billing cycles, WPS-compliant payroll, salary loans, PASI contributions, and PDF payslip generation.",
    tag: "Finance",
  },
  {
    icon: <Briefcase size={24} />,
    color: "bg-amber-100 text-amber-700",
    title: "CRM & Client Portal",
    desc: "Manage clients, deals, and pipelines. Give each company a branded self-service portal for their documents.",
    tag: "Business",
  },
  {
    icon: <BarChart3 size={24} />,
    color: "bg-indigo-100 text-indigo-700",
    title: "Analytics & Reports",
    desc: "Real-time dashboards, expiry alerts, compliance certificates, officer payout reports, and workforce analytics.",
    tag: "Analytics",
  },
];

const STATS = [
  { value: "500+", label: "Companies Served" },
  { value: "12,000+", label: "Work Permits Processed" },
  { value: "98.7%", label: "Compliance Rate" },
  { value: "GCC", label: "Regional Coverage" },
];

const TESTIMONIALS = [
  {
    name: "Mohammed Al-Balushi",
    role: "HR Director, Al-Noor Group",
    company: "Muscat, Oman",
    text: "SmartPRO transformed how we manage our 400+ workforce. The PASI integration and WPS payroll alone saved us 3 days per month.",
    stars: 5,
  },
  {
    name: "Fatima Al-Harthi",
    role: "Operations Manager, Gulf PRO Services",
    company: "Ruwi, Muscat",
    text: "The Sanad office management module is exactly what we needed. Real-time tracking of applications across all our centres.",
    stars: 5,
  },
  {
    name: "Ahmed Al-Rashdi",
    role: "CEO, Oman Business Solutions",
    company: "Sohar, Oman",
    text: "From visa processing to contract signing — everything in one platform. Our clients love the self-service portal.",
    stars: 5,
  },
];

const FAQS = [
  {
    q: "Is SmartPRO compliant with Oman's MHRSD and PASI regulations?",
    a: "Yes. The platform is built specifically for Oman's regulatory framework — including MHRSD labour filings, PASI contribution calculations, WPS salary transfers, and Omanisation quota tracking.",
  },
  {
    q: "Can we manage multiple companies or branches?",
    a: "Absolutely. SmartPRO supports multi-company structures with role-based access control. Each company has isolated data with a shared PRO officer pool.",
  },
  {
    q: "Does it support Arabic and English?",
    a: "The platform is designed for bilingual use. Document templates, contracts, and reports can be generated in both Arabic and English.",
  },
  {
    q: "How does the Shared Omani PRO feature work?",
    a: "Multiple companies can share a pool of registered PRO officers. The billing engine automatically calculates per-company charges based on assignments and service types.",
  },
  {
    q: "Is there a mobile app?",
    a: "The platform is fully responsive and works as a Progressive Web App (PWA) on iOS and Android — with a mobile bottom navigation for quick access to key modules.",
  },
];

export default function Home() {
  const { isAuthenticated, loading } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Top Nav ── */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--smartpro-orange)] flex items-center justify-center shadow-sm">
              <span className="text-white font-black text-sm tracking-tight">SP</span>
            </div>
            <div>
              <div className="font-black text-foreground text-base leading-none">SmartPRO</div>
              <div className="text-[10px] text-muted-foreground leading-none mt-0.5">Business Services Hub</div>
            </div>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#modules" className="hover:text-foreground transition-colors">Modules</a>
            <a href="#why" className="hover:text-foreground transition-colors">Why SmartPRO</a>
            <a href="#testimonials" className="hover:text-foreground transition-colors">Clients</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            {loading ? null : isAuthenticated ? (
              <Button asChild size="sm" className="bg-[var(--smartpro-orange)] hover:bg-[var(--smartpro-orange-dk)] text-white">
                <Link href="/dashboard">Go to Dashboard <ArrowRight size={14} className="ml-1" /></Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <a href={getLoginUrl()}>Sign In</a>
                </Button>
                <Button size="sm" className="bg-[var(--smartpro-orange)] hover:bg-[var(--smartpro-orange-dk)] text-white" asChild>
                  <a href={getLoginUrl()}>Get Started</a>
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero-gradient text-white relative overflow-hidden">
        {/* Decorative grid */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32 relative">
          <div className="max-w-3xl">
            <Badge className="mb-5 bg-[var(--smartpro-orange)]/20 text-orange-300 border-orange-500/30 text-xs font-semibold px-3 py-1">
              🇴🇲 Built for Oman & GCC Business Services
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black leading-tight mb-6">
              The Complete
              <span className="block text-[var(--smartpro-orange)]">Business Services</span>
              Platform for Oman
            </h1>
            <p className="text-lg text-white/75 mb-8 leading-relaxed max-w-2xl">
              Manage government services, PRO operations, HR, payroll, contracts, and client portals —
              all in one platform designed for Oman's regulatory environment and GCC business standards.
            </p>
            <div className="flex flex-wrap gap-3 mb-10">
              <Button size="lg" className="bg-[var(--smartpro-orange)] hover:bg-[var(--smartpro-orange-dk)] text-white font-semibold px-8 shadow-lg" asChild>
                <a href={getLoginUrl()}>Start Free Trial <ArrowRight size={16} className="ml-2" /></a>
              </Button>
              <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 bg-transparent" asChild>
                <a href="#modules">Explore Modules <ChevronRight size={16} className="ml-1" /></a>
              </Button>
            </div>
            {/* Trust badges */}
            <div className="flex flex-wrap gap-4 text-sm text-white/60">
              {["MHRSD Compliant", "PASI Integrated", "WPS Ready", "ISO 27001"].map((b) => (
                <span key={b} className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-400" /> {b}
                </span>
              ))}
            </div>
          </div>
        </div>
        {/* Bottom wave */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-background"
          style={{ clipPath: "ellipse(55% 100% at 50% 100%)" }} />
      </section>

      {/* ── Stats ── */}
      <section className="py-14 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl md:text-4xl font-black text-[var(--smartpro-orange)] mb-1">{s.value}</div>
                <div className="text-sm text-muted-foreground font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Modules ── */}
      <section id="modules" className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <Badge className="mb-3 bg-orange-100 text-orange-700 border-orange-200">Platform Modules</Badge>
            <h2 className="text-3xl md:text-4xl font-black text-foreground mb-4">
              Everything Your Business Needs
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From Sanad office operations to payroll and CRM — SmartPRO covers the full lifecycle
              of business services in Oman and across the GCC.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {MODULES.map((m) => (
              <div key={m.title} className="feature-card group">
                <div className={`feature-icon-wrap ${m.color}`}>{m.icon}</div>
                <Badge variant="outline" className="mb-2 text-xs">{m.tag}</Badge>
                <h3 className="font-bold text-foreground mb-2 text-sm leading-snug">{m.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why SmartPRO ── */}
      <section id="why" className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <Badge className="mb-4 bg-orange-100 text-orange-700 border-orange-200">Why SmartPRO</Badge>
              <h2 className="text-3xl md:text-4xl font-black text-foreground mb-6 leading-tight">
                Built for Oman's<br />Regulatory Reality
              </h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                Unlike generic HR or ERP platforms, SmartPRO is engineered around Oman's specific
                requirements — PASI contributions, MHRSD filings, Omanisation quotas, Sanad service
                centres, and WPS salary transfers.
              </p>
              <div className="space-y-4">
                {[
                  { icon: <Shield size={18} />, title: "PASI & MHRSD Ready", desc: "Automated contribution calculations and ministry filing templates" },
                  { icon: <Globe size={18} />, title: "GCC Multi-Country", desc: "Supports operations across Oman, UAE, Saudi Arabia, Qatar, and Bahrain" },
                  { icon: <Lock size={18} />, title: "Enterprise Security", desc: "Role-based access, full audit log, and encrypted document storage" },
                  { icon: <Zap size={18} />, title: "Real-Time Alerts", desc: "Expiry notifications for visas, permits, contracts, and compliance deadlines" },
                  { icon: <RefreshCw size={18} />, title: "Renewal Workflows", desc: "Automated renewal pipelines with officer assignment and status tracking" },
                  { icon: <TrendingUp size={18} />, title: "Business Intelligence", desc: "Analytics dashboards, officer performance reports, and Omanisation metrics" },
                ].map((f) => (
                  <div key={f.title} className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center shrink-0 mt-0.5">
                      {f.icon}
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-foreground">{f.title}</div>
                      <div className="text-xs text-muted-foreground">{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Visual panel */}
            <div className="hero-gradient rounded-3xl p-8 text-white">
              <div className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-6">Platform Overview</div>
              <div className="space-y-4">
                {[
                  { label: "Work Permits Active", value: "1,248", pct: 78, color: "bg-orange-400" },
                  { label: "Omanisation Rate", value: "34.2%", pct: 34, color: "bg-emerald-400" },
                  { label: "Contracts Signed", value: "892", pct: 89, color: "bg-teal-400" },
                  { label: "PASI Compliance", value: "98.7%", pct: 99, color: "bg-amber-400" },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-white/80">{item.label}</span>
                      <span className="font-bold">{item.value}</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-3 gap-4 text-center">
                {[
                  { v: "24/7", l: "Support" },
                  { v: "99.9%", l: "Uptime" },
                  { v: "< 2s", l: "Response" },
                ].map((s) => (
                  <div key={s.l}>
                    <div className="text-xl font-black text-[var(--smartpro-orange)]">{s.v}</div>
                    <div className="text-xs text-white/50 mt-0.5">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section id="testimonials" className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <Badge className="mb-3 bg-orange-100 text-orange-700 border-orange-200">Client Stories</Badge>
            <h2 className="text-3xl md:text-4xl font-black text-foreground mb-4">Trusted Across Oman</h2>
            <p className="text-muted-foreground">What business leaders say about SmartPRO</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex gap-0.5 mb-4">
                  {[...Array(t.stars)].map((_, i) => (
                    <Star key={i} size={14} className="fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-foreground leading-relaxed mb-5 italic">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[var(--smartpro-orange)] flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin size={10} /> {t.company}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-20 bg-background">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <Badge className="mb-3 bg-orange-100 text-orange-700 border-orange-200">FAQ</Badge>
            <h2 className="text-3xl font-black text-foreground mb-4">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-4">
            {FAQS.map((f) => (
              <details key={f.q} className="group bg-card border border-border rounded-xl overflow-hidden">
                <summary className="flex items-center justify-between p-5 cursor-pointer font-semibold text-sm text-foreground list-none">
                  {f.q}
                  <ChevronRight size={16} className="text-muted-foreground group-open:rotate-90 transition-transform shrink-0 ml-3" />
                </summary>
                <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-border pt-4">
                  {f.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 hero-gradient text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Award size={40} className="mx-auto mb-5 text-[var(--smartpro-orange)]" />
          <h2 className="text-3xl md:text-4xl font-black mb-5">
            Ready to Modernise Your<br />Business Operations?
          </h2>
          <p className="text-white/70 mb-8 text-lg max-w-xl mx-auto">
            Join hundreds of companies across Oman and GCC who trust SmartPRO
            to manage their government services, workforce, and business operations.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" className="bg-[var(--smartpro-orange)] hover:bg-[var(--smartpro-orange-dk)] text-white font-semibold px-8" asChild>
              <a href={getLoginUrl()}>Get Started Free <ArrowRight size={16} className="ml-2" /></a>
            </Button>
            <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 bg-transparent" asChild>
              <a href="mailto:info@smartpro.om">Contact Sales</a>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-[var(--smartpro-charcoal)] text-white/60 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[var(--smartpro-orange)] flex items-center justify-center">
                  <span className="text-white font-black text-xs">SP</span>
                </div>
                <div>
                  <div className="text-white font-black text-sm">SmartPRO</div>
                  <div className="text-[10px] text-white/40">Business Services Hub</div>
                </div>
              </div>
              <p className="text-xs leading-relaxed">
                The enterprise platform for Oman and GCC business services —
                government compliance, HR, payroll, and more.
              </p>
            </div>
            <div>
              <div className="text-white text-xs font-semibold uppercase tracking-widest mb-4">Platform</div>
              <div className="space-y-2 text-xs">
                {["Sanad Offices", "PRO Services", "HR & Payroll", "Smart Contracts", "Marketplace", "Analytics"].map((l) => (
                  <div key={l}><a href="#modules" className="hover:text-white transition-colors">{l}</a></div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-white text-xs font-semibold uppercase tracking-widest mb-4">Compliance</div>
              <div className="space-y-2 text-xs">
                {["MHRSD Integration", "PASI Contributions", "WPS Payroll", "Omanisation Tracking", "Labour Law", "Data Privacy"].map((l) => (
                  <div key={l}><span className="hover:text-white transition-colors cursor-default">{l}</span></div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-white text-xs font-semibold uppercase tracking-widest mb-4">Contact</div>
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2"><MapPin size={12} /> Muscat, Sultanate of Oman</div>
                <div className="flex items-center gap-2"><Phone size={12} /> +968 2400 0000</div>
                <div className="flex items-center gap-2"><Mail size={12} /> info@smartpro.om</div>
                <div className="flex items-center gap-2"><Globe size={12} /> www.smartpro.om</div>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span>© 2026 SmartPRO Business Services Hub. All rights reserved.</span>
            <div className="flex gap-4">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-white transition-colors">Support</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
