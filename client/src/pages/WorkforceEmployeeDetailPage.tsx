import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, User, FileText, Shield, Calendar, Building2,
  Phone, Mail, MapPin, CreditCard, Globe, AlertTriangle
} from "lucide-react";

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
  const employeeId = parseInt(params.id || "0");

  const { data: employee, isLoading } = trpc.workforce.employees.getById.useQuery(
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

  const { data: permitsData } = trpc.workforce.workPermits.list.useQuery(
    {},
    { enabled: employeeId > 0 }
  );

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

  if (!employee) {
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

  const emp = employee as any;
  const cases = (casesData as any)?.cases ?? [];
  const docs = (docsData as any)?.documents ?? [];
  const permits = (permitsData as any)?.permits ?? [];
  const activePermit = permits.find((p: any) => p.status === "active" || p.status === "valid");

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
            <h1 className="text-lg font-semibold">{emp.fullName || emp.name || `Employee #${employeeId}`}</h1>
            <p className="text-xs text-muted-foreground">{emp.jobTitle || "—"} · {emp.department || "—"}</p>
          </div>
          <Badge className={`text-xs ${statusColor(emp.permitStatus || emp.status || "")}`}>
            {emp.permitStatus || emp.status || "Active"}
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
            { label: "Active Permits", value: permits.filter((p: any) => p.status === "active").length, icon: Shield, color: "text-emerald-600" },
            { label: "Open Cases", value: cases.filter((c: any) => c.status !== "closed" && c.status !== "completed").length, icon: FileText, color: "text-blue-600" },
            { label: "Documents", value: docs.length, icon: CreditCard, color: "text-purple-600" },
            { label: "Expiring Soon", value: permits.filter((p: any) => {
              if (!p.expiryDate) return false;
              const days = Math.ceil((new Date(p.expiryDate).getTime() - Date.now()) / 86400000);
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
                  <InfoRow label="Full Name (EN)" value={emp.fullName || emp.name} />
                  <InfoRow label="Full Name (AR)" value={emp.fullNameAr} />
                  <InfoRow label="Civil ID" value={emp.civilId} />
                  <InfoRow label="Nationality" value={emp.nationality} />
                  <InfoRow label="Date of Birth" value={emp.birthDate} />
                  <InfoRow label="Gender" value={emp.gender} />
                  <InfoRow label="Email" value={emp.email} />
                  <InfoRow label="Phone" value={emp.phone} />
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
                  <InfoRow label="Job Title" value={emp.jobTitle} />
                  <InfoRow label="Department" value={emp.department} />
                  <InfoRow label="Employee Type" value={emp.employeeType} />
                  <InfoRow label="Start Date" value={emp.startDate} />
                  <InfoRow label="Salary" value={emp.salary ? `OMR ${emp.salary}` : null} />
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
                  <InfoRow label="Passport Number" value={emp.passportNumber} />
                  <InfoRow label="Passport Issue Country" value={emp.passportIssueCountry} />
                  <InfoRow label="Passport Issue Date" value={emp.passportIssueDate} />
                  <InfoRow label="Passport Expiry" value={emp.passportExpiryDate} />
                  <InfoRow label="Visa Number" value={emp.visaNumber} />
                  <InfoRow label="Arrival Date" value={emp.arrivalDate} />
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
                      <InfoRow label="Permit Number" value={activePermit.permitNumber} />
                      <InfoRow label="Occupation" value={activePermit.occupationTitleEn} />
                      <InfoRow label="Issue Date" value={activePermit.issueDate} />
                      <InfoRow label="Expiry Date" value={activePermit.expiryDate} />
                      <InfoRow label="Status" value={activePermit.status} />
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
                        <th className="text-left px-4 py-3 font-medium">Permit Number</th>
                        <th className="text-left px-4 py-3 font-medium">Type</th>
                        <th className="text-left px-4 py-3 font-medium">Occupation</th>
                        <th className="text-left px-4 py-3 font-medium">Expiry</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {permits.map((p: any) => (
                        <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-3 font-mono text-xs">{p.permitNumber}</td>
                          <td className="px-4 py-3 capitalize">{p.permitType?.replace(/_/g, " ")}</td>
                          <td className="px-4 py-3">{p.occupationTitleEn || p.occupationCode || "—"}</td>
                          <td className="px-4 py-3">{p.expiryDate || "—"}</td>
                          <td className="px-4 py-3">
                            <Badge className={`text-xs ${statusColor(p.status)}`}>{p.status}</Badge>
                          </td>
                        </tr>
                      ))}
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
                        <th className="text-left px-4 py-3 font-medium">Case Type</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-left px-4 py-3 font-medium">Priority</th>
                        <th className="text-left px-4 py-3 font-medium">Gov. Reference</th>
                        <th className="text-left px-4 py-3 font-medium">Created</th>
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
                            {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}
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
                        <th className="text-left px-4 py-3 font-medium">Document Type</th>
                        <th className="text-left px-4 py-3 font-medium">Verification</th>
                        <th className="text-left px-4 py-3 font-medium">Expires</th>
                        <th className="text-left px-4 py-3 font-medium">Uploaded</th>
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
                            {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "—"}
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
