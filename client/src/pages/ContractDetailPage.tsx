/**
 * Contract Detail Page — /hr/promoter-assignments/:id
 *
 * Sections:
 *   1. Header — contract number, type badge, status badge, action bar
 *   2. Summary — parties (first/second), dates, location, expiry indicator
 *   3. Promoter Identity — name, civil ID, passport, nationality, job title, passport expiry
 *   4. Documents — generated PDF, signed copy, with upload action
 *   5. Timeline — audit events
 *   6. Edit dialog (reuses shared PromoterAssignmentFormSection)
 */

import { useState } from "react";
import { Link, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  RotateCcw,
  Shield,
  Upload,
  User,
  X,
} from "lucide-react";
import {
  usePromoterAssignmentForm,
  type PromoterAssignmentFormState,
} from "@/components/contracts/usePromoterAssignmentForm";
import { PromoterAssignmentFormSection } from "@/components/contracts/PromoterAssignmentFormSection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const s = typeof d === "string" ? d : (d as Date).toISOString();
  return s.slice(0, 10);
}

function daysUntil(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const s = typeof d === "string" ? d : (d as Date).toISOString();
  const target = new Date(s.slice(0, 10));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function ExpiryChip({ days, label }: { days: number | null; label: string }) {
  if (days === null) return null;
  if (days < 0)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
        <AlertCircle className="h-3 w-3" />
        {label} expired {Math.abs(days)}d ago
      </span>
    );
  if (days <= 30)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
        <AlertTriangle className="h-3 w-3" />
        {label} expires in {days}d
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
      <CheckCircle2 className="h-3 w-3" />
      {label} valid
    </span>
  );
}

const STATUS_COLOR: Record<string, string> = {
  active:     "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  draft:      "bg-zinc-500/15    text-zinc-600    border-zinc-500/30",
  expired:    "bg-red-500/15     text-red-600     border-red-500/30",
  terminated: "bg-zinc-500/15    text-zinc-500    border-zinc-400/30",
  renewed:    "bg-blue-500/15    text-blue-600    border-blue-500/30",
  suspended:  "bg-amber-500/15   text-amber-700   border-amber-500/30",
  inactive:   "bg-zinc-500/15    text-zinc-500    border-zinc-400/30",
};

// ─── FIELD ROW ────────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-2 border-b border-border/40 last:border-0 text-sm">
      <span className="text-muted-foreground font-medium">{label}</span>
      <span className="text-foreground break-words">{value ?? "—"}</span>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b bg-muted/30">
        <span className="text-primary">{icon}</span>
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
      </div>
      <div className="px-5 py-3">{children}</div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [showEdit, setShowEdit] = useState(false);
  const [showRenew, setShowRenew] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.contractManagement.getById.useQuery(
    { id: id! },
    { enabled: !!id, retry: 1 }
  );

  const { data: docGenReadiness } = trpc.documentGeneration.readiness.useQuery();
  const pdfAvailable = docGenReadiness?.googleDocsConfigured ?? false;

  // ─── MUTATIONS ────────────────────────────────────────────────────────────

  const updateMutation = trpc.contractManagement.update.useMutation({
    onSuccess: () => {
      toast.success("Contract updated");
      refetch();
      setShowEdit(false);
    },
    onError: (e) => toast.error("Update failed", { description: e.message }),
  });

  const terminateMutation = trpc.contractManagement.terminate.useMutation({
    onSuccess: () => {
      toast.success("Contract terminated");
      refetch();
    },
    onError: (e) => toast.error("Terminate failed", { description: e.message }),
  });

  const renewMutation = trpc.contractManagement.renew.useMutation({
    onSuccess: (result) => {
      toast.success("Contract renewed", {
        description: `New contract created. ID: ${result.id.slice(0, 8)}…`,
      });
      setShowRenew(false);
      refetch();
    },
    onError: (e) => toast.error("Renew failed", { description: e.message }),
  });

  const generateMutation = trpc.documentGeneration.generate.useMutation({
    onSuccess: (result) => {
      toast.success("PDF ready");
      window.open(result.fileUrl, "_blank");
      setGeneratingPdf(false);
      refetch();
    },
    onError: (e) => {
      toast.error("PDF generation failed", { description: e.message });
      setGeneratingPdf(false);
    },
  });

  // ─── EDIT FORM ────────────────────────────────────────────────────────────

  const promoterDetail = data?.promoterDetail;
  const location = data?.locations?.[0];
  const contract = data?.contract;

  const editForm = usePromoterAssignmentForm({
    enabled: showEdit,
    initialValues: contract && location && promoterDetail
      ? {
          locationEn: location.locationEn ?? "",
          locationAr: location.locationAr ?? "",
          effectiveDate: fmtDate(contract.effectiveDate),
          expiryDate: fmtDate(contract.expiryDate),
          contractNumber: contract.contractNumber ?? "",
          issueDate: contract.issueDate ? fmtDate(contract.issueDate) : "",
          status: (contract.status as PromoterAssignmentFormState["status"]) ?? "active",
          civilId: promoterDetail.civilId ?? "",
          passportNumber: promoterDetail.passportNumber ?? "",
          passportExpiry: promoterDetail.passportExpiry ? fmtDate(promoterDetail.passportExpiry) : "",
          nationality: promoterDetail.nationality ?? "",
          jobTitleEn: promoterDetail.jobTitleEn ?? "",
        }
      : undefined,
  });

  function handleSaveEdit() {
    if (!id) return;
    const s = editForm.state;
    updateMutation.mutate({
      id,
      locationEn: s.locationEn.trim() || undefined,
      locationAr: s.locationAr.trim() || undefined,
      effectiveDate: s.effectiveDate || undefined,
      expiryDate: s.expiryDate || undefined,
      contractNumber: s.contractNumber.trim() || undefined,
      issueDate: s.issueDate || undefined,
      status: (s.status === "inactive" ? "draft" : s.status) as "active" | "expired" | "terminated" | "renewed" | "suspended" | "draft" | undefined,
      civilId: s.civilId.trim() || undefined,
      passportNumber: s.passportNumber.trim() || undefined,
      passportExpiry: s.passportExpiry || undefined,
      nationality: s.nationality.trim() || undefined,
      jobTitleEn: s.jobTitleEn.trim() || undefined,
    });
  }

  function handleTerminate() {
    if (!id || !confirm("Terminate this contract?")) return;
    terminateMutation.mutate({ id });
  }

  function handleGeneratePdf() {
    if (!id) return;
    setGeneratingPdf(true);
    generateMutation.mutate({
      templateKey: "outsourcing_contract_promoter_bilingual",
      entityId: id,
      outputFormat: "pdf",
    });
  }

  // ─── RENDER STATES ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error?.message ?? "Contract not found."}</AlertDescription>
        </Alert>
        <Link href="/hr/promoter-assignments">
          <Button variant="outline" className="mt-4 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to list
          </Button>
        </Link>
      </div>
    );
  }

  const { parties, events, documents } = data;
  const firstParty  = parties.find((p) => p.partyRole === "first_party");
  const secondParty = parties.find((p) => p.partyRole === "second_party");
  const contractDays = daysUntil(contract!.expiryDate);
  const passportDays = promoterDetail?.passportExpiry ? daysUntil(promoterDetail.passportExpiry) : null;
  const isTerminated = contract!.status === "terminated";
  const isRenewed    = contract!.status === "renewed";

  const promoterName =
    promoterDetail?.fullNameEn ??
    (promoterDetail?.fullNameAr ? `(AR) ${promoterDetail.fullNameAr}` : "Unknown promoter");

  // ─── MAIN RENDER ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="p-6 space-y-5 max-w-5xl mx-auto">

        {/* Back + Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <Link href="/hr/promoter-assignments">
              <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-1">
                <ArrowLeft className="h-3.5 w-3.5" /> All Assignments
              </button>
            </Link>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
              <FileText className="h-6 w-6 text-primary shrink-0" />
              <span>Promoter Assignment</span>
              {contract!.contractNumber && (
                <code className="text-base font-mono font-normal text-muted-foreground">
                  #{contract!.contractNumber}
                </code>
              )}
              <Badge
                variant="outline"
                className={`text-xs capitalize ${STATUS_COLOR[contract!.status] ?? ""}`}
              >
                {contract!.status}
              </Badge>
            </h1>
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mt-1">
              <ExpiryChip days={contractDays} label="Contract" />
              {passportDays !== null && <ExpiryChip days={passportDays} label="Passport" />}
            </div>
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>

            {!isTerminated && !isRenewed && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowEdit(true)}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}

            <Button
              size="sm"
              className="gap-1.5"
              disabled={!pdfAvailable || generatingPdf}
              onClick={handleGeneratePdf}
              title={pdfAvailable ? "Generate bilingual PDF" : "PDF generation not configured"}
            >
              {generatingPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {generatingPdf ? "Generating…" : "Generate PDF"}
            </Button>

            {!isTerminated && !isRenewed && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowRenew(true)}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Renew
              </Button>
            )}

            {!isTerminated && !isRenewed && (
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={handleTerminate}
                disabled={terminateMutation.isPending}
              >
                {terminateMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
                Terminate
              </Button>
            )}
          </div>
        </div>

        {/* 1. Parties */}
        <SectionCard icon={<Building2 className="h-4 w-4" />} title="Contract Parties">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">
                First Party — Client (work site owner)
              </p>
              <Field label="Name (EN)" value={firstParty?.displayNameEn} />
              <Field label="Name (AR)" value={firstParty?.displayNameAr} />
              <Field label="CR / Reg. no." value={firstParty?.registrationNumber} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">
                Second Party — Employer (promoter supplier)
              </p>
              <Field label="Name (EN)" value={secondParty?.displayNameEn} />
              <Field label="Name (AR)" value={secondParty?.displayNameAr} />
              <Field label="CR / Reg. no." value={secondParty?.registrationNumber} />
            </div>
          </div>
        </SectionCard>

        {/* 2. Location */}
        <SectionCard icon={<MapPin className="h-4 w-4" />} title="Work Location — First Party Site">
          <Field label="Location (EN)" value={location?.locationEn} />
          <Field label="Location (AR)" value={location?.locationAr} />
          {location?.siteCode && <Field label="Site code" value={location.siteCode} />}
        </SectionCard>

        {/* 3. Promoter Identity */}
        <SectionCard icon={<User className="h-4 w-4" />} title="Promoter">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            <div>
              <Field label="Full name (EN)"   value={promoterDetail?.fullNameEn} />
              <Field label="Full name (AR)"   value={promoterDetail?.fullNameAr} />
              <Field label="Job title"        value={promoterDetail?.jobTitleEn} />
              <Field label="Nationality"      value={promoterDetail?.nationality} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
                  Identity &amp; Travel Documents
                </p>
                <Shield className="h-3 w-3 text-muted-foreground" />
              </div>
              <Field label="Civil ID"          value={promoterDetail?.civilId} />
              <Field label="Passport no."      value={promoterDetail?.passportNumber} />
              <Field
                label="Passport expiry"
                value={
                  promoterDetail?.passportExpiry ? (
                    <span className="flex items-center gap-2">
                      {fmtDate(promoterDetail.passportExpiry)}
                      <ExpiryChip days={passportDays} label="Passport" />
                    </span>
                  ) : null
                }
              />
            </div>
          </div>
        </SectionCard>

        {/* 4. Contract details */}
        <SectionCard icon={<Calendar className="h-4 w-4" />} title="Contract Details">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            <div>
              <Field label="Effective date"  value={fmtDate(contract!.effectiveDate)} />
              <Field
                label="Expiry date"
                value={
                  <span className="flex items-center gap-2">
                    {fmtDate(contract!.expiryDate)}
                    <ExpiryChip days={contractDays} label="Contract" />
                  </span>
                }
              />
              <Field label="Issue date"      value={fmtDate(contract!.issueDate)} />
            </div>
            <div>
              <Field label="Contract no."    value={contract!.contractNumber} />
              <Field label="Contract type"   value={contract!.contractTypeId?.replace(/_/g, " ")} />
              <Field label="Status"          value={
                <Badge variant="outline" className={`text-xs capitalize ${STATUS_COLOR[contract!.status] ?? ""}`}>
                  {contract!.status}
                </Badge>
              } />
            </div>
          </div>
          {contract!.renewalOfContractId && (
            <div className="mt-3 text-sm text-muted-foreground">
              Renewal of{" "}
              <Link href={`/hr/promoter-assignments/${contract!.renewalOfContractId}`}>
                <span className="text-primary underline underline-offset-2 cursor-pointer font-mono text-xs">
                  {contract!.renewalOfContractId.slice(0, 8)}…
                </span>
              </Link>
            </div>
          )}
        </SectionCard>

        {/* 5. Documents */}
        <SectionCard icon={<FileText className="h-4 w-4" />} title="Documents">
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No documents yet. Generate a PDF to get started.</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium capitalize">
                        {doc.documentKind.replace(/_/g, " ")}
                      </p>
                      {doc.fileName && (
                        <p className="text-xs text-muted-foreground">{doc.fileName}</p>
                      )}
                    </div>
                  </div>
                  {doc.fileUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 h-7 text-xs"
                      onClick={() => window.open(doc.fileUrl!, "_blank")}
                    >
                      <Download className="h-3 w-3" /> Open
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 text-xs text-muted-foreground">
            Signed copy upload coming soon (PR 5).
          </div>
        </SectionCard>

        {/* 6. Timeline */}
        <SectionCard icon={<Clock className="h-4 w-4" />} title="Timeline">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No events yet.</p>
          ) : (
            <ol className="relative border-l-2 border-border/60 ml-3 space-y-4 py-1">
              {events.map((ev) => (
                <li key={ev.id} className="ml-4 relative">
                  <div className="absolute -left-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary/70 ring-2 ring-background" />
                  <p className="text-sm font-medium capitalize">
                    {ev.action.replace(/_/g, " ")}
                  </p>
                  {ev.actorName && (
                    <p className="text-xs text-muted-foreground">by {ev.actorName}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(ev.createdAt).toLocaleString()}
                  </p>
                  {ev.details && Object.keys(ev.details).length > 0 && (
                    <pre className="mt-1 text-xs bg-muted/50 rounded p-2 overflow-x-auto max-w-xs">
                      {JSON.stringify(ev.details, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>

      {/* ── Edit Dialog ────────────────────────────────────────────────────── */}
      <Dialog open={showEdit} onOpenChange={(v) => { setShowEdit(v); if (!v) editForm.reset(); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto gap-0 p-0">
          <div className="p-6 pb-0">
            <DialogHeader className="text-left">
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5" /> Edit Contract
              </DialogTitle>
              <DialogDescription>
                Update location, identity fields, dates, or status. Party and promoter cannot be changed.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-6 py-4">
            <PromoterAssignmentFormSection form={editForm} showStatus />
          </div>
          <DialogFooter className="p-6 pt-2 border-t bg-muted/20 flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowEdit(false); editForm.reset(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              className="min-w-[130px] gap-2"
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Renew Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={showRenew} onOpenChange={setShowRenew}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" /> Renew Contract
            </DialogTitle>
            <DialogDescription>
              Creates a new contract with the same parties and promoter, linked to this one.
              Current contract will be marked as <strong>renewed</strong>.
            </DialogDescription>
          </DialogHeader>
          <RenewForm
            contractId={id!}
            currentExpiryDate={fmtDate(contract!.expiryDate)}
            onSuccess={() => { setShowRenew(false); refetch(); }}
            onCancel={() => setShowRenew(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── RENEW FORM ───────────────────────────────────────────────────────────────

function RenewForm({
  contractId,
  currentExpiryDate,
  onSuccess,
  onCancel,
}: {
  contractId: string;
  currentExpiryDate: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [newEffectiveDate, setNewEffectiveDate] = useState(currentExpiryDate);
  const [newExpiryDate, setNewExpiryDate] = useState("");
  const [newContractNumber, setNewContractNumber] = useState("");
  const renewMutation = trpc.contractManagement.renew.useMutation({
    onSuccess,
    onError: (e) => toast.error("Renew failed", { description: e.message }),
  });

  return (
    <div className="space-y-4 pt-1">
      <div className="space-y-2">
        <Label>New effective date</Label>
        <DateInput
          value={newEffectiveDate}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewEffectiveDate(e.target.value)}
          className="h-10"
        />
      </div>
      <div className="space-y-2">
        <Label>New expiry date <span className="text-destructive">*</span></Label>
        <DateInput
          value={newExpiryDate}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewExpiryDate(e.target.value)}
          className="h-10"
        />
      </div>
      <div className="space-y-2">
        <Label>New contract reference no.</Label>
        <Input
          placeholder="e.g. PA-2027-001"
          value={newContractNumber}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewContractNumber(e.target.value)}
          className="h-10 font-mono text-sm"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button
          onClick={() =>
            renewMutation.mutate({
              originalContractId: contractId,
              newEffectiveDate,
              newExpiryDate,
              newContractNumber: newContractNumber.trim() || undefined,
            })
          }
          disabled={!newEffectiveDate || !newExpiryDate || renewMutation.isPending}
          className="gap-2"
        >
          {renewMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Create Renewal
        </Button>
      </div>
    </div>
  );
}
