import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Trash2,
  Download,
  Loader2,
  Users,
  Building2,
  Calendar,
  MapPin,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";

type AssignmentRow = {
  id: string;
  firstPartyCompanyId: number;
  secondPartyCompanyId: number;
  promoterEmployeeId: number;
  locationAr: string | null;
  locationEn: string | null;
  startDate: Date | string;
  endDate: Date | string;
  status: string;
  contractReferenceNumber: string | null;
  firstPartyName: string;
  secondPartyName: string;
  promoterName: string;
};

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 10);
}

export default function PromoterAssignmentsPage() {
  const { activeCompanyId } = useActiveCompany();
  const [showCreate, setShowCreate] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [clientCompanyId, setClientCompanyId] = useState<number | "">("");
  const [employerCompanyId, setEmployerCompanyId] = useState<number | "">("");
  const [promoterEmployeeId, setPromoterEmployeeId] = useState<number | "">("");
  const [clientSiteId, setClientSiteId] = useState<number | "">("");
  const [form, setForm] = useState({
    locationEn: "",
    locationAr: "",
    startDate: "",
    endDate: "",
    contractReferenceNumber: "",
    issueDate: "",
    status: "active" as "active" | "inactive" | "expired",
  });

  const {
    data: assignments = [],
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = trpc.promoterAssignments.list.useQuery(undefined, {
    retry: 1,
  });

  const { data: docGenReadiness } = trpc.documentGeneration.readiness.useQuery();
  const pdfGenerationAvailable = docGenReadiness?.googleDocsConfigured ?? false;

  const pickersInput =
    typeof clientCompanyId === "number" ? { clientCompanyId } : undefined;
  const { data: pickers, isLoading: pickersLoading } =
    trpc.promoterAssignments.companiesForPartyPickers.useQuery(pickersInput, {
      enabled: showCreate && activeCompanyId != null,
    });

  const { data: clientSites = [], isLoading: sitesLoading } =
    trpc.promoterAssignments.listClientWorkLocations.useQuery(
      { clientCompanyId: typeof clientCompanyId === "number" ? clientCompanyId : 0 },
      {
        enabled: showCreate && typeof clientCompanyId === "number" && clientCompanyId > 0,
      }
    );

  const employerEmployeesQueryEnabled =
    showCreate &&
    typeof clientCompanyId === "number" &&
    clientCompanyId > 0 &&
    typeof employerCompanyId === "number" &&
    employerCompanyId > 0;

  const {
    data: employerEmployees = [],
    isLoading: employeesLoading,
    isError: employeesQueryError,
    error: employeesQueryErr,
    refetch: refetchEmployerEmployees,
  } = trpc.promoterAssignments.listEmployerEmployees.useQuery(
    {
      employerCompanyId: typeof employerCompanyId === "number" ? employerCompanyId : 0,
      clientCompanyId: typeof clientCompanyId === "number" && clientCompanyId > 0 ? clientCompanyId : undefined,
    },
    {
      enabled: employerEmployeesQueryEnabled,
    }
  );

  useEffect(() => {
    if (showCreate && activeCompanyId != null && clientCompanyId === "") {
      setClientCompanyId(activeCompanyId);
    }
  }, [showCreate, activeCompanyId, clientCompanyId]);

  const createMutation = trpc.promoterAssignments.create.useMutation({
    onSuccess: () => {
      toast.success("Assignment created", { description: "Promoter assignment saved successfully." });
      refetch();
      setShowCreate(false);
      resetForm();
    },
    onError: (e) => toast.error("Error", { description: e.message }),
  });

  const deleteMutation = trpc.promoterAssignments.delete.useMutation({
    onSuccess: () => {
      toast.success("Deleted", { description: "Assignment removed." });
      refetch();
    },
    onError: (e) => toast.error("Error", { description: e.message }),
  });

  const generateMutation = trpc.documentGeneration.generate.useMutation({
    onSuccess: (result) => {
      toast.success("Contract generated!", { description: "Opening PDF…" });
      window.open(result.fileUrl, "_blank");
      setGeneratingId(null);
    },
    onError: (e) => {
      const isConfig = e.data?.code === "PRECONDITION_FAILED" || /GOOGLE_DOCS_SERVICE_ACCOUNT_JSON/i.test(e.message);
      toast.error(isConfig ? "PDF generation unavailable" : "Generation failed", { description: e.message });
      setGeneratingId(null);
    },
  });

  function resetForm() {
    setClientCompanyId("");
    setEmployerCompanyId("");
    setPromoterEmployeeId("");
    setClientSiteId("");
    setForm({
      locationEn: "",
      locationAr: "",
      startDate: "",
      endDate: "",
      contractReferenceNumber: "",
      issueDate: "",
      status: "active",
    });
  }

  function openCreate() {
    resetForm();
    setShowCreate(true);
  }

  const canSubmit =
    typeof clientCompanyId === "number" &&
    typeof employerCompanyId === "number" &&
    typeof promoterEmployeeId === "number" &&
    form.locationEn.trim().length > 0 &&
    form.locationAr.trim().length > 0 &&
    form.startDate &&
    form.endDate &&
    clientCompanyId !== employerCompanyId;

  function handleCreate() {
    if (!canSubmit) {
      toast.error("Missing fields", {
        description: "Select both parties, promoter, locations, and dates.",
      });
      return;
    }
    createMutation.mutate({
      clientCompanyId,
      employerCompanyId,
      promoterEmployeeId,
      locationAr: form.locationAr.trim(),
      locationEn: form.locationEn.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      contractReferenceNumber: form.contractReferenceNumber.trim() || undefined,
      issueDate: form.issueDate || undefined,
      clientSiteId: typeof clientSiteId === "number" ? clientSiteId : undefined,
      status: form.status,
    });
  }

  function handleGenerate(assignment: AssignmentRow) {
    setGeneratingId(assignment.id);
    generateMutation.mutate({
      templateKey: "promoter_assignment_contract_bilingual",
      entityId: assignment.id,
      outputFormat: "pdf",
    });
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return assignments;
    const q = search.toLowerCase();
    return (assignments as AssignmentRow[]).filter(
      (a) =>
        (a.promoterName ?? "").toLowerCase().includes(q) ||
        (a.firstPartyName ?? "").toLowerCase().includes(q) ||
        (a.secondPartyName ?? "").toLowerCase().includes(q) ||
        (a.locationEn ?? "").toLowerCase().includes(q) ||
        (a.contractReferenceNumber ?? "").toLowerCase().includes(q)
    );
  }, [assignments, search]);

  const statusColor: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    inactive: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
    expired: "bg-red-500/15 text-red-500 border-red-500/30",
  };

  const assignmentRows = assignments as AssignmentRow[];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-border/60 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Promoter Assignments
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Manage promoter assignment contracts between companies. The client (first party) hosts the work site; the
              employer (second party) supplies the promoter employee. Generate bilingual PDF contracts instantly.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2 shrink-0 self-start">
            <Plus className="h-4 w-4" />
            New Assignment
          </Button>
        </div>

        {isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <span>{error?.message ?? "Could not load assignments."}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {docGenReadiness && !pdfGenerationAvailable && (
          <Alert className="border-amber-500/40 bg-amber-500/5 text-foreground">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-foreground">Contract PDFs are not available on this server</AlertTitle>
            <AlertDescription className="text-foreground/90 space-y-2">
              <p className="text-sm leading-relaxed">
                A server admin should set{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
                  GOOGLE_DOCS_SERVICE_ACCOUNT_JSON
                </code>{" "}
                to your Google Cloud service account JSON (full key file as one line or string), then restart the app.
              </p>
              <ul className="list-disc pl-4 text-sm text-muted-foreground space-y-1 marker:text-amber-600/80">
                <li>Enable Google Drive API and Google Docs API for the GCP project.</li>
                <li>
                  Share each template Doc with the service account email (
                  <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono text-foreground">client_email</code>{" "}
                  in the JSON) as Editor.
                </li>
                <li>
                  See{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono text-foreground">.env.example</code>{" "}
                  for the variable and a sample.
                </li>
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {/* Stats bar */}
        <div
          className={`grid grid-cols-2 sm:grid-cols-4 gap-3 transition-opacity ${isFetching && !isLoading ? "opacity-80" : ""}`}
        >
          {[
            { label: "Total", value: assignmentRows.length, icon: <FileText className="h-4 w-4" /> },
            {
              label: "Active",
              value: assignmentRows.filter((a) => a.status === "active").length,
              icon: <Users className="h-4 w-4 text-emerald-500" />,
            },
            {
              label: "Expired",
              value: assignmentRows.filter((a) => a.status === "expired").length,
              icon: <AlertCircle className="h-4 w-4 text-red-500" />,
            },
            {
              label: "Companies",
              value: new Set(assignmentRows.flatMap((a) => [a.firstPartyCompanyId, a.secondPartyCompanyId])).size,
              icon: <Building2 className="h-4 w-4 text-blue-500" />,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border bg-card/80 shadow-sm backdrop-blur-sm p-4 flex items-center gap-3"
            >
              <div className="p-2 rounded-lg bg-muted/80">{s.icon}</div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search + Refresh */}
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search by promoter, company, or location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm min-w-[200px]"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Table — min-width + horizontal scroll so all columns (esp. Promoter) stay readable */}
        <div className="rounded-xl border bg-card shadow-sm">
          <Table className="min-w-[1020px]">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="font-semibold min-w-[9.5rem] w-[11rem]">Promoter</TableHead>
                <TableHead className="font-semibold min-w-[10rem] max-w-[14rem]">First Party</TableHead>
                <TableHead className="font-semibold min-w-[10rem] max-w-[14rem]">Second Party</TableHead>
                <TableHead className="font-semibold min-w-[12rem] max-w-[18rem]">Location</TableHead>
                <TableHead className="font-semibold whitespace-nowrap">Period</TableHead>
                <TableHead className="font-semibold whitespace-nowrap">Ref #</TableHead>
                <TableHead className="font-semibold whitespace-nowrap">Status</TableHead>
                <TableHead className="text-right font-semibold sticky right-0 z-10 bg-muted/95 backdrop-blur-sm border-l border-border/60 shadow-[-6px_0_12px_-6px_rgba(0,0,0,0.08)] min-w-[9rem]">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3" />
                    <p>Loading assignments…</p>
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                    <p className="font-medium text-destructive">Unable to load data</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                      Try again
                    </Button>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground max-w-md mx-auto">
                      <FileText className="h-12 w-12 opacity-25" />
                      <p className="font-medium text-foreground">No assignments yet</p>
                      <p className="text-sm">
                        {search.trim()
                          ? "No rows match your search. Clear the filter or try different keywords."
                          : "Create a promoter assignment to link a client site with an employer’s employee and generate contracts."}
                      </p>
                      {!search.trim() && (
                        <Button size="sm" onClick={openCreate} className="mt-1 gap-2">
                          <Plus className="h-4 w-4" /> New Assignment
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                (filtered as AssignmentRow[]).map((a) => (
                  <TableRow key={a.id} className="hover:bg-muted/30 group">
                    <TableCell className="whitespace-normal align-top min-w-[9.5rem] max-w-[13rem]">
                      <div className="flex items-start gap-2 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0 mt-0.5">
                          {(a.promoterName || "?").charAt(0).toUpperCase()}
                        </div>
                        <span
                          className="font-medium text-sm leading-snug break-words"
                          title={a.promoterName || undefined}
                        >
                          {a.promoterName || "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal align-top min-w-[10rem] max-w-[14rem] break-words">
                      <span title={a.firstPartyName}>{a.firstPartyName}</span>
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal align-top min-w-[10rem] max-w-[14rem] break-words">
                      <span title={a.secondPartyName}>{a.secondPartyName}</span>
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal align-top min-w-[12rem] max-w-[18rem]">
                      <div className="flex items-start gap-1.5 text-muted-foreground min-w-0">
                        <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span className="line-clamp-3 break-words" title={a.locationEn ?? undefined}>
                          {a.locationEn ?? "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap align-top">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {formatDate(a.startDate)} → {formatDate(a.endDate)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono text-xs whitespace-nowrap align-top max-w-[7rem] truncate" title={a.contractReferenceNumber ?? undefined}>
                      {a.contractReferenceNumber ?? "—"}
                    </TableCell>
                    <TableCell className="align-top whitespace-nowrap">
                      <Badge variant="outline" className={`text-xs capitalize ${statusColor[a.status] ?? ""}`}>
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="sticky right-0 z-10 bg-card group-hover:bg-muted/40 border-l border-border/50 align-top shadow-[-6px_0_12px_-6px_rgba(0,0,0,0.06)]">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="gap-1.5 text-xs"
                          disabled={generatingId === a.id || !pdfGenerationAvailable}
                          onClick={() => handleGenerate(a)}
                          title={
                            pdfGenerationAvailable
                              ? "Generate bilingual PDF contract"
                              : "PDF generation is not configured (GOOGLE_DOCS_SERVICE_ACCOUNT_JSON missing on server)"
                          }
                        >
                          {generatingId === a.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          {generatingId === a.id ? "Generating…" : "Contract"}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("Delete this assignment?")) deleteMutation.mutate({ id: a.id });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog
        open={showCreate}
        onOpenChange={(v) => {
          setShowCreate(v);
          if (!v) resetForm();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto gap-0 p-0 sm:p-0">
          <div className="p-6 pb-0 space-y-3">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Plus className="h-5 w-5" />
                New Promoter Assignment
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                <strong className="text-foreground">First party</strong> is the client (work site).{" "}
                <strong className="text-foreground">Second party</strong> is the employer. The{" "}
                <strong className="text-foreground">promoter</strong> must be an employee of the employer only.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 py-4 space-y-6">
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Building2 className="h-4 w-4 text-primary" />
                Contract parties
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-x-6">
                <div className="space-y-2 min-w-0">
                  <Label className="text-foreground">First party (client) *</Label>
                  <Select
                    value={clientCompanyId === "" ? "" : String(clientCompanyId)}
                    onValueChange={(v) => {
                      const n = Number(v);
                      setClientCompanyId(n);
                      setClientSiteId("");
                      setEmployerCompanyId("");
                      setPromoterEmployeeId("");
                      setForm((f) => ({ ...f, locationEn: "", locationAr: "" }));
                    }}
                    disabled={pickersLoading}
                  >
                    <SelectTrigger className="h-11 w-full min-w-0 max-w-full">
                      <SelectValue placeholder={pickersLoading ? "Loading companies…" : "Select client company…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(pickers?.clientOptions ?? []).map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                          {c.nameAr ? ` · ${c.nameAr}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 min-w-0">
                  <Label className="text-foreground">Second party (employer) *</Label>
                  <Select
                    value={employerCompanyId === "" ? "" : String(employerCompanyId)}
                    onValueChange={(v) => {
                      setEmployerCompanyId(Number(v));
                      setPromoterEmployeeId("");
                    }}
                    disabled={typeof clientCompanyId !== "number" || clientCompanyId <= 0}
                  >
                    <SelectTrigger className="h-11 w-full min-w-0 max-w-full">
                      <SelectValue placeholder="Select employer company…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(pickers?.employerOptions ?? []).map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                          {c.nameAr ? ` · ${c.nameAr}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <MapPin className="h-4 w-4 text-primary" />
                Work location
              </div>
              <div className="space-y-2">
                <Label>Client work location (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Pick a saved attendance site to fill English and Arabic location fields, or type manually below.
                </p>
                <Select
                  value={clientSiteId === "" ? "__manual__" : String(clientSiteId)}
                  onValueChange={(v) => {
                    if (v === "__manual__") {
                      setClientSiteId("");
                      return;
                    }
                    const sid = Number(v);
                    setClientSiteId(sid);
                    const site = clientSites.find((s) => s.id === sid);
                    if (site) {
                      const en = [site.name, site.location].filter(Boolean).join(" — ");
                      setForm((f) => ({
                        ...f,
                        locationEn: en,
                        locationAr: site.name,
                      }));
                    }
                  }}
                  disabled={typeof clientCompanyId !== "number" || sitesLoading}
                >
                  <SelectTrigger className="h-11 w-full min-w-0 max-w-full">
                    <SelectValue
                      placeholder={sitesLoading ? "Loading sites…" : "Select site or type manually…"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__manual__">Type location manually</SelectItem>
                    {clientSites.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                        {s.location ? ` — ${s.location}` : ""}
                        {s.clientName ? ` (${s.clientName})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Location (English) *</Label>
                  <Input
                    className="h-11"
                    placeholder="e.g. eXtra - Muscat City Centre"
                    value={form.locationEn}
                    onChange={(e) => setForm((f) => ({ ...f, locationEn: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Location (Arabic) *</Label>
                  <Input
                    className="h-11"
                    dir="rtl"
                    placeholder="مثال: اكسترا - مسقط سيتي سنتر"
                    value={form.locationAr}
                    onChange={(e) => setForm((f) => ({ ...f, locationAr: e.target.value }))}
                  />
                </div>
              </div>
            </section>

            <Separator />

            <section className="space-y-3 min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Users className="h-4 w-4 text-primary" />
                Promoter employee
              </div>
              <p className="text-xs text-muted-foreground -mt-1">
                Lists active and on-leave employees of the selected employer (second party).
              </p>
              {employeesQueryError && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                    <span>{employeesQueryErr?.message ?? "Could not load employees."}</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => refetchEmployerEmployees()}>
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              <Select
                value={promoterEmployeeId === "" ? "" : String(promoterEmployeeId)}
                onValueChange={(v) => setPromoterEmployeeId(Number(v))}
                disabled={
                  typeof clientCompanyId !== "number" ||
                  clientCompanyId <= 0 ||
                  typeof employerCompanyId !== "number" ||
                  employerCompanyId <= 0 ||
                  employeesLoading ||
                  employeesQueryError
                }
              >
                <SelectTrigger className="h-11 w-full min-w-0 max-w-full">
                  <SelectValue
                    placeholder={
                      typeof clientCompanyId !== "number" || clientCompanyId <= 0
                        ? "Select client (first party) first…"
                        : typeof employerCompanyId !== "number" || employerCompanyId <= 0
                          ? "Select employer first…"
                          : employeesLoading
                            ? "Loading employees…"
                            : employeesQueryError
                              ? "Employee list unavailable"
                              : "Select employee…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {employerEmployees.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.firstName} {e.lastName}
                      {e.status === "on_leave" ? " (on leave)" : ""}
                      {e.firstNameAr || e.lastNameAr
                        ? ` · ${[e.firstNameAr, e.lastNameAr].filter(Boolean).join(" ")}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {employerEmployeesQueryEnabled &&
                !employeesLoading &&
                !employeesQueryError &&
                employerEmployees.length === 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-500/90 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
                    No active or on-leave employees found for this employer in HR. Add employees under the employer
                    company or check their employment status.
                  </p>
                )}
            </section>

            <Separator />

            <section className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start date *</Label>
                  <DateInput
                    className="h-11"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End date *</Label>
                  <DateInput
                    className="h-11"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contract reference no.</Label>
                  <Input
                    className="h-11 font-mono text-sm"
                    placeholder="e.g. PA-2026-001"
                    value={form.contractReferenceNumber}
                    onChange={(e) => setForm((f) => ({ ...f, contractReferenceNumber: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Issue date</Label>
                  <DateInput
                    className="h-11"
                    value={form.issueDate}
                    onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2 max-w-xs">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof f.status }))}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>
          </div>

          <DialogFooter className="p-6 pt-2 border-t bg-muted/20 flex-row justify-end gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreate(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !canSubmit} className="gap-2 min-w-[160px]">
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
