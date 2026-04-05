import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  CardHeader,
  CardTitle,
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
  Pencil,
  Trash2,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileX,
  Building2,
  Shield,
  Briefcase,
  CreditCard,
  ArrowLeft,
} from "lucide-react";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";
import { DateInput } from "@/components/ui/date-input";

// ─── Document type config ─────────────────────────────────────────────────────

const DOC_TYPES: { value: string; label: string; icon: React.ElementType; category: string }[] = [
  { value: "cr_certificate", label: "Commercial Registration (CR)", icon: Building2, category: "Business Registration" },
  { value: "occi_membership", label: "OCCI Membership Certificate", icon: Shield, category: "Business Registration" },
  { value: "municipality_licence", label: "Municipality Licence", icon: Building2, category: "Licences" },
  { value: "trade_licence", label: "Trade Licence", icon: Briefcase, category: "Licences" },
  { value: "tax_card", label: "Tax Card", icon: CreditCard, category: "Tax & Finance" },
  { value: "labour_card", label: "Labour Card (MOL)", icon: Shield, category: "Labour" },
  { value: "pasi_certificate", label: "PASI Certificate", icon: Shield, category: "Labour" },
  { value: "chamber_certificate", label: "Chamber of Commerce Certificate", icon: Building2, category: "Business Registration" },
  { value: "bank_letter", label: "Bank Introduction Letter", icon: CreditCard, category: "Finance" },
  { value: "insurance_certificate", label: "Insurance Certificate", icon: Shield, category: "Insurance" },
  { value: "other", label: "Other Document", icon: FileText, category: "Other" },
];

const CATEGORIES = DOC_TYPES.map((d) => d.category).filter((v, i, a) => a.indexOf(v) === i);

// ─── Expiry status helpers ────────────────────────────────────────────────────

function ExpiryBadge({ status, expiryDate }: { status: string; expiryDate: string | null }) {
  if (!expiryDate) return <Badge variant="outline" className="text-muted-foreground">No Expiry</Badge>;

  const expiry = new Date(expiryDate);
  const now = new Date();
  const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (status === "expired" || daysLeft < 0) {
    return (
      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800">
        <FileX className="w-3 h-3 mr-1" /> Expired
      </Badge>
    );
  }
  if (daysLeft <= 30) {
    return (
      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800">
        <AlertTriangle className="w-3 h-3 mr-1" /> {daysLeft}d left
      </Badge>
    );
  }
  if (daysLeft <= 90) {
    return (
      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800">
        <Clock className="w-3 h-3 mr-1" /> {daysLeft}d left
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
      <CheckCircle2 className="w-3 h-3 mr-1" /> Valid
    </Badge>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CompanyDocumentsPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<any>(null);
  const [deleteDocId, setDeleteDocId] = useState<number | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);

  // Upload form state
  const [form, setForm] = useState({
    docType: "",
    title: "",
    docNumber: "",
    issuingAuthority: "",
    issueDate: "",
    expiryDate: "",
    notes: "",
    fileBase64: "",
    fileName: "",
    mimeType: "",
    fileSize: 0,
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: docs = [], isLoading } = trpc.documents.listCompanyDocs.useQuery();
  const { data: stats } = trpc.documents.getCompanyDocStats.useQuery();

  const uploadMutation = trpc.documents.uploadCompanyDoc.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded successfully");
      utils.documents.listCompanyDocs.invalidate();
      utils.documents.getCompanyDocStats.invalidate();
      setUploadOpen(false);
      resetForm();
    },
    onError: (err) => toast.error("Upload failed: " + err.message),
  });

  const updateMutation = trpc.documents.updateCompanyDoc.useMutation({
    onSuccess: () => {
      toast.success("Document updated");
      utils.documents.listCompanyDocs.invalidate();
      setEditDoc(null);
    },
    onError: (err) => toast.error("Update failed: " + err.message),
  });

  const deleteMutation = trpc.documents.deleteCompanyDoc.useMutation({
    onSuccess: () => {
      toast.success("Document removed");
      utils.documents.listCompanyDocs.invalidate();
      utils.documents.getCompanyDocStats.invalidate();
      setDeleteDocId(null);
    },
    onError: (err) => toast.error("Delete failed: " + err.message),
  });

  function resetForm() {
    setForm({ docType: "", title: "", docNumber: "", issuingAuthority: "", issueDate: "", expiryDate: "", notes: "", fileBase64: "", fileName: "", mimeType: "", fileSize: 0 });
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setForm((f) => ({ ...f, fileBase64: base64, fileName: file.name, mimeType: file.type, fileSize: file.size }));
    };
    reader.readAsDataURL(file);
  }

  const filteredDocs = activeCategory === "all"
    ? docs
    : docs.filter((d) => {
        const type = DOC_TYPES.find((t) => t.value === d.docType);
        return type?.category === activeCategory;
      });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/company/workspace")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Company Documents</h1>
            <p className="text-sm text-muted-foreground">Official certificates, licences, and registrations</p>
          </div>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Document
        </Button>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Documents", value: stats.total, color: "text-foreground" },
            { label: "Valid", value: stats.valid, color: "text-emerald-600 dark:text-emerald-400" },
            { label: "Expiring Soon", value: stats.expiringSoon, color: "text-amber-600 dark:text-amber-400" },
            { label: "Expired", value: stats.expired, color: "text-red-600 dark:text-red-400" },
          ].map((s) => (
            <Card key={s.label} className="bg-card border-border">
              <CardContent className="p-4 text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={activeCategory === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveCategory("all")}
        >
          All ({docs.length})
        </Button>
        {CATEGORIES.map((cat) => {
          const count = docs.filter((d) => {
            const type = DOC_TYPES.find((t) => t.value === d.docType);
            return type?.category === cat;
          }).length;
          return (
            <Button
              key={cat}
              variant={activeCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveCategory(cat)}
            >
              {cat} ({count})
            </Button>
          );
        })}
      </div>

      {/* Documents grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-xl">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-1">No documents yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Upload your company's official documents to keep them organised and track expiry dates.
          </p>
          <Button onClick={() => setUploadOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Upload First Document
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocs.map((doc) => {
            const typeConfig = DOC_TYPES.find((t) => t.value === doc.docType);
            const Icon = typeConfig?.icon ?? FileText;
            return (
              <Card key={doc.id} className="bg-card border-border hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold text-foreground truncate">{doc.title}</CardTitle>
                        <p className="text-xs text-muted-foreground truncate">{typeConfig?.label ?? doc.docType}</p>
                      </div>
                    </div>
                    <ExpiryBadge status={doc.expiryStatus} expiryDate={doc.expiryDate as string | null} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {doc.docNumber && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">No:</span> {doc.docNumber}
                    </div>
                  )}
                  {doc.issuingAuthority && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Issued by:</span> {doc.issuingAuthority}
                    </div>
                  )}
                  <div className="flex gap-1 text-xs text-muted-foreground">
                    {doc.issueDate && <span>Issued: {fmtDate(doc.issueDate)}</span>}
                    {doc.issueDate && doc.expiryDate && <span>·</span>}
                    {doc.expiryDate && <span>Expires: {fmtDate(doc.expiryDate)}</span>}
                  </div>
                  <div className="flex gap-2 pt-1">
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
                      className="gap-1 text-xs"
                      onClick={() => setEditDoc(doc)}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
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
            );
          })}
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { setUploadOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload Company Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Document Type *</Label>
              <Select value={form.docType} onValueChange={(v) => {
                const type = DOC_TYPES.find((t) => t.value === v);
                setForm((f) => ({ ...f, docType: v, title: f.title || type?.label || "" }));
              }}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <div key={cat}>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{cat}</div>
                      {DOC_TYPES.filter((t) => t.category === cat).map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Document Title *</Label>
              <Input
                className="mt-1"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Commercial Registration Certificate"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Document Number</Label>
                <Input
                  className="mt-1"
                  value={form.docNumber}
                  onChange={(e) => setForm((f) => ({ ...f, docNumber: e.target.value }))}
                  placeholder="e.g. 1354155"
                />
              </div>
              <div>
                <Label>Issuing Authority</Label>
                <Input
                  className="mt-1"
                  value={form.issuingAuthority}
                  onChange={(e) => setForm((f) => ({ ...f, issuingAuthority: e.target.value }))}
                  placeholder="e.g. MOCIIP"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Issue Date</Label>
                <DateInput className="mt-1"
                  value={form.issueDate}
                  onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
                />
              </div>
              <div>
                <Label>Expiry Date</Label>
                <DateInput className="mt-1"
                  value={form.expiryDate}
                  onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Upload File (PDF / Image)</Label>
              <div
                className="mt-1 border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {form.fileName ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-foreground">
                    <FileText className="w-4 h-4 text-primary" />
                    {form.fileName}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    <Upload className="w-5 h-5 mx-auto mb-1" />
                    Click to upload PDF or image
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
            <div>
              <Label>Notes</Label>
              <Textarea
                className="mt-1"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Any additional notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadOpen(false); resetForm(); }}>Cancel</Button>
            <Button
              onClick={() => uploadMutation.mutate(form)}
              disabled={!form.docType || !form.title || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      {editDoc && (
        <Dialog open={!!editDoc} onOpenChange={(o) => !o && setEditDoc(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Document</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Document Title</Label>
                <Input
                  className="mt-1"
                  value={editDoc.title}
                  onChange={(e) => setEditDoc((d: any) => ({ ...d, title: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Document Number</Label>
                  <Input
                    className="mt-1"
                    value={editDoc.docNumber ?? ""}
                    onChange={(e) => setEditDoc((d: any) => ({ ...d, docNumber: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Issuing Authority</Label>
                  <Input
                    className="mt-1"
                    value={editDoc.issuingAuthority ?? ""}
                    onChange={(e) => setEditDoc((d: any) => ({ ...d, issuingAuthority: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Issue Date</Label>
                  <DateInput className="mt-1"
                    value={editDoc.issueDate ? new Date(editDoc.issueDate).toISOString().split("T")[0] : ""}
                    onChange={(e) => setEditDoc((d: any) => ({ ...d, issueDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Expiry Date</Label>
                  <DateInput className="mt-1"
                    value={editDoc.expiryDate ? new Date(editDoc.expiryDate).toISOString().split("T")[0] : ""}
                    onChange={(e) => setEditDoc((d: any) => ({ ...d, expiryDate: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  className="mt-1"
                  rows={2}
                  value={editDoc.notes ?? ""}
                  onChange={(e) => setEditDoc((d: any) => ({ ...d, notes: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDoc(null)}>Cancel</Button>
              <Button
                onClick={() => updateMutation.mutate({
                  id: editDoc.id,
                  title: editDoc.title,
                  docNumber: editDoc.docNumber,
                  issuingAuthority: editDoc.issuingAuthority,
                  issueDate: editDoc.issueDate ? new Date(editDoc.issueDate).toISOString().split("T")[0] : undefined,
                  expiryDate: editDoc.expiryDate ? new Date(editDoc.expiryDate).toISOString().split("T")[0] : undefined,
                  notes: editDoc.notes,
                })}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteDocId} onOpenChange={(o) => !o && setDeleteDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the document from your vault. The file will no longer be accessible.
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

      {/* PDF/Image viewer */}
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
