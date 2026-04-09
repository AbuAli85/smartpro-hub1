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
import { useTranslation } from "react-i18next";

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTITY_TYPE_VALUES = [
  "work_permit",
  "visa",
  "resident_card",
  "labour_card",
  "sanad_licence",
  "officer_document",
  "employee_document",
  "pro_service",
] as const;

const CASE_TYPE_VALUES = [
  "renewal",
  "amendment",
  "document_update",
  "new_permit",
  "transfer",
  "cancellation",
  "contract_registration",
  "employee_update",
] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  triggered: "bg-blue-100 text-blue-700",
  case_created: "bg-green-100 text-green-700",
  skipped: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
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
  const { t } = useTranslation("renewalWorkflows");
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
    onSuccess: () => { toast.success(t("toastRuleCreated")); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const updateRule = trpc.renewalWorkflows.updateRule.useMutation({
    onSuccess: () => { toast.success(t("toastRuleUpdated")); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error(t("toastNameRequired"));
    if (editRule?.id) {
      updateRule.mutate({ id: editRule.id, ...form, caseType: form.caseType as "renewal" });
    } else {
      createRule.mutate({ ...form, entityType: form.entityType as "work_permit", caseType: form.caseType as "renewal" });
    }
  };

  const set = <K extends keyof RuleFormData>(key: K, val: RuleFormData[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const isBusy = createRule.isPending || updateRule.isPending;

  const automationOpts = [
    { key: "autoCreateCase" as const, labelKey: "optAutoCase" as const, descKey: "optAutoCaseDesc" as const },
    { key: "autoAssignOfficer" as const, labelKey: "optAutoAssign" as const, descKey: "optAutoAssignDesc" as const },
    { key: "notifyClient" as const, labelKey: "optNotifyClient" as const, descKey: "optNotifyClientDesc" as const },
    { key: "notifyOwnerFlag" as const, labelKey: "optNotifyOwner" as const, descKey: "optNotifyOwnerDesc" as const },
  ];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editRule ? t("dialogEditTitle") : t("dialogCreateTitle")}</DialogTitle>
          <DialogDescription>{t("dialogRuleDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>{t("labelRuleName")}</Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder={t("placeholderRuleName")} />
          </div>
          <div className="space-y-1">
            <Label>{t("labelDescription")}</Label>
            <Input value={form.description} onChange={e => set("description", e.target.value)} placeholder={t("placeholderDescription")} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>{t("labelDocumentType")}</Label>
              <Select value={form.entityType} onValueChange={v => set("entityType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPE_VALUES.map(e => (
                    <SelectItem key={e} value={e}>{t(`entityTypes.${e}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("labelTriggerDays")}</Label>
              <Input
                type="number" min={1} max={365}
                value={form.triggerDaysBefore}
                onChange={e => set("triggerDaysBefore", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t("labelCaseTypeCreate")}</Label>
            <Select value={form.caseType} onValueChange={v => set("caseType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CASE_TYPE_VALUES.map(c => (
                  <SelectItem key={c} value={c}>{t(`caseTypes.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">{t("automationOptions")}</p>
            {automationOpts.map(opt => (
              <div key={opt.key} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t(opt.labelKey)}</p>
                  <p className="text-xs text-muted-foreground">{t(opt.descKey)}</p>
                </div>
                <Switch checked={form[opt.key] as boolean} onCheckedChange={v => set(opt.key, v)} />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={handleSubmit} disabled={isBusy}>
            {isBusy ? t("saving") : editRule ? t("updateRule") : t("createRule")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RenewalWorkflowsPage() {
  const { t, i18n } = useTranslation("renewalWorkflows");
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === "admin";
  const [, navigate] = useLocation();
  const dateLocale = i18n.language === "ar-OM" ? "ar-OM" : "en-GB";

  const formatTableDate = (d: Date | null | undefined) => {
    if (!d) return "—";
    return d.toLocaleDateString(dateLocale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Asia/Muscat",
    });
  };

  const formatTableDateTime = (d: Date | null | undefined) => {
    if (!d) return "—";
    return d.toLocaleString(dateLocale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Muscat",
    });
  };

  const entityTypeLabel = (value: string) =>
    t(`entityTypes.${value}`, { defaultValue: value.replace(/_/g, " ") });

  const caseTypeLabel = (value: string) =>
    t(`caseTypes.${value}`, { defaultValue: value.replace(/_/g, " ") });

  const runStatusLabel = (status: string) =>
    t(`runStatus.${status}`, { defaultValue: status.replace(/_/g, " ") });

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
    onSuccess: () => {
      toast.success(t("toastRuleDeleted"));
      utils.renewalWorkflows.listRules.invalidate();
      utils.renewalWorkflows.getDashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const processWorkflows = trpc.renewalWorkflows.processWorkflows.useMutation({
    onSuccess: (data) => {
      if (data.dryRun) {
        setDryRunResult(data as typeof dryRunResult);
        setDryRunDialogOpen(true);
      } else {
        toast.success(
          t("toastEngineRan", {
            created: data.summary.caseCreated,
            triggered: data.summary.triggered,
          }),
        );
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
    { labelKey: "kpiActiveRules" as const, value: dashboard?.activeRules ?? 0, icon: Zap, color: "text-blue-600" },
    { labelKey: "kpiCasesCreated" as const, value: dashboard?.runs.caseCreated ?? 0, icon: CheckCircle2, color: "text-green-600" },
    { labelKey: "kpiTriggered" as const, value: dashboard?.runs.triggered ?? 0, icon: AlertCircle, color: "text-orange-500" },
    { labelKey: "kpiFailed" as const, value: dashboard?.runs.failed ?? 0, icon: AlertCircle, color: "text-red-600" },
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
                <h1 className="text-2xl font-black text-foreground tracking-tight">{t("title")}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">{t("subtitle")}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">{t("badgeAutoTrigger")}</span>
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">{t("badgeExpiry")}</span>
              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">{t("badgeOmanGov")}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1">
              <RefreshCw className="h-4 w-4 shrink-0" /> {t("refresh")}
            </Button>
            {isPlatformAdmin && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => processWorkflows.mutate({ dryRun: true })}
                      disabled={processWorkflows.isPending}
                      className="gap-1"
                    >
                      <Play className="h-4 w-4 shrink-0" /> {t("dryRun")}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("dryRunTooltip")}</TooltipContent>
                </Tooltip>
                <Button
                  size="sm"
                  onClick={() => processWorkflows.mutate({ dryRun: false })}
                  disabled={processWorkflows.isPending}
                  className="bg-green-600 hover:bg-green-700 gap-1"
                >
                  <Zap className="h-4 w-4 shrink-0" />
                  {processWorkflows.isPending ? t("running") : t("runEngine")}
                </Button>
              </>
            )}
            <Button size="sm" onClick={() => { setEditingRule(undefined); setRuleDialogOpen(true); }} className="gap-1">
              <Plus className="h-4 w-4 shrink-0" /> {t("newRule")}
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map(kpi => (
            <Card key={kpi.labelKey}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{t(kpi.labelKey)}</p>
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
            <TabsTrigger value="rules">{t("tabRules")}</TabsTrigger>
            <TabsTrigger value="runs">{t("tabRuns")}</TabsTrigger>
            <TabsTrigger value="recent">{t("tabRecent")}</TabsTrigger>
          </TabsList>

          {/* Rules Tab */}
          <TabsContent value="rules" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("activeRulesTitle")}</CardTitle>
                <CardDescription>{t("activeRulesDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                {rulesLoading ? (
                  <div className="text-center py-8 text-muted-foreground">{t("loadingRules")}</div>
                ) : !rulesData?.length ? (
                  <div className="text-center py-12">
                    <Zap className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="font-medium">{t("emptyRulesTitle")}</p>
                    <p className="text-sm text-muted-foreground mt-1">{t("emptyRulesDesc")}</p>
                    <Button className="mt-4 gap-1" onClick={() => setRuleDialogOpen(true)}>
                      <Plus className="h-4 w-4 shrink-0" /> {t("createFirstRule")}
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("colRuleName")}</TableHead>
                        <TableHead>{t("colDocumentType")}</TableHead>
                        <TableHead>{t("colTrigger")}</TableHead>
                        <TableHead>{t("colCaseType")}</TableHead>
                        <TableHead>{t("colAutomation")}</TableHead>
                        <TableHead>{t("colStatus")}</TableHead>
                        <TableHead className="text-end">{t("colActions")}</TableHead>
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
                              {entityTypeLabel(rule.entityType)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              {t("daysBeforeExpiry", { count: rule.triggerDaysBefore })}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm capitalize">{caseTypeLabel(rule.caseType)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {rule.autoCreateCase && <Badge className="text-xs bg-blue-50 text-blue-700 border-blue-200">{t("badgeAutoCase")}</Badge>}
                              {rule.autoAssignOfficer && <Badge className="text-xs bg-purple-50 text-purple-700 border-purple-200">{t("badgeAutoAssign")}</Badge>}
                              {rule.notifyClient && <Badge className="text-xs bg-green-50 text-green-700 border-green-200">{t("badgeNotifyClient")}</Badge>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={rule.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}>
                              {rule.isActive ? t("statusActive") : t("statusInactive")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-end">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7" aria-label={t("ariaEditRule")}
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
                                variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" aria-label={t("ariaDeleteRule")}
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
                <CardTitle className="text-base">{t("runHistoryTitle")}</CardTitle>
                <CardDescription>{t("runHistoryDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                {runsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">{t("loadingRuns")}</div>
                ) : !runsData?.items?.length ? (
                  <div className="text-center py-12">
                    <Clock className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="font-medium">{t("noRunsTitle")}</p>
                    <p className="text-sm text-muted-foreground mt-1">{t("noRunsDesc")}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("colEntity")}</TableHead>
                        <TableHead>{t("colType")}</TableHead>
                        <TableHead>{t("colExpiryDate")}</TableHead>
                        <TableHead>{t("colDaysLeft")}</TableHead>
                        <TableHead>{t("colStatus")}</TableHead>
                        <TableHead>{t("colCaseNum")}</TableHead>
                        <TableHead>{t("colTriggeredAt")}</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runsData.items.map(run => {
                        const expiryDate = run.expiryDate ? new Date(run.expiryDate) : null;
                        const triggeredAt = run.triggeredAt ? new Date(run.triggeredAt) : null;
                        const daysLeft = expiryDate ? Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                        const statusColor = STATUS_COLORS[run.status] ?? "bg-slate-100 text-slate-700";
                        return (
                          <TableRow key={run.id}>
                            <TableCell className="font-medium text-sm max-w-[200px] truncate">{run.entityLabel ?? `#${run.entityId}`}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {entityTypeLabel(run.entityType)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{formatTableDate(expiryDate)}</TableCell>
                            <TableCell>
                              {daysLeft !== null ? (
                                <span className={`text-sm font-medium ${daysLeft <= 7 ? "text-red-600" : daysLeft <= 30 ? "text-orange-500" : "text-muted-foreground"}`}>
                                  {daysLeft > 0 ? t("daysShort", { count: daysLeft }) : t("expired")}
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${statusColor}`}>{runStatusLabel(run.status)}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">{run.caseId ? `#${run.caseId}` : "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatTableDateTime(triggeredAt)}</TableCell>
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
                <CardTitle className="text-base">{t("recentActivityTitle")}</CardTitle>
                <CardDescription>{t("recentActivityDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                {dashLoading ? (
                  <div className="text-center py-8 text-muted-foreground">{t("loading")}</div>
                ) : !dashboard?.recentRuns?.length ? (
                  <div className="text-center py-12 text-muted-foreground">{t("noRecentActivity")}</div>
                ) : (
                  <div className="space-y-2">
                    {dashboard.recentRuns.map(run => {
                      const statusColor = STATUS_COLORS[run.status] ?? "bg-slate-100 text-slate-700";
                      const expiryDate = run.expiryDate ? new Date(run.expiryDate) : null;
                      return (
                        <div key={run.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors gap-2">
                          <div className="flex flex-wrap items-center gap-3 min-w-0">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${run.status === "case_created" ? "bg-green-500" : run.status === "failed" ? "bg-red-500" : "bg-blue-500"}`} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{run.entityLabel ?? `${run.entityType} #${run.entityId}`}</p>
                              <p className="text-xs text-muted-foreground">
                                {t("expiresLine", {
                                  date: formatTableDate(expiryDate),
                                  days: run.daysBeforeExpiry,
                                })}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {run.caseId && <span className="text-xs text-muted-foreground">{t("caseRef", { id: run.caseId })}</span>}
                            <Badge className={`text-xs ${statusColor}`}>{runStatusLabel(run.status)}</Badge>
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

        <RuleFormDialog
          open={ruleDialogOpen}
          onClose={() => { setRuleDialogOpen(false); setEditingRule(undefined); }}
          editRule={editingRule}
          onSaved={handleRuleSaved}
        />

        <Dialog open={dryRunDialogOpen} onOpenChange={setDryRunDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("dryRunTitle")}</DialogTitle>
              <DialogDescription>
                {t("dryRunDesc", { count: dryRunResult?.processed ?? 0 })}
              </DialogDescription>
            </DialogHeader>
            {dryRunResult && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="rounded-lg bg-blue-50 p-3 text-center">
                    <p className="text-2xl font-bold text-blue-700">{dryRunResult.summary.wouldTrigger}</p>
                    <p className="text-xs text-blue-600">{t("wouldTrigger")}</p>
                  </div>
                  <div className="rounded-lg bg-green-50 p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{dryRunResult.summary.caseCreated}</p>
                    <p className="text-xs text-green-600">{t("wouldCreateCases")}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 text-center">
                    <p className="text-2xl font-bold text-slate-700">{dryRunResult.processed}</p>
                    <p className="text-xs text-slate-600">{t("totalItems")}</p>
                  </div>
                </div>
                {dryRunResult.items.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("colEntity")}</TableHead>
                        <TableHead>{t("colType")}</TableHead>
                        <TableHead>{t("colExpiry")}</TableHead>
                        <TableHead>{t("colDaysLeft")}</TableHead>
                        <TableHead>{t("colRule")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dryRunResult.items.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm font-medium">{item.entityLabel}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{entityTypeLabel(item.entityType)}</Badge></TableCell>
                          <TableCell className="text-sm">{formatTableDate(new Date(item.expiryDate))}</TableCell>
                          <TableCell>
                            <span className={`text-sm font-medium ${item.daysLeft <= 7 ? "text-red-600" : item.daysLeft <= 30 ? "text-orange-500" : "text-muted-foreground"}`}>
                              {t("daysShort", { count: item.daysLeft })}
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
              <Button variant="outline" onClick={() => setDryRunDialogOpen(false)}>{t("close")}</Button>
              {isPlatformAdmin && (
                <Button
                  className="bg-green-600 hover:bg-green-700 gap-1"
                  onClick={() => {
                    setDryRunDialogOpen(false);
                    processWorkflows.mutate({ dryRun: false });
                  }}
                >
                  <Zap className="h-4 w-4 shrink-0" /> {t("runForReal")}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
