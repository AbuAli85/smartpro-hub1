import { useState, useRef } from "react";
import {
  FileText, Wand2, Printer, Copy, Trash2, Eye, Clock,
  ChevronDown, CheckCircle2, Loader2, Building2, User, Globe,
  Languages, ClipboardList, History, Plus, Search,
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

// ─── Letter type metadata ─────────────────────────────────────────────────────
const LETTER_TYPES = [
  {
    value: "salary_certificate",
    labelEn: "Salary Certificate",
    labelAr: "شهادة راتب",
    icon: "💰",
    color: "bg-emerald-50 border-emerald-200 text-emerald-800",
    desc: "Official confirmation of monthly salary for banks, embassies, or government authorities",
  },
  {
    value: "employment_verification",
    labelEn: "Employment Verification",
    labelAr: "تحقق من التوظيف",
    icon: "✅",
    color: "bg-blue-50 border-blue-200 text-blue-800",
    desc: "Confirms the employee is currently employed at the company",
  },
  {
    value: "noc",
    labelEn: "No Objection Certificate (NOC)",
    labelAr: "شهادة عدم ممانعة",
    icon: "📋",
    color: "bg-violet-50 border-violet-200 text-violet-800",
    desc: "States the company has no objection to the employee's stated purpose",
  },
  {
    value: "experience_letter",
    labelEn: "Experience Letter",
    labelAr: "خطاب خبرة",
    icon: "🏅",
    color: "bg-amber-50 border-amber-200 text-amber-800",
    desc: "Confirms the employee's period of service and role upon departure",
  },
  {
    value: "promotion_letter",
    labelEn: "Promotion Letter",
    labelAr: "خطاب ترقية",
    icon: "🚀",
    color: "bg-sky-50 border-sky-200 text-sky-800",
    desc: "Official notification of promotion to a new position",
  },
  {
    value: "salary_transfer_letter",
    labelEn: "Salary Transfer Letter",
    labelAr: "خطاب تحويل الراتب",
    icon: "🏦",
    color: "bg-teal-50 border-teal-200 text-teal-800",
    desc: "Authorises the bank to receive the employee's salary transfer",
  },
  {
    value: "leave_approval_letter",
    labelEn: "Leave Approval Letter",
    labelAr: "خطاب الموافقة على الإجازة",
    icon: "🌴",
    color: "bg-orange-50 border-orange-200 text-orange-800",
    desc: "Official approval of the employee's leave request",
  },
  {
    value: "warning_letter",
    labelEn: "Warning Letter",
    labelAr: "خطاب إنذار",
    icon: "⚠️",
    color: "bg-red-50 border-red-200 text-red-800",
    desc: "Formal disciplinary warning issued to the employee",
  },
] as const;

type LetterTypeValue = typeof LETTER_TYPES[number]["value"];

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English Only", flag: "🇬🇧" },
  { value: "ar", label: "Arabic Only (عربي فقط)", flag: "🇴🇲" },
  { value: "both", label: "Bilingual (EN + AR)", flag: "🌐" },
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
            .letterhead-right { text-align: right; }
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
            <div class="letterhead-right">
              <img src="/favicon.ico" style="width:40px;height:40px;opacity:0.3" onerror="this.style.display='none'" />
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
      {/* Letterhead */}
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
          <div className="flex items-center gap-2">
            <div className="w-12 h-12 rounded-xl bg-[#1a365d] flex items-center justify-center">
              <span className="text-white font-black text-sm">SP</span>
            </div>
          </div>
        </div>
        {letter.referenceNumber && (
          <div className="mt-3 text-xs text-muted-foreground">
            Ref: <span className="font-mono font-semibold text-foreground">{letter.referenceNumber}</span>
          </div>
        )}
      </div>

      {/* Letter body */}
      <div
        ref={printRef}
        className="bg-white border border-t-0 border-border rounded-b-lg flex-1 overflow-y-auto px-6 py-5 prose prose-sm max-w-none"
        style={{ minHeight: "400px" }}
      >
        {letter.language === "both" ? (
          <>
            {letter.bodyEn && (
              <div
                className="mb-8"
                dangerouslySetInnerHTML={{ __html: letter.bodyEn }}
              />
            )}
            {letter.bodyEn && letter.bodyAr && (
              <hr className="border-muted my-6" />
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

      {/* Action bar */}
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HRLettersPage() {
  const [activeTab, setActiveTab] = useState<"generate" | "history">("generate");
  const [selectedType, setSelectedType] = useState<LetterTypeValue | "">("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [language, setLanguage] = useState<"en" | "ar" | "both">("en");
  const [issuedTo, setIssuedTo] = useState("");
  const [purpose, setPurpose] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [generatedLetter, setGeneratedLetter] = useState<any | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [viewLetter, setViewLetter] = useState<any | null>(null);

  // Data
  const { data: employees } = trpc.hr.listEmployees.useQuery({ status: "active" });
  const { data: myCompany } = trpc.companies.myCompany.useQuery();
  const { data: letters, refetch: refetchLetters } = trpc.hrLetters.listLetters.useQuery();

  const generateMutation = trpc.hrLetters.generateLetter.useMutation({
    onSuccess: (data) => {
      setGeneratedLetter(data);
      setIsGenerating(false);
      refetchLetters();
      toast.success("Letter generated successfully");
    },
    onError: (err) => {
      setIsGenerating(false);
      toast.error("Failed to generate letter: " + err.message);
    },
  });

  const deleteMutation = trpc.hrLetters.deleteLetter.useMutation({
    onSuccess: () => {
      refetchLetters();
      toast.success("Letter deleted");
    },
  });

  const handleGenerate = () => {
    if (!selectedType) { toast.error("Please select a letter type"); return; }
    if (!selectedEmployeeId) { toast.error("Please select an employee"); return; }
    setIsGenerating(true);
    setGeneratedLetter(null);
    generateMutation.mutate({
      employeeId: selectedEmployeeId,
      letterType: selectedType as any,
      language,
      issuedTo: issuedTo || undefined,
      purpose: purpose || undefined,
      additionalNotes: additionalNotes || undefined,
    });
  };

  const company = myCompany?.company;
  const selectedTypeMeta = LETTER_TYPES.find(t => t.value === selectedType);
  const selectedEmployee = employees?.find(e => e.id === selectedEmployeeId);

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

  const languageLabel = (lang: string) => {
    const opt = LANGUAGE_OPTIONS.find(o => o.value === lang);
    return opt ? `${opt.flag} ${opt.label}` : lang;
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText size={22} className="text-primary" />
            HR Letter Generator
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Generate official, Oman-standard HR letters for employees — powered by AI
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs">
            <Wand2 size={11} /> AI-Powered
          </Badge>
          <Badge variant="outline" className="gap-1 text-xs">
            <Languages size={11} /> Bilingual EN / AR
          </Badge>
          <Badge variant="outline" className="gap-1 text-xs">
            <Printer size={11} /> Print Ready
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="generate" className="gap-1.5">
            <Plus size={13} /> Generate Letter
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History size={13} /> Letter History
            {(letters?.length ?? 0) > 0 && (
              <span className="ml-1 bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {letters!.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Generate Tab ── */}
        <TabsContent value="generate" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left: Form */}
            <div className="lg:col-span-2 space-y-5">
              {/* Step 1: Letter Type */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ClipboardList size={15} className="text-primary" />
                    Step 1 — Select Letter Type
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {LETTER_TYPES.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setSelectedType(type.value)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all text-sm ${
                        selectedType === type.value
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border hover:border-primary/40 hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{type.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground leading-tight">{type.labelEn}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5" dir="rtl">{type.labelAr}</div>
                        </div>
                        {selectedType === type.value && (
                          <CheckCircle2 size={15} className="text-primary shrink-0" />
                        )}
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>

              {/* Step 2: Employee & Options */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <User size={15} className="text-primary" />
                    Step 2 — Employee & Options
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Employee picker */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Employee</Label>
                    <Select
                      value={selectedEmployeeId?.toString() ?? ""}
                      onValueChange={(v) => setSelectedEmployeeId(Number(v))}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Select employee…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(employees ?? []).map((emp) => (
                          <SelectItem key={emp.id} value={emp.id.toString()}>
                            <div className="flex flex-col">
                              <span>{emp.firstName} {emp.lastName}</span>
                              <span className="text-xs text-muted-foreground">{emp.position ?? emp.department ?? "—"}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Language */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Language</Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {LANGUAGE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setLanguage(opt.value as any)}
                          className={`px-2 py-2 rounded-md border text-xs font-medium transition-all text-center ${
                            language === opt.value
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border hover:border-primary/40"
                          }`}
                        >
                          <div className="text-base">{opt.flag}</div>
                          <div className="mt-0.5 leading-tight">{opt.value === "both" ? "Bilingual" : opt.value === "en" ? "English" : "Arabic"}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Addressed to */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Addressed To (optional)</Label>
                    <Input
                      value={issuedTo}
                      onChange={e => setIssuedTo(e.target.value)}
                      placeholder="e.g. Bank Muscat, Royal Oman Police, Embassy…"
                      className="text-sm"
                    />
                  </div>

                  {/* Purpose */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Purpose / Reason (optional)</Label>
                    <Input
                      value={purpose}
                      onChange={e => setPurpose(e.target.value)}
                      placeholder="e.g. Visa application, bank account opening…"
                      className="text-sm"
                    />
                  </div>

                  {/* Additional notes */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Additional Notes (optional)</Label>
                    <Textarea
                      value={additionalNotes}
                      onChange={e => setAdditionalNotes(e.target.value)}
                      placeholder="Any specific details to include in the letter…"
                      className="text-sm resize-none"
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Generate button */}
              <Button
                className="w-full gap-2 h-11 text-base"
                onClick={handleGenerate}
                disabled={isGenerating || !selectedType || !selectedEmployeeId}
              >
                {isGenerating ? (
                  <><Loader2 size={16} className="animate-spin" /> Generating Letter…</>
                ) : (
                  <><Wand2 size={16} /> Generate Letter</>
                )}
              </Button>

              {/* Summary card */}
              {selectedType && selectedEmployee && (
                <Card className="bg-muted/30 border-dashed">
                  <CardContent className="pt-4 pb-3 space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <FileText size={12} />
                      <span className="font-medium text-foreground">{selectedTypeMeta?.labelEn}</span>
                      <span>·</span>
                      <span dir="rtl">{selectedTypeMeta?.labelAr}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User size={12} />
                      <span>{selectedEmployee.firstName} {selectedEmployee.lastName}</span>
                      {selectedEmployee.position && <span>· {selectedEmployee.position}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe size={12} />
                      <span>{LANGUAGE_OPTIONS.find(o => o.value === language)?.label}</span>
                    </div>
                    {company && (
                      <div className="flex items-center gap-2">
                        <Building2 size={12} />
                        <span>{company.name}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right: Preview */}
            <div className="lg:col-span-3">
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[500px] border border-dashed border-border rounded-xl bg-muted/20 gap-4">
                  <Loader2 size={36} className="animate-spin text-primary" />
                  <div className="text-center">
                    <p className="font-semibold text-foreground">Generating your letter…</p>
                    <p className="text-sm text-muted-foreground mt-1">AI is drafting the official letter with all employee and company details</p>
                  </div>
                </div>
              ) : generatedLetter ? (
                <LetterPreview
                  letter={generatedLetter}
                  companyName={company?.name ?? ""}
                  companyNameAr={company?.nameAr}
                  crNumber={company?.crNumber}
                  companyAddress={company?.address ?? company?.city}
                  companyPhone={company?.phone}
                  companyEmail={company?.email}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full min-h-[500px] border border-dashed border-border rounded-xl bg-muted/20 gap-3 text-center px-8">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <FileText size={28} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Letter Preview</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Select a letter type and employee, then click <strong>Generate Letter</strong> to create an official HR letter with your company letterhead.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 w-full max-w-xs">
                    {LETTER_TYPES.slice(0, 4).map(t => (
                      <div key={t.value} className={`text-xs px-2 py-1.5 rounded-md border ${t.color} text-center`}>
                        {t.icon} {t.labelEn}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── History Tab ── */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <History size={16} className="text-primary" />
                    Generated Letters
                  </CardTitle>
                  <CardDescription className="mt-0.5">
                    All previously generated HR letters for your company
                  </CardDescription>
                </div>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    placeholder="Search letters…"
                    className="pl-8 text-sm w-56"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredLetters.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No letters generated yet</p>
                  <p className="text-sm mt-1">Switch to the Generate tab to create your first letter</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredLetters.map((letter) => {
                    const emp = employees?.find(e => e.id === letter.employeeId);
                    const typeMeta = LETTER_TYPES.find(t => t.value === letter.letterType);
                    return (
                      <div
                        key={letter.id}
                        className="flex items-center gap-4 px-4 py-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                      >
                        <div className="text-xl w-8 text-center shrink-0">{typeMeta?.icon ?? "📄"}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-foreground">{typeMeta?.labelEn ?? letter.letterType}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {LANGUAGE_OPTIONS.find(o => o.value === letter.language)?.flag} {letter.language.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <User size={10} />
                              {emp ? `${emp.firstName} ${emp.lastName}` : `Employee #${letter.employeeId}`}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock size={10} />
                              {new Date(letter.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                            {letter.referenceNumber && (
                              <span className="font-mono text-[10px]">{letter.referenceNumber}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-xs h-7 px-2"
                            onClick={() => setViewLetter(letter)}
                          >
                            <Eye size={12} /> View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-xs h-7 px-2 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm("Delete this letter?")) deleteMutation.mutate({ id: letter.id });
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

      {/* View Letter Dialog */}
      <Dialog open={!!viewLetter} onOpenChange={(o) => { if (!o) setViewLetter(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText size={16} />
              {viewLetter ? (LETTER_TYPES.find(t => t.value === viewLetter.letterType)?.labelEn ?? viewLetter.letterType) : ""}
            </DialogTitle>
            <DialogDescription>
              {viewLetter?.referenceNumber && `Ref: ${viewLetter.referenceNumber}`}
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
    </div>
  );
}
