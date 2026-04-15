import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Database,
  Code2,
  LayoutDashboard,
  TestTube2,
  ShieldAlert,
  CreditCard,
  FileSignature,
  Lock,
  HardDrive,
  Activity,
  Layers,
  ListChecks,
  FileCode2,
  Globe,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModuleRow {
  name: string;
  pct: number;
}

interface InfraRow {
  name: string;
  icon: React.ElementType;
  status: "missing" | "blocked" | "partial" | "ok";
  label: string;
  pct: number;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const MODULES: ModuleRow[] = [
  { name: "Attendance & scheduling",    pct: 85 },
  { name: "HR & employee management",   pct: 80 },
  { name: "RBAC & multi-tenant",        pct: 85 },
  { name: "Workforce & gov services",   pct: 75 },
  { name: "Contract management",        pct: 65 },
  { name: "Payroll",                    pct: 55 },
  { name: "CRM & sales pipeline",       pct: 55 },
  { name: "Billing & invoicing",        pct: 50 },
  { name: "Leave management",           pct: 50 },
  { name: "Finance & accounting",       pct: 25 },
  { name: "Reporting & analytics",      pct: 30 },
  { name: "B2B client portal",          pct: 35 },
];

const INFRA: InfraRow[] = [
  { name: "Payment gateway integration", icon: CreditCard,    status: "missing",  label: "Missing",      pct: 0  },
  { name: "E-signature (DocuSign etc.)", icon: FileSignature, status: "blocked",  label: "Blocked",      pct: 0  },
  { name: "2FA / MFA authentication",    icon: Lock,          status: "missing",  label: "Missing",      pct: 0  },
  { name: "Backup & disaster recovery",  icon: HardDrive,     status: "missing",  label: "Missing",      pct: 0  },
  { name: "Structured logging & APM",    icon: Activity,      status: "partial",  label: "Sentry only",  pct: 35 },
  { name: "Redis / caching layer",       icon: Layers,        status: "missing",  label: "Missing",      pct: 0  },
  { name: "Job queue (BullMQ etc.)",     icon: ListChecks,    status: "partial",  label: "Ad-hoc only",  pct: 10 },
  { name: "E2E / integration tests",     icon: TestTube2,     status: "partial",  label: "~13% unit",    pct: 13 },
  { name: "PDF export (real)",           icon: FileCode2,     status: "partial",  label: "HTML only",    pct: 20 },
  { name: "i18n (Arabic) complete",      icon: Globe,         status: "partial",  label: "~17 pages left", pct: 60 },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function barColor(pct: number) {
  if (pct >= 75) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function ModuleBar({ name, pct }: ModuleRow) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-52 shrink-0 text-sm text-zinc-300">{name}</span>
      <div className="flex-1 h-2 rounded-full bg-zinc-700">
        <div
          className={cn("h-2 rounded-full transition-all", barColor(pct))}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn(
          "w-10 text-right text-xs font-semibold tabular-nums",
          pct >= 75 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-red-400",
        )}
      >
        {pct}%
      </span>
    </div>
  );
}

const STATUS_CHIP: Record<InfraRow["status"], string> = {
  missing: "bg-red-900/60 text-red-300 border border-red-700/40",
  blocked: "bg-orange-900/60 text-orange-300 border border-orange-700/40",
  partial: "bg-amber-900/60 text-amber-300 border border-amber-700/40",
  ok:      "bg-emerald-900/60 text-emerald-300 border border-emerald-700/40",
};

function InfraBar({ name, icon: Icon, status, label, pct }: InfraRow) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Icon className="w-4 h-4 shrink-0 text-zinc-500" />
      <span className="w-52 shrink-0 text-sm text-zinc-300">{name}</span>
      <div className="flex-1 h-2 rounded-full bg-zinc-700">
        {pct > 0 && (
          <div
            className="h-2 rounded-full bg-amber-500"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <span className={cn("rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap", STATUS_CHIP[status])}>
        {label}
      </span>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800/60 p-5 text-center">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">{label}</p>
      <p className={cn("text-2xl font-bold", warn ? "text-red-400" : "text-zinc-100")}>
        {value}
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductionReadinessPage() {
  const overallPct = Math.round(
    MODULES.reduce((s, m) => s + m.pct, 0) / MODULES.length,
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 px-6 py-10 font-sans">
      <div className="mx-auto max-w-3xl space-y-8">

        {/* ── Header ── */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2 text-amber-400">
            <AlertTriangle className="w-5 h-5" />
            <h1 className="text-xl font-bold">Not ready for daily operations</h1>
          </div>
          <p className="text-sm text-zinc-400">
            Strong foundation (~70% built), but critical production gaps remain
          </p>
        </div>

        {/* ── Top stats ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Codebase size"  value="211K lines" />
          <StatCard label="DB tables"      value="110+" />
          <StatCard label="UI pages"       value="116" />
          <StatCard label="Test coverage"  value="~13%"  warn />
        </div>

        {/* ── Overall bar ── */}
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-300">Overall platform completeness</span>
            <span className="text-sm font-semibold text-amber-400">{overallPct}%</span>
          </div>
          <div className="h-3 rounded-full bg-zinc-700">
            <div
              className="h-3 rounded-full bg-amber-500 transition-all"
              style={{ width: `${overallPct}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500">
            Platform is built wide rather than deep — impressive breadth, but critical depth gaps block daily operations.
          </p>
        </div>

        {/* ── Core modules ── */}
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-5 space-y-1">
          <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
            Core modules — what's built
          </h2>
          {MODULES.map((m) => (
            <ModuleBar key={m.name} {...m} />
          ))}
        </div>

        {/* ── Infrastructure ── */}
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-5 space-y-1">
          <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
            Production infrastructure — critical gaps
          </h2>
          {INFRA.map((row) => (
            <InfraBar key={row.name} {...row} />
          ))}
        </div>

        {/* ── Blockers summary ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              icon: XCircle,
              color: "text-red-400",
              bg: "border-red-800/40 bg-red-950/30",
              title: "Cannot pay employees",
              body: "No WPS file generation. Payroll produces documents, not bank transfers.",
            },
            {
              icon: XCircle,
              color: "text-red-400",
              bg: "border-red-800/40 bg-red-950/30",
              title: "Cannot collect money",
              body: "No payment gateway. Invoices are PDFs — not a collection pipeline.",
            },
            {
              icon: AlertTriangle,
              color: "text-amber-400",
              bg: "border-amber-800/40 bg-amber-950/20",
              title: "Risky to deploy",
              body: "13% test coverage. Payroll and billing have zero tests.",
            },
          ].map(({ icon: Icon, color, bg, title, body }) => (
            <div key={title} className={cn("rounded-xl border p-4 space-y-1", bg)}>
              <div className={cn("flex items-center gap-2 font-semibold text-sm", color)}>
                <Icon className="w-4 h-4" />
                {title}
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        {/* ── Roadmap ── */}
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-5 space-y-4">
          <h2 className="text-xs uppercase tracking-widest text-zinc-500">
            Estimated path to production-ready
          </h2>
          {[
            {
              phase: "Phase 1",
              weeks: "Weeks 1–6",
              label: "Unblock Operations",
              color: "text-red-400 border-red-700/50 bg-red-950/30",
              items: ["WPS bank transfer file generation", "Gratuity / end-of-service calculator", "DB backup automation", "2FA / MFA", "BullMQ job queue"],
            },
            {
              phase: "Phase 2",
              weeks: "Weeks 7–12",
              label: "Close the Revenue Loop",
              color: "text-amber-400 border-amber-700/50 bg-amber-950/20",
              items: ["Thawani Pay + Stripe integration", "Invoice aging & dunning", "Real report queries (replace simulated)", "Payroll test suite", "Credit notes & disputes"],
            },
            {
              phase: "Phase 3",
              weeks: "Weeks 13–16",
              label: "Production Hardening",
              color: "text-emerald-400 border-emerald-700/50 bg-emerald-950/20",
              items: ["Immutable audit logging", "E2E test suite", "Load & performance testing", "VAT reporting / finance basics", "Monitoring & alerting"],
            },
          ].map(({ phase, weeks, label, color, items }) => (
            <div key={phase} className={cn("rounded-lg border p-4 space-y-2", color)}>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold">{phase}</span>
                <span className="text-xs text-zinc-500">{weeks}</span>
                <span className="ml-auto text-xs font-medium">{label}</span>
              </div>
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-zinc-300">
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ── Bottom verdict ── */}
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-5">
          <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
            Bottom line
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { q: "Can HR use it to manage employees?",   a: "Yes — with workarounds",   ok: true  },
              { q: "Can payroll be run through it?",       a: "No — WPS & gratuity missing", ok: false },
              { q: "Can finance use it for reporting?",    a: "No — simulated data",       ok: false },
              { q: "Can it collect money from clients?",   a: "No — no payment gateway",   ok: false },
              { q: "Is it safe to store sensitive data?",  a: "Partially — no 2FA, no backup", ok: false },
              { q: "Is it safe to deploy changes?",        a: "Risky — 13% test coverage", ok: false },
            ].map(({ q, a, ok }) => (
              <div key={q} className="flex items-start gap-2 text-xs">
                {ok
                  ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  : <XCircle      className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />}
                <div>
                  <span className="text-zinc-400">{q}</span>
                  <span className={cn("ml-1 font-semibold", ok ? "text-emerald-400" : "text-red-400")}>
                    {a}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-zinc-500 leading-relaxed border-t border-zinc-700 pt-3">
            <strong className="text-zinc-300">Estimated effort:</strong> 3–4 months with a focused team of 2–3 engineers.
            The architecture supports all additions — none require rearchitecting what exists.
          </p>
        </div>

        {/* ── Footer ── */}
        <p className="text-center text-xs text-zinc-600 pb-4">
          SmartPro Hub · Production Readiness Assessment · April 2026
        </p>
      </div>
    </div>
  );
}
