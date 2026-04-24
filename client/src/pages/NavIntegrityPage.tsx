import { useState } from "react"; // used for IssueSection and HubDomainCard expanded state
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  LayoutGrid,
  Layers,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  Hash,
  FolderTree,
} from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatRunAt(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

const DOMAIN_LABELS: Record<string, { label: string; color: string }> = {
  hrInsights: { label: "HR Insights", color: "bg-blue-500/10 text-blue-600 border-blue-200" },
  organization: { label: "Organization", color: "bg-purple-500/10 text-purple-600 border-purple-200" },
  renewals: { label: "Renewals", color: "bg-amber-500/10 text-amber-600 border-amber-200" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: "pass" | "fail" }) {
  if (status === "pass") {
    return (
      <Badge className="gap-1.5 bg-emerald-500/10 text-emerald-700 border border-emerald-200 hover:bg-emerald-500/10">
        <CheckCircle2 className="h-3.5 w-3.5" />
        All checks passed
      </Badge>
    );
  }
  return (
    <Badge className="gap-1.5 bg-red-500/10 text-red-700 border border-red-200 hover:bg-red-500/10">
      <XCircle className="h-3.5 w-3.5" />
      Issues detected
    </Badge>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card p-4">
      <div className={`mt-0.5 rounded-md p-2 ${accent ?? "bg-muted"}`}>
        <Icon className="h-4 w-4 text-foreground/70" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function IssueRow({ issue }: { issue: { id: string; message: string; severity: string } }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-red-200/60 bg-red-50/40 dark:bg-red-950/20 dark:border-red-900/40 px-3 py-2.5">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
      <p className="text-sm text-foreground/90 font-mono leading-relaxed">{issue.message}</p>
    </div>
  );
}

function IssueSection({
  title,
  icon: Icon,
  issues,
  totalChecked,
  description,
}: {
  title: string;
  icon: React.ElementType;
  issues: { id: string; message: string; severity: string }[];
  totalChecked?: number;
  description?: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const passed = issues.length === 0;

  return (
    <Card className="border border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`rounded-md p-1.5 ${passed ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
              <Icon className={`h-4 w-4 ${passed ? "text-emerald-600" : "text-red-500"}`} />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">{title}</CardTitle>
              {description && (
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {totalChecked !== undefined && (
              <span className="text-xs text-muted-foreground">{totalChecked} checked</span>
            )}
            {passed ? (
              <Badge className="gap-1 bg-emerald-500/10 text-emerald-700 border border-emerald-200 hover:bg-emerald-500/10 text-xs">
                <CheckCircle2 className="h-3 w-3" />
                Clean
              </Badge>
            ) : (
              <Badge className="gap-1 bg-red-500/10 text-red-700 border border-red-200 hover:bg-red-500/10 text-xs">
                <XCircle className="h-3 w-3" />
                {issues.length} {issues.length === 1 ? "issue" : "issues"}
              </Badge>
            )}
            {!passed && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {!passed && expanded && (
        <CardContent className="pt-0">
          <div className="flex flex-col gap-2">
            {issues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </div>
        </CardContent>
      )}
      {passed && (
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground italic">No issues found.</p>
        </CardContent>
      )}
    </Card>
  );
}

function HubDomainCard({
  domain,
}: {
  domain: {
    domain: string;
    totalPages: number;
    passingPages: number;
    failingPages: { sourceFile: string; issues: string[] }[];
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = DOMAIN_LABELS[domain.domain] ?? {
    label: domain.domain,
    color: "bg-muted text-foreground border-border",
  };
  const allPass = domain.failingPages.length === 0;

  return (
    <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <Badge className={`text-xs border ${meta.color}`}>{meta.label}</Badge>
          <span className="text-sm text-muted-foreground">
            {domain.passingPages}/{domain.totalPages} pages passing
          </span>
        </div>
        <div className="flex items-center gap-2">
          {allPass ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border/40 px-4 py-3 space-y-2">
          {domain.failingPages.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">All pages are correctly wired.</p>
          ) : (
            domain.failingPages.map((p) => (
              <div key={p.sourceFile} className="rounded-md border border-red-200/60 bg-red-50/40 dark:bg-red-950/20 dark:border-red-900/40 px-3 py-2">
                <p className="text-xs font-semibold text-foreground/80 font-mono mb-1">{p.sourceFile}</p>
                {p.issues.map((issue, i) => (
                  <p key={i} className="text-xs text-red-600 dark:text-red-400">{issue}</p>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function NavIntegrityPage() {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = trpc.platformOps.runNavIntegrityChecks.useQuery(undefined, {
    staleTime: 0,
  });

  const handleRerun = () => {
    void refetch();
    toast.success("Re-running integrity checks…");
  };

  if (!user || !canAccessGlobalAdminProcedures(user)) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Access restricted to platform administrators.</p>
      </div>
    );
  }

  return (
    <div className="container py-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <ShieldCheck className="h-5 w-5 text-foreground/70" />
            <h1 className="text-xl font-semibold tracking-tight">Navigation Integrity</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">
            Validates the platform navigation structure — duplicate routes, label key drift, missing
            intents, and hub breadcrumb alignment across all child pages.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRerun}
          disabled={isLoading}
          className="gap-2 shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Re-run checks
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-red-200 bg-red-50/40 dark:bg-red-950/20 mb-6">
          <CardContent className="pt-4 flex items-start gap-3">
            <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Failed to run checks</p>
              <p className="text-xs text-red-600 dark:text-red-500 mt-1 font-mono">{error.message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton */}
      {isLoading && !data && (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-lg border border-border/40 bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Overall status banner */}
          <div
            className={`rounded-lg border px-5 py-4 mb-6 flex items-center justify-between ${
              data.overallStatus === "pass"
                ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/40"
                : "border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900/40"
            }`}
          >
            <div className="flex items-center gap-3">
              {data.overallStatus === "pass" ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              ) : (
                <XCircle className="h-6 w-6 text-red-500" />
              )}
              <div>
                <p className={`font-semibold ${data.overallStatus === "pass" ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                  {data.overallStatus === "pass"
                    ? "All integrity checks passed"
                    : `${data.navMetadataIssues.length + data.hubBreadcrumbIssues.length} issue(s) require attention`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last run: {formatRunAt(data.runAt)}
                </p>
              </div>
            </div>
            <StatusBadge status={data.overallStatus} />
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <SummaryCard
              icon={LayoutGrid}
              label="Nav groups"
              value={data.totalGroups}
              accent="bg-blue-500/10"
            />
            <SummaryCard
              icon={Hash}
              label="Nav leaves"
              value={data.totalLeaves}
              sub="unique routes"
              accent="bg-purple-500/10"
            />
            <SummaryCard
              icon={FolderTree}
              label="Hub pages"
              value={data.totalHubPages}
              sub="breadcrumb-governed"
              accent="bg-amber-500/10"
            />
            <SummaryCard
              icon={data.overallStatus === "pass" ? CheckCircle2 : AlertTriangle}
              label="Total issues"
              value={data.navMetadataIssues.length + data.hubBreadcrumbIssues.length}
              sub={data.overallStatus === "pass" ? "clean" : "need fixing"}
              accent={data.overallStatus === "pass" ? "bg-emerald-500/10" : "bg-red-500/10"}
            />
          </div>

          {/* Check sections */}
          <div className="space-y-4 mb-8">
            <IssueSection
              title="Platform nav metadata"
              icon={Layers}
              issues={data.navMetadataIssues}
              totalChecked={data.totalLeaves}
              description="Validates leaf intents, href normalization, duplicate routes, and label key drift across all nav groups."
            />
            <IssueSection
              title="Hub breadcrumb coverage"
              icon={BookOpen}
              issues={data.hubBreadcrumbIssues}
              totalChecked={data.totalHubPages}
              description="Ensures all governed hub child pages import HubBreadcrumb and use the correct trail helper."
            />
          </div>

          {/* Hub domain breakdown */}
          <div>
            <h2 className="text-sm font-semibold text-foreground/80 mb-3 flex items-center gap-2">
              <FolderTree className="h-4 w-4" />
              Hub domain breakdown
            </h2>
            <div className="space-y-2">
              {data.hubDomains.map((domain) => (
                <HubDomainCard key={domain.domain} domain={domain} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
