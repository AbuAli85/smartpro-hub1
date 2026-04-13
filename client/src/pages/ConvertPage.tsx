import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getLoginUrl } from "@/const";
import {
  ArrowLeft, ArrowRight, Users, FileText, PenLine, Receipt,
  CheckCircle2, Zap, ChevronRight,
} from "lucide-react";

const FEATURES = [
  {
    icon: Users,
    title: "CRM & sales pipeline",
    subtitle: "Never lose track of a lead",
    desc: "Manage every prospect from first enquiry to signed contract in one visual pipeline. SmartPRO's CRM is built for service businesses — track follow-up dates, attach documents, log calls, and see the full history of every client relationship.",
    bullets: [
      "Kanban pipeline: New → Qualified → Proposal → Negotiation → Won/Lost",
      "Automatic follow-up reminders based on last activity date",
      "Attach enquiry emails, WhatsApp screenshots, and documents to each lead",
      "Win/loss analytics to understand where deals stall",
    ],
  },
  {
    icon: FileText,
    title: "AI-generated proposals",
    subtitle: "Send a polished proposal in under 10 minutes",
    desc: "Describe the client's requirements and SmartPRO generates a professional, branded proposal — with scope of work, timeline, pricing table, and terms. Edit, adjust, and send directly from the platform.",
    bullets: [
      "AI drafts the scope, deliverables, and timeline from your notes",
      "Branded with your company logo, colours, and contact details",
      "Pricing table with line items, discounts, and VAT calculation",
      "Send as a secure link or PDF attachment",
    ],
  },
  {
    icon: PenLine,
    title: "Contract e-signature",
    subtitle: "Close deals without printing a single page",
    desc: "Once the client accepts the proposal, convert it into a binding contract and collect legally valid e-signatures from all parties. SmartPRO stores the signed contract with a full audit trail.",
    bullets: [
      "One-click conversion from accepted proposal to contract",
      "Multi-party signing: client, your authorised signatory, witnesses",
      "Tamper-evident audit trail with timestamps and IP addresses",
      "Signed PDFs stored securely and accessible at any time",
    ],
  },
  {
    icon: Receipt,
    title: "Instant invoicing",
    subtitle: "Get paid faster with professional invoices",
    desc: "Generate a VAT-compliant invoice the moment a contract is signed. SmartPRO pre-fills client details, service line items, and payment terms. Send via email and track payment status in real time.",
    bullets: [
      "VAT-compliant invoices with your CR number and tax registration",
      "Pre-filled from the signed contract — no re-entry of data",
      "Payment status tracking: Sent → Viewed → Paid → Overdue",
      "Automated payment reminders at 7, 3, and 0 days before due date",
    ],
  },
];

export default function ConvertPage() {
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
            <Link href="/features/retain"><a className="text-sm text-muted-foreground hover:text-foreground hidden sm:block">Retain →</a></Link>
            <Button size="sm" asChild><a href={getLoginUrl()}>Get started <ArrowRight size={14} className="ml-1" /></a></Button>
          </div>
        </div>
      </header>

      <section className="py-20 bg-gradient-to-b from-green-50/70 to-background dark:from-green-950/20 dark:to-background border-b border-border/40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 flex items-center justify-center mx-auto mb-6">
            <Zap size={32} />
          </div>
          <Badge variant="outline" className="mb-4 text-xs font-semibold tracking-widest uppercase border-green-300 text-green-700 dark:border-green-700 dark:text-green-300">Convert</Badge>
          <h1 className="text-4xl sm:text-5xl font-black text-foreground mb-5 leading-tight">
            Turn enquiries into{" "}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-green-600 to-green-400">signed contracts</span>
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            From first contact to signed contract and first invoice — SmartPRO removes every bottleneck in your sales process so you close deals faster.
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
                  <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 flex items-center justify-center mb-4">
                    <Icon size={24} />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-widest text-green-600 dark:text-green-400 mb-1">{f.subtitle}</p>
                  <h2 className="text-2xl font-black text-foreground mb-3">{f.title}</h2>
                  <p className="text-muted-foreground leading-relaxed mb-5">{f.desc}</p>
                  <ul className="space-y-2">
                    {f.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-foreground">
                        <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />{b}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={`rounded-2xl border border-green-100 dark:border-green-900/40 bg-gradient-to-br from-green-50 to-background dark:from-green-950/20 dark:to-background p-8 ${i % 2 === 1 ? "lg:order-1" : ""}`}>
                  <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 flex items-center justify-center mb-4">
                    <Icon size={20} />
                  </div>
                  <div className="text-lg font-bold text-foreground mb-1">{f.title}</div>
                  <div className="text-sm text-muted-foreground mb-5">{f.subtitle}</div>
                  <div className="space-y-2">
                    {f.bullets.map((b) => (
                      <div key={b} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <ChevronRight size={13} className="text-green-400 shrink-0 mt-0.5" />{b}
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
          <h2 className="text-2xl font-black text-foreground mb-3">Ready to close more deals?</h2>
          <p className="text-muted-foreground mb-8">SmartPRO also helps you attract new leads and retain the clients you win.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button asChild><a href={getLoginUrl()}>Start free trial <ArrowRight size={14} className="ml-1" /></a></Button>
            <Button variant="outline" asChild><Link href="/features/attract"><a>← How we help you attract</a></Link></Button>
            <Button variant="outline" asChild><Link href="/features/retain"><a>How we help you retain <ArrowRight size={14} className="ml-1" /></a></Link></Button>
          </div>
        </div>
      </section>
    </div>
  );
}
