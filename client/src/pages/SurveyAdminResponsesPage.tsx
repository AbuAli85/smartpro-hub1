import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { buildWhatsAppMessageHref, toWhatsAppPhoneDigits } from "@/lib/whatsappClickToChat";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ChevronDown,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Link2,
  ListChecks,
  Loader2,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Check,
  UserPlus,
  Link2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "in_progress" | "completed" | "abandoned";

/** Unified row for Sanad outreach dialog (platform offices or intel centre directory). */
type OutreachTableRow = {
  rowKey: string;
  name: string;
  nameAr: string | null;
  phone: string | null;
  contactPerson: string | null;
  email: string | null;
  hasEmail: boolean;
  surveyUrl: string | null;
  governorateLabel?: string | null;
  wilayat?: string | null;
  surveyUnavailableReason?: "not_linked" | "office_inactive" | null;
  /** Intel directory only */
  intelCenterId?: number;
  pipelineStatus?: string;
  pipelineOwnerName?: string | null;
  lastContactedAt?: Date | string | null;
  nextAction?: string | null;
};

/** Prefer Arabic name; strip leading directory refs like "1645 - " for clearer WhatsApp copy. */
function officeLabelForWhatsApp(row: OutreachTableRow): string {
  const ar = row.nameAr?.trim();
  if (ar) return ar;
  const n = row.name.trim();
  const stripped = n.replace(/^\d{1,12}\s*[-–—:]\s*/u, "").trim();
  if (stripped.length >= 2) return stripped;
  return n || "—";
}

const STATUS_BADGE: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
  in_progress: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  abandoned: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
};

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function csvEscapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadSanadLinksCsv(
  rows: Array<{
    name: string;
    phone: string | null;
    contactPerson: string | null;
    email: string | null | undefined;
    surveyUrl: string | null;
    governorateLabel?: string | null;
    wilayat?: string | null;
    surveyNote?: string | null;
  }>,
  filename: string,
  format: "platform" | "intel",
): void {
  const header =
    format === "intel"
      ? ["office_name", "governorate", "wilayat", "phone", "contact", "survey_url", "note"].join(",")
      : ["office_name", "phone", "contact", "email", "survey_url"].join(",");
  const lines = rows.map((r) =>
    format === "intel"
      ? [
          csvEscapeCell(r.name),
          csvEscapeCell(r.governorateLabel ?? ""),
          csvEscapeCell(r.wilayat ?? ""),
          csvEscapeCell(r.phone ?? ""),
          csvEscapeCell(r.contactPerson ?? ""),
          csvEscapeCell(r.surveyUrl ?? ""),
          csvEscapeCell(r.surveyNote ?? ""),
        ].join(",")
      : [
          csvEscapeCell(r.name),
          csvEscapeCell(r.phone ?? ""),
          csvEscapeCell(r.contactPerson ?? ""),
          csvEscapeCell(r.email ?? ""),
          csvEscapeCell(r.surveyUrl ?? ""),
        ].join(","),
  );
  const blob = new Blob([`${header}\n${lines.join("\n")}\n`], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** WhatsApp drafts for Omani offices: always Arabic, independent of admin UI language. */
const WHATSAPP_OUTREACH_LANG = "ar-OM";

// ─── Export helpers ───────────────────────────────────────────────────────────

type ExportRow = {
  id: number;
  status: string;
  language: string;
  respondentName: string | null;
  respondentEmail: string | null;
  respondentPhone: string | null;
  companyName: string | null;
  companySector: string | null;
  companySize: string | null;
  companyGovernorate: string | null;
  sanadOfficeName: string | null;
  nurtureFollowupCount: number;
  nurtureStoppedReason: string | null;
  startedAt: Date | string;
  completedAt: Date | string | null;
  updatedAt: Date | string | null;
};

const EXPORT_HEADERS = [
  "ID", "Status", "Language", "Respondent Name", "Email", "Phone",
  "Company", "Sector", "Company Size", "Governorate", "Sanad Office",
  "Nurture Emails", "Nurture Stopped Reason", "Started At", "Completed At", "Updated At",
];

function rowToArray(r: ExportRow): string[] {
  return [
    String(r.id),
    r.status,
    r.language,
    r.respondentName ?? "",
    r.respondentEmail ?? "",
    r.respondentPhone ?? "",
    r.companyName ?? "",
    r.companySector ?? "",
    r.companySize ?? "",
    r.companyGovernorate ?? "",
    r.sanadOfficeName ?? "",
    String(r.nurtureFollowupCount),
    r.nurtureStoppedReason ?? "",
    fmtDate(r.startedAt),
    fmtDate(r.completedAt),
    fmtDate(r.updatedAt),
  ];
}

function downloadResponsesCsv(rows: ExportRow[], filename: string): void {
  const lines = [EXPORT_HEADERS.join(","), ...rows.map((r) => rowToArray(r).map(csvEscapeCell).join(","))];
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function downloadResponsesXlsx(rows: ExportRow[], filename: string): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS, ...rows.map(rowToArray)]);
  // Auto-width columns
  ws["!cols"] = EXPORT_HEADERS.map((h, i) => ({
    wch: Math.max(h.length, ...rows.map((r) => (rowToArray(r)[i] ?? "").length), 10),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Responses");
  XLSX.writeFile(wb, filename);
}

function downloadResponsesPdf(rows: ExportRow[], filename: string, statusLabel: string): void {
  const tableRows = rows
    .map(
      (r) =>
        `<tr>
          <td>${r.id}</td>
          <td><span class="badge badge-${r.status}">${r.status.replace("_", " ")}</span></td>
          <td>${r.respondentName ?? "—"}</td>
          <td>${r.respondentEmail ?? "—"}</td>
          <td>${r.companyName ?? "—"}</td>
          <td>${r.companyGovernorate ?? "—"}</td>
          <td>${r.sanadOfficeName ?? "—"}</td>
          <td>${fmtDate(r.startedAt)}</td>
          <td>${fmtDate(r.completedAt)}</td>
        </tr>`,
    )
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Survey Responses Export</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:11px;margin:24px;color:#111}
    h1{font-size:16px;margin-bottom:4px}p{margin:0 0 12px;color:#555;font-size:11px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:5px 7px;text-align:left;vertical-align:top}
    th{background:#f5f5f5;font-weight:600}tr:nth-child(even){background:#fafafa}
    .badge{padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600}
    .badge-completed{background:#d1fae5;color:#065f46}.badge-in_progress{background:#fef3c7;color:#92400e}.badge-abandoned{background:#fee2e2;color:#991b1b}
  </style></head><body>
  <h1>Survey Responses Export</h1>
  <p>Filter: ${statusLabel} &nbsp;|&nbsp; ${rows.length} records &nbsp;|&nbsp; Generated: ${new Date().toLocaleString()}</p>
  <table><thead><tr><th>ID</th><th>Status</th><th>Respondent</th><th>Email</th><th>Company</th><th>Governorate</th><th>Sanad Office</th><th>Started</th><th>Completed</th></tr></thead>
  <tbody>${tableRows}</tbody></table></body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function SurveyAdminResponsesPage() {
  const { t, i18n } = useTranslation("survey");
  const outreachRtl = Boolean(i18n.language?.startsWith("ar"));
  const utils = trpc.useUtils();
  const tWhatsappOutreach = useMemo(
    () => i18n.getFixedT(WHATSAPP_OUTREACH_LANG, "survey"),
    [i18n],
  );
  const [page, setPage] = useState(1);
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("all");
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [sanadOutreachOpen, setSanadOutreachOpen] = useState(false);
  const [sanadIntelTipsOpen, setSanadIntelTipsOpen] = useState(false);
  const [sanadOutreachListMode, setSanadOutreachListMode] = useState<"intel" | "platform">("intel");
  const [sanadOutreachManualOnly, setSanadOutreachManualOnly] = useState<
    Array<{
      id: number;
      name: string;
      nameAr: string | null;
      phone: string | null;
      contactPerson: string | null;
      surveyUrl: string;
    }> | null
  >(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [selectedStatus]);

  const { data: stats } = trpc.survey.adminGetAnalytics.useQuery();

  const sanadLinksQuery = trpc.survey.adminSanadOfficeSurveyLinks.useQuery(undefined, {
    enabled: sanadOutreachOpen && sanadOutreachManualOnly === null && sanadOutreachListMode === "platform",
  });

  const intelLinksQuery = trpc.survey.adminSanadIntelCenterSurveyLinks.useQuery(undefined, {
    enabled: sanadOutreachOpen && sanadOutreachManualOnly === null && sanadOutreachListMode === "intel",
  });

  const intelPipeKpis = trpc.survey.adminSanadIntelPipelineKpis.useQuery(undefined, {
    enabled: sanadOutreachOpen && sanadOutreachManualOnly === null && sanadOutreachListMode === "intel",
  });

  const markIntelContacted = trpc.survey.adminSanadIntelMarkContacted.useMutation({
    onSuccess: () => {
      void intelLinksQuery.refetch();
      void intelPipeKpis.refetch();
      toast.success("Marked as contacted");
    },
    onError: (e) => toast.error(e.message),
  });

  const inviteIntelSmartPro = trpc.survey.adminSanadIntelInviteSmartPro.useMutation({
    onSuccess: async (data) => {
      void intelLinksQuery.refetch();
      void intelPipeKpis.refetch();
      const url =
        typeof window !== "undefined" ? `${window.location.origin}${data.invitePath}` : data.invitePath;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Invite link generated — pipeline set to invited", {
          description: data.whatsappAutoSent ? "WhatsApp template sent when configured." : undefined,
        });
      } catch {
        toast.success("Invite generated", { description: url });
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const followUpQuery = trpc.survey.adminSanadSurveyOfficeFollowUp.useQuery(undefined, {
    enabled: followUpOpen,
  });

  const { data, isLoading, isError, error } = trpc.survey.adminListResponses.useQuery(
    {
      page,
      limit: 25,
      status: selectedStatus === "all" ? undefined : selectedStatus,
    },
  );

  const exportQuery = trpc.survey.adminExportResponses.useQuery(
    { status: selectedStatus === "all" ? undefined : selectedStatus },
    { enabled: false, retry: false },
  );

  const handleExport = useCallback(
    async (format: "csv" | "xlsx" | "pdf") => {
      setIsExporting(true);
      try {
        const result = await exportQuery.refetch();
        const rows = result.data;
        if (!rows || rows.length === 0) {
          toast.info("No responses to export.");
          return;
        }
        const statusLabel = selectedStatus === "all" ? "All" : selectedStatus.replace("_", " ");
        const date = new Date().toISOString().slice(0, 10);
        const base = `survey-responses-${statusLabel.toLowerCase().replace(" ", "-")}-${date}`;
        if (format === "csv") {
          downloadResponsesCsv(rows, `${base}.csv`);
          toast.success(`Exported ${rows.length} responses as CSV.`);
        } else if (format === "xlsx") {
          await downloadResponsesXlsx(rows, `${base}.xlsx`);
          toast.success(`Exported ${rows.length} responses as Excel.`);
        } else {
          downloadResponsesPdf(rows, `${base}.html`, statusLabel);
          toast.success(`Exported ${rows.length} responses as PDF-ready HTML.`);
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Export failed.");
      } finally {
        setIsExporting(false);
      }
    },
    [exportQuery, selectedStatus],
  );

  const inviteSanadMutation = trpc.survey.adminInviteSanadOffices.useMutation({
    onSuccess: (r) => {
      void utils.survey.adminSanadSurveyOfficeFollowUp.invalidate();
      const base = t("admin.inviteSanadToast", {
        sent: r.sent,
        withEmail: r.withEmailCount,
        failed: r.failed,
        skipped: r.skippedNoEmail,
        defaultValue:
          "Emails sent: {{sent}} / {{withEmail}} (failed: {{failed}}). Offices without email: {{skipped}}.",
      });
      const waDesc = r.whatsappAutoAttempted
        ? t("admin.inviteSanadToastWhatsapp", {
            waSent: r.whatsappSent,
            waFailed: r.whatsappFailed,
            waNoPhone: r.whatsappSkippedNoPhone,
            defaultValue:
              "WhatsApp (Arabic template): {{waSent}} sent, {{waFailed}} failed, {{waNoPhone}} skipped (no valid phone).",
          })
        : undefined;
      const batchNote = r.outreachBatchId
        ? t("admin.inviteOutreachLogged", {
            batch: r.outreachBatchId.slice(0, 8),
            defaultValue: "Outreach logged (batch {{batch}}…). Open Follow-up to see per-office status.",
          })
        : undefined;
      const desc = [waDesc, batchNote].filter(Boolean).join("\n") || undefined;
      toast.success(base, desc ? { description: desc } : undefined);
      if (r.manualOutreach.length > 0) {
        setSanadOutreachListMode("platform");
        setSanadOutreachManualOnly(r.manualOutreach);
        setSanadOutreachOpen(true);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const outreachDisplayRows: OutreachTableRow[] = useMemo(() => {
    if (sanadOutreachManualOnly !== null) {
      return sanadOutreachManualOnly.map((o) => ({
        rowKey: `platform-${o.id}`,
        name: o.name,
        nameAr: o.nameAr,
        phone: o.phone,
        contactPerson: o.contactPerson,
        email: null,
        hasEmail: false,
        surveyUrl: o.surveyUrl,
      }));
    }
    if (sanadOutreachListMode === "intel") {
      return (
        intelLinksQuery.data?.rows.map((r) => ({
          rowKey: `intel-${r.intelCenterId}`,
          name: r.centerName,
          nameAr: null,
          phone: r.contactNumber,
          contactPerson: r.responsiblePerson,
          email: null,
          hasEmail: false,
          surveyUrl: r.surveyUrl,
          governorateLabel: r.governorateLabel,
          wilayat: r.wilayat,
          surveyUnavailableReason: r.surveyUnavailableReason,
          intelCenterId: r.intelCenterId,
          pipelineStatus: r.pipelineStatus,
          pipelineOwnerName: r.pipelineOwnerName,
          lastContactedAt: r.lastContactedAt,
          nextAction: r.nextAction,
        })) ?? []
      );
    }
    return (
      sanadLinksQuery.data?.offices.map((o) => ({
        rowKey: `platform-${o.id}`,
        name: o.name,
        nameAr: o.nameAr,
        phone: o.phone,
        contactPerson: o.contactPerson,
        email: o.email,
        hasEmail: o.hasEmail,
        surveyUrl: o.surveyUrl,
      })) ?? []
    );
  }, [
    sanadOutreachManualOnly,
    sanadOutreachListMode,
    intelLinksQuery.data?.rows,
    sanadLinksQuery.data?.offices,
  ]);

  /** Same survey entry URL without `officeId` — for WhatsApp when a row has no per-office link yet. */
  const surveyPublicStartUrl = useMemo(() => {
    const slug =
      intelLinksQuery.data?.surveySlug ??
      sanadLinksQuery.data?.surveySlug ??
      "oman-business-sector-2026";

    if (sanadOutreachManualOnly?.length) {
      const first = sanadOutreachManualOnly[0]?.surveyUrl;
      if (first) {
        try {
          const u = new URL(first);
          u.search = "";
          return u.toString();
        } catch {
          /* ignore */
        }
      }
    }

    const intel = intelLinksQuery.data;
    const plat = sanadLinksQuery.data;
    const preferredBase =
      sanadOutreachListMode === "intel"
        ? intel?.baseUrl?.trim()
        : plat?.baseUrl?.trim();
    const anyApiBase = preferredBase || intel?.baseUrl?.trim() || plat?.baseUrl?.trim();

    let base = (anyApiBase ?? "").replace(/\/+$/, "");
    if (!base && typeof window !== "undefined") {
      base = window.location.origin.replace(/\/+$/, "");
    }
    if (base && slug) return `${base}/survey/${slug}`;
    return null;
  }, [
    sanadOutreachManualOnly,
    sanadOutreachListMode,
    sanadLinksQuery.data,
    intelLinksQuery.data,
  ]);

  const isIntelLayout =
    sanadOutreachManualOnly === null && sanadOutreachListMode === "intel";
  const outreachColCount = isIntelLayout ? 7 : 6;

  const outreachLoading =
    sanadOutreachOpen &&
    sanadOutreachManualOnly === null &&
    (sanadOutreachListMode === "intel" ? intelLinksQuery.isLoading : sanadLinksQuery.isLoading);

  const outreachQueryError =
    sanadOutreachManualOnly === null
      ? sanadOutreachListMode === "intel"
        ? intelLinksQuery.error
        : sanadLinksQuery.error
      : null;

  const total = data?.total ?? 0;
  const limit = data?.limit ?? 25;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ClipboardList className="h-7 w-7 text-primary" aria-hidden />
            {t("admin.responses")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("admin.filterByStatus")}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            disabled={inviteSanadMutation.isPending}
            onClick={() => {
              if (
                window.confirm(
                  t("admin.inviteSanadConfirm", {
                    defaultValue:
                      "Send invitation emails to every active Sanad office that has an email on file? Offices without email are not emailed; you can copy their survey links afterward.",
                  }),
                )
              ) {
                inviteSanadMutation.mutate({});
              }
            }}
          >
            <Mail className="h-4 w-4" aria-hidden />
            {t("admin.emailSanadOffices", { defaultValue: "Email Sanad offices" })}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setSanadOutreachManualOnly(null);
              setSanadOutreachListMode("intel");
              setSanadOutreachOpen(true);
            }}
          >
            <Link2 className="h-4 w-4" aria-hidden />
            {t("admin.sanadSurveyLinks", { defaultValue: "Sanad survey links" })}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setFollowUpOpen(true)}
          >
            <ListChecks className="h-4 w-4" aria-hidden />
            {t("admin.followUpOpen", { defaultValue: "Follow-up status" })}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={isExporting}
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-4 w-4" aria-hidden />
                )}
                {isExporting ? "Exporting…" : "Export"}
                <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {selectedStatus === "all" ? "All responses" : selectedStatus.replace("_", " ")}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void handleExport("csv")} className="gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExport("xlsx")} className="gap-2">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExport("pdf")} className="gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                PDF-ready HTML
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Select
            value={selectedStatus}
            onValueChange={(v) => setSelectedStatus(v as StatusFilter)}
          >
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder={t("admin.filterByStatus")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("admin.all")}</SelectItem>
              <SelectItem value="in_progress">{t("admin.inProgress")}</SelectItem>
              <SelectItem value="completed">{t("admin.completed")}</SelectItem>
              <SelectItem value="abandoned">{t("admin.abandoned", { defaultValue: "Abandoned" })}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <CardDescription>
                {i === 0 && t("admin.totalResponses")}
                {i === 1 && t("admin.completed")}
                {i === 2 && t("admin.inProgress")}
              </CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {!stats ? (
                  <Skeleton className="mt-1 h-9 w-20" />
                ) : i === 0 ? (
                  stats.totalResponses
                ) : i === 1 ? (
                  stats.completedResponses
                ) : (
                  stats.inProgressResponses
                )}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.responses")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isError && (
            <p className="text-destructive text-sm" role="alert">
              {error?.message ?? "Failed to load responses"}
            </p>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.respondent")}</TableHead>
                  <TableHead>{t("admin.company")}</TableHead>
                  <TableHead>{t("companySector")}</TableHead>
                  <TableHead>{t("admin.sanadOffice", { defaultValue: "Sanad office" })}</TableHead>
                  <TableHead>{t("admin.status")}</TableHead>
                  <TableHead>{t("admin.date")}</TableHead>
                  <TableHead className="text-right">
                    {t("admin.actions", { defaultValue: "Actions" })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, r) => (
                      <TableRow key={r}>
                        {Array.from({ length: 7 }).map((__, c) => (
                          <TableCell key={c}>
                            <Skeleton className="h-4 w-full max-w-[140px]" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : (data?.rows.length ?? 0) === 0
                    ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                            {t("admin.noResponses")}
                          </TableCell>
                        </TableRow>
                      )
                    : data?.rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">
                            {row.respondentName?.trim() || "—"}
                          </TableCell>
                          <TableCell>{row.companyName?.trim() || "—"}</TableCell>
                          <TableCell>{row.companySector?.trim() || "—"}</TableCell>
                          <TableCell className="max-w-[10rem] truncate text-muted-foreground text-sm">
                            {"sanadOfficeName" in row && row.sanadOfficeName
                              ? String(row.sanadOfficeName).trim() || "—"
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={STATUS_BADGE[row.status] ?? "border-border"}
                            >
                              {row.status === "completed"
                                ? t("admin.completed")
                                : row.status === "in_progress"
                                  ? t("admin.inProgress")
                                  : t("admin.abandoned", { defaultValue: "Abandoned" })}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground tabular-nums">
                            {fmtDate(row.startedAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/survey/admin/responses/${row.id}`}>{t("admin.viewDetail")}</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-muted-foreground text-sm">
              {total === 0
                ? "—"
                : `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} / ${total}`}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isLoading || page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isLoading || page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={sanadOutreachOpen}
        onOpenChange={(open) => {
          setSanadOutreachOpen(open);
          if (!open) {
            setSanadOutreachManualOnly(null);
            setSanadIntelTipsOpen(false);
          }
        }}
      >
        <DialogContent
          className={cn(
            "flex h-[min(92vh,56rem)] w-[calc(100%-1rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-lg border bg-background p-0 shadow-lg sm:max-w-4xl",
          )}
        >
          <DialogHeader
            className={cn(
              "shrink-0 space-y-2 border-b px-6 pt-6 pb-4 pr-14",
              outreachRtl ? "text-end" : "text-start",
            )}
          >
            <DialogTitle>
              {sanadOutreachManualOnly !== null
                ? t("admin.sanadOutreachNoEmailTitle", { defaultValue: "Offices without email" })
                : isIntelLayout
                  ? t("admin.sanadOutreachIntelTitle", { defaultValue: "Sanad centres (directory)" })
                  : t("admin.sanadOutreachAllTitle", { defaultValue: "Sanad office survey links" })}
            </DialogTitle>
            <DialogDescription className="max-w-none text-pretty break-words sm:pr-2">
              {sanadOutreachManualOnly !== null
                ? t("admin.sanadOutreachNoEmailDesc", {
                    defaultValue:
                      "Share each survey link by WhatsApp or phone using the office name and number on file. The link records which Sanad office the response belongs to.",
                  })
                : isIntelLayout
                  ? t("admin.sanadOutreachIntelDesc", {
                      defaultValue:
                        "Imported directory: use WhatsApp or Copy per row. Expand the tips panel for details.",
                    })
                  : t("admin.sanadOutreachAllDesc", {
                      defaultValue:
                        "Per-office survey links for manual outreach. Offices that have an email can also get the link via the Email Sanad offices button.",
                    })}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6 py-3">
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              {sanadOutreachManualOnly === null ? (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className="text-muted-foreground shrink-0 text-sm">
                    {t("admin.sanadOutreachListSource", { defaultValue: "List source" })}
                  </span>
                  <Select
                    value={sanadOutreachListMode}
                    onValueChange={(v) => setSanadOutreachListMode(v as "intel" | "platform")}
                  >
                    <SelectTrigger className="w-full min-w-0 sm:w-[min(100%,280px)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="intel">
                        {t("admin.sanadListIntel", { defaultValue: "Intel centres (directory)" })}
                      </SelectItem>
                      <SelectItem value="platform">
                        {t("admin.sanadListPlatform", { defaultValue: "Platform offices (live)" })}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="min-w-0 flex-1" />
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 self-stretch sm:self-center"
                disabled={outreachDisplayRows.length === 0 || Boolean(outreachQueryError)}
                onClick={() =>
                  downloadSanadLinksCsv(
                    outreachDisplayRows.map((r) => ({
                      name: r.name,
                      phone: r.phone,
                      contactPerson: r.contactPerson,
                      email: r.email,
                      surveyUrl: r.surveyUrl ?? surveyPublicStartUrl ?? null,
                      governorateLabel: r.governorateLabel,
                      wilayat: r.wilayat,
                      surveyNote:
                        r.surveyUnavailableReason === "not_linked"
                          ? !r.surveyUrl && surveyPublicStartUrl
                            ? t("admin.surveyNoteNotLinkedPublicCsv", {
                                defaultValue:
                                  "Centre not linked to platform — survey_url column is the general (public) start URL",
                              })
                            : t("admin.surveyNoteNotLinked", {
                                defaultValue: "No linked platform office",
                              })
                          : r.surveyUnavailableReason === "office_inactive"
                            ? t("admin.surveyNoteOfficeInactive", {
                                defaultValue: "Linked office not active",
                              })
                            : null,
                    })),
                    "sanad-survey-links.csv",
                    isIntelLayout ? "intel" : "platform",
                  )
                }
              >
                {t("admin.downloadSanadCsv", { defaultValue: "Download CSV" })}
              </Button>
            </div>

            {sanadOutreachManualOnly === null && isIntelLayout && intelPipeKpis.data ? (
              <div className="grid shrink-0 grid-cols-3 gap-2 rounded-lg border border-border/80 bg-muted/25 px-3 py-2 text-center text-sm">
                <div>
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Centres
                  </span>
                  <span className="tabular-nums text-base font-semibold">{intelPipeKpis.data.totalCentres}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Contacted+
                  </span>
                  <span className="tabular-nums text-base font-semibold">{intelPipeKpis.data.contactedPct}%</span>
                </div>
                <div>
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Conversion
                  </span>
                  <span className="tabular-nums text-base font-semibold">{intelPipeKpis.data.conversionPct}%</span>
                </div>
              </div>
            ) : null}

            {sanadOutreachManualOnly === null &&
              isIntelLayout &&
              !outreachLoading &&
              !outreachQueryError &&
              outreachDisplayRows.length > 0 && (
                <Collapsible
                  open={sanadIntelTipsOpen}
                  onOpenChange={setSanadIntelTipsOpen}
                  className="shrink-0 rounded-lg border border-blue-200/80 bg-blue-50/80 dark:border-blue-900 dark:bg-blue-950/40"
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start text-sm font-medium text-blue-950 hover:bg-blue-100/60 dark:text-blue-50 dark:hover:bg-blue-900/40"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Info className="size-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
                        <span className="min-w-0 break-words">
                          {t("admin.sanadIntelTipsToggle", {
                            defaultValue: "How WhatsApp & Copy work (tap to expand)",
                          })}
                        </span>
                      </span>
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 text-blue-700 transition-transform dark:text-blue-300",
                          sanadIntelTipsOpen && "rotate-180",
                        )}
                        aria-hidden
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t border-blue-200/60 px-3 pb-3 pt-0 dark:border-blue-900/80">
                    <ul className="mt-2 list-disc space-y-1.5 ps-4 text-xs leading-relaxed text-blue-950/95 marker:text-blue-600 dark:text-blue-50/95 dark:marker:text-blue-300 sm:text-sm">
                      <li className="break-words">
                        {t("admin.sanadIntelOutreachBullet1", {
                          defaultValue:
                            "Green WhatsApp icon: opens an Arabic draft. You must still tap Send inside WhatsApp.",
                        })}
                      </li>
                      <li className="break-words">
                        {t("admin.sanadIntelOutreachBullet2", {
                          defaultValue:
                            "Badge “Public URL” or “Office URL” shows which link is inside that draft.",
                        })}
                      </li>
                      <li className="break-words">
                        {t("admin.sanadIntelOutreachBullet3", {
                          defaultValue:
                            "“Office URL” / “Public URL” copies the same link as in the WhatsApp draft.",
                        })}
                      </li>
                      <li className="break-words">
                        {t("admin.sanadIntelOutreachBullet4", {
                          defaultValue:
                            "“Centre not linked…” is informational: link the centre in Sanad Intelligence to get a dedicated URL and auto-attribution.",
                        })}
                      </li>
                    </ul>
                    <p className="mt-2 text-xs sm:text-sm">
                      <Link
                        href="/admin/sanad/directory"
                        className="font-medium text-blue-800 underline-offset-2 hover:underline dark:text-blue-200"
                      >
                        {t("admin.openSanadDirectoryToLink", {
                          defaultValue: "Open Sanad directory → link a centre to a platform office",
                        })}
                      </Link>
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              )}

          {outreachQueryError && (
            <Alert variant="destructive" className="text-left">
              <AlertTitle>
                {t("admin.sanadOutreachErrorTitle", { defaultValue: "Could not load this list" })}
              </AlertTitle>
              <AlertDescription className="flex flex-col gap-2">
                <span>{outreachQueryError.message}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-fit border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() =>
                    void (sanadOutreachListMode === "intel"
                      ? intelLinksQuery.refetch()
                      : sanadLinksQuery.refetch())
                  }
                >
                  {t("admin.sanadOutreachRetry", { defaultValue: "Retry" })}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border bg-card">
            <div className="min-h-0 flex-1 overflow-auto">
            <Table className="min-w-[48rem]">
              <TableHeader className="bg-muted/40 dark:bg-muted/30">
                <TableRow>
                  <TableHead>{t("admin.sanadColOffice", { defaultValue: "Office" })}</TableHead>
                  {isIntelLayout ? (
                    <>
                      <TableHead>{t("companyGovernorate", { defaultValue: "Governorate" })}</TableHead>
                      <TableHead>{t("admin.sanadColWilayat", { defaultValue: "Wilayat" })}</TableHead>
                    </>
                  ) : null}
                  <TableHead>{t("yourPhone")}</TableHead>
                  <TableHead>{t("admin.sanadColContact", { defaultValue: "Contact" })}</TableHead>
                  {!isIntelLayout ? <TableHead>{t("yourEmail")}</TableHead> : null}
                  <TableHead className="w-[5.5rem] min-w-[5.5rem] max-w-[5.5rem] text-center align-bottom">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>
                        {isIntelLayout
                          ? t("admin.sanadColPipelineActions", { defaultValue: "Actions" })
                          : t("admin.sanadColWhatsapp", { defaultValue: "WhatsApp" })}
                      </span>
                      <span className="text-muted-foreground text-[10px] font-normal leading-tight">
                        {isIntelLayout
                          ? t("admin.sanadColPipelineActionsSub", { defaultValue: "Outreach" })
                          : t("admin.sanadColWhatsappSub", {
                              defaultValue: "Arabic draft",
                            })}
                      </span>
                    </div>
                  </TableHead>
                  <TableHead
                    className={cn(
                      "min-w-[11rem] max-w-[22rem] align-bottom sm:min-w-[12rem]",
                      outreachRtl ? "text-start" : "text-end",
                    )}
                  >
                    <div
                      className={cn(
                        "flex flex-col gap-0.5",
                        outreachRtl ? "items-start" : "items-end",
                      )}
                    >
                      <span>{t("admin.sanadColSurveyUrl", { defaultValue: "Survey URL" })}</span>
                      <span className="text-muted-foreground max-w-[12rem] text-[10px] font-normal leading-snug">
                        {isIntelLayout
                          ? t("admin.sanadColSurveyUrlSubIntel", {
                              defaultValue: "Same URL as WhatsApp draft",
                            })
                          : t("admin.sanadColSurveyUrlSubPlatform", {
                              defaultValue: "Dedicated per office",
                            })}
                      </span>
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outreachQueryError ? (
                  <TableRow>
                    <TableCell colSpan={outreachColCount} className="text-muted-foreground h-14 text-center text-sm">
                      {t("admin.sanadOutreachErrorTableHint", {
                        defaultValue: "Fix the issue above, or tap Retry, to load rows here.",
                      })}
                    </TableCell>
                  </TableRow>
                ) : outreachLoading ? (
                  <>
                    {[0, 1, 2].map((i) => (
                      <TableRow key={`sk-${i}`}>
                        <TableCell colSpan={outreachColCount}>
                          <Skeleton className="h-10 w-full" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ) : outreachDisplayRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={outreachColCount} className="text-muted-foreground h-16 text-center">
                      {isIntelLayout
                        ? t("admin.sanadOutreachIntelEmpty", {
                            defaultValue:
                              "No centres in the imported directory yet. Import the directory, link centres to active platform offices for survey URLs, or switch list source to “Platform offices (live)”.",
                          })
                        : t("admin.sanadOutreachEmpty", {
                            defaultValue: "No active Sanad offices on the platform.",
                          })}
                    </TableCell>
                  </TableRow>
                ) : (
                  outreachDisplayRows.map((row) => {
                    const waDigits = toWhatsAppPhoneDigits(row.phone);
                    const officeWa = officeLabelForWhatsApp(row);
                    const waMessage = row.surveyUrl
                      ? tWhatsappOutreach("admin.whatsappSurveyMessage", {
                          officeName: officeWa,
                          surveyUrl: row.surveyUrl,
                          defaultValue:
                            "السلام عليكم ورحمة الله وبركاته،\n\nنفيدكم بأن هذه الرسالة تتصل باستبيان قطاع الأعمال الرسمي في سلطنة عُمان (منصة سمارت برو «المندوب الذكي» وبرنامج مكاتب سند)، لجمع معلومات قطاعية تُسهم في التخطيط والإفادة الرسمية.\n\nالمنشأة:\n{{officeName}}\n\nالرابط المباشر لاستكمال الاستبيان عبر المتصفح:\n{{surveyUrl}}\n\nشكراً لتعاونكم،",
                        })
                      : surveyPublicStartUrl
                        ? tWhatsappOutreach("admin.whatsappSurveyMessageNoOfficeLink", {
                            officeName: officeWa,
                            surveyPublicUrl: surveyPublicStartUrl,
                            defaultValue:
                              "السلام عليكم ورحمة الله وبركاته،\n\nنفيدكم بأن هذه الرسالة تتصل باستبيان قطاع الأعمال الرسمي في سلطنة عُمان (منصة سمارت برو «المندوب الذكي» وبرنامج مكاتب سند)، لجمع معلومات قطاعية تُسهم في التخطيط والإفادة الرسمية.\n\nالمنشأة:\n{{officeName}}\n\nلا يتوفر حالياً رابط مخصّص لربط إجابتكم تلقائياً بهذا المكتب على المنصة (يُتاح بعد ربط المركز بمكتب سند نشط). يمكنكم البدء عبر الرابط العام أدناه.\n\nولإرسال الرابط المخصّص عند جاهزيته، نرجو الرد على هذه المحادثة أو تزويدنا ببريد إلكتروني نشط.\n\nالرابط العام:\n{{surveyPublicUrl}}\n\nشكراً لتعاونكم،",
                          })
                        : tWhatsappOutreach("admin.whatsappSurveyMessageNoLink", {
                            officeName: officeWa,
                            defaultValue:
                              "السلام عليكم ورحمة الله وبركاته،\n\nنفيدكم بأن هذه الرسالة تتصل باستبيان قطاع الأعمال الرسمي في سلطنة عُمان (منصة سمارت برو «المندوب الذكي» وبرنامج مكاتب سند)، لجمع معلومات قطاعية تُسهم في التخطيط والإفادة الرسمية.\n\nالمنشأة:\n{{officeName}}\n\nلم يُرفق رابط إلكتروني مع هذه الرسالة حالياً. نرجو منكم الرد على هذه المحادثة عند التيسّر، أو تزويدنا ببريد إلكتروني نشط، ليُرسل إليكم رابط الاستبيان المخصّص للمنشأة.\n\nشكراً لتعاونكم،",
                          });
                    const waHref = waDigits ? buildWhatsAppMessageHref(waDigits, waMessage) : null;
                    return (
                    <TableRow key={row.rowKey} className="align-top">
                      <TableCell className="max-w-[10rem] font-medium">
                        <span className="line-clamp-2">{row.name}</span>
                        {isIntelLayout && (row.pipelineStatus || row.pipelineOwnerName) ? (
                          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                            {row.pipelineStatus ? (
                              <span className="me-1 rounded bg-muted px-1 py-0.5 font-normal capitalize">
                                {row.pipelineStatus.replace(/_/g, " ")}
                              </span>
                            ) : null}
                            {row.pipelineOwnerName?.trim() ? (
                              <span title={row.pipelineOwnerName}>Owner: {row.pipelineOwnerName}</span>
                            ) : null}
                            {row.lastContactedAt ? (
                              <span className="ms-1 block sm:inline">
                                · {t("admin.lastContactShort", { defaultValue: "Last" })}{" "}
                                {fmtDate(row.lastContactedAt)}
                              </span>
                            ) : null}
                          </p>
                        ) : null}
                      </TableCell>
                      {isIntelLayout ? (
                        <>
                          <TableCell className="max-w-[7rem] truncate text-muted-foreground text-sm">
                            {row.governorateLabel?.trim() || "—"}
                          </TableCell>
                          <TableCell className="max-w-[7rem] truncate text-muted-foreground text-sm">
                            {row.wilayat?.trim() || "—"}
                          </TableCell>
                        </>
                      ) : null}
                      <TableCell className="text-muted-foreground tabular-nums text-sm">
                        {row.phone?.trim() || "—"}
                      </TableCell>
                      <TableCell className="max-w-[8rem] truncate text-muted-foreground text-sm">
                        {row.contactPerson?.trim() || "—"}
                      </TableCell>
                      {!isIntelLayout ? (
                        <TableCell className="max-w-[9rem] truncate text-sm">
                          {row.email?.trim() ? (
                            row.email
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      ) : null}
                      <TableCell className="w-[5.5rem] min-w-[5.5rem] max-w-[5.5rem] align-top text-center">
                        {isIntelLayout && row.intelCenterId != null ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                aria-label={t("admin.sanadColPipelineActions", { defaultValue: "Actions" })}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel>{t("admin.pipelineOutreachMenu", { defaultValue: "Outreach" })}</DropdownMenuLabel>
                              <DropdownMenuItem
                                disabled={!waHref}
                                onSelect={() => {
                                  if (waHref) window.open(waHref, "_blank", "noopener,noreferrer");
                                }}
                              >
                                <MessageCircle className="mr-2 h-4 w-4 text-[#25D366]" />
                                {t("admin.menuWhatsappDraft", { defaultValue: "WhatsApp (prefilled)" })}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!waDigits}
                                onSelect={() => {
                                  if (waDigits) window.open(`tel:${waDigits}`, "_self");
                                }}
                              >
                                <Phone className="mr-2 h-4 w-4" />
                                {t("admin.menuCall", { defaultValue: "Call" })}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={inviteIntelSmartPro.isPending}
                                onSelect={() => inviteIntelSmartPro.mutate({ centerId: row.intelCenterId! })}
                              >
                                <Link2 className="mr-2 h-4 w-4" />
                                {t("admin.menuInviteSmartPro", { defaultValue: "Invite to SmartPRO" })}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={markIntelContacted.isPending}
                                onSelect={() => markIntelContacted.mutate({ centerId: row.intelCenterId! })}
                              >
                                <Check className="mr-2 h-4 w-4" />
                                {t("admin.menuMarkContacted", { defaultValue: "Mark as contacted" })}
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href="/admin/sanad/directory" className="flex cursor-pointer items-center">
                                  <UserPlus className="mr-2 h-4 w-4" />
                                  {t("admin.menuAssignOwner", { defaultValue: "Assign owner (directory)" })}
                                </Link>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <div className="mt-1 flex flex-col items-center gap-1">
                            {row.surveyUrl ? (
                              <span
                                className="inline-flex max-w-full justify-center rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                title={t("admin.msgVariantDedicatedHint", { defaultValue: "Dedicated office link — response auto-linked to this office" })}
                              >
                                {t("admin.msgVariantDedicated", { defaultValue: "Office URL" })}
                              </span>
                            ) : surveyPublicStartUrl ? (
                              <span
                                className="inline-flex max-w-full justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                title={t("admin.msgVariantPublicHint", { defaultValue: "General survey link — no automatic office binding. Link the centre for a dedicated URL." })}
                              >
                                {t("admin.msgVariantPublic", { defaultValue: "Public URL" })}
                              </span>
                            ) : (
                              <span
                                className="inline-flex max-w-full justify-center rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                                title={t("admin.msgVariantNoLinkHint", { defaultValue: "No survey link — message asks recipient to reply for a link" })}
                              >
                                {t("admin.msgVariantNoLink", { defaultValue: "No link" })}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-1.5 py-1">
                            {waHref ? (
                              <Button
                                asChild
                                size="sm"
                                className="border-0 bg-[#25D366] text-white hover:bg-[#20bd5a]"
                                title={`${t("admin.whatsappOpenHint", { defaultValue: "Opens WhatsApp with a draft." })} ${t("admin.whatsappDraftReady", { defaultValue: "Then tap Send in WhatsApp." })}`}
                              >
                                <a
                                  href={waHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`${t("admin.sanadColWhatsapp", { defaultValue: "WhatsApp" })}. ${t("admin.whatsappDraftReady", { defaultValue: "Tap Send in WhatsApp after opening." })}`}
                                >
                                  <MessageCircle className="h-4 w-4" aria-hidden />
                                </a>
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-xs" title={t("admin.whatsappNoPhoneHint", { defaultValue: "Add a valid phone number" })}>
                                —
                              </span>
                            )}
                            {row.surveyUrl ? (
                              <span
                                className="inline-flex max-w-full justify-center rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                title={t("admin.msgVariantDedicatedHint", { defaultValue: "Dedicated office link — response auto-linked to this office" })}
                              >
                                {t("admin.msgVariantDedicated", { defaultValue: "Office URL" })}
                              </span>
                            ) : surveyPublicStartUrl ? (
                              <span
                                className="inline-flex max-w-full justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                title={t("admin.msgVariantPublicHint", { defaultValue: "General survey link — no automatic office binding. Link the centre for a dedicated URL." })}
                              >
                                {t("admin.msgVariantPublic", { defaultValue: "Public URL" })}
                              </span>
                            ) : (
                              <span
                                className="inline-flex max-w-full justify-center rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                                title={t("admin.msgVariantNoLinkHint", { defaultValue: "No survey link — message asks recipient to reply for a link" })}
                              >
                                {t("admin.msgVariantNoLink", { defaultValue: "No link" })}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "min-w-[11rem] max-w-[22rem] align-top sm:min-w-[12rem]",
                          outreachRtl ? "text-start" : "text-end",
                        )}
                      >
                        <div
                          className={cn(
                            "flex min-w-0 flex-col gap-1.5",
                            isIntelLayout
                              ? "items-stretch"
                              : outreachRtl
                                ? "items-start"
                                : "items-end",
                          )}
                        >
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn(
                              "h-auto min-h-8 max-w-full whitespace-normal px-2 py-1.5 text-center text-[11px] leading-snug",
                              isIntelLayout &&
                                (outreachRtl ? "w-fit self-start" : "w-fit self-end"),
                            )}
                            disabled={!row.surveyUrl && !surveyPublicStartUrl}
                            title={
                              row.surveyUrl
                                ? undefined
                                : surveyPublicStartUrl
                                  ? t("admin.surveyPublicLinkCopyHint", {
                                      defaultValue:
                                        "General survey link (no office binding). Link the centre for a dedicated URL.",
                                    })
                                  : t("admin.surveyLinkUnavailableHint", {
                                      defaultValue:
                                        "Link the centre to an active Sanad office to get a survey URL.",
                                    })
                            }
                            onClick={async () => {
                              const toCopy = row.surveyUrl ?? surveyPublicStartUrl;
                              if (!toCopy) return;
                              try {
                                await navigator.clipboard.writeText(toCopy);
                                toast.success(
                                  row.surveyUrl
                                    ? t("admin.surveyLinkCopied", { defaultValue: "Survey link copied" })
                                    : t("admin.surveyPublicLinkCopied", {
                                        defaultValue: "General survey link copied (office-specific link after linking)",
                                      }),
                                );
                              } catch {
                                toast.error(t("copyFailed"));
                              }
                            }}
                          >
                            {row.surveyUrl
                              ? t("admin.copyDedicatedLink", { defaultValue: "Copy dedicated" })
                              : surveyPublicStartUrl
                                ? t("admin.copyPublicLink", { defaultValue: "Copy public URL" })
                                : t("copyToken")}
                          </Button>
                          {isIntelLayout ? (
                            <span className="min-w-0 w-full max-w-full break-words text-start text-xs leading-snug text-muted-foreground">
                              {row.surveyUrl ? (
                                <span className="text-green-700 dark:text-green-400">
                                  {t("admin.outreachBindingDedicated", {
                                    defaultValue:
                                      "Linked to platform — Copy and WhatsApp both use the dedicated office URL.",
                                  })}
                                </span>
                              ) : surveyPublicStartUrl ? (
                                <span
                                  className="border-muted-foreground/25 border-s-2 ps-2 text-muted-foreground"
                                  title={t("admin.outreachBindingUsePublic", {
                                    defaultValue:
                                      "Centre not linked on platform yet — Copy and WhatsApp use the same general survey URL until you link this centre.",
                                  })}
                                >
                                  <span className="font-medium text-foreground">
                                    {t("admin.outreachBindingUsePublicShort", {
                                      defaultValue: "Not linked to platform office",
                                    })}
                                  </span>
                                  <span className="mt-0.5 block text-[11px] leading-snug">
                                    {t("admin.outreachBindingUsePublicDetail", {
                                      defaultValue:
                                        "Copy and WhatsApp use the general survey URL until you link this centre (see link above).",
                                    })}
                                  </span>
                                </span>
                              ) : row.surveyUnavailableReason === "office_inactive" ? (
                                <span className="text-muted-foreground">
                                  {t("admin.badgeOfficeInactive", { defaultValue: "Office inactive" })}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">
                                  {t("admin.badgeNotLinked", { defaultValue: "Not linked" })}
                                </span>
                              )}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            </div>
          </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("admin.followUpTitle", { defaultValue: "Sanad office survey — follow-up" })}
            </DialogTitle>
            <DialogDescription>
              {t("admin.followUpDesc", {
                defaultValue:
                  "Latest bulk invite per office (from “Email Sanad offices”) and the latest office-linked survey response, if any.",
              })}
            </DialogDescription>
          </DialogHeader>
          {followUpQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : followUpQuery.error ? (
            <p className="text-destructive text-sm" role="alert">
              {followUpQuery.error.message}
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.sanadColOffice", { defaultValue: "Office" })}</TableHead>
                    <TableHead>{t("yourEmail")}</TableHead>
                    <TableHead>{t("yourPhone")}</TableHead>
                    <TableHead className="text-center">{t("admin.followUpInviteCount", { defaultValue: "Invites sent" })}</TableHead>
                    <TableHead>{t("admin.followUpLastOutreach", { defaultValue: "Last invite" })}</TableHead>
                    <TableHead>{t("admin.followUpSurvey", { defaultValue: "Survey response" })}</TableHead>
                    <TableHead className="text-right">{t("admin.followUpAction", { defaultValue: "Open" })}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(followUpQuery.data?.offices ?? []).map((row) => {
                    const lo = row.lastOutreach;
                    const lr = row.linkedResponse;
                    const outcomeKey =
                      lo?.outcome === "sent"
                        ? "admin.outreachOutcomeSent"
                        : lo?.outcome === "failed"
                          ? "admin.outreachOutcomeFailed"
                          : lo?.outcome === "skipped_no_email"
                            ? "admin.outreachOutcomeSkippedEmail"
                            : lo?.outcome === "skipped_no_phone"
                              ? "admin.outreachOutcomeSkippedPhone"
                              : "admin.outreachOutcomeOther";
                    const outcomeLabel = lo
                      ? t(outcomeKey, {
                          defaultValue: lo.outcome.replace(/_/g, " "),
                        })
                      : null;
                    const channelLabel =
                      lo?.channel === "whatsapp_api"
                        ? t("admin.outreachChannelWhatsapp", { defaultValue: "WhatsApp API" })
                        : lo?.channel === "email"
                          ? t("admin.outreachChannelEmail", { defaultValue: "Email" })
                          : null;
                    return (
                      <TableRow key={row.officeId}>
                        <TableCell className="max-w-[10rem] font-medium">
                          <span className="line-clamp-2">{row.nameAr?.trim() || row.name}</span>
                        </TableCell>
                        <TableCell className="max-w-[9rem] truncate text-sm">{row.email ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{row.phone ?? "—"}</TableCell>
                        <TableCell className="text-center">
                          {row.inviteCount > 0 ? (
                            <Badge variant="secondary" className="tabular-nums font-semibold">
                              {row.inviteCount}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">0</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[14rem] text-xs">
                          {!lo ? (
                            <span className="text-muted-foreground">
                              {t("admin.followUpNever", { defaultValue: "No logged invite yet" })}
                            </span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-muted-foreground tabular-nums">
                                {fmtDate(lo.createdAt)}
                              </span>
                              <span>
                                {channelLabel} ·{" "}
                                <Badge
                                  variant="outline"
                                  className={
                                    lo.outcome === "sent"
                                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                      : lo.outcome === "failed"
                                        ? "border-red-300 bg-red-50 text-red-900"
                                        : "text-muted-foreground"
                                  }
                                >
                                  {outcomeLabel}
                                </Badge>
                              </span>
                              {lo.detail ? (
                                <span className="text-destructive line-clamp-2" title={lo.detail}>
                                  {lo.detail}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {!lr ? (
                            <span className="text-muted-foreground text-xs">
                              {t("admin.followUpNoResponse", { defaultValue: "No office-linked response" })}
                            </span>
                          ) : (
                            <Badge variant="secondary" className="font-normal">
                              {lr.status === "completed"
                                ? t("admin.completed")
                                : lr.status === "in_progress"
                                  ? t("admin.inProgress")
                                  : t("admin.abandoned", { defaultValue: "Abandoned" })}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {lr ? (
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/survey/admin/responses/${lr.id}`}>{t("admin.viewDetail")}</Link>
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
