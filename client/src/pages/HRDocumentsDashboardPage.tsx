import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  Upload,
  Search,
  Filter,
  ExternalLink,
  Building2,
  Users,
  ShieldAlert,
  FileWarning,
  Eye,
  RefreshCw,
  ChevronRight,
  Calendar,
  Folder,
  FolderOpen,
  BadgeAlert,
  TrendingUp,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  mol_work_permit_certificate: "Work Permit",
  passport: "Passport",
  visa: "Visa",
  resident_card: "Resident Card",
  labour_card: "Labour Card",
  employment_contract: "Employment Contract",
  civil_id: "Civil ID",
  medical_certificate: "Medical Certificate",
  photo: "Photo",
  other: "Other",
};

const COMPANY_DOC_TYPE_LABELS: Record<string, string> = {
  cr_certificate: "CR Certificate",
  occi_membership: "OCCI Membership",
  municipality_licence: "Municipality Licence",
  trade_licence: "Trade Licence",
  tax_card: "Tax Card",
  labour_card: "Labour Card",
  pasi_certificate: "PASI Certificate",
  chamber_certificate: "Chamber Certificate",
  other: "Other",
};

const CRITICAL_DOC_TYPES = ["mol_work_permit_certificate", "passport", "visa"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  color: "green" | "amber" | "red" | "blue" | "purple" | "default";
}) {
  const colorMap = {
    green: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30",
    red: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30",
    blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30",
    purple: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30",
    default: "text-muted-foreground bg-muted/40",
  };
  return (
    <Card className="border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className={`p-2.5 rounded-lg ${colorMap[color]}`}>{icon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground truncate">{label}</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityBadge({ severity, daysLeft }: { severity: string; daysLeft: number }) {
  if (severity === "expired") {
    return (
      <Badge variant="destructive" className="text-xs font-medium">
        Expired {Math.abs(daysLeft)}d ago
      </Badge>
    );
  }
  if (severity === "critical") {
    return (
      <Badge className="text-xs font-medium bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800">
        {daysLeft}d left
      </Badge>
    );
  }
  return (
    <Badge className="text-xs font-medium bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
      {daysLeft}d left
    </Badge>
  );
}

function ExpiryStatusBadge({ status }: { status: string }) {
  if (status === "expired") {
    return <Badge variant="destructive" className="text-xs">Expired</Badge>;
  }
  if (status === "expiring_soon") {
    return (
      <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
        Expiring Soon
      </Badge>
    );
  }
  if (status === "valid") {
    return (
      <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
        Valid
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-xs text-muted-foreground">No Expiry</Badge>;
}

function MissingDocBadge({ docType }: { docType: string }) {
  const label = DOC_TYPE_LABELS[docType] ?? docType;
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded px-1.5 py-0.5 font-medium">
      <AlertTriangle size={10} />
      {label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HRDocumentsDashboardPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: dashboard, isLoading: dashLoading, refetch } = trpc.documents.getDashboard.useQuery();
  const { data: allEmployeeDocs, isLoading: docsLoading } = trpc.documents.getAllEmployeeDocs.useQuery(
    { search, docType: docTypeFilter, status: statusFilter as "valid" | "expiring_soon" | "expired" | "no_expiry" | "all" },
    { enabled: activeTab === "employee-docs" }
  );
  const { data: companyDocs, isLoading: companyDocsLoading } = trpc.documents.listCompanyDocs.useQuery(
    undefined,
    { enabled: activeTab === "company-docs" }
  );

  const totalDocs = (dashboard?.companyDocStats.total ?? 0) + (dashboard?.employeeDocStats.total ?? 0);
  const totalExpired = (dashboard?.companyDocStats.expired ?? 0) + (dashboard?.employeeDocStats.expired ?? 0);
  const totalExpiringSoon = (dashboard?.companyDocStats.expiringSoon ?? 0) + (dashboard?.employeeDocStats.expiringSoon ?? 0);
  const missingCount = dashboard?.employeesWithMissingDocs.length ?? 0;

  const coveragePercent = useMemo(() => {
    const total = dashboard?.totalEmployees ?? 0;
    const withDocs = dashboard?.employeesWithAnyDoc ?? 0;
    if (total === 0) return 0;
    return Math.round((withDocs / total) * 100);
  }, [dashboard]);

  if (dashLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FolderOpen className="text-orange-500" size={26} />
              Document Management
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Central view of all company and employee documents — expiry tracking, compliance alerts, and quick uploads.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
              <RefreshCw size={14} />
              Refresh
            </Button>
            <Link href="/company/documents">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Building2 size={14} />
                Company Docs
              </Button>
            </Link>
          </div>
        </div>

        {/* ── KPI Tiles ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            icon={<FileText size={20} />}
            label="Total Documents"
            value={totalDocs}
            sub={`${dashboard?.companyDocStats.total ?? 0} company · ${dashboard?.employeeDocStats.total ?? 0} employee`}
            color="blue"
          />
          <KpiCard
            icon={<AlertTriangle size={20} />}
            label="Expired"
            value={totalExpired}
            sub={totalExpired > 0 ? "Immediate action required" : "None expired"}
            color={totalExpired > 0 ? "red" : "green"}
          />
          <KpiCard
            icon={<Clock size={20} />}
            label="Expiring Soon"
            value={totalExpiringSoon}
            sub="Within 90 days"
            color={totalExpiringSoon > 0 ? "amber" : "green"}
          />
          <KpiCard
            icon={<ShieldAlert size={20} />}
            label="Missing Critical Docs"
            value={missingCount}
            sub={`${dashboard?.totalEmployees ?? 0} active employees`}
            color={missingCount > 0 ? "red" : "green"}
          />
        </div>

        {/* ── Secondary KPIs ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            icon={<Users size={20} />}
            label="Doc Coverage"
            value={`${coveragePercent}%`}
            sub={`${dashboard?.employeesWithAnyDoc ?? 0} of ${dashboard?.totalEmployees ?? 0} employees`}
            color={coveragePercent >= 80 ? "green" : coveragePercent >= 50 ? "amber" : "red"}
          />
          <KpiCard
            icon={<CheckCircle size={20} />}
            label="Valid Employee Docs"
            value={dashboard?.employeeDocStats.valid ?? 0}
            sub="All clear"
            color="green"
          />
          <KpiCard
            icon={<TrendingUp size={20} />}
            label="Recently Uploaded"
            value={dashboard?.recentlyUploaded.length ?? 0}
            sub="Last 30 days"
            color="purple"
          />
          <KpiCard
            icon={<Folder size={20} />}
            label="Company Documents"
            value={dashboard?.companyDocStats.total ?? 0}
            sub={`${dashboard?.companyDocStats.expired ?? 0} expired · ${dashboard?.companyDocStats.expiringSoon ?? 0} expiring`}
            color={dashboard?.companyDocStats.expired ?? 0 > 0 ? "red" : "default"}
          />
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50">
            <TabsTrigger value="overview" className="gap-1.5">
              <TrendingUp size={14} />
              Overview
            </TabsTrigger>
            <TabsTrigger value="expiry-timeline" className="gap-1.5">
              <Clock size={14} />
              Expiry Timeline
              {(dashboard?.expiringIn90Days.length ?? 0) > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                  {dashboard!.expiringIn90Days.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="missing-docs" className="gap-1.5">
              <BadgeAlert size={14} />
              Missing Docs
              {missingCount > 0 && (
                <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                  {missingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="employee-docs" className="gap-1.5">
              <Users size={14} />
              All Employee Docs
            </TabsTrigger>
            <TabsTrigger value="company-docs" className="gap-1.5">
              <Building2 size={14} />
              Company Docs
            </TabsTrigger>
          </TabsList>

          {/* ── Overview Tab ─────────────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-6 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Expiry alerts preview */}
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Clock size={16} className="text-amber-500" />
                      Upcoming Expirations
                    </span>
                    <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setActiveTab("expiry-timeline")}>
                      View all <ChevronRight size={12} />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(dashboard?.expiringIn90Days.length ?? 0) === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      <CheckCircle size={32} className="mx-auto mb-2 text-emerald-500" />
                      No documents expiring in the next 90 days
                    </div>
                  ) : (
                    dashboard!.expiringIn90Days.slice(0, 6).map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-sm ${
                          item.severity === "expired"
                            ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                            : item.severity === "critical"
                            ? "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800"
                            : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{item.employeeName}</p>
                          <p className="text-xs text-muted-foreground">
                            {DOC_TYPE_LABELS[item.documentType] ?? item.documentType}
                            {item.department && ` · ${item.department}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <SeverityBadge severity={item.severity} daysLeft={item.daysLeft} />
                          <Link href={`/employee/${item.employeeId}/documents`}>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <ExternalLink size={12} />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Missing docs preview */}
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <FileWarning size={16} className="text-red-500" />
                      Employees Missing Critical Docs
                    </span>
                    <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setActiveTab("missing-docs")}>
                      View all <ChevronRight size={12} />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(dashboard?.employeesWithMissingDocs.length ?? 0) === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      <CheckCircle size={32} className="mx-auto mb-2 text-emerald-500" />
                      All employees have critical documents uploaded
                    </div>
                  ) : (
                    dashboard!.employeesWithMissingDocs.slice(0, 5).map((emp) => (
                      <div
                        key={emp.id}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 text-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {emp.firstName} {emp.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground mb-1">
                            {emp.position ?? "—"}{emp.department ? ` · ${emp.department}` : ""}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {emp.missingDocTypes.map((t) => (
                              <MissingDocBadge key={t} docType={t} />
                            ))}
                          </div>
                        </div>
                        <Link href={`/employee/${emp.id}/documents`}>
                          <Button variant="outline" size="sm" className="ml-3 gap-1 text-xs whitespace-nowrap">
                            <Upload size={12} />
                            Upload
                          </Button>
                        </Link>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recently uploaded */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <RefreshCw size={16} className="text-purple-500" />
                  Recently Uploaded (Last 30 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(dashboard?.recentlyUploaded.length ?? 0) === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    No documents uploaded in the last 30 days
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Employee</TableHead>
                          <TableHead scope="col">Document Type</TableHead>
                          <TableHead scope="col">File Name</TableHead>
                          <TableHead scope="col">Uploaded</TableHead>
                          <TableHead scope="col" className="w-20">View</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dashboard!.recentlyUploaded.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.employeeName}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {DOC_TYPE_LABELS[item.documentType] ?? item.documentType}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs truncate max-w-[200px]">
                              {item.fileName}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {fmtDate(item.createdAt)}
                            </TableCell>
                            <TableCell>
                              <a href={item.fileUrl} target="_blank" rel="noopener noreferrer">
                                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="View document">
                                  <Eye size={14} />
                                </Button>
                              </a>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Expiry Timeline Tab ───────────────────────────────────────────── */}
          <TabsContent value="expiry-timeline" className="mt-4">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar size={16} className="text-amber-500" />
                  Documents Expiring Within 90 Days
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(dashboard?.expiringIn90Days.length ?? 0) === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle size={48} className="mx-auto mb-3 text-emerald-500" />
                    <p className="font-medium">All clear!</p>
                    <p className="text-sm mt-1">No documents expiring in the next 90 days.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Employee</TableHead>
                          <TableHead scope="col">Department</TableHead>
                          <TableHead scope="col">Document Type</TableHead>
                          <TableHead scope="col">Expiry Date</TableHead>
                          <TableHead scope="col">Status</TableHead>
                          <TableHead scope="col" className="w-20">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dashboard!.expiringIn90Days.map((item) => (
                          <TableRow
                            key={item.id}
                            className={
                              item.severity === "expired"
                                ? "bg-red-50/50 dark:bg-red-950/10"
                                : item.severity === "critical"
                                ? "bg-orange-50/50 dark:bg-orange-950/10"
                                : "bg-amber-50/50 dark:bg-amber-950/10"
                            }
                          >
                            <TableCell className="font-medium">{item.employeeName}</TableCell>
                            <TableCell className="text-muted-foreground">{item.department ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {DOC_TYPE_LABELS[item.documentType] ?? item.documentType}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {item.expiresAt ? fmtDate(item.expiresAt) : "—"}
                            </TableCell>
                            <TableCell>
                              <SeverityBadge severity={item.severity} daysLeft={item.daysLeft} />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <a href={item.fileUrl} target="_blank" rel="noopener noreferrer">
                                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="View document">
                                        <Eye size={13} />
                                      </Button>
                                    </a>
                                  </TooltipTrigger>
                                  <TooltipContent>View document</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Link href={`/employee/${item.employeeId}/documents`}>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Go to employee documents">
                                        <Upload size={13} />
                                      </Button>
                                    </Link>
                                  </TooltipTrigger>
                                  <TooltipContent>Upload renewal</TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Missing Docs Tab ──────────────────────────────────────────────── */}
          <TabsContent value="missing-docs" className="mt-4">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileWarning size={16} className="text-red-500" />
                    Employees Missing Critical Documents
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Critical: Work Permit · Passport · Visa
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                {(dashboard?.employeesWithMissingDocs.length ?? 0) === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle size={48} className="mx-auto mb-3 text-emerald-500" />
                    <p className="font-medium">All employees have critical documents uploaded!</p>
                    <p className="text-sm mt-1">Work permit, passport, and visa are on file for all active staff.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Employee</TableHead>
                          <TableHead scope="col">Position / Department</TableHead>
                          <TableHead scope="col">Missing Documents</TableHead>
                          <TableHead scope="col">Uploaded Docs</TableHead>
                          <TableHead scope="col" className="w-28">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dashboard!.employeesWithMissingDocs.map((emp) => (
                          <TableRow key={emp.id} className="bg-red-50/30 dark:bg-red-950/10">
                            <TableCell className="font-medium">
                              {emp.firstName} {emp.lastName}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {emp.position ?? "—"}
                              {emp.department && <span className="text-xs ml-1 text-muted-foreground">· {emp.department}</span>}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {emp.missingDocTypes.map((t) => (
                                  <MissingDocBadge key={t} docType={t} />
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {emp.uploadedDocTypes.length === 0
                                ? "None uploaded"
                                : emp.uploadedDocTypes.map((t) => DOC_TYPE_LABELS[t] ?? t).join(", ")}
                            </TableCell>
                            <TableCell>
                              <Link href={`/employee/${emp.id}/documents`}>
                                <Button size="sm" className="gap-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white">
                                  <Upload size={12} />
                                  Upload Docs
                                </Button>
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── All Employee Docs Tab ─────────────────────────────────────────── */}
          <TabsContent value="employee-docs" className="mt-4">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users size={16} className="text-blue-500" />
                  All Employee Documents
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search by employee name or document..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 text-sm"
                    />
                  </div>
                  <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
                    <SelectTrigger className="w-full sm:w-44 text-sm">
                      <Filter size={13} className="mr-1.5 text-muted-foreground" />
                      <SelectValue placeholder="Document type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {Object.entries(DOC_TYPE_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-40 text-sm">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="valid">Valid</SelectItem>
                      <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="no_expiry">No Expiry</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {docsLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                    ))}
                  </div>
                ) : (allEmployeeDocs?.length ?? 0) === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No documents found matching your filters.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Employee</TableHead>
                          <TableHead scope="col">Department</TableHead>
                          <TableHead scope="col">Document Type</TableHead>
                          <TableHead scope="col">File</TableHead>
                          <TableHead scope="col">Issued</TableHead>
                          <TableHead scope="col">Expires</TableHead>
                          <TableHead scope="col">Status</TableHead>
                          <TableHead scope="col">Verification</TableHead>
                          <TableHead scope="col" className="w-16">View</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allEmployeeDocs!.map((doc) => (
                          <TableRow key={doc.id}>
                            <TableCell className="font-medium whitespace-nowrap">
                              <Link href={`/employee/${doc.employeeId}/documents`} className="hover:text-orange-500 transition-colors">
                                {doc.employeeName}
                              </Link>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{doc.department ?? "—"}</TableCell>
                            <TableCell className="text-sm">
                              {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs max-w-[140px] truncate">
                              {doc.fileName}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {doc.issuedAt ? fmtDate(doc.issuedAt) : "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {doc.expiresAt ? fmtDate(doc.expiresAt) : "—"}
                            </TableCell>
                            <TableCell>
                              <ExpiryStatusBadge status={doc.expiryStatus} />
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={doc.verificationStatus === "verified" ? "default" : "outline"}
                                className={`text-xs ${
                                  doc.verificationStatus === "verified"
                                    ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400"
                                    : doc.verificationStatus === "rejected"
                                    ? "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {doc.verificationStatus}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="View document">
                                  <Eye size={13} />
                                </Button>
                              </a>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="text-xs text-muted-foreground mt-3 text-right">
                      {allEmployeeDocs!.length} document{allEmployeeDocs!.length !== 1 ? "s" : ""} found
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Company Docs Tab ──────────────────────────────────────────────── */}
          <TabsContent value="company-docs" className="mt-4">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 size={16} className="text-blue-500" />
                    Company Documents
                  </CardTitle>
                  <Link href="/company/documents">
                    <Button size="sm" className="gap-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white">
                      <Upload size={12} />
                      Manage Company Docs
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {companyDocsLoading ? (
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                    ))}
                  </div>
                ) : (companyDocs?.length ?? 0) === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Building2 size={40} className="mx-auto mb-3 opacity-30" />
                    <p>No company documents uploaded yet.</p>
                    <Link href="/company/documents">
                      <Button className="mt-3 gap-1.5 bg-orange-500 hover:bg-orange-600 text-white" size="sm">
                        <Upload size={14} />
                        Upload Company Documents
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Document</TableHead>
                          <TableHead scope="col">Type</TableHead>
                          <TableHead scope="col">Doc Number</TableHead>
                          <TableHead scope="col">Issuing Authority</TableHead>
                          <TableHead scope="col">Expiry Date</TableHead>
                          <TableHead scope="col">Status</TableHead>
                          <TableHead scope="col" className="w-16">View</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {companyDocs!.map((doc) => (
                          <TableRow
                            key={doc.id}
                            className={
                              doc.expiryStatus === "expired"
                                ? "bg-red-50/30 dark:bg-red-950/10"
                                : doc.expiryStatus === "expiring_soon"
                                ? "bg-amber-50/30 dark:bg-amber-950/10"
                                : ""
                            }
                          >
                            <TableCell className="font-medium">{doc.title}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {COMPANY_DOC_TYPE_LABELS[doc.docType] ?? doc.docType}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{doc.docNumber ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{doc.issuingAuthority ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {doc.expiryDate ? fmtDate(doc.expiryDate) : "—"}
                            </TableCell>
                            <TableCell>
                              <ExpiryStatusBadge status={doc.expiryStatus} />
                            </TableCell>
                            <TableCell>
                              {doc.fileUrl ? (
                                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="View document">
                                    <Eye size={13} />
                                  </Button>
                                </a>
                              ) : (
                                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-30" disabled aria-label="No file">
                                  <FileText size={13} />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
