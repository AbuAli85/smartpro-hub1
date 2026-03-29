import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Upload, FileText, User, Calendar, Building2,
  CheckCircle2, AlertCircle, Loader2, Info
} from "lucide-react";

const PERMIT_TYPES = [
  { value: "new_work_permit", label: "New Work Permit" },
  { value: "renewal", label: "Renewal" },
  { value: "transfer", label: "Transfer" },
  { value: "cancellation", label: "Cancellation" },
  { value: "emergency", label: "Emergency" },
];

const OCCUPATION_CODES = [
  { code: "2141", title: "Civil Engineer" },
  { code: "2143", title: "Electrical Engineer" },
  { code: "2144", title: "Mechanical Engineer" },
  { code: "2512", title: "Software Developer" },
  { code: "3115", title: "Building Inspector" },
  { code: "4110", title: "General Office Clerk" },
  { code: "5120", title: "Cook" },
  { code: "7111", title: "Building Frame Worker" },
  { code: "8111", title: "Mining Plant Operator" },
  { code: "9112", title: "Cleaner" },
];

type Step = "employee" | "permit" | "review" | "success";

export default function WorkforcePermitUploadPage() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("employee");
  const [form, setForm] = useState({
    // Employee identification
    employeeId: "",
    civilId: "",
    // Permit details
    permitNumber: "",
    permitType: "new_work_permit",
    occupationCode: "",
    occupationTitle: "",
    issueDate: "",
    expiryDate: "",
    sponsorName: "",
    sponsorId: "",
    // Location
    governorate: "",
    wilayat: "",
  });

  const utils = trpc.useUtils();

  const uploadMutation = trpc.workforce.workPermits.createFromCertificate.useMutation({
    onSuccess: () => {
      toast.success("Work permit uploaded and saved successfully");
      utils.workforce.workPermits.list.invalidate();
      utils.workforce.employees.list.invalidate();
      setStep("success");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to upload work permit");
    },
  });

  const update = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const canProceedStep1 = form.employeeId.trim() !== "" || form.civilId.trim() !== "";
  const canProceedStep2 =
    form.permitNumber.trim() !== "" &&
    form.expiryDate !== "" &&
    form.permitType !== "";

  const handleSubmit = () => {
    uploadMutation.mutate({
      fileUrl: "manual-entry",
      fileKey: `manual-${Date.now()}`,
      parsed: {
        civilId: form.civilId || `EMP-${form.employeeId}`,
        fullNameEn: `Employee ${form.employeeId}`,
        workPermitNumber: form.permitNumber,
        occupationCode: form.occupationCode || undefined,
        occupationTitleEn: form.occupationTitle || undefined,
        issueDate: form.issueDate || undefined,
        expiryDate: form.expiryDate,
        companyNameEn: form.sponsorName || undefined,
        crNumber: form.sponsorId || undefined,
        workLocationGovernorate: form.governorate || undefined,
        workLocationWilayat: form.wilayat || undefined,
      },
    });
  };

  const steps: { id: Step; label: string; icon: typeof User }[] = [
    { id: "employee", label: "Employee", icon: User },
    { id: "permit", label: "Permit Details", icon: FileText },
    { id: "review", label: "Review", icon: CheckCircle2 },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  if (step === "success") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center shadow-lg">
          <CardContent className="pt-10 pb-8 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Permit Uploaded</h2>
            <p className="text-muted-foreground text-sm">
              Work permit <span className="font-mono font-semibold text-foreground">{form.permitNumber}</span> has been
              successfully recorded and linked to the employee profile.
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <Button variant="outline" onClick={() => navigate("/workforce/permits")}>
                View All Permits
              </Button>
              <Button onClick={() => { setStep("employee"); setForm({ employeeId: "", civilId: "", permitNumber: "", permitType: "new_work_permit", occupationCode: "", occupationTitle: "", issueDate: "", expiryDate: "", sponsorName: "", sponsorId: "", governorate: "", wilayat: "" }); }}>
                Upload Another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/workforce/permits")} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Permits
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">Upload MOL Work Permit Certificate</h1>
            <p className="text-xs text-muted-foreground">Register a new permit from the Ministry of Labour portal</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Progress Steps */}
        <div className="flex flex-wrap items-center gap-0">
          {steps.map((s, idx) => (
            <div key={s.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                  idx < currentStepIndex
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : idx === currentStepIndex
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-background border-muted-foreground/30 text-muted-foreground"
                }`}>
                  {idx < currentStepIndex ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <s.icon className="w-4 h-4" />
                  )}
                </div>
                <span className={`text-xs font-medium ${idx === currentStepIndex ? "text-primary" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mb-5 mx-2 transition-colors ${idx < currentStepIndex ? "bg-emerald-500" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Employee Identification */}
        {step === "employee" && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="w-5 h-5 text-primary" />
                Employee Identification
              </CardTitle>
              <CardDescription>
                Enter the employee's system ID or Civil ID to link this permit to their profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 flex gap-2 text-sm text-blue-800">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <span>At least one identifier is required. Civil ID is preferred for MOL alignment.</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="employeeId">Employee System ID</Label>
                  <Input
                    id="employeeId"
                    placeholder="e.g. 42"
                    value={form.employeeId}
                    onChange={(e) => update("employeeId", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Internal platform employee ID</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="civilId">Civil ID (National ID)</Label>
                  <Input
                    id="civilId"
                    placeholder="e.g. 12345678"
                    value={form.civilId}
                    onChange={(e) => update("civilId", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Oman Civil ID number</p>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={() => setStep("permit")} disabled={!canProceedStep1} className="gap-2">
                  Continue to Permit Details
                  <ArrowLeft className="w-4 h-4 rotate-180" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Permit Details */}
        {step === "permit" && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="w-5 h-5 text-primary" />
                Work Permit Details
              </CardTitle>
              <CardDescription>
                Enter the permit information exactly as it appears on the MOL certificate.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Core permit fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="permitNumber">
                    Permit Number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="permitNumber"
                    placeholder="e.g. WP-2024-001234"
                    value={form.permitNumber}
                    onChange={(e) => update("permitNumber", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Permit Type <span className="text-destructive">*</span></Label>
                  <Select value={form.permitType} onValueChange={(v) => update("permitType", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERMIT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Occupation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Occupation Code</Label>
                  <Select value={form.occupationCode} onValueChange={(v) => {
                    const found = OCCUPATION_CODES.find((o) => o.code === v);
                    update("occupationCode", v);
                    if (found) update("occupationTitle", found.title);
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select occupation" />
                    </SelectTrigger>
                    <SelectContent>
                      {OCCUPATION_CODES.map((o) => (
                        <SelectItem key={o.code} value={o.code}>{o.code} — {o.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="occupationTitle">Occupation Title (EN)</Label>
                  <Input
                    id="occupationTitle"
                    placeholder="e.g. Software Developer"
                    value={form.occupationTitle}
                    onChange={(e) => update("occupationTitle", e.target.value)}
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="issueDate">Issue Date</Label>
                  <Input
                    id="issueDate"
                    type="date"
                    value={form.issueDate}
                    onChange={(e) => update("issueDate", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiryDate">
                    Expiry Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="expiryDate"
                    type="date"
                    value={form.expiryDate}
                    onChange={(e) => update("expiryDate", e.target.value)}
                  />
                </div>
              </div>

              {/* Sponsor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sponsorName">Sponsor / Employer Name</Label>
                  <Input
                    id="sponsorName"
                    placeholder="e.g. Al Noor Trading LLC"
                    value={form.sponsorName}
                    onChange={(e) => update("sponsorName", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sponsorId">Sponsor ID / CR Number</Label>
                  <Input
                    id="sponsorId"
                    placeholder="e.g. 1234567"
                    value={form.sponsorId}
                    onChange={(e) => update("sponsorId", e.target.value)}
                  />
                </div>
              </div>

              {/* Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="governorate">Governorate</Label>
                  <Input
                    id="governorate"
                    placeholder="e.g. Muscat"
                    value={form.governorate}
                    onChange={(e) => update("governorate", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wilayat">Wilayat</Label>
                  <Input
                    id="wilayat"
                    placeholder="e.g. Bausher"
                    value={form.wilayat}
                    onChange={(e) => update("wilayat", e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep("employee")} className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
                <Button onClick={() => setStep("review")} disabled={!canProceedStep2} className="gap-2">
                  Review & Submit
                  <ArrowLeft className="w-4 h-4 rotate-180" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Review */}
        {step === "review" && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                Review & Confirm
              </CardTitle>
              <CardDescription>
                Verify all details before submitting. This will create a new work permit record.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Employee section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  <User className="w-4 h-4" />
                  Employee
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {form.employeeId && (
                    <div className="flex justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-muted-foreground">System ID</span>
                      <span className="font-medium">{form.employeeId}</span>
                    </div>
                  )}
                  {form.civilId && (
                    <div className="flex justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-muted-foreground">Civil ID</span>
                      <span className="font-medium font-mono">{form.civilId}</span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Permit section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  <FileText className="w-4 h-4" />
                  Permit Details
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: "Permit Number", value: form.permitNumber },
                    { label: "Type", value: PERMIT_TYPES.find(t => t.value === form.permitType)?.label },
                    { label: "Occupation", value: form.occupationTitle || form.occupationCode || "—" },
                    { label: "Issue Date", value: form.issueDate || "—" },
                    { label: "Expiry Date", value: form.expiryDate },
                    { label: "Sponsor", value: form.sponsorName || "—" },
                    { label: "Governorate", value: form.governorate || "—" },
                    { label: "Wilayat", value: form.wilayat || "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium text-right max-w-[60%] truncate">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Expiry warning */}
              {form.expiryDate && new Date(form.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex gap-2 text-sm text-amber-800">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>This permit expires within 30 days. A renewal case will be recommended after upload.</span>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep("permit")} className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={uploadMutation.isPending}
                  className="gap-2 min-w-[140px]"
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload Permit
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info card */}
        <Card className="border-dashed bg-muted/30">
          <CardContent className="py-4 px-5">
            <div className="flex gap-3 text-sm text-muted-foreground">
              <Building2 className="w-4 h-4 mt-0.5 shrink-0 text-primary/60" />
              <div>
                <span className="font-medium text-foreground">MOL Certificate Upload</span>
                <p className="mt-0.5">
                  This form records work permit data from the Oman Ministry of Labour (MOL) portal.
                  Uploaded permits are linked to the employee's government profile and tracked for expiry alerts.
                  AI-assisted PDF parsing from MOL certificates is available as a future enhancement.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
