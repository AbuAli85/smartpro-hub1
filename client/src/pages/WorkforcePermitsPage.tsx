import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  FileText, AlertTriangle, Clock, CheckCircle2, Plus, Search,
  Upload, RefreshCw, Eye, Calendar, Building2, User
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  active: { label: "Active", color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle2 },
  expiring_soon: { label: "Expiring Soon", color: "text-amber-700", bg: "bg-amber-100", icon: Clock },
  expired: { label: "Expired", color: "text-red-700", bg: "bg-red-100", icon: AlertTriangle },
  in_grace: { label: "In Grace Period", color: "text-orange-700", bg: "bg-orange-100", icon: Clock },
  cancelled: { label: "Cancelled", color: "text-gray-700", bg: "bg-gray-100", icon: AlertTriangle },
  transferred: { label: "Transferred", color: "text-blue-700", bg: "bg-blue-100", icon: CheckCircle2 },
  pending_update: { label: "Pending Update", color: "text-purple-700", bg: "bg-purple-100", icon: Clock },
  unknown: { label: "Unknown", color: "text-gray-600", bg: "bg-gray-100", icon: Clock },
};

type PermitItem = {
  id: number;
  workPermitNumber: string;
  permitStatus: string | null;
  occupationTitleEn: string | null;
  occupationCode: string | null;
  issueDate: Date | null;
  expiryDate: Date | null;
  employeeName: string;
  nationality: string | null;
  daysToExpiry: number | null;
};

function daysLabel(days: number | null) {
  if (days == null) return "—";
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  return `${days}d remaining`;
}

export default function WorkforcePermitsPage() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expiringFilter, setExpiringFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedPermit, setSelectedPermit] = useState<string | null>(null);

  // Upload form state
  const [uploadForm, setUploadForm] = useState({
    employeeId: "",
    permitNumber: "",
    occupationCode: "",
    occupationTitle: "",
    issueDate: "",
    expiryDate: "",
    permitType: "new_permit",
    sponsorName: "",
    workplaceLocation: "",
  });

  const { data, isLoading, refetch } = trpc.workforce.workPermits.list.useQuery({
    query: query || undefined,
    permitStatus: statusFilter !== "all" ? (statusFilter as "active" | "expiring_soon" | "expired" | "in_grace" | "cancelled") : undefined,
    expiringWithinDays: expiringFilter === "30" ? 30 : expiringFilter === "90" ? 90 : undefined,
    page,
    pageSize: 20,
  });

  const uploadMutation = trpc.workforce.workPermits.createFromCertificate.useMutation({
    onSuccess: () => {
      toast.success("Work permit uploaded successfully");
      setShowUploadDialog(false);
      setUploadForm({ employeeId: "", permitNumber: "", occupationCode: "", occupationTitle: "", issueDate: "", expiryDate: "", permitType: "new_permit", sponsorName: "", workplaceLocation: "" });
      refetch();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const renewMutation = trpc.workforce.cases.create.useMutation({
    onSuccess: () => {
      toast.success("Renewal case created successfully");
      refetch();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const permits = data?.items ?? [];

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Work Permits</h1>
          <p className="text-muted-foreground text-sm mt-0.5">MOL-aligned permit lifecycle — upload, track, renew, cancel</p>
        </div>
        <Button size="sm" onClick={() => setShowUploadDialog(true)}>
          <Upload className="w-4 h-4 mr-2" />
          Upload Certificate
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by permit number, employee name, occupation..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="in_grace">In Grace Period</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={expiringFilter} onValueChange={(v) => { setExpiringFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Expiry</SelectItem>
            <SelectItem value="30">Expiring in 30 days</SelectItem>
            <SelectItem value="90">Expiring in 90 days</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Permits Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Permit No.</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Employee</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Occupation</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Issue Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Expiry Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Remaining</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : permits.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No work permits found</p>
                      <p className="text-xs mt-1">Upload MOL certificates to track permit lifecycle</p>
                      <Button size="sm" className="mt-3" onClick={() => setShowUploadDialog(true)}>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Certificate
                      </Button>
                    </td>
                  </tr>
                ) : (
                  (permits as PermitItem[]).map((permit) => {
                    const cfg = STATUS_CONFIG[permit.permitStatus ?? "unknown"] ?? STATUS_CONFIG.unknown;
                    const Icon = cfg.icon;
                    return (
                      <tr key={permit.id} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-medium">{permit.workPermitNumber}</td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{permit.employeeName ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">{permit.nationality ?? ""}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <p>{permit.occupationTitleEn ?? "—"}</p>
                          {permit.occupationCode && <p className="text-muted-foreground">{permit.occupationCode}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                            <Icon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {permit.issueDate ? new Date(permit.issueDate).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {permit.expiryDate ? new Date(permit.expiryDate).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${
                            permit.daysToExpiry == null ? "text-muted-foreground" :
                            permit.daysToExpiry < 0 ? "text-red-600" :
                            permit.daysToExpiry <= 30 ? "text-red-600" :
                            permit.daysToExpiry <= 90 ? "text-amber-600" : "text-emerald-600"
                          }`}>
                            {daysLabel(permit.daysToExpiry)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => navigate(`/workforce/permits/${permit.id}`)}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            {(permit.permitStatus === "active" || permit.permitStatus === "expiring_soon") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-amber-700 hover:bg-amber-50"
                                onClick={() => renewMutation.mutate({ caseType: "renewal", workPermitId: permit.id })}
                                disabled={renewMutation.isPending}
                              >
                                Renew
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && permits.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">Showing {permits.length} permits</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={permits.length < 20} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload MOL Work Permit Certificate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Employee ID *</Label>
                <Input
                  value={uploadForm.employeeId}
                  onChange={(e) => setUploadForm(f => ({ ...f, employeeId: e.target.value }))}
                  placeholder="Employee ID"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Permit Number *</Label>
                <Input
                  value={uploadForm.permitNumber}
                  onChange={(e) => setUploadForm(f => ({ ...f, permitNumber: e.target.value }))}
                  placeholder="MOL permit number"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Occupation Code</Label>
                <Input
                  value={uploadForm.occupationCode}
                  onChange={(e) => setUploadForm(f => ({ ...f, occupationCode: e.target.value }))}
                  placeholder="e.g. 2141"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Occupation Title</Label>
                <Input
                  value={uploadForm.occupationTitle}
                  onChange={(e) => setUploadForm(f => ({ ...f, occupationTitle: e.target.value }))}
                  placeholder="e.g. Civil Engineer"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Issue Date *</Label>
                <Input
                  type="date"
                  value={uploadForm.issueDate}
                  onChange={(e) => setUploadForm(f => ({ ...f, issueDate: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Expiry Date *</Label>
                <Input
                  type="date"
                  value={uploadForm.expiryDate}
                  onChange={(e) => setUploadForm(f => ({ ...f, expiryDate: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Permit Type</Label>
                <Select value={uploadForm.permitType} onValueChange={(v) => setUploadForm(f => ({ ...f, permitType: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new_permit">New Permit</SelectItem>
                    <SelectItem value="renewal">Renewal</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="amendment">Amendment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Sponsor Name</Label>
                <Input
                  value={uploadForm.sponsorName}
                  onChange={(e) => setUploadForm(f => ({ ...f, sponsorName: e.target.value }))}
                  placeholder="Sponsor / employer name"
                  className="mt-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>Cancel</Button>
            <Button
              onClick={() => uploadMutation.mutate({
                fileUrl: "manual-entry",
                fileKey: `manual-${Date.now()}`,
                parsed: {
                  civilId: uploadForm.employeeId,
                  fullNameEn: "Manual Entry",
                  workPermitNumber: uploadForm.permitNumber,
                  occupationCode: uploadForm.occupationCode || undefined,
                  occupationTitleEn: uploadForm.occupationTitle || undefined,
                  issueDate: uploadForm.issueDate || undefined,
                  expiryDate: uploadForm.expiryDate || undefined,
                },
              })}
              disabled={uploadMutation.isPending || !uploadForm.permitNumber || !uploadForm.expiryDate || !uploadForm.employeeId}
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload Permit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
