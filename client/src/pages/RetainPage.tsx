import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getLoginUrl } from "@/const";
import {
  ArrowLeft, ArrowRight, LayoutDashboard, Bell, Activity, LineChart,
  CheckCircle2, Heart, ChevronRight,
} from "lucide-react";

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "Client self-service portal",
    subtitle: "Give clients visibility without the back-and-forth",
    desc: "Each client gets a branded portal where they can view active services, track progress, download documents, and raise requests — without emailing you. Fewer status calls means more time for delivery.",
    bullets: [
      "Real-time status for every active service request",
      "Document library: contracts, invoices, HR letters, permits",
      "Raise new requests and track their progress",
      "Branded with your company name and logo",
    ],
  },
  {
    icon: Bell,
    title: "Proactive renewal reminders",
    subtitle: "Never let a contract lapse silently",
    desc: "SmartPRO monitors expiry dates for visas, work permits, trade licences, and service contracts. Automated reminders go to both you and your client at 90, 60, 30, and 7 days before expiry — so renewals happen on time, every time.",
    bullets: [
      "Tracks visa, work permit, trade licence, and contract expiry dates",
      "Automated reminders at 90 / 60 / 30 / 7 days before expiry",
      "Reminders sent to both your team and the client contact",
      "One-click renewal request from the reminder email",
    ],
  },
  {
    icon: Activity,
    title: "Service delivery tracking",
    subtitle: "Show clients exactly where their work stands",
    desc: "Every service request has a transparent progress timeline that clients can view at any time. Milestone updates are logged automatically as your team completes steps — reducing anxiety and building confidence.",
    bullets: [
      "Visual timeline: Received → In Progress → Pending Client → Completed",
      "Automatic milestone updates as your team logs progress",
      "Client-visible notes and document uploads at each stage",
      "SLA tracking: flag requests that are approaching or past deadline",
    ],
  },
  {
    icon: LineChart,
    title: "Performance reporting",
    subtitle: "Prove your value with data",
    desc: "Send clients a monthly or quarterly report showing everything SmartPRO handled for them — services completed, turnaround times, cost savings, and upcoming renewals. Reports are generated automatically and can be sent with one click.",
    bullets: [
      "Auto-generated monthly and quarterly client reports",
      "Services completed, turnaround times, and SLA adherence",
      "Upcoming renewals and recommended actions",
      "Branded PDF export or shareable link",
    ],
  },
];

export default function RetainPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/">
            <a className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft size={16} /> Back to home
            </a>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/features/attract"><a className="text-sm text-muted-foreground hover:text-foreground hidden sm:block">← Attract</a></Link>
            <Link href="/features/convert"><a className="text-sm text-muted-foreground hover:text-foreground hidden sm:block">← Convert</a></Link>
            <Button size="sm" asChild><a href={getLoginUrl()}>Get started <ArrowRight size={14} className="ml-1" /></a></Button>
          </div>
        </div>
      </header>

      <section className="py-20 bg-gradient-to-b from-blue-50/70 to-background dark:from-blue-950/20 dark:to-background border-b border-border/40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 flex items-center justify-center mx-auto mb-6">
            <Heart size={32} />
          </div>
          <Badge variant="outline" className="mb-4 text-xs font-semibold tracking-widest uppercase border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300">Retain</Badge>
          <h1 className="text-4xl sm:text-5xl font-black text-foreground mb-5 leading-tight">
            Keep clients engaged{" "}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-blue-400">and coming back</span>
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Retention is built on trust, transparency, and timely communication. SmartPRO gives you the tools to deliver all three — automatically.
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
                  <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 flex items-center justify-center mb-4">
                    <Icon size={24} />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-1">{f.subtitle}</p>
                  <h2 className="text-2xl font-black text-foreground mb-3">{f.title}</h2>
                  <p className="text-muted-foreground leading-relaxed mb-5">{f.desc}</p>
                  <ul className="space-y-2">
                    {f.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-foreground">
                        <CheckCircle2 size={16} className="text-blue-500 shrink-0 mt-0.5" />{b}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={`rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-gradient-to-br from-blue-50 to-background dark:from-blue-950/20 dark:to-background p-8 ${i % 2 === 1 ? "lg:order-1" : ""}`}>
                  <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 flex items-center justify-center mb-4">
                    <Icon size={20} />
                  </div>
                  <div className="text-lg font-bold text-foreground mb-1">{f.title}</div>
                  <div className="text-sm text-muted-foreground mb-5">{f.subtitle}</div>
                  <div className="space-y-2">
                    {f.bullets.map((b) => (
                      <div key={b} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <ChevronRight size={13} className="text-blue-400 shrink-0 mt-0.5" />{b}
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
          <h2 className="text-2xl font-black text-foreground mb-3">Ready to retain more clients?</h2>
          <p className="text-muted-foreground mb-8">SmartPRO covers the full client lifecycle — attract, convert, and retain.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button asChild><a href={getLoginUrl()}>Start free trial <ArrowRight size={14} className="ml-1" /></a></Button>
            <Button variant="outline" asChild><Link href="/features/attract"><a>← How we help you attract</a></Link></Button>
            <Button variant="outline" asChild><Link href="/features/convert"><a>← How we help you convert</a></Link></Button>
          </div>
        </div>
      </section>
    </div>
  );
}
