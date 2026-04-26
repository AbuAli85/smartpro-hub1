import { useMemo, useState } from "react";
import { Link } from "wouter";
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
import { cn } from "@/lib/utils";

export type EngagementDetailViewProps = {
  engagementId: number;
  /** List page href, e.g. `/engagements` or `/client/engagements` */
  listPath: string;
  /** Hides staff tools, internal notes, reorders sections for the client shell */
  clientMode: boolean;
};

export function EngagementDetailView({ engagementId, listPath, clientMode }: EngagementDetailViewProps) {
  const { t } = useTranslation("engagements");
  const valid = Number.isFinite(engagementId) && engagementId > 0;
  const { activeCompanyId, loading: companyListLoading } = useActiveCompany();
  const workspaceReady = !companyListLoading && activeCompanyId != null;
  const { data: myCompany } = trpc.companies.myCompany.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: workspaceReady },
  );
  const memberRole = myCompany?.member?.role ?? null;
  const showStaffReply =
    !clientMode &&
    memberRole != null &&
    memberRole !== "client" &&
    memberRole !== "company_member" &&
    memberRole !== "external_auditor";

  const detail = trpc.engagements.getById.useQuery(
    { engagementId, companyId: activeCompanyId! },
    { enabled: valid && workspaceReady, retry: false },
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

  const internalNotes = trpc.engagements.listInternalNotes.useQuery(
    { engagementId, companyId: activeCompanyId! },
    { enabled: valid && showStaffReply && workspaceReady },
  );
  const addNote = trpc.engagements.addInternalNote.useMutation({
    onSuccess: () => {
      toast.success(t("noteAdded"));
      setNoteBody("");
      internalNotes.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const requestInstr = trpc.engagements.requestPaymentInstructions.useMutation({
    onSuccess: () => {
      toast.success(t("messageSent"));
      setPayInstr("");
      detail.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const submitProof = trpc.engagements.submitTransferProof.useMutation({
    onSuccess: () => {
      toast.success(t("messageSent"));
      setProofUrl("");
      setProofRef("");
      detail.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const verifyProof = trpc.engagements.verifyTransferProof.useMutation({
    onSuccess: () => detail.refetch(),
    onError: (e) => toast.error(e.message),
  });
  const markPaid = trpc.engagements.markPaidExternally.useMutation({
    onSuccess: () => detail.refetch(),
    onError: (e) => toast.error(e.message),
  });

  const [noteBody, setNoteBody] = useState("");
  const [payInstr, setPayInstr] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [proofRef, setProofRef] = useState("");

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

  const pendingContractId = useMemo(() => {
    const links = detail.data?.links ?? [];
    const c = links.find((l) => l.linkType === "contract" && l.entityId != null);
    return c?.entityId ?? null;
  }, [detail.data?.links]);

  const yourTasks = useMemo(() => {
    const tasks = detail.data?.tasks ?? [];
    return tasks.filter((x) => x.status === "pending" || x.status === "in_progress");
  }, [detail.data?.tasks]);

  const doneTasks = useMemo(() => {
    const tasks = detail.data?.tasks ?? [];
    return tasks.filter((x) => x.status === "done" || x.status === "cancelled");
  }, [detail.data?.tasks]);

  if (!valid) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">{t("invalidId")}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href={listPath}>{t("backToList")}</Link>
        </Button>
      </div>
    );
  }

  const headerCard = detail.data && (
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
            {clientMode && detail.data.engagement.dueDate && (
              <p className="text-xs text-muted-foreground mt-1">
                Due: {fmtDateTimeShort(detail.data.engagement.dueDate)}
              </p>
            )}
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
        {detail.data.engagement.topActionLabel && (
          <div
            className={cn(
              "rounded-xl border",
              clientMode
                ? "border-primary/45 bg-primary/10 p-4 shadow-sm ring-1 ring-primary/15"
                : "border-primary/25 bg-primary/5 p-3",
            )}
          >
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("topAction")}</p>
            <p className={cn("mt-1 font-semibold leading-snug", clientMode ? "text-base" : "text-sm font-medium")}>
              {detail.data.engagement.topActionLabel}
            </p>
          </div>
        )}
        {!clientMode && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("nextStep")}</p>
            <p className="text-sm mt-1">{nextStep}</p>
          </div>
        )}
        {!clientMode && detail.data.engagement.healthReason && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("healthReason")}</p>
            <p className="text-sm mt-1 text-amber-800 dark:text-amber-300">{detail.data.engagement.healthReason}</p>
          </div>
        )}
        {detail.data.engagement.summary && (
          <p className="text-sm text-muted-foreground">{detail.data.engagement.summary}</p>
        )}
      </CardContent>
    </Card>
  );

  const timelineCard = detail.data && (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{clientMode ? "Timeline" : t("activity")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-64 overflow-y-auto scrollbar-hidden">
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
  );

  const tasksCard = detail.data && (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{t("tasks")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {clientMode ? (
          <>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Your tasks</p>
              {yourTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("none")}</p>
              ) : (
                yourTasks.map((task) => (
                  <div key={task.id} className="border-b border-border/60 pb-2 mb-2 last:border-0">
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">{task.status.replace(/_/g, " ")}</p>
                  </div>
                ))
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Completed</p>
              {doneTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("none")}</p>
              ) : (
                doneTasks.map((task) => (
                  <div key={task.id} className="border-b border-border/40 pb-2 mb-2 last:border-0 opacity-80">
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">{task.status.replace(/_/g, " ")}</p>
                  </div>
                ))
              )}
            </div>
          </>
        ) : detail.data.tasks.length === 0 ? (
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
  );

  const documentsCard = detail.data && (
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
                  <p className="text-xs text-muted-foreground capitalize">
                    {d.status}
                    {!clientMode && d.scanStatus ? ` · scan: ${d.scanStatus.replace(/_/g, " ")}` : ""}
                  </p>
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
            disabled={!workspaceReady || !docTitle.trim() || !docUrl.trim() || uploadDoc.isPending}
            onClick={() =>
              uploadDoc.mutate({
                engagementId,
                title: docTitle.trim(),
                fileUrl: docUrl.trim(),
                companyId: activeCompanyId!,
              })
            }
          >
            {t("addDocument")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const messagesCard = detail.data && (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{t("messages")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-hidden pr-1">
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
                    <span className="font-medium">
                      {m.author === "client" ? "You" : m.author === "platform" ? "SmartPRO" : m.author}
                    </span>
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
            disabled={!workspaceReady || !msgSubject.trim() || !msgBody.trim() || sendClient.isPending}
            onClick={() =>
              sendClient.mutate({
                engagementId,
                subject: msgSubject.trim(),
                body: msgBody.trim(),
                companyId: activeCompanyId!,
              })
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
              disabled={!workspaceReady || !staffSubject.trim() || !staffBody.trim() || sendStaff.isPending}
              onClick={() =>
                sendStaff.mutate({
                  engagementId,
                  subject: staffSubject.trim(),
                  body: staffBody.trim(),
                  companyId: activeCompanyId!,
                })
              }
            >
              {t("postStaffReply")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const paymentCard = detail.data && (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{clientMode ? "Payment" : t("paymentTransfer")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!(clientMode && (detail.data.paymentTransfer?.phase ?? "idle") === "idle") && (
          <p className="text-xs text-muted-foreground">
            {t("paymentPhase")}: {detail.data.paymentTransfer?.phase?.replace(/_/g, " ") ?? "idle"}
          </p>
        )}
        {detail.data.paymentTransfer?.instructionsText && (
          <div className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">
            {detail.data.paymentTransfer.instructionsText}
          </div>
        )}
        {showStaffReply && (
          <div className="space-y-2 border-t pt-3">
            <Textarea rows={3} placeholder={t("instructionsPlaceholder")} value={payInstr} onChange={(e) => setPayInstr(e.target.value)} />
            <Button
              size="sm"
              variant="outline"
              disabled={!workspaceReady || !payInstr.trim() || requestInstr.isPending}
              onClick={() =>
                requestInstr.mutate({
                  engagementId,
                  instructionsText: payInstr.trim(),
                  companyId: activeCompanyId!,
                })
              }
            >
              {t("requestInstructions")}
            </Button>
            {detail.data.paymentTransfer?.phase === "proof_submitted" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    verifyProof.mutate({ engagementId, accept: true, companyId: activeCompanyId! })
                  }
                >
                  {t("verifyProof")} (accept)
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    verifyProof.mutate({ engagementId, accept: false, companyId: activeCompanyId! })
                  }
                >
                  Reject
                </Button>
              </div>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => markPaid.mutate({ engagementId, companyId: activeCompanyId! })}
            >
              {t("markReconciled")}
            </Button>
          </div>
        )}
        {(detail.data.paymentTransfer?.phase === "instructions_sent" || detail.data.paymentTransfer?.phase === "rejected") && (
          <div className="space-y-2 border-t pt-3">
            <Input placeholder={t("docUrl")} value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} />
            <Input placeholder="Reference" value={proofRef} onChange={(e) => setProofRef(e.target.value)} />
            <Button
              size="sm"
              disabled={!workspaceReady || !proofUrl.trim() || submitProof.isPending}
              onClick={() =>
                submitProof.mutate({
                  engagementId,
                  proofUrl: proofUrl.trim(),
                  proofReference: proofRef.trim() || undefined,
                  companyId: activeCompanyId!,
                })
              }
            >
              {t("submitProof")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const linkedAndInvoiceCard = detail.data && !clientMode && (
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
                  <li key={`${inv.kind}-${inv.id}`}>
                    {inv.invoiceNumber} — {inv.status} — OMR {inv.amountOmr}
                    {"balanceOmr" in inv && inv.balanceOmr != null ? ` — bal OMR ${inv.balanceOmr}` : ""}
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
  );

  const contractClientCard = detail.data && clientMode && (detail.data.signatureSummary.length > 0 || pendingContractId) && (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Contract</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {detail.data.signatureSummary.map((s) => (
          <p key={s.contractId}>
            {t("contractSignatures", { id: s.contractId, pending: s.pending, signed: s.signed })}
            {s.pending > 0 && (
              <Button variant="default" size="sm" className="ml-2" asChild>
                <Link href={`/contracts/${s.contractId}/sign`}>Sign</Link>
              </Button>
            )}
          </p>
        ))}
        {detail.data.signatureSummary.length === 0 && pendingContractId && (
          <Button variant="default" size="sm" asChild>
            <Link href={`/contracts/${pendingContractId}/sign`}>View & sign</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );

  const internalNotesCard = showStaffReply && detail.data && (
    <Card className="border-0 shadow-sm border-l-4 border-l-amber-500/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{t("internalNotes")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {internalNotes.data?.items.length === 0 && <p className="text-xs text-muted-foreground">{t("none")}</p>}
        {internalNotes.data?.items.map((n) => (
          <div key={n.id} className="text-sm border-b border-border/50 pb-2">
            <p className="whitespace-pre-wrap">{n.body}</p>
            <p className="text-xs text-muted-foreground mt-1">{fmtDateTimeShort(n.createdAt)}</p>
          </div>
        ))}
        <Textarea rows={3} placeholder={t("notePlaceholder")} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
        <Button
          size="sm"
          variant="secondary"
          disabled={!workspaceReady || !noteBody.trim() || addNote.isPending}
          onClick={() => addNote.mutate({ engagementId, body: noteBody.trim(), companyId: activeCompanyId! })}
        >
          {t("addNote")}
        </Button>
      </CardContent>
    </Card>
  );

  const staffActivityCard = detail.data && !clientMode && (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{t("activity")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-64 overflow-y-auto scrollbar-hidden">
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
  );

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="gap-1">
          <Link href={listPath}>
            <ChevronLeft className="w-4 h-4" /> {t("backToList")}
          </Link>
        </Button>
      </div>

      {(detail.isLoading || (valid && !workspaceReady)) && (
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

      {detail.data &&
        (clientMode ? (
          <>
            {headerCard}
            {timelineCard}
            {tasksCard}
            {documentsCard}
            {messagesCard}
            {paymentCard}
            {contractClientCard}
          </>
        ) : (
          <>
            {headerCard}
            {linkedAndInvoiceCard}
            {internalNotesCard}
            {paymentCard}
            {tasksCard}
            {messagesCard}
            {documentsCard}
            {staffActivityCard}
          </>
        ))}
    </div>
  );
}
