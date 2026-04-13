import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getLoginUrl } from "@/const";
import {
  ArrowLeft, ArrowRight, ShoppingBag, Globe, Star, BarChart3,
  CheckCircle2, Radar, ChevronRight,
} from "lucide-react";

const FEATURES = [
  {
    icon: ShoppingBag,
    title: "Marketplace listing",
    subtitle: "Get found by the right businesses",
    desc: "SmartPRO's marketplace connects Omani and GCC businesses with verified service providers. Your listing appears in search results for PRO services, HR outsourcing, legal consulting, and more — with your credentials, response time, and pricing tiers displayed upfront.",
    bullets: [
      "Appear in category and keyword searches across Oman and GCC",
      "Display your certifications, MOL registration, and years of experience",
      "Set service packages with clear pricing and turnaround times",
      "Receive enquiries directly in your SmartPRO inbox",
    ],
  },
  {
    icon: Globe,
    title: "Public service catalogue",
    subtitle: "Showcase everything you offer",
    desc: "Build a structured, SEO-friendly catalogue of every service you provide. Clients can browse your offerings, compare packages, and request quotes — all without leaving the platform.",
    bullets: [
      "Organise services by category (visa, payroll, legal, HR, etc.)",
      "Add pricing tiers: basic, standard, and premium packages",
      "Include turnaround times, prerequisites, and deliverables",
      "Link directly to your catalogue from emails and proposals",
    ],
  },
  {
    icon: Star,
    title: "Verified reviews & ratings",
    subtitle: "Build trust before the first conversation",
    desc: "Clients who have used your services can leave star ratings and written reviews directly on your SmartPRO profile. Reviews are verified against actual completed engagements — no fake testimonials.",
    bullets: [
      "Star ratings (1–5) with written testimonials from real clients",
      "Verified badge on reviews tied to completed contracts",
      "Average rating displayed prominently on your marketplace listing",
      "Respond publicly to reviews to show responsiveness",
    ],
  },
  {
    icon: BarChart3,
    title: "Lead analytics",
    subtitle: "Know what's working and double down",
    desc: "See exactly which services attract the most profile views, enquiries, and conversions. SmartPRO's lead analytics dashboard shows you where your pipeline comes from.",
    bullets: [
      "Profile view counts and enquiry-to-conversion rates per service",
      "Traffic sources: marketplace search, direct link, referral",
      "Weekly and monthly trend charts",
      "Competitor benchmark for your service category",
    ],
  },
];

export default function AttractPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={16} /> Back to home
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/features/convert" className="text-sm text-muted-foreground hover:text-foreground hidden sm:block">Convert →</Link>
            <Link href="/features/retain" className="text-sm text-muted-foreground hover:text-foreground hidden sm:block">Retain →</Link>
            <Button size="sm" asChild><a href={getLoginUrl()}>Get started <ArrowRight size={14} className="ml-1" /></a></Button>
          </div>
        </div>
      </header>

      <section className="py-20 bg-gradient-to-b from-red-50/70 to-background dark:from-red-950/20 dark:to-background border-b border-border/40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 flex items-center justify-center mx-auto mb-6">
            <Radar size={32} />
          </div>
          <Badge variant="outline" className="mb-4 text-xs font-semibold tracking-widest uppercase border-red-300 text-red-700 dark:border-red-700 dark:text-red-300">Attract</Badge>
          <h1 className="text-4xl sm:text-5xl font-black text-foreground mb-5 leading-tight">
            Make your services{" "}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-600 to-red-400">discoverable</span>
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Put your business in front of the right clients at the right time — through the SmartPRO marketplace, a polished service catalogue, and verified client reviews.
          </p>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
                <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                  <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 flex items-center justify-center mb-4">
                    <Icon size={24} />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-widest text-red-600 dark:text-red-400 mb-1">{f.subtitle}</p>
                  <h2 className="text-2xl font-black text-foreground mb-3">{f.title}</h2>
                  <p className="text-muted-foreground leading-relaxed mb-5">{f.desc}</p>
                  <ul className="space-y-2">
                    {f.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-foreground">
                        <CheckCircle2 size={16} className="text-red-500 shrink-0 mt-0.5" />{b}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={`rounded-2xl border border-red-100 dark:border-red-900/40 bg-gradient-to-br from-red-50 to-background dark:from-red-950/20 dark:to-background p-8 ${i % 2 === 1 ? "lg:order-1" : ""}`}>
                  <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 flex items-center justify-center mb-4">
                    <Icon size={20} />
                  </div>
                  <div className="text-lg font-bold text-foreground mb-1">{f.title}</div>
                  <div className="text-sm text-muted-foreground mb-5">{f.subtitle}</div>
                  <div className="space-y-2">
                    {f.bullets.map((b) => (
                      <div key={b} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <ChevronRight size={13} className="text-red-400 shrink-0 mt-0.5" />{b}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="py-16 bg-muted/30 border-t border-border/40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-black text-foreground mb-3">Ready to attract more clients?</h2>
          <p className="text-muted-foreground mb-8">Once you attract them, SmartPRO helps you convert and retain them too.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button asChild><a href={getLoginUrl()}>Start free trial <ArrowRight size={14} className="ml-1" /></a></Button>
            <Button variant="outline" asChild><Link href="/features/convert"><a>How we help you convert <ArrowRight size={14} className="ml-1" /></a></Link></Button>
            <Button variant="outline" asChild><Link href="/features/retain"><a>How we help you retain <ArrowRight size={14} className="ml-1" /></a></Link></Button>
          </div>
        </div>
      </section>
    </div>
  );
}
