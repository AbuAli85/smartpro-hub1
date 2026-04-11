import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeft, User, FileText, Shield, Calendar, Building2,
  Phone, CreditCard, Globe, AlertTriangle, ClipboardList, CheckCircle2, XCircle,
} from "lucide-react";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";
import {
  parseProfileRequestIdFromSearch,
  PROFILE_CHANGE_REQUEST_SCROLL_MARGIN_CLASS,
  scheduleScrollToProfileChangeRequest,
} from "@shared/profileChangeRequestDeepLink";
import { cn } from "@/lib/utils";

function statusColor(status: string) {
  const s = status?.toLowerCase();
  if (s === "active" || s === "valid") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (s === "expired") return "bg-red-100 text-red-800 border-red-200";
  if (s === "expiring_soon") return "bg-amber-100 text-amber-800 border-amber-200";
  if (s === "pending") return "bg-blue-100 text-blue-800 border-blue-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between py-2 border-b border-muted/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right max-w-[60%]">{value}</span>
    </div>
  );
}

export default function WorkforceEmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const urlSearch = useSearch();
  const employeeId = parseInt(params.id || "0");
  const highlightRequestId = useMemo(() => parseProfileRequestIdFromSearch(urlSearch), [urlSearch]);

  const { data: detail, isLoading } = trpc.workforce.employees.getById.useQuery(
    { employeeId },
    { enabled: employeeId > 0 }
  );

  const { data: casesData } = trpc.workforce.cases.list.useQuery(
    { employeeId },
    { enabled: employeeId > 0 }
  );

  const { data: docsData } = trpc.workforce.documents.list.useQuery(
    { employeeId },
    { enabled: employeeId > 0 }
  );

  const { data: profileChangeRows, isLoading: profileChangeLoading } =
    trpc.workforce.profileChangeRequests.listForEmployee.useQuery(
      { employeeId },
      { enabled: employeeId > 0 },
    );

  const utils = trpc.useUtils();
  const resolveReq = trpc.workforce.profileChangeRequests.resolve.useMutation({
    onSuccess: () => {
      toast.success("Marked as resolved");
      void utils.workforce.profileChangeRequests.listForEmployee.invalidate({ employeeId });
      void utils.workforce.profileChangeRequests.listCompany.invalidate();
      setActionDialog({ open: false, mode: "resolve", requestId: null });
      setActionNote("");
    },
    onError: (e) => toast.error(e.message),
  });
  const rejectReq = trpc.workforce.profileChangeRequests.reject.useMutation({
    onSuccess: () => {
      toast.success("Request closed");
      void utils.workforce.profileChangeRequests.listForEmployee.invalidate({ employeeId });
      void utils.workforce.profileChangeRequests.listCompany.invalidate();
      setActionDialog({ open: false, mode: "resolve", requestId: null });
      setActionNote("");
    },
    onError: (e) => toast.error(e.message),
  });

  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    mode: "resolve" | "reject";
    requestId: number | null;
  }>({ open: false, mode: "resolve", requestId: null });
  const [actionNote, setActionNote] = useState("");

  useEffect(() => {
    if (!highlightRequestId) return;
    scheduleScrollToProfileChangeRequest(highlightRequestId);
  }, [highlightRequestId, employeeId, profileChangeRows]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-card px-6 py-4">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!detail?.employee) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Employee not found or access denied.</p>
          <Button variant="outline" onClick={() => navigate("/workforce/employees")}>
            Back to Employees
          </Button>
        </div>
      </div>
    );
  }

  const emp = detail.employee as Record<string, unknown>;
  const gov = detail.governmentProfile as { civilId?: string | null } | null;
  const activePermit = detail.activePermit as Record<string, unknown> | null | undefined;
  const allPermits = (detail.allPermits ?? []) as Array<Record<string, unknown>>;
  const permitHealth = detail.permitHealth as { status?: string; daysToExpiry?: number | null } | undefined;

  const cases = (casesData as { items?: unknown[] })?.items ?? [];
  const docs = Array.isArray(docsData) ? docsData : [];
  const permits = allPermits;

  const displayName =
    typeof emp.firstName === "string" || typeof emp.lastName === "string"
      ? `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim()
      : "";
  const civilIdDisplay =
    (typeof gov?.civilId === "string" && gov.civilId) || (typeof emp.nationalId === "string" && emp.nationalId) || null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/workforce/employees")} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{displayName || `Employee #${employeeId}`}</h1>
            <p className="text-xs text-muted-foreground">
              {typeof emp.position === "string" ? emp.position : "—"} · {typeof emp.department === "string" ? emp.department : "—"}
            </p>
          </div>
          <Badge className={`text-xs ${statusColor(String(permitHealth?.status ?? (typeof emp.status === "string" ? emp.status : "") ?? ""))}`}>
            {permitHealth?.status ?? (typeof emp.status === "string" ? emp.status : "Active")}
          </Badge>
          <Button size="sm" onClick={() => navigate(`/workforce/cases/new?employeeId=${employeeId}`)}>
            Open Case
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Active Permits", value: permits.filter((p) => String((p as { permitStatus?: string }).permitStatus) === "active").length, icon: Shield, color: "text-emerald-600" },
            { label: "Open Cases", value: cases.filter((c: any) => c.status !== "closed" && c.status !== "completed").length, icon: FileText, color: "text-blue-600" },
            { label: "Documents", value: docs.length, icon: CreditCard, color: "text-purple-600" },
            { label: "Expiring Soon", value: permits.filter((p) => {
              const ex = (p as { expiryDate?: Date | string | null }).expiryDate;
              if (!ex) return false;
              const days = Math.ceil((new Date(ex).getTime() - Date.now()) / 86400000);
              return days >= 0 && days <= 30;
            }).length, icon: AlertTriangle, color: "text-amber-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="shadow-sm">
              <CardContent className="pt-4 pb-3 px-4 flex items-center gap-3">
                <Icon className={`w-8 h-8 ${color}`} />
                <div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Profile change requests (employee self-service → HR) */}
        <Card className="shadow-sm border-primary/15">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              Profile change requests
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Requests submitted from the employee portal. Resolve or close after updating the employee record.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {profileChangeLoading ? (
              <Skeleton className="h-16 w-full rounded-md" />
            ) : !profileChangeRows || profileChangeRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No profile change requests on file.</p>
            ) : (
              <div className="space-y-3">
                {(["pending", "resolved", "rejected"] as const).map((bucket) => {
                  const rows = profileChangeRows.filter((r) => r.status === bucket);
                  if (rows.length === 0) return null;
                  return (
                    <div key={bucket}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                        {bucket === "pending" ? "Pending" : bucket === "resolved" ? "Resolved" : "Closed / rejected"}
                      </p>
                      <ul className="space-y-2">
                        {rows.map((r) => (
                          <li
                            id={`profile-change-request-${r.id}`}
                            key={r.id}
                            className={cn(
                              "rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 text-sm transition-shadow",
                              PROFILE_CHANGE_REQUEST_SCROLL_MARGIN_CLASS,
                              highlightRequestId === r.id &&
                                "ring-2 ring-primary ring-offset-2 border-primary/40",
                            )}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0 space-y-1">
                                <p className="font-medium text-foreground">{r.fieldLabel}</p>
                                <p className="text-xs text-muted-foreground break-words">
                                  <span className="font-medium text-foreground/90">Requested value: </span>
                                  {r.requestedValue}
                                </p>
                                {r.notes ? (
                                  <p className="text-xs text-muted-foreground">
                                    <span className="font-medium">Employee notes: </span>
                                    {r.notes}
                                  </p>
                                ) : null}
                                <p className="text-[11px] text-muted-foreground">
                                  Submitted {r.submittedAt ? fmtDateTime(r.submittedAt as string | Date) : "—"}
                                  {r.submitterName || r.submitterEmail
                                    ? ` · by ${r.submitterName ?? r.submitterEmail ?? "employee"}`
                                    : ""}
                                </p>
                                {r.status !== "pending" && r.resolvedAt ? (
                                  <p className="text-[11px] text-muted-foreground">
                                    {r.status === "resolved" ? "Resolved" : "Closed"}{" "}
                                    {fmtDateTime(r.resolvedAt as string | Date)}
                                    {r.resolverName ? ` · ${r.resolverName}` : ""}
                                    {r.resolutionNote ? ` — ${r.resolutionNote}` : ""}
                                  </p>
                                ) : null}
                              </div>
                              {r.status === "pending" && (
                                <div className="flex flex-wrap gap-1.5 shrink-0">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => {
                                      setActionNote("");
                                      setActionDialog({ open: true, mode: "resolve", requestId: r.id });
                                    }}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs gap-1 text-muted-foreground"
                                    onClick={() => {
                                      setActionNote("");
                                      setActionDialog({ open: true, mode: "reject", requestId: r.id });
                                    }}
                                  >
                                    <XCircle className="h-3.5 w-3.5" /> Close
                                  </Button>
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog
          open={actionDialog.open}
          onOpenChange={(open) => {
            if (!open) setActionDialog({ open: false, mode: "resolve", requestId: null });
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {actionDialog.mode === "resolve" ? "Mark request resolved" : "Close request"}
              </DialogTitle>
              <DialogDescription>
                {actionDialog.mode === "resolve"
                  ? "Confirm after you have updated the employee record in the HR system."
                  : "Use when the change cannot be applied or was handled another way. The employee will be notified."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label className="text-xs">Note for audit trail (optional)</Label>
              <Textarea
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder="e.g. Updated in payroll system…"
                rows={3}
                maxLength={500}
                className="text-sm resize-none"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActionDialog({ open: false, mode: "resolve", requestId: null })}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={
                  !actionDialog.requestId ||
                  resolveReq.isPending ||
                  rejectReq.isPending
                }
                onClick={() => {
                  const id = actionDialog.requestId;
                  if (!id) return;
                  const note = actionNote.trim() || undefined;
                  if (actionDialog.mode === "resolve") {
                    resolveReq.mutate({ requestId: id, resolutionNote: note });
                  } else {
                    rejectReq.mutate({ requestId: id, resolutionNote: note });
                  }
                }}
              >
                {actionDialog.mode === "resolve" ? "Mark resolved" : "Close request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Tabs */}
        <Tabs defaultValue="profile">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="permits">Permits ({permits.length})</TabsTrigger>
            <TabsTrigger value="cases">Cases ({cases.length})</TabsTrigger>
            <TabsTrigger value="documents">Documents ({docs.length})</TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    Personal Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  <InfoRow label="Full Name (EN)" value={displayName || undefined} />
                  <InfoRow label="Full Name (AR)" value={typeof emp.firstNameAr === "string" || typeof emp.lastNameAr === "string" ? `${emp.firstNameAr ?? ""} ${emp.lastNameAr ?? ""}`.trim() : undefined} />
                  <InfoRow label="Civil ID" value={civilIdDisplay ?? undefined} />
                  <InfoRow label="Nationality" value={typeof emp.nationality === "string" ? emp.nationality : undefined} />
                  <InfoRow label="Date of Birth" value={emp.dateOfBirth ? fmtDate(emp.dateOfBirth as string | Date) : undefined} />
                  <InfoRow label="Gender" value={typeof emp.gender === "string" ? emp.gender : undefined} />
                  <InfoRow label="Email" value={typeof emp.email === "string" ? emp.email : undefined} />
                  <InfoRow label="Phone" value={typeof emp.phone === "string" ? emp.phone : undefined} />
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    Employment Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  <InfoRow label="Job Title" value={typeof emp.position === "string" ? emp.position : undefined} />
                  <InfoRow label="Department" value={typeof emp.department === "string" ? emp.department : undefined} />
                  <InfoRow label="Employee Type" value={typeof emp.employmentType === "string" ? emp.employmentType.replace(/_/g, " ") : undefined} />
                  <InfoRow label="Start Date" value={emp.hireDate ? fmtDate(emp.hireDate as string | Date) : undefined} />
                  <InfoRow label="Salary" value={emp.salary ? `OMR ${String(emp.salary)}` : null} />
                  <InfoRow label="Branch" value={emp.branchId ? `Branch #${emp.branchId}` : null} />
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    Passport & Visa
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  <InfoRow label="Passport Number" value={typeof emp.passportNumber === "string" ? emp.passportNumber : undefined} />
                  <InfoRow label="Visa Number" value={typeof emp.visaNumber === "string" ? emp.visaNumber : undefined} />
                  <InfoRow label="Visa Expiry" value={emp.visaExpiryDate ? fmtDate(emp.visaExpiryDate as string | Date) : undefined} />
                  <InfoRow label="Work permit expiry (HR)" value={emp.workPermitExpiryDate ? fmtDate(emp.workPermitExpiryDate as string | Date) : undefined} />
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    Active Work Permit
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  {activePermit ? (
                    <>
                      <InfoRow label="Permit Number" value={typeof activePermit.workPermitNumber === "string" ? activePermit.workPermitNumber : undefined} />
                      <InfoRow label="Occupation" value={typeof activePermit.occupationTitleEn === "string" ? activePermit.occupationTitleEn : undefined} />
                      <InfoRow label="Issue Date" value={activePermit.issueDate ? fmtDate(activePermit.issueDate as string | Date) : undefined} />
                      <InfoRow label="Expiry Date" value={activePermit.expiryDate ? fmtDate(activePermit.expiryDate as string | Date) : undefined} />
                      <InfoRow label="Status" value={typeof activePermit.permitStatus === "string" ? activePermit.permitStatus : undefined} />
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">No active work permit found.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Permits Tab */}
          <TabsContent value="permits" className="mt-4">
            <Card className="shadow-sm">
              <CardContent className="p-0">
                {permits.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">No work permits found.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th scope="col" className="text-left px-4 py-3 font-medium">Permit Number</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium">Type</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium">Occupation</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium">Expiry</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {permits.map((p) => {
                        const row = p as { id?: number; workPermitNumber?: string; permitStatus?: string; occupationTitleEn?: string; occupationCode?: string; expiryDate?: Date | string | null };
                        return (
                        <tr key={String(row.id)} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-3 font-mono text-xs">{row.workPermitNumber ?? "—"}</td>
                          <td className="px-4 py-3 capitalize">—</td>
                          <td className="px-4 py-3">{row.occupationTitleEn || row.occupationCode || "—"}</td>
                          <td className="px-4 py-3">{row.expiryDate ? fmtDate(row.expiryDate) : "—"}</td>
                          <td className="px-4 py-3">
                            <Badge className={`text-xs ${statusColor(String(row.permitStatus ?? ""))}`}>{row.permitStatus ?? "—"}</Badge>
                          </td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cases Tab */}
          <TabsContent value="cases" className="mt-4">
            <Card className="shadow-sm">
              <CardContent className="p-0">
                {cases.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">No government cases found.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th scope="col" className="text-left px-4 py-3 font-medium">Case Type</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium">Status</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium">Priority</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium">Gov. Reference</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cases.map((c: any) => (
                        <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-3 capitalize">{c.caseType?.replace(/_/g, " ")}</td>
                          <td className="px-4 py-3">
                            <Badge className={`text-xs ${statusColor(c.status)}`}>{c.status}</Badge>
                          </td>
                          <td className="px-4 py-3 capitalize">{c.priority}</td>
                          <td className="px-4 py-3 font-mono text-xs">{c.governmentReference || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {c.createdAt ? fmtDate(c.createdAt) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="mt-4">
            <Card className="shadow-sm">
              <CardContent className="p-0">
                {docs.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">No documents uploaded.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th scope="col" className="text-left px-4 py-3 font-medium">Document Type</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium">Verification</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium">Expires</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium">Uploaded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docs.map((d: any) => (
                        <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-3 capitalize">{d.documentType?.replace(/_/g, " ")}</td>
                          <td className="px-4 py-3">
                            <Badge className={`text-xs ${statusColor(d.verificationStatus)}`}>
                              {d.verificationStatus}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">{d.expiresAt || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {d.createdAt ? fmtDate(d.createdAt) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
