import { useState, useRef, useMemo } from "react";
import {
  FileText, Printer, Copy, Trash2, Eye, Clock,
  CheckCircle2, Loader2, Building2, User, Globe,
  ClipboardList, History, Plus, Search, Mail,
  AlertCircle, Stamp, Languages, ShieldCheck, ScanEye,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { fmtDateLong } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const LETTER_TYPES = [
  { value: "salary_certificate", labelEn: "Salary Certificate", labelAr: "شهادة راتب", icon: "💰", color: "bg-emerald-50 border-emerald-200 text-emerald-800" },
  { value: "employment_verification", labelEn: "Employment Verification", labelAr: "تحقق من التوظيف", icon: "✅", color: "bg-blue-50 border-blue-200 text-blue-800" },
  { value: "noc", labelEn: "No Objection Certificate (NOC)", labelAr: "شهادة عدم ممانعة", icon: "📋", color: "bg-violet-50 border-violet-200 text-violet-800" },
  { value: "experience_letter", labelEn: "Experience Letter", labelAr: "خطاب خبرة", icon: "🏅", color: "bg-amber-50 border-amber-200 text-amber-800" },
  { value: "promotion_letter", labelEn: "Promotion Letter", labelAr: "خطاب ترقية", icon: "🚀", color: "bg-sky-50 border-sky-200 text-sky-800" },
  { value: "salary_transfer_letter", labelEn: "Salary Transfer Letter", labelAr: "خطاب تحويل الراتب", icon: "🏦", color: "bg-teal-50 border-teal-200 text-teal-800" },
  { value: "leave_approval_letter", labelEn: "Leave Approval Letter", labelAr: "خطاب الموافقة على الإجازة", icon: "🌴", color: "bg-orange-50 border-orange-200 text-orange-800" },
  { value: "warning_letter", labelEn: "Warning Letter", labelAr: "خطاب إنذار", icon: "⚠️", color: "bg-red-50 border-red-200 text-red-800" },
] as const;

type LetterTypeValue = typeof LETTER_TYPES[number]["value"];

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English", flag: "🇬🇧" },
  { value: "ar", label: "Arabic", flag: "🇴🇲" },
  { value: "both", label: "Bilingual", flag: "🌐" },
];

function LetterPreview({
  letter,
  companyName,
  companyNameAr,
  crNumber,
  companyAddress,
  companyPhone,
  companyEmail,
}: {
  letter: { bodyEn?: string | null; bodyAr?: string | null; language: string; subject?: string | null; referenceNumber?: string | null };
  companyName: string;
  companyNameAr?: string | null;
  crNumber?: string | null;
  companyAddress?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
}) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current?.innerHTML ?? "";
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>${letter.subject ?? "HR Letter"}</title>
          <style>
            @page { size: A4; margin: 20mm 25mm; }
            body { font-family: "Times New Roman", serif; font-size: 12pt; color: #000; line-height: 1.6; }
            .letterhead { border-bottom: 3px double #1a365d; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
            .letterhead-left { text-align: left; }
            .company-name { font-size: 16pt; font-weight: bold; color: #1a365d; }
            .company-name-ar { font-size: 14pt; font-weight: bold; color: #1a365d; direction: rtl; }
            .company-meta { font-size: 9pt; color: #555; margin-top: 4px; }
            .letter-body p { margin: 8px 0; }
            .letter-ar { direction: rtl; text-align: right; font-family: "Arial", sans-serif; }
            .divider { border-top: 2px solid #1a365d; margin: 24px 0; padding-top: 8px; text-align: center; font-size: 9pt; color: #666; letter-spacing: 0.15em; text-transform: uppercase; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <div class="letterhead">
            <div class="letterhead-left">
              <div class="company-name">${companyName}</div>
              ${companyNameAr ? `<div class="company-name-ar">${companyNameAr}</div>` : ""}
              <div class="company-meta">
                ${crNumber ? `CR: ${crNumber} &nbsp;|&nbsp; ` : ""}
                ${companyAddress ?? "Muscat, Sultanate of Oman"}
              </div>
              <div class="company-meta">
                ${companyPhone ? `Tel: ${companyPhone}` : ""}
                ${companyEmail ? ` &nbsp;|&nbsp; ${companyEmail}` : ""}
              </div>
            </div>
          </div>
          <div class="letter-body">${content}</div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  const handleCopy = () => {
    const text = [letter.bodyEn, letter.bodyAr].filter(Boolean).join("\n\n---\n\n");
    const stripped = text.replace(/<[^>]+>/g, "");
    navigator.clipboard.writeText(stripped).then(() => toast.success("Letter copied to clipboard"));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border border-border rounded-t-lg px-6 pt-5 pb-4 border-b-2 border-b-[#1a365d]">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-bold text-[#1a365d]">{companyName}</div>
            {companyNameAr && (
              <div className="text-base font-semibold text-[#1a365d] mt-0.5" dir="rtl">{companyNameAr}</div>
            )}
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {crNumber && <div>CR: {crNumber}</div>}
              <div>{companyAddress ?? "Muscat, Sultanate of Oman"}</div>
              {(companyPhone || companyEmail) && (
                <div>{[companyPhone, companyEmail].filter(Boolean).join(" · ")}</div>
              )}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#1a365d] flex items-center justify-center">
            <span className="text-white font-black text-sm">SP</span>
          </div>
        </div>
        {letter.referenceNumber && (
          <div className="mt-3 text-xs text-muted-foreground">
            Reference No. <span className="font-mono font-semibold text-foreground">{letter.referenceNumber}</span>
          </div>
        )}
      </div>

      <div
        ref={printRef}
        className="bg-white border border-t-0 border-border rounded-b-lg flex-1 overflow-y-auto px-6 py-5 prose prose-sm max-w-none"
        style={{ minHeight: "400px" }}
      >
        {letter.language === "both" ? (
          <>
            {letter.bodyEn && (
              <div className="mb-8" dangerouslySetInnerHTML={{ __html: letter.bodyEn }} />
            )}
            {letter.bodyEn && letter.bodyAr && (
              <div className="relative my-8 flex items-center gap-3 select-none" aria-hidden>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-border" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">Arabic</span>
                <div className="h-px flex-1 bg-gradient-to-r from-border via-border to-transparent" />
              </div>
            )}
            {letter.bodyAr && (
              <div
                dir="rtl"
                className="text-right font-[Arial,sans-serif]"
                dangerouslySetInnerHTML={{ __html: letter.bodyAr }}
              />
            )}
          </>
        ) : letter.language === "ar" ? (
          <div
            dir="rtl"
            className="text-right font-[Arial,sans-serif]"
            dangerouslySetInnerHTML={{ __html: letter.bodyAr ?? "" }}
          />
        ) : (
          <div dangerouslySetInnerHTML={{ __html: letter.bodyEn ?? "" }} />
        )}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <Button onClick={handlePrint} className="gap-2 flex-1">
          <Printer size={15} /> Print / Save as PDF
        </Button>
        <Button variant="outline" onClick={handleCopy} className="gap-2">
          <Copy size={15} /> Copy Text
        </Button>
      </div>
    </div>
  );
}

function DynamicFields({
  letterType,
  values,
  onChange,
}: {
  letterType: LetterTypeValue;
  values: Record<string, string>;
  onChange: (k: string, v: string) => void;
}) {
  const row = (label: string, key: string, placeholder?: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      <Input
        className="text-sm"
        value={values[key] ?? ""}
        onChange={(e) => onChange(key, e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
  switch (letterType) {
    case "noc":
      return (
        <div className="space-y-3">
          {row("Purpose of issuance *", "purposeOfIssuance", "e.g. visa processing, bank account opening")}
          {row("Destination / institution *", "destination")}
          {row("Validity until *", "validityUntil", "YYYY-MM-DD")}
        </div>
      );
    case "experience_letter":
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ce"
              aria-label="Currently employed"
              checked={values.currentlyEmployed === "true"}
              onChange={(e) => onChange("currentlyEmployed", e.target.checked ? "true" : "")}
            />
            <Label htmlFor="ce" className="text-sm font-normal">Currently employed</Label>
          </div>
          {values.currentlyEmployed !== "true" && row("Employment end date *", "employmentEndDate", "YYYY-MM-DD")}
        </div>
      );
    case "promotion_letter":
      return (
        <div className="space-y-3">
          {row("Previous title *", "previousTitle")}
          {row("New title *", "newTitle")}
          {row("Effective date *", "promotionEffectiveDate", "YYYY-MM-DD")}
          {row("Approval reference *", "approvalReference")}
        </div>
      );
    case "salary_transfer_letter":
      return (
        <div className="space-y-3">
          {row("Bank name *", "bankName")}
        </div>
      );
    case "leave_approval_letter":
      return (
        <div className="space-y-3">
          {row("Leave type *", "leaveType")}
          {row("Leave start *", "leaveStart", "YYYY-MM-DD")}
          {row("Leave end *", "leaveEnd", "YYYY-MM-DD")}
          {row("Expected return *", "returnDate", "YYYY-MM-DD")}
        </div>
      );
    case "warning_letter":
      return (
        <div className="space-y-3">
          {row("Incident date *", "incidentDate", "YYYY-MM-DD")}
          {row("Policy / category *", "policyCategory")}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Factual summary *</Label>
            <Textarea
              className="text-sm"
              rows={3}
              value={values.factualSummary ?? ""}
              onChange={(e) => onChange("factualSummary", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Corrective expectation *</Label>
            <Textarea
              className="text-sm"
              rows={3}
              value={values.correctiveExpectation ?? ""}
              onChange={(e) => onChange("correctiveExpectation", e.target.value)}
            />
          </div>
        </div>
      );
    case "employment_verification":
      return (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="incSal"
            aria-label="Include salary in letter"
            checked={values.includeSalary === "true"}
            onChange={(e) => onChange("includeSalary", e.target.checked ? "true" : "")}
          />
          <Label htmlFor="incSal" className="text-sm font-normal">Include salary in letter</Label>
        </div>
      );
    default:
      return null;
  }
}

export default function HRLettersPage() {
  const [activeTab, setActiveTab] = useState<"generate" | "history">("generate");
  const [selectedType, setSelectedType] = useState<LetterTypeValue | "">("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [language, setLanguage] = useState<"en" | "ar" | "both">("en");
  const [issuedTo, setIssuedTo] = useState("");
  const [purpose, setPurpose] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recipientPreset, setRecipientPreset] = useState<"twimc" | "bank" | "embassy" | "ministry" | "custom" | "">("");
  const [signatoryId, setSignatoryId] = useState<number | null>(null);
  const [dynamicFields, setDynamicFields] = useState<Record<string, string>>({});
  const [generatedLetter, setGeneratedLetter] = useState<any | null>(null);
  const [issuedSummary, setIssuedSummary] = useState<{ id: number; referenceNumber: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [viewLetter, setViewLetter] = useState<any | null>(null);
  const [previewTab, setPreviewTab] = useState<"preview" | "data">("preview");
  const [signatoryDialogOpen, setSignatoryDialogOpen] = useState(false);
  const [newSig, setNewSig] = useState({ nameEn: "", nameAr: "", titleEn: "", titleAr: "" });
  const [quickPreviewType, setQuickPreviewType] = useState<LetterTypeValue | null>(null);

  const { activeCompanyId } = useActiveCompany();
  const { data: employees } = trpc.hr.listEmployees.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );
  const { data: myCompany } = trpc.companies.myCompany.useQuery(activeCompanyId ? { companyId: activeCompanyId } : undefined);
  const { data: letters, refetch: refetchLetters } = trpc.hrLetters.listLetters.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: signatories, refetch: refetchSignatories } = trpc.hrLetters.listSignatories.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: templateMeta } = trpc.hrLetters.letterTemplateMeta.useQuery(undefined, { enabled: activeCompanyId != null });

  const effectivePurpose = useMemo(() => {
    if (selectedType === "noc") return (dynamicFields.purposeOfIssuance ?? "").trim();
    return purpose.trim();
  }, [selectedType, dynamicFields.purposeOfIssuance, purpose]);

  const fieldPayload = useMemo(() => {
    const base: Record<string, unknown> = { ...dynamicFields, issueDate };
    if (recipientPreset) base.recipientPreset = recipientPreset;
    if (dynamicFields.includeSalary === "true") base.includeSalary = true;
    if (dynamicFields.currentlyEmployed === "true") base.currentlyEmployed = true;
    return base;
  }, [dynamicFields, issueDate, recipientPreset]);

  const readinessInput = useMemo(() => {
    if (!activeCompanyId || !selectedType || !selectedEmployeeId || !signatoryId) return null;
    return {
      employeeId: selectedEmployeeId,
      letterType: selectedType as any,
      language,
      signatoryId,
      issuedTo: recipientPreset === "twimc" ? "To Whom It May Concern" : issuedTo,
      purpose: effectivePurpose,
      additionalNotes,
      fieldPayload,
      recipientPreset: recipientPreset || undefined,
      companyId: activeCompanyId,
      forOfficialIssue: true,
    };
  }, [activeCompanyId, selectedType, selectedEmployeeId, signatoryId, language, issuedTo, effectivePurpose, additionalNotes, fieldPayload, recipientPreset]);

  const { data: readiness } = trpc.hrLetters.validateReadiness.useQuery(readinessInput!, {
    enabled: readinessInput != null,
  });

  const previewInput = useMemo(() => {
    if (!readinessInput || readiness?.ok !== true) return null;
    const { forOfficialIssue: _f, ...rest } = readinessInput as { forOfficialIssue?: boolean } & Record<string, unknown>;
    return rest;
  }, [readinessInput, readiness?.ok]);

  const { data: previewData } = trpc.hrLetters.previewLetter.useQuery(previewInput as any, {
    enabled: previewInput != null && readiness?.ok === true,
  });

  const company = myCompany?.company;
  const selectedTypeMeta = LETTER_TYPES.find(t => t.value === selectedType);
  const selectedEmployee = employees?.find(e => e.id === selectedEmployeeId);

  const generateMutation = trpc.hrLetters.generateLetter.useMutation({
    onSuccess: (data) => {
      setGeneratedLetter(data);
      setIssuedSummary({
        id: data.id,
        referenceNumber: data.referenceNumber ?? "",
      });
      setIsGenerating(false);
      refetchLetters();
      toast.success("Official letter issued and saved");
    },
    onError: (err) => {
      setIsGenerating(false);
      toast.error(err.message || "Failed to issue letter");
    },
  });

  const deleteMutation = trpc.hrLetters.deleteLetter.useMutation({
    onSuccess: () => {
      refetchLetters();
      toast.success("Letter deleted");
    },
  });

  const recordExportMutation = trpc.hrLetters.recordLetterExport.useMutation();

  type LetterItem = NonNullable<typeof letters>[number];
  const [emailDialogLetter, setEmailDialogLetter] = useState<LetterItem | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSentSuccess, setEmailSentSuccess] = useState(false);
  const sendEmailMutation = trpc.hrLetters.sendLetterByEmail.useMutation({
    onSuccess: () => {
      setEmailSentSuccess(true);
      setIsSendingEmail(false);
      trpc.useUtils().hrLetters.listLetters.invalidate();
    },
    onError: (err) => {
      toast.error("Failed to send email: " + err.message);
      setIsSendingEmail(false);
    },
  });

  const createSignatoryMutation = trpc.hrLetters.createSignatory.useMutation({
    onSuccess: () => {
      toast.success("Signatory added");
      refetchSignatories();
      setSignatoryDialogOpen(false);
      setNewSig({ nameEn: "", nameAr: "", titleEn: "", titleAr: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleIssue = () => {
    if (!selectedType || !selectedEmployeeId || !signatoryId || !activeCompanyId) {
      toast.error("Select letter type, employee, and signatory");
      return;
    }
    if (readiness?.ok !== true) {
      toast.error(readiness?.missing?.join("; ") ?? "Complete required fields");
      return;
    }
    setIsGenerating(true);
    setGeneratedLetter(null);
    setIssuedSummary(null);
    generateMutation.mutate({
      employeeId: selectedEmployeeId,
      letterType: selectedType as any,
      language,
      signatoryId,
      issuedTo: recipientPreset === "twimc" ? "To Whom It May Concern" : issuedTo,
      purpose: effectivePurpose || undefined,
      additionalNotes: additionalNotes || undefined,
      fieldPayload,
      recipientPreset: recipientPreset || undefined,
      companyId: activeCompanyId,
    });
  };

  const handlePrintTracked = () => {
    if (generatedLetter?.id) {
      recordExportMutation.mutate({ id: generatedLetter.id, companyId: activeCompanyId ?? undefined });
    }
  };

  const filteredLetters = (letters ?? []).filter(l => {
    if (!historySearch) return true;
    const q = historySearch.toLowerCase();
    const emp = employees?.find(e => e.id === l.employeeId);
    const empName = emp ? `${emp.firstName} ${emp.lastName}`.toLowerCase() : "";
    return empName.includes(q) || l.letterType.includes(q) || (l.referenceNumber ?? "").toLowerCase().includes(q);
  });

  const letterTypeLabel = (type: string) => {
    const meta = LETTER_TYPES.find(t => t.value === type);
    return meta ? `${meta.icon} ${meta.labelEn}` : type;
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText size={22} className="text-primary" />
            HR Letter Generator
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
            Generate company-branded HR letters in English, Arabic, or bilingual format using employee records and approved templates.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs">
            <Languages size={11} /> Bilingual EN / AR
          </Badge>
          <Badge variant="outline" className="gap-1 text-xs">
            <Printer size={11} /> Print Ready
          </Badge>
          <Badge variant="outline" className="gap-1 text-xs">
            <ShieldCheck size={11} /> Approved Templates
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "generate" | "history")}>
        <TabsList>
          <TabsTrigger value="generate" className="gap-1.5">
            <Plus size={13} /> Generate Letter
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History size={13} /> Issuance Log
            {(letters?.length ?? 0) > 0 && (
              <span className="ml-1 bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {letters!.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-5">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ClipboardList size={15} className="text-primary" />
                    Step 1 — Letter type
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {LETTER_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => { setSelectedType(type.value); setDynamicFields({}); setIssuedSummary(null); setGeneratedLetter(null); }}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg border transition-all text-sm",
                        selectedType === type.value
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border hover:border-primary/40 hover:bg-muted/50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{type.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground leading-tight">{type.labelEn}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5" dir="rtl">{type.labelAr}</div>
                          {(() => {
                            const tm = templateMeta?.find((m) => m.code === type.value);
                            if (!tm) return null;
                            return (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {tm.supportsEn && <Badge variant="secondary" className="text-[9px] h-5 px-1">EN</Badge>}
                                {tm.supportsAr && <Badge variant="secondary" className="text-[9px] h-5 px-1">AR</Badge>}
                                {tm.supportsBilingual && <Badge variant="secondary" className="text-[9px] h-5 px-1">Bi</Badge>}
                                {tm.isSensitive && <Badge variant="destructive" className="text-[9px] h-5 px-1">Sensitive</Badge>}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            title="Quick preview template"
                            className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQuickPreviewType(type.value);
                            }}
                          >
                            <ScanEye size={14} />
                          </button>
                          {selectedType === type.value && <CheckCircle2 size={15} className="text-primary" />}
                        </div>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <User size={15} className="text-primary" />
                    Step 2 — Employee
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Employee</Label>
                  <Select
                    value={selectedEmployeeId?.toString() ?? ""}
                    onValueChange={(v) => setSelectedEmployeeId(Number(v))}
                  >
                    <SelectTrigger className="text-sm mt-1">
                      <SelectValue placeholder="Search employee…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(employees ?? []).map((emp) => (
                        <SelectItem key={emp.id} value={emp.id.toString()}>
                          <div className="flex flex-col">
                            <span>{emp.firstName} {emp.lastName}</span>
                            <span className="text-xs text-muted-foreground">
                              #{emp.employeeNumber ?? emp.id} · {emp.position ?? "—"} · {emp.department ?? "—"} · {emp.status}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Stamp size={15} className="text-primary" />
                    Signatory
                  </CardTitle>
                  <CardDescription>Authorised signatory for this company (required for official issue).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2">
                    <Select
                      value={signatoryId?.toString() ?? ""}
                      onValueChange={(v) => setSignatoryId(Number(v))}
                    >
                      <SelectTrigger className="text-sm flex-1">
                        <SelectValue placeholder="Select signatory…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(signatories ?? []).map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.nameEn} — {s.titleEn}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="sm" onClick={() => setSignatoryDialogOpen(true)}>
                      Add
                    </Button>
                  </div>
                  {(!signatories || signatories.length === 0) && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-md px-2 py-1.5">
                      Add at least one signatory before issuing letters.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Language & dates</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-1.5">
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setLanguage(opt.value as "en" | "ar" | "both")}
                        className={cn(
                          "px-2 py-2 rounded-md border text-xs font-medium transition-all text-center",
                          language === opt.value
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border hover:border-primary/40"
                        )}
                      >
                        <div className="text-base">{opt.flag}</div>
                        <div className="mt-0.5">{opt.label}</div>
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Issue date *</Label>
                    <Input type="date" className="text-sm" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Step 3 — Letter details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recipient preset</Label>
                    <Select value={recipientPreset || "none"} onValueChange={(v) => setRecipientPreset(v === "none" ? "" : (v as any))}>
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Optional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="twimc">To Whom It May Concern</SelectItem>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="embassy">Embassy</SelectItem>
                        <SelectItem value="ministry">Ministry</SelectItem>
                        <SelectItem value="custom">Custom (use field below)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {recipientPreset === "twimc" ? (
                    <Alert className="py-2">
                      <AlertTitle className="text-sm">Addressee</AlertTitle>
                      <AlertDescription className="text-xs">
                        This letter will use the standard salutation <strong>To Whom It May Concern</strong> in English and
                        <span dir="rtl"> إلى من يهمه الأمر</span> in Arabic.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Addressee</Label>
                      <Input
                        className="text-sm"
                        value={issuedTo}
                        onChange={(e) => setIssuedTo(e.target.value)}
                        placeholder="Bank / authority / embassy name…"
                      />
                    </div>
                  )}
                  {selectedType !== "noc" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Purpose</Label>
                      <Input className="text-sm" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Additional notes</Label>
                    <Textarea className="text-sm resize-none" rows={2} value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} />
                  </div>
                  {selectedType && (
                    <DynamicFields
                      letterType={selectedType}
                      values={dynamicFields}
                      onChange={(k, v) => setDynamicFields((prev) => ({ ...prev, [k]: v }))}
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Step 4 — Review & issue</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {readinessInput && readiness && (
                    <div
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm flex gap-2 items-start",
                        readiness.ok ? "border-emerald-200 bg-emerald-500/5 text-emerald-900 dark:text-emerald-100" : "border-amber-200 bg-amber-500/5"
                      )}
                    >
                      {readiness.ok ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
                      <div>
                        <div className="font-medium">{readiness.ok ? "Ready for official issue" : "Missing required data"}</div>
                        {!readiness.ok && (
                          <ul className="list-disc list-inside text-xs mt-1 text-muted-foreground">
                            {readiness.missing.map((m) => (
                              <li key={m}>{m}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                  {issuedSummary && generatedLetter && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-500/5 px-3 py-2.5 text-sm space-y-1">
                      <div className="font-semibold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                        <CheckCircle2 size={16} className="shrink-0" />
                        Letter issued successfully
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Reference <span className="font-mono font-semibold text-foreground">{issuedSummary.referenceNumber}</span>
                        {" · "}
                        Saved to the issuance log. Use Print or Copy below for this record.
                      </p>
                    </div>
                  )}
                  <Button
                    className="w-full gap-2 h-11 text-base"
                    onClick={handleIssue}
                    disabled={isGenerating || !selectedType || !selectedEmployeeId || !signatoryId || readiness?.ok !== true}
                  >
                    {isGenerating ? (
                      <><Loader2 size={16} className="animate-spin" /> Issuing…</>
                    ) : (
                      <><Stamp size={16} /> Issue official letter</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-7 flex flex-col gap-3 min-w-0">
              <div className="flex gap-2 border-b border-border pb-2">
                <Button type="button" variant={previewTab === "preview" ? "secondary" : "ghost"} size="sm" onClick={() => setPreviewTab("preview")}>
                  Preview
                </Button>
                <Button type="button" variant={previewTab === "data" ? "secondary" : "ghost"} size="sm" onClick={() => setPreviewTab("data")}>
                  Data used
                </Button>
              </div>

              {isGenerating ? (
                <div className="flex flex-col items-center justify-center min-h-[500px] border border-dashed border-border rounded-xl bg-muted/20 gap-4">
                  <Loader2 size={36} className="animate-spin text-primary" />
                  <p className="font-semibold text-foreground">Issuing official letter…</p>
                </div>
              ) : generatedLetter ? (
                <div onClick={handlePrintTracked}>
                  <LetterPreview
                    letter={generatedLetter}
                    companyName={company?.name ?? ""}
                    companyNameAr={company?.nameAr}
                    crNumber={company?.crNumber}
                    companyAddress={company?.address ?? company?.city}
                    companyPhone={company?.phone}
                    companyEmail={company?.email}
                  />
                </div>
              ) : previewTab === "data" ? (
                <Card className="min-h-[400px]">
                  <CardContent className="pt-4 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-[600px]">
                    {readinessInput
                      ? JSON.stringify({ fieldPayload, employeeId: selectedEmployeeId, signatoryId, language }, null, 2)
                      : "Select type, employee, and signatory to see the data snapshot inputs."}
                  </CardContent>
                </Card>
              ) : previewTab === "preview" && previewData?.ok && previewData.preview ? (
                <LetterPreview
                  letter={{
                    bodyEn: previewData.preview.bodyEn,
                    bodyAr: previewData.preview.bodyAr,
                    language: previewData.preview.language,
                    subject: previewData.preview.subject,
                    referenceNumber: previewData.preview.referenceNumber,
                  }}
                  companyName={company?.name ?? ""}
                  companyNameAr={company?.nameAr}
                  crNumber={company?.crNumber}
                  companyAddress={company?.address ?? company?.city}
                  companyPhone={company?.phone}
                  companyEmail={company?.email}
                />
              ) : (
                <div className="flex flex-col justify-center min-h-[500px] border border-dashed border-border rounded-xl bg-muted/10 gap-3 text-center px-8">
                  <FileText size={40} className="mx-auto text-primary/40" />
                  <p className="font-semibold text-foreground">Document readiness</p>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Select a letter type and employee to begin. Required company and signatory data are checked automatically.
                    The preview updates when mandatory data is complete.
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <History size={16} className="text-primary" />
                    Issuance log
                  </CardTitle>
                  <CardDescription className="mt-0.5">Reference, template version, and status</CardDescription>
                </div>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search…"
                    className="pl-8 text-sm w-56"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredLetters.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No letters yet</p>
                  <p className="text-sm mt-1">Switch to Generate to issue your first letter</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredLetters.map((letter) => {
                    const emp = employees?.find(e => e.id === letter.employeeId);
                    return (
                      <div
                        key={letter.id}
                        className="flex items-center gap-4 px-4 py-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{letterTypeLabel(letter.letterType)}</span>
                            <Badge variant="outline" className="text-[10px]">{letter.language.toUpperCase()}</Badge>
                            {"letterStatus" in letter && letter.letterStatus && (
                              <Badge variant="secondary" className="text-[10px]">{letter.letterStatus}</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-3">
                            <span>{emp ? `${emp.firstName} ${emp.lastName}` : `#${letter.employeeId}`}</span>
                            <span>{fmtDateLong(letter.createdAt)}</span>
                            {letter.referenceNumber && <span className="font-mono">{letter.referenceNumber}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2" onClick={() => setViewLetter(letter)}>
                            <Eye size={12} /> View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn("gap-1 text-xs h-7 px-2", "emailSentAt" in letter && letter.emailSentAt ? "text-emerald-600 border-emerald-300" : "")}
                            title={"emailSentAt" in letter && letter.emailSentAt ? `Last sent: ${new Date(letter.emailSentAt as string).toLocaleString()}` : "Send by email"}
                            onClick={() => {
                              const emp = employees?.find(e => e.id === letter.employeeId);
                              setEmailTo(emp?.email ?? "");
                              setEmailCc("");
                              setEmailSentSuccess(false);
                              setEmailDialogLetter(letter);
                            }}
                          >
                            <Mail size={12} />
                            {"emailSendCount" in letter && (letter.emailSendCount as number) > 0 && (
                              <span className="text-[9px] font-bold">{letter.emailSendCount as number}</span>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-xs h-7 px-2 text-destructive"
                            onClick={() => {
                              if (confirm("Delete this letter?")) deleteMutation.mutate({ id: letter.id, companyId: activeCompanyId ?? undefined });
                            }}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!viewLetter} onOpenChange={(o) => { if (!o) setViewLetter(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText size={16} />
              {viewLetter ? letterTypeLabel(viewLetter.letterType) : ""}
            </DialogTitle>
            <DialogDescription>
              {viewLetter?.referenceNumber && <>Reference No. {viewLetter.referenceNumber}</>}
            </DialogDescription>
          </DialogHeader>
          {viewLetter && (
            <LetterPreview
              letter={viewLetter}
              companyName={company?.name ?? ""}
              companyNameAr={company?.nameAr}
              crNumber={company?.crNumber}
              companyAddress={company?.address ?? company?.city}
              companyPhone={company?.phone}
              companyEmail={company?.email}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!emailDialogLetter} onOpenChange={(o) => { if (!o) { setEmailDialogLetter(null); setEmailTo(""); setEmailCc(""); setEmailSentSuccess(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail size={16} /> Send Letter by Email
            </DialogTitle>
            <DialogDescription>
              A secure, 7-day expiring link to view the letter will be embedded in the email.
            </DialogDescription>
          </DialogHeader>

          {emailSentSuccess ? (
            <div className="py-8 flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-emerald-600" />
              </div>
              <p className="font-semibold text-base">Email Sent Successfully</p>
              <p className="text-sm text-muted-foreground">
                The letter was sent to <strong>{emailTo}</strong>
                {emailCc.trim() ? <> with a copy to <strong>{emailCc}</strong></> : ""}
              </p>
              <Button className="mt-2" onClick={() => { setEmailDialogLetter(null); setEmailTo(""); setEmailCc(""); setEmailSentSuccess(false); }}>
                Done
              </Button>
            </div>
          ) : (
            <>
              {emailDialogLetter && (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex items-start gap-3">
                  <FileText size={16} className="mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{letterTypeLabel(emailDialogLetter.letterType)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(() => {
                        const emp = employees?.find(e => e.id === emailDialogLetter.employeeId);
                        return emp ? `${emp.firstName} ${emp.lastName}` : `Employee #${emailDialogLetter.employeeId}`;
                      })()}
                      {emailDialogLetter.referenceNumber && <span className="ml-2 font-mono">{emailDialogLetter.referenceNumber}</span>}
                    </p>
                    {"emailSentAt" in emailDialogLetter && emailDialogLetter.emailSentAt && (
                      <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                        <CheckCircle2 size={11} />
                        Previously sent {new Date(emailDialogLetter.emailSentAt as string).toLocaleString()}
                        {"emailSendCount" in emailDialogLetter && (emailDialogLetter.emailSendCount as number) > 1 && (
                          <span className="ml-1 text-muted-foreground">({emailDialogLetter.emailSendCount as number}x total)</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-4 py-1">
                <div className="space-y-1.5">
                  <Label htmlFor="email-to">Recipient Email <span className="text-destructive">*</span></Label>
                  <Input
                    id="email-to"
                    type="email"
                    placeholder="employee@example.com"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email-cc">
                    CC <span className="text-xs text-muted-foreground">(optional, comma-separated, max 5)</span>
                  </Label>
                  <Input
                    id="email-cc"
                    type="text"
                    placeholder="manager@example.com, hr@example.com"
                    value={emailCc}
                    onChange={(e) => setEmailCc(e.target.value)}
                  />
                </div>
                <div className="rounded-md bg-blue-50 border border-blue-100 px-3 py-2 flex items-start gap-2">
                  <ShieldCheck size={14} className="text-blue-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-700">
                    The email contains a secure, 7-day expiring link. The employee does not need to log in to view the letter.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => { setEmailDialogLetter(null); setEmailTo(""); setEmailCc(""); setEmailSentSuccess(false); }}>Cancel</Button>
                <Button
                  disabled={!emailTo || isSendingEmail}
                  onClick={() => {
                    if (!emailDialogLetter) return;
                    const ccList = emailCc.trim()
                      ? emailCc.split(",").map(s => s.trim()).filter(Boolean).slice(0, 5)
                      : undefined;
                    setIsSendingEmail(true);
                    sendEmailMutation.mutate({
                      id: emailDialogLetter.id,
                      employeeEmail: emailTo,
                      cc: ccList,
                      companyId: activeCompanyId ?? undefined,
                    });
                  }}
                >
                  {isSendingEmail ? <Loader2 size={14} className="animate-spin mr-1" /> : <Mail size={14} className="mr-1" />}
                  Send Email
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={signatoryDialogOpen} onOpenChange={setSignatoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add signatory</DialogTitle>
            <DialogDescription>English and Arabic names for bilingual letters.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Name (English) *" value={newSig.nameEn} onChange={(e) => setNewSig((s) => ({ ...s, nameEn: e.target.value }))} />
            <Input placeholder="Name (Arabic)" value={newSig.nameAr} onChange={(e) => setNewSig((s) => ({ ...s, nameAr: e.target.value }))} />
            <Input placeholder="Title (English) *" value={newSig.titleEn} onChange={(e) => setNewSig((s) => ({ ...s, titleEn: e.target.value }))} />
            <Input placeholder="Title (Arabic)" value={newSig.titleAr} onChange={(e) => setNewSig((s) => ({ ...s, titleAr: e.target.value }))} />
            <Button
              className="w-full"
              disabled={!newSig.nameEn.trim() || !newSig.titleEn.trim()}
              onClick={() =>
                createSignatoryMutation.mutate({
                  nameEn: newSig.nameEn.trim(),
                  nameAr: newSig.nameAr.trim() || undefined,
                  titleEn: newSig.titleEn.trim(),
                  titleAr: newSig.titleAr.trim() || undefined,
                  isDefault: true,
                  companyId: activeCompanyId ?? undefined,
                })
              }
            >
              Save signatory
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Preview Dialog — shows template structure with placeholder data */}
      <Dialog open={!!quickPreviewType} onOpenChange={(o) => { if (!o) setQuickPreviewType(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanEye size={16} />
              Template Preview — {quickPreviewType ? LETTER_TYPES.find(t => t.value === quickPreviewType)?.labelEn : ""}
            </DialogTitle>
            <DialogDescription>
              This is a sample of how the letter will look when issued. Actual employee and company data will replace the placeholders.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-start gap-2 text-sm text-amber-800 mb-2">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>Showing placeholder data. Select an employee and fill in the form to see a live preview with real data on the right panel.</span>
          </div>
          {quickPreviewType && (() => {
            const meta = LETTER_TYPES.find(t => t.value === quickPreviewType);
            const tm = templateMeta?.find(m => m.code === quickPreviewType);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Letter details</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{meta?.icon}</span>
                        <span className="font-medium">{meta?.labelEn}</span>
                      </div>
                      <div className="text-xs text-muted-foreground" dir="rtl">{meta?.labelAr}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Supported formats</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {tm?.supportsEn && <Badge variant="secondary">English</Badge>}
                      {tm?.supportsAr && <Badge variant="secondary">Arabic</Badge>}
                      {tm?.supportsBilingual && <Badge variant="secondary">Bilingual</Badge>}
                      {tm?.isSensitive && <Badge variant="destructive">Sensitive — restricted access</Badge>}
                    </div>

                  </div>
                </div>
                <div className="rounded-lg border border-border bg-white px-6 py-5 text-[#1a1a1a]">
                  {/* Letterhead */}
                  <div className="border-b-2 border-[#1a365d] pb-4 mb-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-base font-bold text-[#1a365d] leading-tight">Al Amri Investment and Services LLC</div>
                        <div className="text-[10px] text-[#1a365d] font-medium mt-0.5">شركة العامري للاستثمار والخدمات ذ.م.م</div>
                        <div className="text-xs text-gray-500 mt-1.5 space-y-0.5">
                          <div>CR: 1234567 · Muscat, Sultanate of Oman</div>
                          <div>+968 2412 3456 · hr@alamri-invest.om</div>
                        </div>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-[#1a365d] flex items-center justify-center shrink-0">
                        <span className="text-white font-black text-sm">AA</span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                      <span>Ref: <span className="font-mono font-semibold text-gray-700">HRL-{(quickPreviewType ?? "LTTR").toUpperCase().replace("_","-").slice(0,8)}-2025-00042</span></span>
                      <span>Date: {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</span>
                    </div>
                  </div>

                  {/* Per-type realistic body */}
                  <div className="text-sm leading-relaxed space-y-3">
                    {quickPreviewType === "salary_certificate" && (<>
                      <p className="font-semibold text-center text-base underline underline-offset-4">Salary Certificate</p>
                      <p>To Whom It May Concern,</p>
                      <p>This is to certify that <strong>Mr. Ahmed Khalid Al-Balushi</strong>, holder of Omani National ID No. <strong>12345678</strong>, is currently employed with <strong>Al Amri Investment and Services LLC</strong> as a <strong>Senior Accountant</strong> in the <strong>Finance Department</strong> since <strong>15 March 2021</strong>.</p>
                      <p>His monthly basic salary is <strong>OMR 750.000</strong> (Seven Hundred and Fifty Omani Rials), with a total monthly package including allowances of <strong>OMR 950.000</strong> (Nine Hundred and Fifty Omani Rials).</p>
                      <p>His salary is transferred monthly to Bank Muscat, Account No. <strong>0123456789</strong>.</p>
                      <p>This certificate is issued upon the employee's request for bank purposes and carries no further liability on the company.</p>
                    </>)}

                    {quickPreviewType === "employment_verification" && (<>
                      <p className="font-semibold text-center text-base underline underline-offset-4">Employment Verification Letter</p>
                      <p>To Whom It May Concern,</p>
                      <p>This is to confirm that <strong>Ms. Fatima Nasser Al-Rawahi</strong>, holder of Omani National ID No. <strong>98765432</strong>, is a full-time employee of <strong>Al Amri Investment and Services LLC</strong>.</p>
                      <table className="w-full text-xs border border-gray-200 rounded mt-2 mb-2">
                        <tbody>
                          {[
                            ["Job Title", "HR Coordinator"],
                            ["Department", "Human Resources"],
                            ["Employment Type", "Permanent"],
                            ["Start Date", "01 June 2019"],
                            ["Employment Status", "Active"],
                          ].map(([k, v]) => (
                            <tr key={k} className="border-b border-gray-100">
                              <td className="px-3 py-1.5 font-medium text-gray-600 w-40">{k}</td>
                              <td className="px-3 py-1.5 font-semibold">{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p>This letter is issued for official purposes as requested by the employee.</p>
                    </>)}

                    {quickPreviewType === "noc" && (<>
                      <p className="font-semibold text-center text-base underline underline-offset-4">No Objection Certificate</p>
                      <p>To Whom It May Concern,</p>
                      <p>This is to certify that <strong>Mr. Mohammed Salim Al-Hinai</strong>, Omani National ID No. <strong>11223344</strong>, employed as a <strong>Project Engineer</strong> in the <strong>Operations Department</strong> since <strong>10 January 2020</strong>, has applied for a visa to the <strong>United Kingdom</strong>.</p>
                      <p><strong>Al Amri Investment and Services LLC</strong> has no objection to Mr. Al-Hinai travelling to the United Kingdom for the purpose of <strong>attending a professional training programme</strong>. He is expected to resume his duties on <strong>01 June 2025</strong>.</p>
                      <p>This certificate is valid until <strong>31 May 2025</strong> and is issued solely for visa application purposes.</p>
                    </>)}

                    {quickPreviewType === "experience_letter" && (<>
                      <p className="font-semibold text-center text-base underline underline-offset-4">Experience Letter</p>
                      <p>To Whom It May Concern,</p>
                      <p>This is to certify that <strong>Ms. Aisha Hamad Al-Zadjali</strong>, Omani National ID No. <strong>55667788</strong>, was employed with <strong>Al Amri Investment and Services LLC</strong> as a <strong>Marketing Executive</strong> in the <strong>Marketing & Communications Department</strong> from <strong>01 September 2018</strong> to <strong>28 February 2025</strong> — a period of <strong>6 years and 6 months</strong>.</p>
                      <p>During her tenure, Ms. Al-Zadjali demonstrated exceptional dedication, strong analytical skills, and consistent professionalism. She was instrumental in leading the company's digital marketing initiatives and contributed significantly to brand growth across the GCC region.</p>
                      <p>We wish her continued success in her future career endeavours.</p>
                    </>)}

                    {quickPreviewType === "promotion_letter" && (<>
                      <p className="font-semibold text-center text-base underline underline-offset-4">Promotion Letter</p>
                      <p>Dear <strong>Mr. Khalid Yousuf Al-Maqbali</strong>,</p>
                      <p>We are pleased to inform you that, in recognition of your outstanding performance and valuable contributions to <strong>Al Amri Investment and Services LLC</strong>, you have been promoted to the position of <strong>Senior Operations Manager</strong> effective <strong>01 May 2025</strong>.</p>
                      <table className="w-full text-xs border border-gray-200 rounded mt-2 mb-2">
                        <tbody>
                          {[
                            ["Previous Title", "Operations Manager"],
                            ["New Title", "Senior Operations Manager"],
                            ["Department", "Operations"],
                            ["New Basic Salary", "OMR 1,200.000"],
                            ["Effective Date", "01 May 2025"],
                          ].map(([k, v]) => (
                            <tr key={k} className="border-b border-gray-100">
                              <td className="px-3 py-1.5 font-medium text-gray-600 w-40">{k}</td>
                              <td className="px-3 py-1.5 font-semibold">{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p>We congratulate you on this well-deserved achievement and look forward to your continued contributions.</p>
                    </>)}

                    {quickPreviewType === "salary_transfer_letter" && (<>
                      <p className="font-semibold text-center text-base underline underline-offset-4">Salary Transfer Letter</p>
                      <p>To: <strong>The Branch Manager</strong><br />Bank Dhofar — Ruwi Branch, Muscat</p>
                      <p>Dear Sir / Madam,</p>
                      <p>We request you to transfer the monthly salary of our employee, <strong>Mr. Saif Abdullah Al-Kindi</strong>, Omani National ID No. <strong>33445566</strong>, employed as a <strong>Logistics Coordinator</strong>, to the following bank account with effect from <strong>01 April 2025</strong>:</p>
                      <table className="w-full text-xs border border-gray-200 rounded mt-2 mb-2">
                        <tbody>
                          {[
                            ["Bank Name", "Bank Dhofar"],
                            ["Branch", "Ruwi, Muscat"],
                            ["Account Name", "Saif Abdullah Al-Kindi"],
                            ["Account No.", "0987654321"],
                            ["IBAN", "OM810080000000987654321"],
                            ["Monthly Salary", "OMR 620.000"],
                          ].map(([k, v]) => (
                            <tr key={k} className="border-b border-gray-100">
                              <td className="px-3 py-1.5 font-medium text-gray-600 w-40">{k}</td>
                              <td className="px-3 py-1.5 font-semibold">{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p>Kindly arrange the transfer accordingly and confirm receipt of this instruction.</p>
                    </>)}

                    {quickPreviewType === "leave_approval_letter" && (<>
                      <p className="font-semibold text-center text-base underline underline-offset-4">Leave Approval Letter</p>
                      <p>Dear <strong>Ms. Huda Rashid Al-Amri</strong>,</p>
                      <p>We are pleased to confirm that your annual leave request has been approved as per the details below:</p>
                      <table className="w-full text-xs border border-gray-200 rounded mt-2 mb-2">
                        <tbody>
                          {[
                            ["Employee", "Huda Rashid Al-Amri"],
                            ["Department", "Customer Relations"],
                            ["Leave Type", "Annual Leave"],
                            ["From", "10 May 2025"],
                            ["To", "24 May 2025"],
                            ["Total Days", "15 calendar days"],
                            ["Return Date", "25 May 2025"],
                          ].map(([k, v]) => (
                            <tr key={k} className="border-b border-gray-100">
                              <td className="px-3 py-1.5 font-medium text-gray-600 w-40">{k}</td>
                              <td className="px-3 py-1.5 font-semibold">{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p>Please ensure all pending tasks are handed over before your departure. We wish you a pleasant leave.</p>
                    </>)}

                    {quickPreviewType === "warning_letter" && (<>
                      <p className="font-semibold text-center text-base underline underline-offset-4">Official Warning Letter</p>
                      <p>Dear <strong>Mr. Tariq Nabil Al-Shukaili</strong>,</p>
                      <p>This letter serves as a <strong>formal written warning</strong> regarding your repeated unauthorised absences from work on <strong>14, 17, and 21 April 2025</strong>, in violation of Article 12 of the company's Employee Code of Conduct and the Oman Labour Law (Royal Decree No. 35/2003).</p>
                      <p>Despite a verbal warning issued on <strong>10 April 2025</strong>, the behaviour has continued. You are hereby required to provide a written explanation within <strong>three (3) working days</strong> of receiving this letter.</p>
                      <p className="font-medium text-red-700">Please be advised that any further violation may result in escalated disciplinary action, up to and including termination of employment.</p>
                      <p>This letter will be placed in your official personnel file.</p>
                    </>)}

                    <div className="mt-6 pt-4 border-t border-gray-200">
                      <p className="font-semibold text-sm">Ibrahim Khalid Al-Amri</p>
                      <p className="text-xs text-gray-600">General Manager — Human Resources</p>
                      <p className="text-xs text-gray-400 mt-0.5">Al Amri Investment and Services LLC · Muscat, Sultanate of Oman</p>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setQuickPreviewType(null)}>Close</Button>
                  <Button onClick={() => {
                    setSelectedType(quickPreviewType);
                    setDynamicFields({});
                    setIssuedSummary(null);
                    setGeneratedLetter(null);
                    setQuickPreviewType(null);
                    setActiveTab("generate");
                  }}>
                    <Stamp size={14} className="mr-1.5" /> Use this template
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
