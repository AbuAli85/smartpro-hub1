import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  FolderOpen, Search, Upload, FileText, CheckCircle2,
  AlertTriangle, Clock, Eye, ShieldCheck, Calendar, Filter
} from "lucide-react";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

const DOC_TYPE_LABELS: Record<string, string> = {
  mol_work_permit_certificate: "MOL Work Permit Certificate",
  passport: "Passport",
  civil_id: "Civil ID / Resident Card",
  visa: "Visa",
  resident_card: "Resident Card",
  labour_card: "Labour Card",
  employment_contract: "Employment Contract",
  medical_certificate: "Medical Certificate",
  photo: "Photo",
  other: "Other",
};

const VERIFY_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  pending: { label: "Pending", color: "text-gray-600", bg: "bg-gray-100", icon: Clock },
  verified: { label: "Verified", color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "text-red-700", bg: "bg-red-100", icon: AlertTriangle },
  expired: { label: "Expired", color: "text-orange-700", bg: "bg-orange-100", icon: AlertTriangle },
};

export default function WorkforceDocumentsPage() {
  const [query, setQuery] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("all");
  const [verifyFilter, setVerifyFilter] = useState("all");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    employeeId: "",
    documentType: "passport" as "mol_work_permit_certificate" | "passport" | "visa" | "resident_card" | "labour_card" | "employment_contract" | "civil_id" | "medical_certificate" | "photo" | "other",
    expiresAt: "",
    issuedAt: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: docsRaw, isLoading, refetch } = trpc.workforce.documents.list.useQuery({
    documentType: docTypeFilter !== "all" ? docTypeFilter : undefined,
    expiringWithinDays: verifyFilter === "expiring" ? 90 : undefined,
  });

  const uploadMutation = trpc.workforce.documents.upload.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded successfully");
      setShowUploadDialog(false);
      setUploadForm({ employeeId: "", documentType: "passport", expiresAt: "", issuedAt: "" });
      setSelectedFile(null);
      refetch();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const verifyMutation = trpc.workforce.documents.verify.useMutation({
    onSuccess: () => { toast.success("Document verified"); refetch(); },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const docs = (docsRaw ?? []).filter(d => {
    if (verifyFilter === "verified") return d.verificationStatus === "verified";
    if (verifyFilter === "pending") return d.verificationStatus === "pending";
    if (verifyFilter === "rejected") return d.verificationStatus === "rejected";
    return true;
  }).filter(d => {
    if (!query) return true;
    return (DOC_TYPE_LABELS[d.documentType] ?? d.documentType).toLowerCase().includes(query.toLowerCase()) ||
           (d.fileName ?? "").toLowerCase().includes(query.toLowerCase());
  });

  const expiringSoon = docs.filter(d => d.daysToExpiry != null && d.daysToExpiry >= 0 && d.daysToExpiry <= 90);
  const expired = docs.filter(d => d.daysToExpiry != null && d.daysToExpiry < 0);

  const handleUpload = () => {
    if (!selectedFile || !uploadForm.employeeId) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1] ?? "";
      uploadMutation.mutate({
        employeeId: parseInt(uploadForm.employeeId),
        documentType: uploadForm.documentType,
        fileDataBase64: base64,
        fileName: selectedFile.name,
        mimeType: selectedFile.type || "application/pdf",
        issuedAt: uploadForm.issuedAt || undefined,
        expiresAt: uploadForm.expiresAt || undefined,
      });
    };
    reader.readAsDataURL(selectedFile);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderOpen className="w-6 h-6 text-primary" />
            Document Vault
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Centralised employee document storage with expiry tracking and verification
          </p>
        </div>
        <Button onClick={() => setShowUploadDialog(true)} className="gap-2">
          <Upload className="w-4 h-4" /> Upload Document
        </Button>
      </div>

      {/* Alert Banners */}
      {(expiringSoon.length > 0 || expired.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {expired.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-red-600 shrink-0" />
                <div>
                  <p className="font-semibold text-red-800">{expired.length} Expired Document{expired.length > 1 ? "s" : ""}</p>
                  <p className="text-xs text-red-600">Immediate renewal required</p>
                </div>
              </CardContent>
            </Card>
          )}
          {expiringSoon.length > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4 flex items-center gap-3">
                <Clock className="w-8 h-8 text-amber-600 shrink-0" />
                <div>
                  <p className="font-semibold text-amber-800">{expiringSoon.length} Expiring Within 90 Days</p>
                  <p className="text-xs text-amber-600">Plan renewals in advance</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Documents", value: docs.length, icon: FileText, color: "text-primary" },
          { label: "Verified", value: docs.filter(d => d.verificationStatus === "verified").length, icon: ShieldCheck, color: "text-emerald-600" },
          { label: "Pending Review", value: docs.filter(d => d.verificationStatus === "pending").length, icon: Clock, color: "text-amber-600" },
          { label: "Expiring Soon", value: expiringSoon.length, icon: AlertTriangle, color: "text-orange-600" },
        ].map((stat) => (
          <Card key={stat.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search documents..." value={query} onChange={e => setQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
          <SelectTrigger className="w-52">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue placeholder="Document Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={verifyFilter} onValueChange={setVerifyFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Verification" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="expiring">Expiring Soon</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Document Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-40 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderOpen className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">No documents found</p>
          <p className="text-sm">Upload employee documents to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map((doc) => {
            const verifyCfg = VERIFY_STATUS_CONFIG[doc.verificationStatus ?? "pending"] ?? VERIFY_STATUS_CONFIG.pending;
            const VerifyIcon = verifyCfg.icon;
            const isExpiredDoc = doc.daysToExpiry != null && doc.daysToExpiry < 0;
            const isExpiringSoon = doc.daysToExpiry != null && doc.daysToExpiry >= 0 && doc.daysToExpiry <= 90;

            return (
              <Card key={doc.id} className={`border-0 shadow-sm hover:shadow-md transition-shadow ${
                isExpiredDoc ? "border-l-4 border-l-red-500" :
                isExpiringSoon ? "border-l-4 border-l-amber-500" : ""
              }`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="p-2 rounded-lg bg-muted">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}</p>
                        {doc.fileName && <p className="text-xs text-muted-foreground truncate max-w-32">{doc.fileName}</p>}
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${verifyCfg.bg} ${verifyCfg.color} shrink-0`}>
                      <VerifyIcon className="w-3 h-3" />
                      {verifyCfg.label}
                    </span>
                  </div>

                  {doc.expiresAt && (
                    <div className={`flex items-center gap-1.5 text-xs ${
                      isExpiredDoc ? "text-red-600" : isExpiringSoon ? "text-amber-600" : "text-muted-foreground"
                    }`}>
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        Expires: {fmtDate(doc.expiresAt)}
                        {doc.daysToExpiry != null && (
                          <span className="ml-1 font-medium">
                            ({isExpiredDoc ? `${Math.abs(doc.daysToExpiry)}d ago` : `${doc.daysToExpiry}d left`})
                          </span>
                        )}
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    {doc.fileUrl && (
                      <Button variant="outline" size="sm" className="flex-1 h-7 text-xs gap-1"
                        onClick={() => window.open(doc.fileUrl!, "_blank")}>
                        <Eye className="w-3 h-3" /> View
                      </Button>
                    )}
                    {doc.verificationStatus === "pending" && (
                      <Button variant="outline" size="sm"
                        className="flex-1 h-7 text-xs gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                        onClick={() => verifyMutation.mutate({ documentId: doc.id, verificationStatus: "verified" })}
                        disabled={verifyMutation.isPending}>
                        <ShieldCheck className="w-3 h-3" /> Verify
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Employee ID *</Label>
              <Input placeholder="Employee ID number" value={uploadForm.employeeId}
                onChange={e => setUploadForm(f => ({ ...f, employeeId: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Document Type *</Label>
              <Select value={uploadForm.documentType} onValueChange={v => setUploadForm(f => ({ ...f, documentType: v as typeof uploadForm.documentType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>File *</Label>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                onChange={e => setSelectedFile(e.target.files?.[0] ?? null)} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="flex-1" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" />
                  {selectedFile ? selectedFile.name : "Choose File"}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Issue Date</Label>
                <Input type="date" value={uploadForm.issuedAt}
                  onChange={e => setUploadForm(f => ({ ...f, issuedAt: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry Date</Label>
                <Input type="date" value={uploadForm.expiresAt}
                  onChange={e => setUploadForm(f => ({ ...f, expiresAt: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>Cancel</Button>
            <Button onClick={handleUpload}
              disabled={uploadMutation.isPending || !uploadForm.employeeId || !selectedFile}>
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
