import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, FileText, User, AlertTriangle, Clock, CheckCircle2, Loader2, Info
} from "lucide-react";

const CASE_TYPES = [
  { value: "renewal", label: "Work Permit Renewal", description: "Renew an expiring or expired work permit" },
  { value: "new_permit", label: "New Work Permit", description: "Apply for a new work permit for an employee" },
  { value: "cancellation", label: "Permit Cancellation", description: "Cancel an active work permit" },
  { value: "transfer", label: "Employee Transfer", description: "Transfer employee to a different establishment" },
  { value: "amendment", label: "Permit Amendment", description: "Amend details on an existing permit" },
  { value: "contract_registration", label: "Contract Registration", description: "Register employment contract with MOL" },
  { value: "employee_update", label: "Employee Data Update", description: "Update employee personal or employment data" },
  { value: "document_update", label: "Document Update", description: "Update or replace expired documents" },
];

const PRIORITIES = [
  { value: "low", label: "Low", color: "bg-gray-100 text-gray-700" },
  { value: "normal", label: "Normal", color: "bg-blue-100 text-blue-700" },
  { value: "high", label: "High", color: "bg-amber-100 text-amber-700" },
  { value: "urgent", label: "Urgent", color: "bg-red-100 text-red-700" },
];

export default function WorkforceCaseNewPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const prefilledEmployeeId = params.get("employeeId");

  const [form, setForm] = useState({
    caseType: "",
    priority: "normal",
    employeeId: prefilledEmployeeId || "",
    workPermitId: "",
    notes: "",
    dueDate: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [createdCaseId, setCreatedCaseId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const createMutation = trpc.workforce.cases.create.useMutation({
    onSuccess: (data) => {
      toast.success("Government service case created successfully");
      setCreatedCaseId(data.caseId);
      setSubmitted(true);
      utils.workforce.cases.list.invalidate();
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Failed to create case");
    },
  });

  const update = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const selectedCaseType = CASE_TYPES.find((t) => t.value === form.caseType);
  const selectedPriority = PRIORITIES.find((p) => p.value === form.priority);

  const canSubmit =
    form.caseType !== "" &&
    form.priority !== "";

  const handleSubmit = () => {
    createMutation.mutate({
      caseType: form.caseType as any,
      priority: form.priority as any,
      employeeId: form.employeeId ? parseInt(form.employeeId) : undefined,
      workPermitId: form.workPermitId ? parseInt(form.workPermitId) : undefined,
      notes: form.notes || undefined,
      dueDate: form.dueDate || undefined,
    });
  };

  if (submitted && createdCaseId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center shadow-lg">
          <CardContent className="pt-10 pb-8 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold">Case Created</h2>
            <p className="text-muted-foreground text-sm">
              Government service case <span className="font-semibold text-foreground">#{createdCaseId}</span> has been
              created with status <span className="font-semibold text-foreground">Draft</span>.
              Tasks have been auto-generated based on the case type.
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <Button variant="outline" onClick={() => navigate("/workforce/cases")}>
                View All Cases
              </Button>
              <Button onClick={() => {
                setSubmitted(false);
                setCreatedCaseId(null);
                setForm({ caseType: "", priority: "normal", employeeId: prefilledEmployeeId || "", workPermitId: "", notes: "", dueDate: "" });
              }}>
                Create Another
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
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/workforce/cases")} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Cases
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div>
            <h1 className="text-lg font-semibold">New Government Service Case</h1>
            <p className="text-xs text-muted-foreground">Create a new MOL compliance or service case</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Case Type Selection */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Case Type
            </CardTitle>
            <CardDescription>Select the type of government service required.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {CASE_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => update("caseType", type.value)}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    form.caseType === type.value
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/40"
                  }`}
                >
                  <p className="text-sm font-medium">{type.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Priority & Scheduling */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-primary" />
              Priority & Scheduling
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Priority Level</Label>
              <div className="flex gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => update("priority", p.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                      form.priority === p.value
                        ? `border-primary ${p.color}`
                        : "border-muted bg-background text-muted-foreground hover:border-muted-foreground/40"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">
                <Clock className="w-3.5 h-3.5 inline mr-1" />
                Due Date (optional)
              </Label>
              <Input
                id="dueDate"
                type="date"
                value={form.dueDate}
                onChange={(e) => update("dueDate", e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">Set a target completion date for this case.</p>
            </div>
          </CardContent>
        </Card>

        {/* Employee & Permit Linking */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Link to Employee / Permit
            </CardTitle>
            <CardDescription>Optionally link this case to a specific employee or work permit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employeeId">Employee ID</Label>
                <Input
                  id="employeeId"
                  placeholder="e.g. 42"
                  value={form.employeeId}
                  onChange={(e) => update("employeeId", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Internal employee system ID</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="workPermitId">Work Permit ID</Label>
                <Input
                  id="workPermitId"
                  placeholder="e.g. 7"
                  value={form.workPermitId}
                  onChange={(e) => update("workPermitId", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Internal permit record ID</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Additional Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Add any relevant context, special instructions, or notes for this case..."
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={4}
            />
          </CardContent>
        </Card>

        {/* Summary & Submit */}
        {form.caseType && (
          <Card className="shadow-sm border-primary/30 bg-primary/5">
            <CardContent className="py-4 px-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{selectedCaseType?.label}</p>
                  <p className="text-xs text-muted-foreground">{selectedCaseType?.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className={`text-xs ${selectedPriority?.color}`}>
                      {selectedPriority?.label} Priority
                    </Badge>
                    {form.dueDate && (
                      <Badge variant="outline" className="text-xs">
                        Due: {form.dueDate}
                      </Badge>
                    )}
                    {form.employeeId && (
                      <Badge variant="outline" className="text-xs">
                        Employee #{form.employeeId}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit || createMutation.isPending}
                  className="gap-2 shrink-0"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Create Case
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!form.caseType && (
          <div className="p-4 rounded-lg bg-muted/40 border border-dashed flex gap-3 text-sm text-muted-foreground">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Select a case type above to proceed. Auto-generated tasks will be assigned based on the case type.</span>
          </div>
        )}
      </div>
    </div>
  );
}
