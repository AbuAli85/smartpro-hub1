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

import { useRef, useState } from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  CirclePlay,
  Clock,
  CreditCard,
  Download,
  FileText,
  Loader2,
  MapPin,
  Paperclip,
  Pencil,
  RefreshCw,
  RotateCcw,
  Shield,
  Trash2,
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

// ─── DOCUMENT UPLOAD HELPERS ──────────────────────────────────────────────────

/** Reads a File object and resolves with the raw base64 string (no data-URL prefix). */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type UploadableKind = "signed_contract_pdf" | "passport_copy" | "id_card_copy" | "attachment";

const UPLOAD_KIND_META: Record<
  UploadableKind,
  { label: string; description: string; icon: React.ReactNode; acceptAttr: string; maxSizeMb: number; mimeTypes: string[] }
> = {
  signed_contract_pdf: {
    label: "Signed Contract",
    description: "Scanned or electronically signed copy of the executed contract",
    icon: <FileText className="h-4 w-4" />,
    acceptAttr: ".pdf",
    maxSizeMb: 20,
    mimeTypes: ["application/pdf"],
  },
  passport_copy: {
    label: "Passport Copy",
    description: "Promoter's passport bio-data page",
    icon: <Shield className="h-4 w-4" />,
    acceptAttr: ".pdf,.jpg,.jpeg,.png,.webp",
    maxSizeMb: 10,
    mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  },
  id_card_copy: {
    label: "ID Card Copy",
    description: "Promoter's civil ID / national ID card",
    icon: <CreditCard className="h-4 w-4" />,
    acceptAttr: ".pdf,.jpg,.jpeg,.png,.webp",
    maxSizeMb: 10,
    mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  },
  attachment: {
    label: "Attachment",
    description: "Any other supporting document",
    icon: <Paperclip className="h-4 w-4" />,
    acceptAttr: ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx",
    maxSizeMb: 20,
    mimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
};

const ORDERED_UPLOAD_KINDS: UploadableKind[] = [
  "signed_contract_pdf",
  "passport_copy",
  "id_card_copy",
  "attachment",
];

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [showEdit, setShowEdit] = useState(false);
  const [showRenew, setShowRenew] = useState(false);
  const [showActivate, setShowActivate] = useState(false);
  const [showTerminate, setShowTerminate] = useState(false);
  const [terminateReason, setTerminateReason] = useState("");
  const [uploadingKind, setUploadingKind] = useState<UploadableKind | null>(null);
  const fileInputRefs = useRef<Partial<Record<UploadableKind, HTMLInputElement | null>>>({});
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

  const activateMutation = trpc.contractManagement.activate.useMutation({
    onSuccess: () => {
      toast.success("Contract activated", {
        description: "The contract is now in effect.",
      });
      refetch();
      setShowActivate(false);
    },
    onError: (e) => toast.error("Activation failed", { description: e.message }),
  });

  const terminateMutation = trpc.contractManagement.terminate.useMutation({
    onSuccess: () => {
      toast.success("Contract terminated");
      refetch();
      setShowTerminate(false);
      setTerminateReason("");
    },
    onError: (e) => toast.error("Terminate failed", { description: e.message }),
  });

  const renewMutation = trpc.contractManagement.renew.useMutation({
    onSuccess: (result) => {
      toast.success("Contract renewed", {
        description: `New draft contract created. ID: ${result.id.slice(0, 8)}…`,
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

  const uploadDocumentMutation = trpc.contractManagement.uploadDocument.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded");
      refetch();
    },
    onError: (e) => toast.error("Upload failed", { description: e.message }),
  });

  const deleteDocumentMutation = trpc.contractManagement.deleteDocument.useMutation({
    onSuccess: () => {
      toast.success("Document removed");
      refetch();
    },
    onError: (e) => toast.error("Delete failed", { description: e.message }),
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
    if (!id) return;
    terminateMutation.mutate({ id, reason: terminateReason.trim() || undefined });
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

  const { parties, events, documents, allowedTransitions = [] } = data;
  const firstParty  = parties.find((p) => p.partyRole === "first_party");
  const secondParty = parties.find((p) => p.partyRole === "second_party");
  const contractDays = daysUntil(contract!.expiryDate);
  const passportDays = promoterDetail?.passportExpiry ? daysUntil(promoterDetail.passportExpiry) : null;

  // Drive action bar entirely from transition map returned by the API
  const canActivate   = allowedTransitions.includes("active");
  const canTerminate  = allowedTransitions.includes("terminated");
  const canRenew      = allowedTransitions.includes("renewed");
  const isTerminal    = allowedTransitions.length === 0;
  const canEdit       = !isTerminal;

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

          {/* Action bar — driven by allowedTransitions from the API */}
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>

            {/* Activate — only shown for draft contracts */}
            {canActivate && (
              <Button
                size="sm"
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setShowActivate(true)}
              >
                <CirclePlay className="h-3.5 w-3.5" /> Activate
              </Button>
            )}

            {/* Edit */}
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowEdit(true)}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}

            {/* Generate PDF */}
            <Button
              size="sm"
              variant={canActivate ? "outline" : "default"}
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
              {generatingPdf ? "Generating…" : "PDF"}
            </Button>

            {/* Renew */}
            {canRenew && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowRenew(true)}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Renew
              </Button>
            )}

            {/* Terminate */}
            {canTerminate && (
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowTerminate(true)}
                disabled={terminateMutation.isPending}
              >
                <X className="h-3.5 w-3.5" /> Terminate
              </Button>
            )}

            {/* Terminal badge */}
            {isTerminal && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs border border-border text-muted-foreground bg-muted/40">
                No further actions — terminal state
              </span>
            )}
          </div>
        </div>

        {/* Draft status banner */}
        {contract!.status === "draft" && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-400/8 px-5 py-3 flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              This contract is a <strong>draft</strong> — it is not yet in effect.
            </div>
            <div className="text-amber-700 dark:text-amber-400 text-xs">
              Review the details below, then click <strong>Activate</strong> to confirm and put it into effect.
            </div>
            {canActivate && (
              <Button
                size="sm"
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white ml-auto shrink-0"
                onClick={() => setShowActivate(true)}
              >
                <CirclePlay className="h-3.5 w-3.5" /> Activate Contract
              </Button>
            )}
          </div>
        )}

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
          <div className="space-y-3">

            {/* 5a. System-generated PDFs — read-only */}
            {(() => {
              const generatedDocs = documents.filter((d) => d.documentKind === "generated_pdf");
              return (
                <div className="rounded-lg border bg-muted/20">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Generated Contract PDF
                    </div>
                    <span className="text-xs text-muted-foreground">System generated</span>
                  </div>
                  <div className="px-4 py-2">
                    {generatedDocs.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-1">
                        No PDF generated yet. Use the "Generate PDF" action above.
                      </p>
                    ) : (
                      <ul className="space-y-1.5 py-1">
                        {generatedDocs.map((doc) => (
                          <li key={doc.id} className="flex items-center justify-between text-sm">
                            <div>
                              <span className="font-medium">{doc.fileName ?? "contract.pdf"}</span>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {fmtDate(doc.uploadedAt)}
                              </span>
                            </div>
                            {doc.fileUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1.5 text-xs"
                                onClick={() => window.open(doc.fileUrl!, "_blank")}
                              >
                                <Download className="h-3 w-3" /> Open
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* 5b. Uploadable document kinds */}
            {ORDERED_UPLOAD_KINDS.map((kind) => {
              const meta = UPLOAD_KIND_META[kind];
              const kindDocs = documents
                .filter((d) => d.documentKind === kind)
                .sort(
                  (a, b) =>
                    new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
                );
              const isUploading = uploadingKind === kind && uploadDocumentMutation.isPending;

              async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
                const file = e.target.files?.[0];
                if (!file || !id) return;

                if (!meta.mimeTypes.includes(file.type)) {
                  toast.error("Invalid file type", {
                    description: `Accepted: ${meta.acceptAttr}`,
                  });
                  e.target.value = "";
                  return;
                }
                if (file.size > meta.maxSizeMb * 1024 * 1024) {
                  toast.error("File too large", {
                    description: `Maximum size is ${meta.maxSizeMb} MB`,
                  });
                  e.target.value = "";
                  return;
                }

                setUploadingKind(kind);
                try {
                  const fileBase64 = await readFileAsBase64(file);
                  await uploadDocumentMutation.mutateAsync({
                    contractId: id,
                    documentKind: kind,
                    fileBase64,
                    fileName: file.name,
                    mimeType: file.type,
                    fileSize: file.size,
                  });
                } finally {
                  setUploadingKind(null);
                  e.target.value = "";
                }
              }

              return (
                <div key={kind} className="rounded-lg border bg-muted/20">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="text-muted-foreground">{meta.icon}</span>
                      {meta.label}
                    </div>
                    <div>
                      <input
                        ref={(el) => { fileInputRefs.current[kind] = el; }}
                        type="file"
                        accept={meta.acceptAttr}
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        disabled={isUploading}
                        onClick={() => fileInputRefs.current[kind]?.click()}
                      >
                        {isUploading ? (
                          <><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</>
                        ) : (
                          <><Upload className="h-3 w-3" /> Upload</>
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="px-4 py-2">
                    {kindDocs.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-1 italic">
                        {meta.description} — no file uploaded yet.
                      </p>
                    ) : (
                      <ul className="space-y-1.5 py-1">
                        {kindDocs.map((doc, idx) => (
                          <li
                            key={doc.id}
                            className="flex items-center justify-between text-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-medium truncate block max-w-xs">
                                {doc.fileName ?? "document"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Uploaded {fmtDate(doc.uploadedAt)}
                                {idx === 0 && (
                                  <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0 text-[10px] font-medium text-emerald-700">
                                    latest
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {doc.fileUrl && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1.5 text-xs"
                                  onClick={() => window.open(doc.fileUrl!, "_blank")}
                                >
                                  <Download className="h-3 w-3" /> Open
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                disabled={deleteDocumentMutation.isPending}
                                onClick={() => {
                                  if (!confirm(`Remove "${doc.fileName ?? "this document"}"?`)) return;
                                  deleteDocumentMutation.mutate({ documentId: doc.id });
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}

          </div>
        </SectionCard>

        {/* 6. Timeline */}
        <SectionCard icon={<Clock className="h-4 w-4" />} title="Audit Timeline">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No events yet.</p>
          ) : (
            <ol className="relative border-l-2 border-border/60 ml-3 space-y-0 py-1">
              {events.map((ev) => (
                <TimelineEvent key={ev.id} event={ev} />
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

      {/* ── Activate Confirmation ──────────────────────────────────────────── */}
      <AlertDialog open={showActivate} onOpenChange={setShowActivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CirclePlay className="h-5 w-5 text-emerald-600" />
              Activate this contract?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>
                Once activated, the contract will be <strong>in effect</strong> and can only be
                terminated, renewed, or it will expire automatically on{" "}
                <strong>{fmtDate(contract?.expiryDate)}</strong>.
              </span>
              <br />
              <span className="text-muted-foreground text-xs">
                Make sure all details — parties, promoter identity, and dates — are correct before confirming.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={activateMutation.isPending}>
              Cancel — keep as draft
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => activateMutation.mutate({ id: id! })}
              disabled={activateMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 gap-2"
            >
              {activateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Activate Contract
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Terminate Confirmation ──────────────────────────────────────────── */}
      <AlertDialog open={showTerminate} onOpenChange={setShowTerminate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-destructive" />
              Terminate this contract?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action is <strong>permanent</strong>. The contract will be marked as terminated
              and no further changes will be possible. The promoter will no longer be authorised
              to work at this location under this contract.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2">
            <label className="text-sm font-medium text-foreground block mb-1.5">
              Reason (optional)
            </label>
            <textarea
              className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
              placeholder="e.g. End of promotion campaign, mutual agreement…"
              value={terminateReason}
              onChange={(e) => setTerminateReason(e.target.value)}
              maxLength={500}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={terminateMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTerminate}
              disabled={terminateMutation.isPending}
              className="bg-destructive hover:bg-destructive/90 gap-2"
            >
              {terminateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Terminate Contract
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

// ─── TIMELINE EVENT ───────────────────────────────────────────────────────────

const EVENT_META: Record<
  string,
  { icon: React.ReactNode; label: string; color: string }
> = {
  created:         { icon: <FileText className="h-3.5 w-3.5" />, label: "Contract created", color: "bg-zinc-400" },
  activated:       { icon: <CirclePlay className="h-3.5 w-3.5" />, label: "Activated", color: "bg-emerald-500" },
  edited:          { icon: <Pencil className="h-3.5 w-3.5" />, label: "Edited", color: "bg-blue-400" },
  pdf_generated:   { icon: <Download className="h-3.5 w-3.5" />, label: "PDF generated", color: "bg-indigo-400" },
  signed_uploaded: { icon: <Upload className="h-3.5 w-3.5" />, label: "Signed copy uploaded", color: "bg-teal-500" },
  renewed:         { icon: <RotateCcw className="h-3.5 w-3.5" />, label: "Renewed", color: "bg-blue-500" },
  terminated:      { icon: <X className="h-3.5 w-3.5" />, label: "Terminated", color: "bg-red-500" },
  suspended:       { icon: <AlertTriangle className="h-3.5 w-3.5" />, label: "Suspended", color: "bg-amber-500" },
  expired:         { icon: <Clock className="h-3.5 w-3.5" />, label: "Auto-expired", color: "bg-red-400" },
  status_changed:  { icon: <RefreshCw className="h-3.5 w-3.5" />, label: "Status changed", color: "bg-zinc-400" },
  expiry_alerted:  { icon: <AlertCircle className="h-3.5 w-3.5" />, label: "Expiry alert sent", color: "bg-amber-400" },
};

type EventRow = {
  id: string;
  action: string;
  actorName: string | null | undefined;
  createdAt: Date | string;
  details?: Record<string, unknown> | null;
};

function TimelineEvent({ event: ev }: { event: EventRow }) {
  const meta = EVENT_META[ev.action] ?? {
    icon: <Clock className="h-3.5 w-3.5" />,
    label: ev.action.replace(/_/g, " "),
    color: "bg-zinc-400",
  };

  const details = ev.details as Record<string, unknown> | null | undefined;
  const from = details?.from as string | undefined;
  const to   = details?.to   as string | undefined;
  const reason = details?.reason as string | undefined;
  const note   = details?.note   as string | undefined;
  const updatedFields = details?.updatedFields as string[] | undefined;

  return (
    <li className="ml-4 relative pb-4">
      <div
        className={`absolute -left-[1.3rem] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-background text-white flex items-center justify-center ${meta.color}`}
      />
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className="text-sm font-medium capitalize">{meta.label}</p>
        {from && to && (
          <span className="text-xs text-muted-foreground">
            <span className="font-mono">{from}</span>
            {" → "}
            <span className="font-mono">{to}</span>
          </span>
        )}
      </div>
      {(ev.actorName || reason || note || updatedFields) && (
        <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
          {ev.actorName && ev.actorName !== "system:auto-expire" && (
            <p>by {ev.actorName}</p>
          )}
          {ev.actorName === "system:auto-expire" && <p className="italic">automatic</p>}
          {reason && <p className="italic">"{reason}"</p>}
          {note && <p className="italic">"{note}"</p>}
          {updatedFields && updatedFields.length > 0 && (
            <p>Fields: {updatedFields.join(", ")}</p>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground/70 mt-0.5">
        {new Date(ev.createdAt).toLocaleString()}
      </p>
    </li>
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
