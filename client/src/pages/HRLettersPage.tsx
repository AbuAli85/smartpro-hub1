import { useState, useRef, useMemo } from "react";
import {
  FileText, Printer, Copy, Trash2, Eye, Clock,
  CheckCircle2, Loader2, Building2, User, Globe,
  ClipboardList, History, Plus, Search, Mail,
  AlertCircle, Stamp, Languages, ShieldCheck,
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
            .divider { border-top: 1px solid #ccc; margin: 20px 0; }
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
            {letter.bodyEn && letter.bodyAr && <hr className="border-muted my-6" />}
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
          {row("Destination / detail *", "destination")}
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [viewLetter, setViewLetter] = useState<any | null>(null);
  const [previewTab, setPreviewTab] = useState<"preview" | "data">("preview");
  const [signatoryDialogOpen, setSignatoryDialogOpen] = useState(false);
  const [newSig, setNewSig] = useState({ nameEn: "", nameAr: "", titleEn: "", titleAr: "" });

  const { activeCompanyId } = useActiveCompany();
  const { data: employees } = trpc.hr.listEmployees.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );
  const { data: myCompany } = trpc.companies.myCompany.useQuery(activeCompanyId ? { companyId: activeCompanyId } : undefined);
  const { data: letters, refetch: refetchLetters } = trpc.hrLetters.listLetters.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: signatories, refetch: refetchSignatories } = trpc.hrLetters.listSignatories.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: templateMeta } = trpc.hrLetters.letterTemplateMeta.useQuery(undefined, { enabled: activeCompanyId != null });

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
      purpose,
      additionalNotes,
      fieldPayload,
      recipientPreset: recipientPreset || undefined,
      companyId: activeCompanyId,
      forOfficialIssue: true,
    };
  }, [activeCompanyId, selectedType, selectedEmployeeId, signatoryId, language, issuedTo, purpose, additionalNotes, fieldPayload, recipientPreset]);

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
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const sendEmailMutation = trpc.hrLetters.sendLetterByEmail.useMutation({
    onSuccess: () => {
      toast.success("Letter sent by email successfully");
      setEmailDialogLetter(null);
      setEmailTo("");
      setIsSendingEmail(false);
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
    generateMutation.mutate({
      employeeId: selectedEmployeeId,
      letterType: selectedType as any,
      language,
      signatoryId,
      issuedTo: recipientPreset === "twimc" ? "To Whom It May Concern" : issuedTo,
      purpose: purpose || undefined,
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
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 space-y-5">
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
                      onClick={() => { setSelectedType(type.value); setDynamicFields({}); }}
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
                        {selectedType === type.value && <CheckCircle2 size={15} className="text-primary shrink-0" />}
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Addressee</Label>
                    <Input
                      className="text-sm"
                      value={issuedTo}
                      onChange={(e) => setIssuedTo(e.target.value)}
                      disabled={recipientPreset === "twimc"}
                      placeholder={recipientPreset === "twimc" ? "To Whom It May Concern" : "Bank / authority / custom…"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Purpose</Label>
                    <Input className="text-sm" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
                  </div>
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

            <div className="lg:col-span-3 flex flex-col gap-3">
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
                            className="gap-1 text-xs h-7 px-2"
                            onClick={() => {
                              const emp = employees?.find(e => e.id === letter.employeeId);
                              setEmailTo(emp?.email ?? "");
                              setEmailDialogLetter(letter);
                            }}
                          >
                            <Mail size={12} />
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

      <Dialog open={!!emailDialogLetter} onOpenChange={(o) => { if (!o) { setEmailDialogLetter(null); setEmailTo(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail size={16} /> Send Letter by Email
            </DialogTitle>
            <DialogDescription>
              The email includes a time-limited secure link to view and print the letter when possible, or a SmartPRO sign-in link as a fallback.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="email-to">Recipient Email</Label>
              <Input id="email-to" type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setEmailDialogLetter(null); setEmailTo(""); }}>Cancel</Button>
            <Button
              disabled={!emailTo || isSendingEmail}
              onClick={() => {
                if (!emailDialogLetter) return;
                setIsSendingEmail(true);
                sendEmailMutation.mutate({ id: emailDialogLetter.id, employeeEmail: emailTo, companyId: activeCompanyId ?? undefined });
              }}
            >
              {isSendingEmail ? <Loader2 size={14} className="animate-spin mr-1" /> : <Mail size={14} className="mr-1" />}
              Send Email
            </Button>
          </div>
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
    </div>
  );
}
