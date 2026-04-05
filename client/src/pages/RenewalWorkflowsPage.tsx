import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, CheckCircle2, Clock, Edit2, Play, Plus, RefreshCw, Trash2, Zap, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTITY_TYPES = [
  { value: "work_permit", label: "Work Permit" },
  { value: "visa", label: "Visa" },
  { value: "resident_card", label: "Resident Card" },
  { value: "labour_card", label: "Labour Card" },
  { value: "sanad_licence", label: "Sanad Licence" },
  { value: "officer_document", label: "Officer Document" },
  { value: "employee_document", label: "Employee Document" },
  { value: "pro_service", label: "PRO Service" },
];

const CASE_TYPES = [
  { value: "renewal", label: "Renewal" },
  { value: "amendment", label: "Amendment" },
  { value: "document_update", label: "Document Update" },
  { value: "new_permit", label: "New Permit" },
  { value: "transfer", label: "Transfer" },
  { value: "cancellation", label: "Cancellation" },
  { value: "contract_registration", label: "Contract Registration" },
  { value: "employee_update", label: "Employee Update" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:      { label: "Pending",      color: "bg-slate-100 text-slate-700" },
  triggered:    { label: "Triggered",    color: "bg-blue-100 text-blue-700" },
  case_created: { label: "Case Created", color: "bg-green-100 text-green-700" },
  skipped:      { label: "Skipped",      color: "bg-yellow-100 text-yellow-700" },
  failed:       { label: "Failed",       color: "bg-red-100 text-red-700" },
};

// ─── Rule Form Dialog ─────────────────────────────────────────────────────────

type RuleFormData = {
  name: string;
  description: string;
  entityType: string;
  triggerDaysBefore: number;
  autoCreateCase: boolean;
  autoAssignOfficer: boolean;
  notifyClient: boolean;
  notifyOwnerFlag: boolean;
  caseType: string;
};

const DEFAULT_FORM: RuleFormData = {
  name: "",
  description: "",
  entityType: "work_permit",
  triggerDaysBefore: 30,
  autoCreateCase: true,
  autoAssignOfficer: false,
  notifyClient: true,
  notifyOwnerFlag: true,
  caseType: "renewal",
};

function RuleFormDialog({
  open,
  onClose,
  editRule,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editRule?: { id: number } & Partial<RuleFormData>;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<RuleFormData>(editRule ? {
    name: editRule.name ?? "",
    description: editRule.description ?? "",
    entityType: editRule.entityType ?? "work_permit",
    triggerDaysBefore: editRule.triggerDaysBefore ?? 30,
    autoCreateCase: editRule.autoCreateCase ?? true,
    autoAssignOfficer: editRule.autoAssignOfficer ?? false,
    notifyClient: editRule.notifyClient ?? true,
    notifyOwnerFlag: editRule.notifyOwnerFlag ?? true,
    caseType: editRule.caseType ?? "renewal",
  } : DEFAULT_FORM);

  const createRule = trpc.renewalWorkflows.createRule.useMutation({
    onSuccess: () => { toast.success("Rule created"); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const updateRule = trpc.renewalWorkflows.updateRule.useMutation({
    onSuccess: () => { toast.success("Rule updated"); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error("Name is required");
    if (editRule?.id) {
      updateRule.mutate({ id: editRule.id, ...form, caseType: form.caseType as "renewal" });
    } else {
      createRule.mutate({ ...form, entityType: form.entityType as "work_permit", caseType: form.caseType as "renewal" });
    }
  };

  const set = <K extends keyof RuleFormData>(key: K, val: RuleFormData[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const isBusy = createRule.isPending || updateRule.isPending;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editRule ? "Edit Workflow Rule" : "Create Workflow Rule"}</DialogTitle>
          <DialogDescription>
            Define when to automatically trigger a renewal case for an expiring document.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Rule Name *</Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Work Permit 30-day Renewal" />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input value={form.description} onChange={e => set("description", e.target.value)} placeholder="Optional description" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Document Type *</Label>
              <Select value={form.entityType} onValueChange={v => set("entityType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Trigger (days before expiry) *</Label>
              <Input
                type="number" min={1} max={365}
                value={form.triggerDaysBefore}
                onChange={e => set("triggerDaysBefore", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Case Type to Create</Label>
            <Select value={form.caseType} onValueChange={v => set("caseType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CASE_TYPES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Automation Options</p>
            {[
              { key: "autoCreateCase" as const, label: "Auto-create government case", desc: "Automatically opens a case when triggered" },
              { key: "autoAssignOfficer" as const, label: "Auto-assign PRO officer", desc: "Assigns the best available officer to the case" },
              { key: "notifyClient" as const, label: "Notify client", desc: "Send in-app notification to the company" },
              { key: "notifyOwnerFlag" as const, label: "Notify platform owner", desc: "Send platform owner alert" },
            ].map(opt => (
              <div key={opt.key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </div>
                <Switch checked={form[opt.key] as boolean} onCheckedChange={v => set(opt.key, v)} />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isBusy}>
            {isBusy ? "Saving..." : editRule ? "Update Rule" : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RenewalWorkflowsPage() {
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === "admin";
  const [, navigate] = useLocation();

  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<{ id: number } & Partial<RuleFormData> | undefined>();
  const [dryRunResult, setDryRunResult] = useState<{
    processed: number; dryRun: boolean;
    summary: { caseCreated: number; triggered: number; wouldTrigger: number };
    items: Array<{ ruleId: number; ruleName: string; entityType: string; entityId: number; entityLabel: string; expiryDate: Date; daysLeft: number; action: string; caseId?: number }>;
  } | null>(null);
  const [dryRunDialogOpen, setDryRunDialogOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data: dashboard, isLoading: dashLoading } = trpc.renewalWorkflows.getDashboard.useQuery();
  const { data: rulesData, isLoading: rulesLoading } = trpc.renewalWorkflows.listRules.useQuery();
  const { data: runsData, isLoading: runsLoading } = trpc.renewalWorkflows.listRuns.useQuery();

  const deleteRule = trpc.renewalWorkflows.deleteRule.useMutation({
    onSuccess: () => { toast.success("Rule deleted"); utils.renewalWorkflows.listRules.invalidate(); utils.renewalWorkflows.getDashboard.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const processWorkflows = trpc.renewalWorkflows.processWorkflows.useMutation({
    onSuccess: (data) => {
      if (data.dryRun) {
        setDryRunResult(data as typeof dryRunResult);
        setDryRunDialogOpen(true);
      } else {
        toast.success(`Workflow engine ran: ${data.summary.caseCreated} cases created, ${data.summary.triggered} triggered`);
        utils.renewalWorkflows.listRuns.invalidate();
        utils.renewalWorkflows.getDashboard.invalidate();
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleRefresh = () => {
    utils.renewalWorkflows.listRules.invalidate();
    utils.renewalWorkflows.listRuns.invalidate();
    utils.renewalWorkflows.getDashboard.invalidate();
  };

  const handleRuleSaved = () => {
    utils.renewalWorkflows.listRules.invalidate();
    utils.renewalWorkflows.getDashboard.invalidate();
    setEditingRule(undefined);
  };

  const kpis = [
    { label: "Active Rules", value: dashboard?.activeRules ?? 0, icon: Zap, color: "text-blue-600" },
    { label: "Cases Created", value: dashboard?.runs.caseCreated ?? 0, icon: CheckCircle2, color: "text-green-600" },
    { label: "Triggered", value: dashboard?.runs.triggered ?? 0, icon: AlertCircle, color: "text-orange-500" },
    { label: "Failed", value: dashboard?.runs.failed ?? 0, icon: AlertCircle, color: "text-red-600" },
  ];

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center shadow-sm">
                <RefreshCw size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-foreground tracking-tight">Renewal Workflows</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automated renewal engine — visas, CR, PASI, municipality permits, and Oman government document deadlines
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">Auto-Trigger Rules</span>
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">Expiry Tracking</span>
              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">Oman Gov Deadlines</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            {isPlatformAdmin && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => processWorkflows.mutate({ dryRun: true })}
                      disabled={processWorkflows.isPending}
                    >
                      <Play className="h-4 w-4 mr-1" /> Dry Run
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Preview what would fire without creating anything</TooltipContent>
                </Tooltip>
                <Button
                  size="sm"
                  onClick={() => processWorkflows.mutate({ dryRun: false })}
                  disabled={processWorkflows.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Zap className="h-4 w-4 mr-1" />
                  {processWorkflows.isPending ? "Running..." : "Run Engine"}
                </Button>
              </>
            )}
            <Button size="sm" onClick={() => { setEditingRule(undefined); setRuleDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> New Rule
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map(kpi => (
            <Card key={kpi.label}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className={`text-2xl font-bold ${kpi.color}`}>{dashLoading ? "—" : kpi.value}</p>
                  </div>
                  <kpi.icon className={`h-8 w-8 opacity-20 ${kpi.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="rules">
          <TabsList>
            <TabsTrigger value="rules">Workflow Rules</TabsTrigger>
            <TabsTrigger value="runs">Run History</TabsTrigger>
            <TabsTrigger value="recent">Recent Activity</TabsTrigger>
          </TabsList>

          {/* Rules Tab */}
          <TabsContent value="rules" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Active Rules</CardTitle>
                <CardDescription>
                  Each rule defines when to trigger a renewal workflow for a specific document type.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {rulesLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading rules...</div>
                ) : !rulesData?.length ? (
                  <div className="text-center py-12">
                    <Zap className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="font-medium">No workflow rules yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Create your first rule to start automating renewals.</p>
                    <Button className="mt-4" onClick={() => setRuleDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-1" /> Create First Rule
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rule Name</TableHead>
                        <TableHead>Document Type</TableHead>
                        <TableHead>Trigger</TableHead>
                        <TableHead>Case Type</TableHead>
                        <TableHead>Automation</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rulesData.map(rule => (
                        <TableRow key={rule.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{rule.name}</p>
                              {rule.description && <p className="text-xs text-muted-foreground">{rule.description}</p>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {ENTITY_TYPES.find(e => e.value === rule.entityType)?.label ?? rule.entityType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              {rule.triggerDaysBefore} days before
                            </div>
                          </TableCell>
                          <TableCell className="text-sm capitalize">{rule.caseType.replace(/_/g, " ")}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {rule.autoCreateCase && <Badge className="text-xs bg-blue-50 text-blue-700 border-blue-200">Auto Case</Badge>}
                              {rule.autoAssignOfficer && <Badge className="text-xs bg-purple-50 text-purple-700 border-purple-200">Auto Assign</Badge>}
                              {rule.notifyClient && <Badge className="text-xs bg-green-50 text-green-700 border-green-200">Notify Client</Badge>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={rule.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}>
                              {rule.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit renewal workflow"
                                onClick={() => {
                                  setEditingRule({
                                    id: rule.id,
                                    name: rule.name,
                                    description: rule.description ?? "",
                                    entityType: rule.entityType,
                                    triggerDaysBefore: rule.triggerDaysBefore,
                                    autoCreateCase: rule.autoCreateCase,
                                    autoAssignOfficer: rule.autoAssignOfficer,
                                    notifyClient: rule.notifyClient,
                                    notifyOwnerFlag: rule.notifyOwner,
                                    caseType: rule.caseType,
                                  });
                                  setRuleDialogOpen(true);
                                }}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" aria-label="Delete renewal workflow"
                                onClick={() => deleteRule.mutate({ id: rule.id })}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Run History Tab */}
          <TabsContent value="runs" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Workflow Run History</CardTitle>
                <CardDescription>Every time the engine fired a rule against an expiring document.</CardDescription>
              </CardHeader>
              <CardContent>
                {runsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading runs...</div>
                ) : !runsData?.items?.length ? (
                  <div className="text-center py-12">
                    <Clock className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="font-medium">No runs yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Run the workflow engine to start processing renewals.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Entity</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Days Left</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Case #</TableHead>
                        <TableHead>Triggered At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runsData.items.map(run => {
                        const expiryDate = run.expiryDate ? new Date(run.expiryDate) : null;
                        const triggeredAt = run.triggeredAt ? new Date(run.triggeredAt) : null;
                        const daysLeft = expiryDate ? Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                        const statusCfg = STATUS_CONFIG[run.status] ?? { label: run.status, color: "bg-slate-100 text-slate-700" };
                        return (
                          <TableRow key={run.id}>
                            <TableCell className="font-medium text-sm max-w-[200px] truncate">{run.entityLabel ?? `#${run.entityId}`}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {ENTITY_TYPES.find(e => e.value === run.entityType)?.label ?? run.entityType}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{expiryDate?.toLocaleDateString("en-GB") ?? "—"}</TableCell>
                            <TableCell>
                              {daysLeft !== null ? (
                                <span className={`text-sm font-medium ${daysLeft <= 7 ? "text-red-600" : daysLeft <= 30 ? "text-orange-500" : "text-muted-foreground"}`}>
                                  {daysLeft > 0 ? `${daysLeft}d` : "Expired"}
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${statusCfg.color}`}>{statusCfg.label}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">{run.caseId ? `#${run.caseId}` : "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{triggeredAt?.toLocaleString("en-GB") ?? "—"}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" className="h-7 px-2"
                                onClick={() => navigate(`/renewal-workflows/${run.id}`)}>
                                <ChevronRight size={13} />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Recent Activity Tab */}
          <TabsContent value="recent" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent Activity</CardTitle>
                <CardDescription>Last 10 workflow runs across all rules.</CardDescription>
              </CardHeader>
              <CardContent>
                {dashLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : !dashboard?.recentRuns?.length ? (
                  <div className="text-center py-12 text-muted-foreground">No recent activity.</div>
                ) : (
                  <div className="space-y-2">
                    {dashboard.recentRuns.map(run => {
                      const statusCfg = STATUS_CONFIG[run.status] ?? { label: run.status, color: "bg-slate-100 text-slate-700" };
                      const expiryDate = run.expiryDate ? new Date(run.expiryDate) : null;
                      return (
                        <div key={run.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${run.status === "case_created" ? "bg-green-500" : run.status === "failed" ? "bg-red-500" : "bg-blue-500"}`} />
                            <div>
                              <p className="text-sm font-medium">{run.entityLabel ?? `${run.entityType} #${run.entityId}`}</p>
                              <p className="text-xs text-muted-foreground">
                                Expires {expiryDate?.toLocaleDateString("en-GB") ?? "—"} · {run.daysBeforeExpiry}d threshold
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {run.caseId && <span className="text-xs text-muted-foreground">Case #{run.caseId}</span>}
                            <Badge className={`text-xs ${statusCfg.color}`}>{statusCfg.label}</Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Rule Form Dialog */}
        <RuleFormDialog
          open={ruleDialogOpen}
          onClose={() => { setRuleDialogOpen(false); setEditingRule(undefined); }}
          editRule={editingRule}
          onSaved={handleRuleSaved}
        />

        {/* Dry Run Preview Dialog */}
        <Dialog open={dryRunDialogOpen} onOpenChange={setDryRunDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Dry Run Preview</DialogTitle>
              <DialogDescription>
                These {dryRunResult?.processed ?? 0} items would be triggered if you run the engine now. No cases were created.
              </DialogDescription>
            </DialogHeader>
            {dryRunResult && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="rounded-lg bg-blue-50 p-3 text-center">
                    <p className="text-2xl font-bold text-blue-700">{dryRunResult.summary.wouldTrigger}</p>
                    <p className="text-xs text-blue-600">Would Trigger</p>
                  </div>
                  <div className="rounded-lg bg-green-50 p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{dryRunResult.summary.caseCreated}</p>
                    <p className="text-xs text-green-600">Would Create Cases</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 text-center">
                    <p className="text-2xl font-bold text-slate-700">{dryRunResult.processed}</p>
                    <p className="text-xs text-slate-600">Total Items</p>
                  </div>
                </div>
                {dryRunResult.items.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Entity</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead>Days Left</TableHead>
                        <TableHead>Rule</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dryRunResult.items.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm font-medium">{item.entityLabel}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{item.entityType.replace(/_/g, " ")}</Badge></TableCell>
                          <TableCell className="text-sm">{fmtDate(item.expiryDate)}</TableCell>
                          <TableCell>
                            <span className={`text-sm font-medium ${item.daysLeft <= 7 ? "text-red-600" : item.daysLeft <= 30 ? "text-orange-500" : "text-muted-foreground"}`}>
                              {item.daysLeft}d
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.ruleName}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDryRunDialogOpen(false)}>Close</Button>
              {isPlatformAdmin && (
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    setDryRunDialogOpen(false);
                    processWorkflows.mutate({ dryRun: false });
                  }}
                >
                  <Zap className="h-4 w-4 mr-1" /> Run for Real
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
