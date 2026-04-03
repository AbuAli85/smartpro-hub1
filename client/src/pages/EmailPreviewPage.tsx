import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Mail, FileText, PenLine, Send, RefreshCw, Eye, Settings2, ChevronRight,
  Loader2, ExternalLink, Monitor, Smartphone,
} from "lucide-react";

// ── Template definitions ──────────────────────────────────────────────────────
type TemplateId = "invite" | "hr_letter" | "contract_signing";

const TEMPLATES = [
  {
    id: "invite" as TemplateId,
    label: "Team Invite",
    description: "Sent when a company admin invites a new member",
    icon: Mail,
    color: "bg-blue-500/10 text-blue-600 border-blue-200",
    badgeColor: "bg-blue-100 text-blue-700",
  },
  {
    id: "hr_letter" as TemplateId,
    label: "HR Letter",
    description: "Sent when an HR letter is issued to an employee",
    icon: FileText,
    color: "bg-green-500/10 text-green-600 border-green-200",
    badgeColor: "bg-green-100 text-green-700",
  },
  {
    id: "contract_signing" as TemplateId,
    label: "Contract Signing",
    description: "Sent when a signer is added to a contract",
    icon: PenLine,
    color: "bg-orange-500/10 text-orange-600 border-orange-200",
    badgeColor: "bg-orange-100 text-orange-700",
  },
];

// ── Default sample data per template ─────────────────────────────────────────
const DEFAULTS: Record<TemplateId, Record<string, string>> = {
  invite: {
    inviteeName: "John Smith",
    inviterName: "Abu Ali",
    companyName: "Falcon Eye Business and Promotion",
    roleLabel: "Company Admin",
    expiryStr: "10 April 2026",
    inviteUrl: "https://smartprohub-q4qjnxjv.manus.space/invite/sample-token",
  },
  hr_letter: {
    employeeName: "John Smith",
    letterLabel: "Employment Confirmation Letter",
    companyName: "Falcon Eye Business and Promotion",
    issuedBy: "HR Manager",
    dateStr: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  },
  contract_signing: {
    signerName: "John Smith",
    contractTitle: "Service Agreement 2026",
    companyName: "Falcon Eye Business and Promotion",
    signingUrl: "https://smartprohub-q4qjnxjv.manus.space/contracts/sample",
    expiryStr: "30 April 2026",
  },
};

// ── Field definitions per template ───────────────────────────────────────────
const FIELDS: Record<TemplateId, { key: string; label: string; placeholder: string }[]> = {
  invite: [
    { key: "inviteeName",  label: "Invitee Name",   placeholder: "John Smith" },
    { key: "inviterName",  label: "Invited By",      placeholder: "Abu Ali" },
    { key: "companyName",  label: "Company Name",    placeholder: "Falcon Eye Business..." },
    { key: "roleLabel",    label: "Role",            placeholder: "Company Admin" },
    { key: "expiryStr",    label: "Expiry Date",     placeholder: "10 April 2026" },
    { key: "inviteUrl",    label: "Invite URL",      placeholder: "https://..." },
  ],
  hr_letter: [
    { key: "employeeName", label: "Employee Name",   placeholder: "John Smith" },
    { key: "letterLabel",  label: "Letter Type",     placeholder: "Employment Confirmation Letter" },
    { key: "companyName",  label: "Company Name",    placeholder: "Falcon Eye Business..." },
    { key: "issuedBy",     label: "Prepared By",     placeholder: "HR Manager" },
    { key: "dateStr",      label: "Issue Date",      placeholder: "3 April 2026" },
    { key: "pdfUrl",       label: "PDF URL (opt.)",  placeholder: "https://... (leave blank to show login button)" },
  ],
  contract_signing: [
    { key: "signerName",    label: "Signer Name",    placeholder: "John Smith" },
    { key: "contractTitle", label: "Contract Title", placeholder: "Service Agreement 2026" },
    { key: "companyName",   label: "Company Name",   placeholder: "Falcon Eye Business..." },
    { key: "signingUrl",    label: "Signing URL",    placeholder: "https://..." },
    { key: "expiryStr",     label: "Deadline (opt.)", placeholder: "30 April 2026" },
  ],
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function EmailPreviewPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [activeTemplate, setActiveTemplate] = useState<TemplateId>("invite");
  const [fields, setFields] = useState<Record<string, string>>(DEFAULTS["invite"]);
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [testEmailTo, setTestEmailTo] = useState("");
  const [showTestForm, setShowTestForm] = useState(false);

  // Reset fields when template changes
  useEffect(() => {
    setFields(DEFAULTS[activeTemplate]);
  }, [activeTemplate]);

  // Build query input from current fields
  const queryInput = { template: activeTemplate, ...fields };

  const { data, isFetching, refetch } = trpc.companies.previewEmailTemplate.useQuery(
    queryInput,
    { enabled: true, staleTime: 0 }
  );

  // Inject HTML into iframe
  useEffect(() => {
    if (data?.html && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(data.html);
        doc.close();
      }
    }
  }, [data?.html]);

  const sendTestMutation = trpc.companies.sendTestEmail.useMutation({
    onSuccess: (result) => {
      if (result?.success) {
        toast.success("Test email sent!", { description: `Email delivered to ${testEmailTo}` });
        setShowTestForm(false);
        setTestEmailTo("");
      } else {
        toast.error("Send failed", { description: result?.error ?? "Unknown error" });
      }
    },
    onError: (err) => {
      toast.error("Send failed", { description: err.message });
    },
  });

  const activeInfo = TEMPLATES.find((t) => t.id === activeTemplate)!;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Page header ── */}
      <div className="px-6 pt-6 pb-4 border-b border-border bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Settings2 className="w-4 h-4" />
          <span>Company Settings</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">Email Templates</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Email Template Preview</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Preview and test all transactional email templates sent by SmartPRO Hub.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* View mode toggle */}
            <div className="flex items-center border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode("desktop")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "desktop" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                Desktop
              </button>
              <button
                onClick={() => setViewMode("mobile")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "mobile" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Mobile
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5"
            >
              {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setShowTestForm(!showTestForm)}
              className="gap-1.5 bg-red-600 hover:bg-red-700 text-white"
            >
              <Send className="w-3.5 h-3.5" />
              Send Test
            </Button>
          </div>
        </div>

        {/* Send test email form */}
        {showTestForm && (
          <div className="mt-4 p-4 bg-muted/50 rounded-xl border border-border flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs font-medium mb-1.5 block">Send test email to</Label>
              <Input
                type="email"
                placeholder="recipient@example.com"
                value={testEmailTo}
                onChange={(e) => setTestEmailTo(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs font-medium mb-1.5 block">Template</Label>
              <div className="h-9 flex items-center px-3 bg-background border border-border rounded-md text-sm font-medium">
                {activeInfo.label}
              </div>
            </div>
            <Button
              size="sm"
              disabled={!testEmailTo || sendTestMutation.isPending}
              onClick={() =>
                sendTestMutation.mutate({
                  to: testEmailTo,
                  template: activeTemplate,
                  companyName: fields.companyName ?? "Sample Company",
                  roleLabel: fields.roleLabel ?? "Company Admin",
                })
              }
              className="h-9 bg-red-600 hover:bg-red-700 text-white gap-1.5"
            >
              {sendTestMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Send
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTestForm(false)}
              className="h-9 text-muted-foreground"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left panel: template selector + fields */}
        <div className="w-80 shrink-0 flex flex-col border-r border-border overflow-y-auto bg-background">
          {/* Template selector */}
          <div className="p-4 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Templates</p>
            <div className="space-y-2">
              {TEMPLATES.map((t) => {
                const Icon = t.icon;
                const isActive = activeTemplate === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTemplate(t.id)}
                    className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all ${
                      isActive
                        ? "border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800"
                        : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
                    }`}
                  >
                    <div className={`p-2 rounded-lg border ${t.color} shrink-0`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{t.label}</span>
                        {isActive && (
                          <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded-full font-medium">
                            <Eye className="w-2.5 h-2.5" /> Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sample data fields */}
          <div className="p-4 flex-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Sample Data</p>
            <div className="space-y-3">
              {FIELDS[activeTemplate].map((f) => (
                <div key={f.key}>
                  <Label className="text-xs font-medium mb-1 block text-foreground/80">{f.label}</Label>
                  <Input
                    value={fields[f.key] ?? ""}
                    onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>

            <Separator className="my-4" />

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 text-xs"
              onClick={() => setFields(DEFAULTS[activeTemplate])}
            >
              <RefreshCw className="w-3 h-3" />
              Reset to Defaults
            </Button>
          </div>
        </div>

        {/* Right panel: preview iframe */}
        <div className="flex-1 flex flex-col min-w-0 bg-muted/30">
          {/* Preview toolbar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Live Preview</span>
              <Badge variant="outline" className="text-xs font-normal">
                {activeInfo.label}
              </Badge>
              {isFetching && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Rendering…
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>From: noreply@thesmartpro.io</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                Powered by Resend
              </span>
            </div>
          </div>

          {/* Iframe wrapper */}
          <div className="flex-1 overflow-auto flex items-start justify-center p-6">
            <div
              className={`transition-all duration-300 bg-white shadow-xl rounded-xl overflow-hidden border border-border ${
                viewMode === "mobile" ? "w-[390px]" : "w-full max-w-[700px]"
              }`}
              style={{ minHeight: 600 }}
            >
              {data?.html ? (
                <iframe
                  ref={iframeRef}
                  title="Email Preview"
                  className="w-full border-0"
                  style={{ height: 800, display: "block" }}
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="flex items-center justify-center h-96 text-muted-foreground">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-sm">Loading preview…</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
