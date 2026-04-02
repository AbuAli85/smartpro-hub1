import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
import {
  FileText,
  Upload,
  Eye,
  Trash2,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileX,
  ArrowLeft,
  User,
  CreditCard,
  Stamp,
  Shield,
  Briefcase,
  Camera,
} from "lucide-react";

// ─── Document type config ─────────────────────────────────────────────────────

const DOC_TYPES = [
  { value: "mol_work_permit_certificate", label: "Work Permit Certificate", icon: Briefcase, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "passport", label: "Passport", icon: FileText, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  { value: "visa", label: "Visa", icon: Stamp, color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  { value: "resident_card", label: "Resident Card (ROP)", icon: CreditCard, color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" },
  { value: "labour_card", label: "Labour Card", icon: Shield, color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  { value: "employment_contract", label: "Employment Contract", icon: FileText, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  { value: "civil_id", label: "Civil ID Card", icon: CreditCard, color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  { value: "medical_certificate", label: "Medical Certificate", icon: Shield, color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" },
  { value: "photo", label: "Employee Photo", icon: Camera, color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" },
  { value: "other", label: "Other Document", icon: FileText, color: "bg-muted text-muted-foreground" },
] as const;

type DocTypeValue = typeof DOC_TYPES[number]["value"];

// ─── Expiry badge ─────────────────────────────────────────────────────────────

function ExpiryBadge({ expiryDate }: { expiryDate: Date | string | null }) {
  if (!expiryDate) return <Badge variant="outline" className="text-muted-foreground text-xs">No Expiry</Badge>;

  const expiry = new Date(expiryDate);
  const now = new Date();
  const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return (
      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800 text-xs">
        <FileX className="w-3 h-3 mr-1" /> Expired
      </Badge>
    );
  }
  if (daysLeft <= 30) {
    return (
      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800 text-xs">
        <AlertTriangle className="w-3 h-3 mr-1" /> {daysLeft}d left
      </Badge>
    );
  }
  if (daysLeft <= 90) {
    return (
      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800 text-xs">
        <Clock className="w-3 h-3 mr-1" /> {daysLeft}d left
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-xs">
      <CheckCircle2 className="w-3 h-3 mr-1" /> Valid
    </Badge>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EmployeeDocumentsPage() {
  const params = useParams<{ id: string }>();
  const employeeId = parseInt(params.id ?? "0", 10);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteDocId, setDeleteDocId] = useState<number | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);

  const [form, setForm] = useState({
    documentType: "" as DocTypeValue | "",
    issuedAt: "",
    expiresAt: "",
    fileBase64: "",
    fileName: "",
    mimeType: "",
    fileSize: 0,
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: employee } = trpc.hr.getEmployee.useQuery({ id: employeeId }, { enabled: !!employeeId });
  const { data: docs = [], isLoading } = trpc.documents.listEmployeeDocs.useQuery(
    { employeeId },
    { enabled: !!employeeId }
  );

  const uploadMutation = trpc.documents.uploadEmployeeDoc.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded successfully");
      utils.documents.listEmployeeDocs.invalidate({ employeeId });
      setUploadOpen(false);
      resetForm();
    },
    onError: (err) => toast.error("Upload failed: " + err.message),
  });

  const deleteMutation = trpc.documents.deleteEmployeeDoc.useMutation({
    onSuccess: () => {
      toast.success("Document removed");
      utils.documents.listEmployeeDocs.invalidate({ employeeId });
      setDeleteDocId(null);
    },
    onError: (err) => toast.error("Delete failed: " + err.message),
  });

  function resetForm() {
    setForm({ documentType: "", issuedAt: "", expiresAt: "", fileBase64: "", fileName: "", mimeType: "", fileSize: 0 });
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("File too large — maximum file size is 16MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setForm((f) => ({ ...f, fileBase64: base64, fileName: file.name, mimeType: file.type, fileSize: file.size }));
    };
    reader.readAsDataURL(file);
  }

  const employeeName = employee
    ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || "Employee"
    : "Employee";

  // Group docs by type
  const docsByType = DOC_TYPES.map((type) => ({
    ...type,
    docs: docs.filter((d) => d.documentType === type.value),
  })).filter((t) => t.docs.length > 0);

  const missingTypes = DOC_TYPES.filter(
    (t) => t.value !== "other" && t.value !== "photo" && !docs.some((d) => d.documentType === t.value)
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/my-team`)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{employeeName} — Documents</h1>
              <p className="text-sm text-muted-foreground">
                {employee?.position ?? "Employee"} · {docs.length} document{docs.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Upload Document
        </Button>
      </div>

      {/* Missing documents alert */}
      {missingTypes.length > 0 && docs.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Missing Documents</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                {missingTypes.map((t) => t.label).join(", ")} have not been uploaded yet.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        /* Empty state */
        <div className="text-center py-16 border-2 border-dashed border-border rounded-xl">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-1">No documents uploaded yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Upload work permit, passport, visa, resident card, and other official documents for this employee.
          </p>
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {DOC_TYPES.slice(0, 5).map((t) => (
              <Badge key={t.value} variant="outline" className="text-xs">{t.label}</Badge>
            ))}
          </div>
          <Button onClick={() => setUploadOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Upload First Document
          </Button>
        </div>
      ) : (
        /* Documents by type */
        <div className="space-y-6">
          {docsByType.map(({ value, label, icon: Icon, color, docs: typeDocs }) => (
            <div key={value}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-6 h-6 rounded flex items-center justify-center ${color}`}>
                  <Icon className="w-3 h-3" />
                </div>
                <h3 className="font-semibold text-foreground text-sm">{label}</h3>
                <Badge variant="outline" className="text-xs">{typeDocs.length}</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {typeDocs.map((doc) => (
                  <Card key={doc.id} className="bg-card border-border hover:shadow-sm transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{doc.fileName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {doc.mimeType?.includes("pdf") ? "PDF" : "Image"} ·{" "}
                            {doc.fileSizeBytes ? `${Math.round(doc.fileSizeBytes / 1024)}KB` : ""}
                          </p>
                        </div>
                        <ExpiryBadge expiryDate={doc.expiresAt} />
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1 mb-3">
                        {doc.issuedAt && (
                          <div>Issued: {new Date(doc.issuedAt).toLocaleDateString()}</div>
                        )}
                        {doc.expiresAt && (
                          <div>Expires: {new Date(doc.expiresAt).toLocaleDateString()}</div>
                        )}
                        {doc.verificationStatus && (
                          <div className="flex items-center gap-1">
                            Status:{" "}
                            <Badge variant="outline" className="text-xs py-0">
                              {doc.verificationStatus}
                            </Badge>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {doc.fileUrl && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 gap-1 text-xs"
                            onClick={() => setViewUrl(doc.fileUrl as string)}
                          >
                            <Eye className="w-3 h-3" /> View
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs text-destructive hover:text-destructive"
                          onClick={() => setDeleteDocId(doc.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}

          {/* Quick upload missing docs */}
          {missingTypes.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Missing Documents</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {missingTypes.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.value}
                      className="flex items-center gap-2 p-3 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/50 transition-colors text-left"
                      onClick={() => {
                        setForm((f) => ({ ...f, documentType: type.value as DocTypeValue }));
                        setUploadOpen(true);
                      }}
                    >
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground">{type.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { setUploadOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document for {employeeName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Document Type *</Label>
              <Select
                value={form.documentType}
                onValueChange={(v) => setForm((f) => ({ ...f, documentType: v as DocTypeValue }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Issue Date</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={form.issuedAt}
                  onChange={(e) => setForm((f) => ({ ...f, issuedAt: e.target.value }))}
                />
              </div>
              <div>
                <Label>Expiry Date</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Upload File *</Label>
              <div
                className="mt-1 border-2 border-dashed border-border rounded-lg p-5 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {form.fileName ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-foreground">
                    <FileText className="w-4 h-4 text-primary" />
                    {form.fileName}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    <Upload className="w-6 h-6 mx-auto mb-2" />
                    <p>Click to upload PDF or image</p>
                    <p className="text-xs mt-1">Max 16MB · PDF, JPG, PNG</p>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadOpen(false); resetForm(); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (!form.documentType || !form.fileBase64) return;
                uploadMutation.mutate({
                  employeeId,
                  documentType: form.documentType as DocTypeValue,
                  fileName: form.fileName,
                  issuedAt: form.issuedAt || undefined,
                  expiresAt: form.expiresAt || undefined,
                  fileBase64: form.fileBase64,
                  mimeType: form.mimeType,
                  fileSize: form.fileSize,
                });
              }}
              disabled={!form.documentType || !form.fileBase64 || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteDocId} onOpenChange={(o) => !o && setDeleteDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this document. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteDocId && deleteMutation.mutate({ id: deleteDocId })}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Document viewer */}
      {viewUrl && (
        <Dialog open={!!viewUrl} onOpenChange={(o) => !o && setViewUrl(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Document Preview</h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={viewUrl} target="_blank" rel="noopener noreferrer">Open in New Tab</a>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setViewUrl(null)}>Close</Button>
              </div>
            </div>
            <iframe
              src={viewUrl}
              className="w-full"
              style={{ height: "75vh" }}
              title="Document Preview"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
