import { useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { fmtDateTimeShort } from "@/lib/dateUtils";
import { toast } from "sonner";
import { ChevronLeft, Send } from "lucide-react";

export default function EngagementDetailPage() {
  const { t } = useTranslation("engagements");
  const [, params] = useRoute("/engagements/:id");
  const engagementId = params?.id ? Number(params.id) : NaN;
  const valid = Number.isFinite(engagementId) && engagementId > 0;
  const { activeCompanyId } = useActiveCompany();
  const { data: myCompany } = trpc.companies.myCompany.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const memberRole = myCompany?.member?.role ?? null;
  const showStaffReply =
    memberRole != null && memberRole !== "client" && memberRole !== "company_member" && memberRole !== "external_auditor";

  const detail = trpc.engagements.getById.useQuery(
    { engagementId },
    { enabled: valid, retry: false },
  );

  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [staffSubject, setStaffSubject] = useState("");
  const [staffBody, setStaffBody] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docUrl, setDocUrl] = useState("");

  const sendClient = trpc.engagements.sendMessage.useMutation({
    onSuccess: () => {
      toast.success(t("messageSent"));
      setMsgSubject("");
      setMsgBody("");
      detail.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const sendStaff = trpc.engagements.replyFromPlatform.useMutation({
    onSuccess: () => {
      toast.success(t("replySent"));
      setStaffSubject("");
      setStaffBody("");
      detail.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const uploadDoc = trpc.engagements.uploadDocument.useMutation({
    onSuccess: () => {
      toast.success(t("documentAdded"));
      setDocTitle("");
      setDocUrl("");
      detail.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const nextStep = useMemo(() => {
    const e = detail.data?.engagement;
    if (!e) return "";
    if (e.status === "blocked") return t("nextBlocked");
    if (e.engagementType === "contract" && e.currentStage === "pending_signature") {
      return t("nextSignContract");
    }
    if (e.engagementType === "pro_billing_cycle" && (e.currentStage === "pending" || e.currentStage === "overdue")) {
      return t("nextPayInvoice");
    }
    return t("nextDefault");
  }, [detail.data?.engagement, t]);

  if (!valid) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">{t("invalidId")}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/engagements">{t("backToList")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="gap-1">
          <Link href="/engagements">
            <ChevronLeft className="w-4 h-4" /> {t("backToList")}
          </Link>
        </Button>
      </div>

      {detail.isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {detail.isError && (
        <Card>
          <CardContent className="py-8 text-destructive text-sm">{detail.error.message}</CardContent>
        </Card>
      )}

      {detail.data && (
        <>
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xl font-bold">{detail.data.engagement.title}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    {detail.data.engagement.engagementType.replace(/_/g, " ")}
                    {detail.data.engagement.currentStage
                      ? ` · ${detail.data.engagement.currentStage.replace(/_/g, " ")}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {detail.data.engagement.status.replace(/_/g, " ")}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {detail.data.engagement.health.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("nextStep")}</p>
                <p className="text-sm mt-1">{nextStep}</p>
              </div>
              {detail.data.engagement.summary && (
                <p className="text-sm text-muted-foreground">{detail.data.engagement.summary}</p>
              )}
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{t("linkedItems")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {detail.data.links.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("none")}</p>
                ) : (
                  detail.data.links.map((l) => (
                    <Badge key={l.id} variant="outline" className="mr-1 mb-1">
                      {l.linkType.replace(/_/g, " ")}
                      {l.entityId != null ? ` #${l.entityId}` : ""}
                      {l.entityKey ? ` · ${l.entityKey}` : ""}
                    </Badge>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{t("invoiceSignature")}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">{t("invoices")}</p>
                  {detail.data.invoiceSummary.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("none")}</p>
                  ) : (
                    <ul className="list-disc pl-4 mt-1 space-y-1">
                      {detail.data.invoiceSummary.map((inv) => (
                        <li key={inv.id}>
                          {inv.invoiceNumber} — {inv.status} — OMR {inv.amountOmr}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("signatures")}</p>
                  {detail.data.signatureSummary.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("none")}</p>
                  ) : (
                    <ul className="list-disc pl-4 mt-1 space-y-1">
                      {detail.data.signatureSummary.map((s) => (
                        <li key={s.contractId}>
                          {t("contractSignatures", { id: s.contractId, pending: s.pending, signed: s.signed })}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{t("tasks")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.data.tasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("none")}</p>
              ) : (
                detail.data.tasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{task.status.replace(/_/g, " ")}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{t("messages")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {detail.data.messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("noMessages")}</p>
                ) : (
                  [...detail.data.messages]
                    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                    .map((m) => (
                      <div
                        key={m.id}
                        className={`rounded-lg border p-3 text-sm ${
                          m.author === "platform" ? "bg-muted/40 border-border" : "bg-background"
                        }`}
                      >
                        <div className="flex justify-between gap-2 mb-1">
                          <span className="font-medium capitalize">{m.author}</span>
                          <span className="text-xs text-muted-foreground">{fmtDateTimeShort(m.createdAt)}</span>
                        </div>
                        {m.subject && <p className="text-xs text-muted-foreground mb-1">{m.subject}</p>}
                        <p className="whitespace-pre-wrap">{m.body}</p>
                      </div>
                    ))
                )}
              </div>
              <div className="space-y-2 border-t pt-4">
                <Input placeholder={t("subjectPlaceholder")} value={msgSubject} onChange={(e) => setMsgSubject(e.target.value)} />
                <Textarea placeholder={t("messagePlaceholder")} rows={3} value={msgBody} onChange={(e) => setMsgBody(e.target.value)} />
                <Button
                  size="sm"
                  className="gap-2"
                  disabled={!msgSubject.trim() || !msgBody.trim() || sendClient.isPending}
                  onClick={() =>
                    sendClient.mutate({ engagementId, subject: msgSubject.trim(), body: msgBody.trim() })
                  }
                >
                  <Send className="w-3.5 h-3.5" /> {t("send")}
                </Button>
              </div>
              {showStaffReply && (
                <div className="space-y-2 border-t pt-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase">{t("staffReply")}</p>
                  <Input placeholder={t("subjectPlaceholder")} value={staffSubject} onChange={(e) => setStaffSubject(e.target.value)} />
                  <Textarea placeholder={t("staffPlaceholder")} rows={3} value={staffBody} onChange={(e) => setStaffBody(e.target.value)} />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!staffSubject.trim() || !staffBody.trim() || sendStaff.isPending}
                    onClick={() =>
                      sendStaff.mutate({ engagementId, subject: staffSubject.trim(), body: staffBody.trim() })
                    }
                  >
                    {t("postStaffReply")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{t("documents")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {detail.data.documents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("none")}</p>
                ) : (
                  detail.data.documents.map((d) => (
                    <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm border-b border-border/60 pb-2">
                      <div>
                        <p className="font-medium">{d.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">{d.status}</p>
                      </div>
                      {d.fileUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={d.fileUrl} target="_blank" rel="noopener noreferrer">
                            {t("open")}
                          </a>
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-2 border-t pt-4">
                <p className="text-xs font-medium text-muted-foreground uppercase">{t("attachLink")}</p>
                <Input placeholder={t("docTitle")} value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
                <Input placeholder={t("docUrl")} value={docUrl} onChange={(e) => setDocUrl(e.target.value)} />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!docTitle.trim() || !docUrl.trim() || uploadDoc.isPending}
                  onClick={() => uploadDoc.mutate({ engagementId, title: docTitle.trim(), fileUrl: docUrl.trim() })}
                >
                  {t("addDocument")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{t("activity")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-64 overflow-y-auto">
              {detail.data.activity.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("none")}</p>
              ) : (
                detail.data.activity.map((a) => (
                  <div key={a.id} className="text-xs border-b border-border/40 pb-2">
                    <p className="font-medium">{a.action}</p>
                    <p className="text-muted-foreground">{fmtDateTimeShort(a.createdAt)}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
