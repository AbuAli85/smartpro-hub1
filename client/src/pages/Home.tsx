import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import {
  ArrowRight,
  Shield,
  FileText,
  Users,
  Building2,
  BarChart3,
  CheckCircle2,
  Globe,
  Briefcase,
  Star,
  ChevronRight,
  ShoppingBag,
  Banknote,
  Clock,
  Award,
  Phone,
  Mail,
  MapPin,
  TrendingUp,
  Lock,
  Zap,
  RefreshCw,
  Radar,
  CalendarClock,
  ClipboardList,
  Sparkles,
  LayoutGrid,
} from "lucide-react";

const LOGO_SRC = "/smartpro-logo.png";

const MODULES = [
  {
    icon: <Building2 size={24} />,
    color: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200",
    title: "Sanad Office Management",
    desc: "Run government service centres across Oman — applications, staff, SLAs, and performance in one place.",
    tag: "Government",
  },
  {
    icon: <Shield size={24} />,
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    title: "PRO & Visa Services",
    desc: "Work permits, visas, labour cards, PASI, MHRSD filings, and officer assignments with full traceability.",
    tag: "Compliance",
  },
  {
    icon: <Users size={24} />,
    color: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200",
    title: "HR & Workforce Hub",
    desc: "Employees, recruitment, leave, attendance, letters, org charts, KPIs, and Omanisation intelligence.",
    tag: "Human Resources",
  },
  {
    icon: <FileText size={24} />,
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    title: "Contracts & Documents",
    desc: "Smart contracts, e-signatures, renewal workflows, expiry dashboards, and audit-ready document vaults.",
    tag: "Legal",
  },
  {
    icon: <ShoppingBag size={24} />,
    color: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200",
    title: "Service Marketplace",
    desc: "Connect with verified PRO providers across Muscat, Salalah, Sohar, and wider GCC corridors.",
    tag: "Marketplace",
  },
  {
    icon: <Banknote size={24} />,
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    title: "Billing & Payroll Engine",
    desc: "Billing cycles, WPS payroll, PASI deductions, payslips, and finance dashboards built for Oman.",
    tag: "Finance",
  },
  {
    icon: <Briefcase size={24} />,
    color: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200",
    title: "CRM & Client Portal",
    desc: "Pipelines, quotations, and a branded client portal for documents, subscriptions, and onboarding.",
    tag: "Commercial",
  },
  {
    icon: <BarChart3 size={24} />,
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    title: "Analytics & Reporting",
    desc: "Dashboards, expiry alerts, officer payouts, workforce analytics, and exportable compliance reports.",
    tag: "Insights",
  },
];

const CAPABILITY_GROUPS = [
  {
    icon: <Radar size={20} />,
    title: "Control & visibility",
    accent: "text-red-700 dark:text-red-400",
    items: [
      "Control Tower",
      "Executive dashboard",
      "Operations centre",
      "Analytics",
      "Compliance centre",
    ],
  },
  {
    icon: <Building2 size={20} />,
    title: "Government & workforce",
    accent: "text-emerald-700 dark:text-emerald-400",
    items: [
      "Sanad offices & office dashboard",
      "PRO services & workforce hub",
      "Permits, cases & document sync",
      "Partner onboarding & marketplace",
    ],
  },
  {
    icon: <CalendarClock size={20} />,
    title: "HR operations",
    accent: "text-red-700 dark:text-red-400",
    items: [
      "Attendance, sites & today board",
      "Shifts, schedules & holidays",
      "Recruitment & public job board",
      "Letters, tasks & announcements",
    ],
  },
  {
    icon: <Banknote size={20} />,
    title: "Finance & payroll",
    accent: "text-emerald-700 dark:text-emerald-400",
    items: [
      "Payroll engine & WPS-ready flows",
      "PASI-aligned calculations",
      "Billing engine & subscriptions",
      "Finance overview & reports",
    ],
  },
  {
    icon: <ClipboardList size={20} />,
    title: "Governance",
    accent: "text-red-700 dark:text-red-400",
    items: [
      "Renewal workflows & SLA management",
      "Expiry alerts & audit log",
      "Multi-company roles & team access",
      "Platform operations tooling",
    ],
  },
  {
    icon: <LayoutGrid size={20} />,
    title: "Company workspace",
    accent: "text-emerald-700 dark:text-emerald-400",
    items: [
      "Workspace & company hub",
      "Employee & manager portals",
      "Org structure & departments",
      "Preferences & onboarding guides",
    ],
  },
];

const STATS = [
  { value: "500+", label: "Companies served" },
  { value: "12,000+", label: "Work permits processed" },
  { value: "98.7%", label: "Compliance rate" },
  { value: "GCC", label: "Regional coverage" },
];

const TESTIMONIALS = [
  {
    name: "Mohammed Al-Balushi",
    role: "HR Director, Al-Noor Group",
    company: "Muscat, Oman",
    text: "Smart PRO transformed how we manage our 400+ workforce. PASI integration and WPS payroll alone saved us three days every month.",
    stars: 5,
  },
  {
    name: "Fatima Al-Harthi",
    role: "Operations Manager, Gulf PRO Services",
    company: "Ruwi, Muscat",
    text: "Sanad office management is exactly what we needed — real-time visibility across every centre we run.",
    stars: 5,
  },
  {
    name: "Ahmed Al-Rashdi",
    role: "CEO, Oman Business Solutions",
    company: "Sohar, Oman",
    text: "From visas to contract signing, everything lives in one platform. Our clients love the self-service portal.",
    stars: 5,
  },
];

const FAQS = [
  {
    q: "Is Smart PRO compliant with Oman MHRSD and PASI rules?",
    a: "Yes. The platform is built for Oman’s framework — MHRSD labour filings, PASI contributions, WPS salary transfers, and Omanisation tracking are first-class.",
  },
  {
    q: "Can we manage multiple companies or branches?",
    a: "Yes. Multi-company structures with role-based access are supported. Data stays isolated per tenant with shared PRO pools where you need them.",
  },
  {
    q: "Does it support Arabic and English?",
    a: "The product is bilingual-ready. Templates, contracts, and reports can be produced in Arabic and English.",
  },
  {
    q: "How does shared Omani PRO officer coverage work?",
    a: "Companies can share a pool of registered officers. The billing engine allocates charges by service type and assignment.",
  },
  {
    q: "Is there a mobile experience?",
    a: "The platform is responsive and installable as a PWA on iOS and Android, with navigation tuned for mobile field work.",
  },
];

export default function Home() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
        <div className="h-12 w-12 rounded-2xl border-2 border-[var(--smartpro-red)] border-t-transparent animate-spin" aria-hidden />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main" className="skip-to-main">
        Skip to content
      </a>

      <nav className="sticky top-0 z-50 bg-white/95 dark:bg-[oklch(0.14_0.006_286)]/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[4.25rem] flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 min-w-0">
            <img
              src={LOGO_SRC}
              alt="Smart PRO — one-station business solutions"
              className="h-11 w-auto object-contain shrink-0"
              width={180}
              height={44}
            />
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#modules" className="hover:text-foreground transition-colors">
              Modules
            </a>
            <a href="#capabilities" className="hover:text-foreground transition-colors">
              Capabilities
            </a>
            <a href="#why" className="hover:text-foreground transition-colors">
              Why Smart PRO
            </a>
            <a href="#testimonials" className="hover:text-foreground transition-colors">
              Clients
            </a>
            <a href="#faq" className="hover:text-foreground transition-colors">
              FAQ
            </a>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAuthenticated ? (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/control-tower">Dashboard</Link>
                </Button>
                <Button size="sm" className="landing-cta-primary font-semibold shadow-sm" asChild>
                  <Link href="/control-tower">Go to app <ArrowRight size={14} className="ml-1" /></Link>
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <a href={getLoginUrl()}>Sign in</a>
                </Button>
                <Button size="sm" className="landing-cta-primary font-semibold shadow-sm" asChild>
                  <a href={getLoginUrl()}>Get started</a>
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main id="main">
        <section className="hero-gradient text-white relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-28 relative">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div className="max-w-xl">
                <p className="inline-flex rounded-full px-4 py-2 landing-tagline-pill uppercase mb-6 shadow-sm">
                  One-station business solutions
                </p>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-black leading-tight mb-6">
                  Run government, HR, payroll, and clients in{" "}
                  <span className="text-white/95">one platform</span>
                </h1>
                <p className="text-lg text-white/80 mb-8 leading-relaxed">
                  Built for Oman and the GCC: Sanad centres, PRO services, workforce compliance, contracts,
                  billing, and analytics — with security, audit trails, and role-based access throughout.
                </p>
                <div className="flex flex-wrap gap-3 mb-10">
                  <Button
                    size="lg"
                    className="landing-cta-primary font-semibold px-8 shadow-lg h-12"
                    asChild
                  >
                    <a href={getLoginUrl()}>
                      Start free trial <ArrowRight size={16} className="ml-2" />
                    </a>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white/35 text-white hover:bg-white/10 bg-transparent h-12"
                    asChild
                  >
                    <a href="#modules">
                      Explore modules <ChevronRight size={16} className="ml-1" />
                    </a>
                  </Button>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-white/65">
                  {["MHRSD-ready", "PASI integrated", "WPS payroll", "Role-based security"].map((b) => (
                    <span key={b} className="inline-flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-300 shrink-0" /> {b}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex justify-center lg:justify-end">
                <div className="relative w-full max-w-md">
                  <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-white/10 to-transparent blur-2xl" />
                  <img
                    src={LOGO_SRC}
                    alt=""
                    className="relative w-full h-auto object-contain drop-shadow-2xl"
                    width={480}
                    height={200}
                  />
                </div>
              </div>
            </div>
          </div>
          <div
            className="absolute bottom-0 left-0 right-0 h-16 bg-background"
            style={{ clipPath: "ellipse(55% 100% at 50% 100%)" }}
          />
        </section>

        <section className="py-14 bg-background" aria-label="Platform highlights">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {STATS.map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-3xl md:text-4xl font-black mb-1 bg-clip-text text-transparent bg-gradient-to-r from-[var(--smartpro-red)] to-[var(--smartpro-brand-green)]">
                    {s.value}
                  </div>
                  <div className="text-sm text-muted-foreground font-medium">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="modules" className="py-20 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <Badge
                variant="outline"
                className="mb-3 border-rose-200/80 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800"
              >
                Platform modules
              </Badge>
              <h2 className="text-3xl md:text-4xl font-black text-foreground mb-4">
                Everything your business runs on
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                From front-line Sanad operations to payroll and client portals — Smart PRO connects the
                modules teams use every day.
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

        <section id="capabilities" className="py-20 bg-background border-y border-border/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <Badge
                variant="outline"
                className="mb-3 border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
              >
                <Sparkles size={12} className="mr-1.5 inline" /> Full capability map
              </Badge>
              <h2 className="text-3xl md:text-4xl font-black text-foreground mb-4">
                Designed for real operating models
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Representative areas across the product — each area is permission-aware for your team.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {CAPABILITY_GROUPS.map((g) => (
                <div
                  key={g.title}
                  className="rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className={`flex items-center gap-2.5 mb-4 font-semibold ${g.accent}`}>
                    <span className="rounded-lg bg-muted p-2 text-foreground">{g.icon}</span>
                    {g.title}
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {g.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="why" className="py-20 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <Badge
                  variant="outline"
                  className="mb-4 border-rose-200/80 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                >
                  Why Smart PRO
                </Badge>
                <h2 className="text-3xl md:text-4xl font-black text-foreground mb-6 leading-tight">
                  Built for Oman&apos;s regulatory reality
                </h2>
                <p className="text-muted-foreground mb-8 leading-relaxed">
                  Unlike generic HR suites, Smart PRO encodes PASI, MHRSD, Omanisation, Sanad workflows,
                  and WPS payroll patterns — so teams spend less time on spreadsheets and more on outcomes.
                </p>
                <div className="space-y-4">
                  {[
                    {
                      icon: <Shield size={18} />,
                      title: "PASI & MHRSD aligned",
                      desc: "Contribution logic and ministry-ready templates without manual rework.",
                    },
                    {
                      icon: <Globe size={18} />,
                      title: "GCC-ready",
                      desc: "Operate across Oman, UAE, Saudi Arabia, Qatar, and Bahrain where your business reaches.",
                    },
                    {
                      icon: <Lock size={18} />,
                      title: "Enterprise security",
                      desc: "Role-based access, full audit log, and encrypted document handling.",
                    },
                    {
                      icon: <Zap size={18} />,
                      title: "Proactive alerts",
                      desc: "Visas, permits, contracts, and compliance deadlines surface before they expire.",
                    },
                    {
                      icon: <RefreshCw size={18} />,
                      title: "Renewal workflows",
                      desc: "Pipelines with officer assignment, status tracking, and SLAs.",
                    },
                    {
                      icon: <TrendingUp size={18} />,
                      title: "Operational intelligence",
                      desc: "Dashboards, officer performance, and workforce analytics.",
                    },
                  ].map((f) => (
                    <div key={f.title} className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-100 to-emerald-100 dark:from-red-950/50 dark:to-emerald-950/50 text-red-800 dark:text-red-200 flex items-center justify-center shrink-0 mt-0.5">
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
              <div className="hero-gradient rounded-3xl p-8 text-white">
                <div className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-6">
                  Platform snapshot
                </div>
                <div className="space-y-4">
                  {[
                    { label: "Active work permits", value: "1,248", pct: 78, bar: "bg-red-400" },
                    { label: "Omanisation rate", value: "34.2%", pct: 34, bar: "bg-emerald-400" },
                    { label: "Contracts signed", value: "892", pct: 89, bar: "bg-teal-400" },
                    { label: "PASI compliance", value: "98.7%", pct: 99, bar: "bg-amber-400" },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-white/80">{item.label}</span>
                        <span className="font-bold">{item.value}</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className={`h-full ${item.bar} rounded-full`} style={{ width: `${item.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-3 gap-4 text-center">
                  {[
                    { v: "24/7", l: "Support" },
                    { v: "99.9%", l: "Uptime" },
                    { v: "< 2s", l: "API p95" },
                  ].map((s) => (
                    <div key={s.l}>
                      <div className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-[var(--smartpro-red)] to-[var(--smartpro-brand-green)]">
                        {s.v}
                      </div>
                      <div className="text-xs text-white/50 mt-0.5">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="testimonials" className="py-20 bg-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <Badge
                variant="outline"
                className="mb-3 border-rose-200/80 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
              >
                Client stories
              </Badge>
              <h2 className="text-3xl md:text-4xl font-black text-foreground mb-4">Trusted across Oman</h2>
              <p className="text-muted-foreground">What operators and HR leaders say about Smart PRO</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {TESTIMONIALS.map((t) => (
                <div
                  key={t.name}
                  className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex gap-0.5 mb-4">
                    {[...Array(t.stars)].map((_, i) => (
                      <Star key={i} size={14} className="fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-foreground leading-relaxed mb-5 italic">&ldquo;{t.text}&rdquo;</p>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 landing-cta-primary"
                    >
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

        <section id="faq" className="py-20 bg-muted/30">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <Badge
                variant="outline"
                className="mb-3 border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
              >
                FAQ
              </Badge>
              <h2 className="text-3xl font-black text-foreground mb-4">Frequently asked questions</h2>
            </div>
            <div className="space-y-4">
              {FAQS.map((f) => (
                <details key={f.q} className="group bg-card border border-border rounded-xl overflow-hidden">
                  <summary className="flex items-center justify-between p-5 cursor-pointer font-semibold text-sm text-foreground list-none">
                    {f.q}
                    <ChevronRight
                      size={16}
                      className="text-muted-foreground group-open:rotate-90 transition-transform shrink-0 ml-3"
                    />
                  </summary>
                  <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-border pt-4">
                    {f.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 hero-gradient text-white" aria-labelledby="cta-heading">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <Award size={40} className="mx-auto mb-5 text-white/90" />
            <h2 id="cta-heading" className="text-3xl md:text-4xl font-black mb-5">
              Ready to modernise your operations?
            </h2>
            <p className="text-white/75 mb-8 text-lg max-w-xl mx-auto">
              Join organisations across Oman and the GCC that run Smart PRO for government services,
              workforce compliance, and client delivery.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button size="lg" className="landing-cta-primary font-semibold px-8 h-12 shadow-lg" asChild>
                <a href={getLoginUrl()}>
                  Get started free <ArrowRight size={16} className="ml-2" />
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/35 text-white hover:bg-white/10 bg-transparent h-12"
                asChild
              >
                <a href="mailto:info@smartpro.om">Contact sales</a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[var(--smartpro-charcoal)] text-white/60 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img
                  src={LOGO_SRC}
                  alt="Smart PRO"
                  className="h-14 w-auto object-contain max-w-[200px]"
                />
              </div>
              <p className="text-xs leading-relaxed">
                The enterprise hub for Oman and GCC business services — compliance, HR, payroll, and client
                delivery in one place.
              </p>
            </div>
            <div>
              <div className="text-white text-xs font-semibold uppercase tracking-widest mb-4">Platform</div>
              <div className="space-y-2 text-xs">
                {["Sanad & government", "PRO & workforce", "HR & attendance", "Contracts & renewals", "Marketplace", "Analytics"].map((l) => (
                  <div key={l}>
                    <a href="#modules" className="hover:text-white transition-colors">
                      {l}
                    </a>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-white text-xs font-semibold uppercase tracking-widest mb-4">Compliance</div>
              <div className="space-y-2 text-xs">
                {["MHRSD integration", "PASI contributions", "WPS payroll", "Omanisation", "Labour law", "Data privacy"].map((l) => (
                  <div key={l}>
                    <span className="cursor-default">{l}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-white text-xs font-semibold uppercase tracking-widest mb-4">Contact</div>
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2">
                  <MapPin size={12} /> Muscat, Sultanate of Oman
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={12} /> +968 2400 0000
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={12} /> info@smartpro.om
                </div>
                <div className="flex items-center gap-2">
                  <Globe size={12} /> www.smartpro.om
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span>© 2026 Smart PRO. All rights reserved.</span>
            <div className="flex gap-4">
              <a href="#" className="hover:text-white transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-white transition-colors">
                Terms
              </a>
              <a href="#" className="hover:text-white transition-colors">
                Support
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
