import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
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
import { ClipboardList, ChevronLeft, ChevronRight, Link2, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";

type StatusFilter = "all" | "in_progress" | "completed" | "abandoned";

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

/**
 * Digits only for wa.me links (no + prefix).
 * If the value is 8 digits without a country code, prepends Oman +968.
 */
function toWhatsAppPhoneDigits(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9 && d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("968") && d.length === 8) d = `968${d}`;
  if (d.length < 10 || d.length > 15) return null;
  return d;
}

function buildWhatsAppSurveyHref(phoneDigits: string, message: string): string {
  const params = new URLSearchParams();
  params.set("text", message);
  return `https://wa.me/${phoneDigits}?${params.toString()}`;
}

function downloadSanadLinksCsv(
  rows: Array<{
    name: string;
    phone: string | null;
    contactPerson: string | null;
    email: string | null | undefined;
    surveyUrl: string;
  }>,
  filename: string,
): void {
  const header = ["office_name", "phone", "contact", "email", "survey_url"].join(",");
  const lines = rows.map((r) =>
    [
      csvEscapeCell(r.name),
      csvEscapeCell(r.phone ?? ""),
      csvEscapeCell(r.contactPerson ?? ""),
      csvEscapeCell(r.email ?? ""),
      csvEscapeCell(r.surveyUrl),
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

export default function SurveyAdminResponsesPage() {
  const { t } = useTranslation("survey");
  const [page, setPage] = useState(1);
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("all");
  const [sanadOutreachOpen, setSanadOutreachOpen] = useState(false);
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

  useEffect(() => {
    setPage(1);
  }, [selectedStatus]);

  const { data: stats } = trpc.survey.adminGetAnalytics.useQuery();

  const sanadLinksQuery = trpc.survey.adminSanadOfficeSurveyLinks.useQuery(undefined, {
    enabled: sanadOutreachOpen && sanadOutreachManualOnly === null,
  });

  const { data, isLoading, isError, error } = trpc.survey.adminListResponses.useQuery(
    {
      page,
      limit: 25,
      status: selectedStatus === "all" ? undefined : selectedStatus,
    },
  );

  const inviteSanadMutation = trpc.survey.adminInviteSanadOffices.useMutation({
    onSuccess: (r) => {
      const base = t("admin.inviteSanadToast", {
        sent: r.sent,
        withEmail: r.withEmailCount,
        failed: r.failed,
        skipped: r.skippedNoEmail,
        defaultValue:
          "Emails sent: {{sent}} / {{withEmail}} (failed: {{failed}}). Offices without email: {{skipped}}.",
      });
      toast.success(base);
      if (r.manualOutreach.length > 0) {
        setSanadOutreachManualOnly(r.manualOutreach);
        setSanadOutreachOpen(true);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const outreachDisplayRows =
    sanadOutreachManualOnly !== null
      ? sanadOutreachManualOnly.map((o) => ({
          ...o,
          email: null as string | null,
          hasEmail: false,
        }))
      : (sanadLinksQuery.data?.offices.map((o) => ({
          id: o.id,
          name: o.name,
          nameAr: o.nameAr,
          phone: o.phone,
          contactPerson: o.contactPerson,
          surveyUrl: o.surveyUrl,
          email: o.email,
          hasEmail: o.hasEmail,
        })) ?? []);

  const outreachLoading =
    sanadOutreachOpen && sanadOutreachManualOnly === null && sanadLinksQuery.isLoading;

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
              setSanadOutreachOpen(true);
            }}
          >
            <Link2 className="h-4 w-4" aria-hidden />
            {t("admin.sanadSurveyLinks", { defaultValue: "Sanad survey links" })}
          </Button>
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
          if (!open) setSanadOutreachManualOnly(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {sanadOutreachManualOnly !== null
                ? t("admin.sanadOutreachNoEmailTitle", { defaultValue: "Offices without email" })
                : t("admin.sanadOutreachAllTitle", { defaultValue: "Sanad office survey links" })}
            </DialogTitle>
            <DialogDescription>
              {sanadOutreachManualOnly !== null
                ? t("admin.sanadOutreachNoEmailDesc", {
                    defaultValue:
                      "Share each survey link by WhatsApp or phone using the office name and number on file. The link records which Sanad office the response belongs to.",
                  })
                : t("admin.sanadOutreachAllDesc", {
                    defaultValue:
                      "Per-office survey links for manual outreach. Offices that have an email can also get the link via the Email Sanad offices button.",
                  })}
            </DialogDescription>
          </DialogHeader>

          {sanadOutreachManualOnly === null && sanadLinksQuery.isError && (
            <p className="text-destructive text-sm" role="alert">
              {sanadLinksQuery.error.message}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={outreachDisplayRows.length === 0}
              onClick={() =>
                downloadSanadLinksCsv(
                  outreachDisplayRows.map((r) => ({
                    name: r.name,
                    phone: r.phone,
                    contactPerson: r.contactPerson,
                    email: r.email,
                    surveyUrl: r.surveyUrl,
                  })),
                  "sanad-survey-links.csv",
                )
              }
            >
              {t("admin.downloadSanadCsv", { defaultValue: "Download CSV" })}
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.sanadColOffice", { defaultValue: "Office" })}</TableHead>
                  <TableHead>{t("yourPhone")}</TableHead>
                  <TableHead>{t("admin.sanadColContact", { defaultValue: "Contact" })}</TableHead>
                  <TableHead>{t("yourEmail")}</TableHead>
                  <TableHead className="text-center">
                    {t("admin.sanadColWhatsapp", { defaultValue: "WhatsApp" })}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("admin.sanadColLink", { defaultValue: "Link" })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outreachLoading ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                  </TableRow>
                ) : outreachDisplayRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground h-16 text-center">
                      {t("admin.sanadOutreachEmpty", { defaultValue: "No active Sanad offices found." })}
                    </TableCell>
                  </TableRow>
                ) : (
                  outreachDisplayRows.map((row) => {
                    const waDigits = toWhatsAppPhoneDigits(row.phone);
                    const waMessage = t("admin.whatsappSurveyMessage", {
                      officeName: row.name,
                      surveyUrl: row.surveyUrl,
                      defaultValue:
                        "Hello,\n\nPlease complete the survey for {{officeName}}:\n{{surveyUrl}}\n\nThank you.",
                    });
                    const waHref = waDigits ? buildWhatsAppSurveyHref(waDigits, waMessage) : null;
                    return (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[10rem] font-medium">
                        <span className="line-clamp-2">{row.name}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums text-sm">
                        {row.phone?.trim() || "—"}
                      </TableCell>
                      <TableCell className="max-w-[8rem] truncate text-muted-foreground text-sm">
                        {row.contactPerson?.trim() || "—"}
                      </TableCell>
                      <TableCell className="max-w-[9rem] truncate text-sm">
                        {row.email?.trim() ? (
                          row.email
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {waHref ? (
                          <Button
                            asChild
                            size="sm"
                            className="border-0 bg-[#25D366] text-white hover:bg-[#20bd5a]"
                            title={t("admin.whatsappOpenHint", {
                              defaultValue: "Open WhatsApp with this number and a draft message",
                            })}
                          >
                            <a
                              href={waHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={t("admin.sanadColWhatsapp", { defaultValue: "WhatsApp" })}
                            >
                              <MessageCircle className="h-4 w-4" aria-hidden />
                            </a>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs" title={t("admin.whatsappNoPhoneHint", { defaultValue: "Add a valid phone number" })}>
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(row.surveyUrl);
                              toast.success(
                                t("admin.surveyLinkCopied", { defaultValue: "Survey link copied" }),
                              );
                            } catch {
                              toast.error(t("copyFailed"));
                            }
                          }}
                        >
                          {t("copyToken")}
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
