import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Shield, AlertTriangle, Clock, CheckCircle2, Plus, Pencil,
  Trash2, Timer, TrendingUp, Target, Zap
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const SERVICE_TYPES = [
  "work_permit_new",
  "work_permit_renewal",
  "residence_visa",
  "pasi_registration",
  "pasi_contribution",
  "cr_registration",
  "cr_renewal",
  "municipality_permit",
  "labour_card",
  "sanad_service",
  "employee_onboarding",
  "payroll_processing",
  "contract_drafting",
  "document_attestation",
];

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

export default function SlaManagementPage() {
  
  const utils = trpc.useUtils();

  const { data: rules, isLoading: rulesLoading } = trpc.sla.listRules.useQuery();
  const { data: breaches, isLoading: breachesLoading } = trpc.sla.getBreaches.useQuery();
  const { data: performance } = trpc.sla.getPerformanceSummary.useQuery();

  const upsertMutation = trpc.sla.upsertRule.useMutation({
    onSuccess: () => { utils.sla.listRules.invalidate(); setShowDialog(false); toast.success("SLA rule saved"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.sla.deleteRule.useMutation({
    onSuccess: () => { utils.sla.listRules.invalidate(); toast.success("Rule deleted"); },
  });

  const [showDialog, setShowDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<typeof rules extends Array<infer T> ? T : never | null>(null);
  const [activeTab, setActiveTab] = useState<"breaches" | "rules" | "performance">("breaches");

  // Form state
  const [serviceType, setServiceType] = useState("work_permit_renewal");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [targetHours, setTargetHours] = useState(72);
  const [escalationHours, setEscalationHours] = useState(96);
  const [breachAction, setBreachAction] = useState<"notify" | "escalate" | "auto_reassign">("notify");

  const openCreate = () => {
    setEditingRule(null);
    setServiceType("work_permit_renewal");
    setPriority("normal");
    setTargetHours(72);
    setEscalationHours(96);
    setBreachAction("notify");
    setShowDialog(true);
  };

  const openEdit = (rule: NonNullable<typeof rules>[number]) => {
    setEditingRule(rule as any);
    setServiceType(rule.serviceType);
    setPriority(rule.priority as any);
    setTargetHours(rule.targetHours);
    setEscalationHours(rule.escalationHours);
    setBreachAction(rule.breachAction as any);
    setShowDialog(true);
  };

  const handleSave = () => {
    upsertMutation.mutate({
      id: (editingRule as any)?.id,
      serviceType,
      priority,
      targetHours,
      escalationHours,
      breachAction,
      isActive: true,
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-sm">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">SLA Management</h1>
            <p className="text-sm text-muted-foreground">Service Level Agreement tracking · Breach alerts · Performance metrics</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-orange-500 hover:bg-orange-600">
          <Plus className="w-4 h-4" />
          New SLA Rule
        </Button>
      </div>

      {/* Performance KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Cases Tracked", value: performance?.total ?? 0, icon: Target, color: "bg-blue-500" },
          { label: "On-Time Rate", value: `${performance?.onTimeRate ?? 0}%`, icon: CheckCircle2, color: "bg-green-500" },
          { label: "Active Breaches", value: breaches?.length ?? 0, icon: AlertTriangle, color: (breaches?.length ?? 0) > 0 ? "bg-red-500" : "bg-green-500" },
          { label: "Breach Rate", value: `${performance?.breachRate ?? 0}%`, icon: TrendingUp, color: (performance?.breachRate ?? 0) > 10 ? "bg-red-500" : "bg-green-500" },
        ].map((kpi) => (
          <Card key={kpi.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${kpi.color}`}>
                <kpi.icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-black">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(["breaches", "rules", "performance"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === tab ? "border-orange-500 text-orange-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {tab === "breaches" ? `Breaches (${breaches?.length ?? 0})` : tab === "rules" ? `SLA Rules (${rules?.length ?? 0})` : "Performance"}
          </button>
        ))}
      </div>

      {/* Breaches Tab */}
      {activeTab === "breaches" && (
        <div>
          {breachesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="animate-pulse border-0 shadow-sm">
                  <CardContent className="p-4 h-16 bg-muted/30 rounded-xl" />
                </Card>
              ))}
            </div>
          ) : (breaches?.length ?? 0) === 0 ? (
            <Card className="border-dashed border-2 shadow-none">
              <CardContent className="p-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="font-semibold text-green-700">No active SLA breaches</p>
                <p className="text-sm text-muted-foreground mt-1">All cases are within their SLA targets</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {breaches?.map((breach) => (
                <Card key={breach.id} className="border-l-4 border-l-red-500 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                          <span className="font-bold text-sm">Case #{breach.caseId}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_COLORS[breach.priority ?? "normal"]}`}>
                            {breach.priority?.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {breach.caseType?.replace(/_/g, " ").toUpperCase()} · {breach.governmentReference ?? "No ref"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Due: {breach.dueAt ? formatDistanceToNow(new Date(breach.dueAt), { addSuffix: true }) : "—"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black text-red-600">{breach.hoursOverdue}h</p>
                        <p className="text-xs text-muted-foreground">overdue</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rules Tab */}
      {activeTab === "rules" && (
        <div>
          {rulesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} className="animate-pulse border-0 shadow-sm">
                  <CardContent className="p-3 h-14 bg-muted/30 rounded-xl" />
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {rules?.map((rule) => (
                <Card key={rule.id} className="border-0 shadow-sm">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_COLORS[rule.priority]}`}>
                          {rule.priority.toUpperCase()}
                        </span>
                        <span className="font-semibold text-sm truncate">{rule.serviceType.replace(/_/g, " ")}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                        <span className="flex items-center gap-1">
                          <Timer className="w-3 h-3" />
                          Target: {rule.targetHours}h
                        </span>
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Escalate: {rule.escalationHours}h
                        </span>
                        <span>{rule.breachAction.replace(/_/g, " ")}</span>
                        <Badge variant={rule.isActive ? "default" : "secondary"} className="text-xs">
                          {rule.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(rule)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => deleteMutation.mutate({ id: rule.id })}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Performance Tab */}
      {activeTab === "performance" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-bold">Overall SLA Performance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>On-Time Resolution Rate</span>
                  <span className="font-bold text-green-600">{performance?.onTimeRate ?? 0}%</span>
                </div>
                <Progress value={performance?.onTimeRate ?? 0} className="h-2 [&>div]:bg-green-500" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Breach Rate</span>
                  <span className="font-bold text-red-600">{performance?.breachRate ?? 0}%</span>
                </div>
                <Progress value={performance?.breachRate ?? 0} className="h-2 [&>div]:bg-red-500" />
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="text-center">
                  <p className="text-2xl font-black">{performance?.total ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-green-600">{performance?.onTime ?? 0}</p>
                  <p className="text-xs text-muted-foreground">On Time</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-red-600">{performance?.breached ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Breached</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-bold">SLA Targets by Service Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {rules?.slice(0, 8).map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate">{rule.serviceType.replace(/_/g, " ")}</span>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${PRIORITY_COLORS[rule.priority]}`}>
                        {rule.priority}
                      </span>
                      <span className="font-semibold">{rule.targetHours}h</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{(editingRule as any)?.id ? "Edit SLA Rule" : "New SLA Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Service Type</Label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["low", "normal", "high", "urgent"].map((p) => (
                    <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Target Hours</Label>
                <Input className="mt-1" type="number" min={1} value={targetHours} onChange={(e) => setTargetHours(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Escalation Hours</Label>
                <Input className="mt-1" type="number" min={1} value={escalationHours} onChange={(e) => setEscalationHours(Number(e.target.value))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Breach Action</Label>
              <Select value={breachAction} onValueChange={(v) => setBreachAction(v as any)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="notify">Notify</SelectItem>
                  <SelectItem value="escalate">Escalate</SelectItem>
                  <SelectItem value="auto_reassign">Auto Reassign</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={upsertMutation.isPending} className="bg-orange-500 hover:bg-orange-600">
              {upsertMutation.isPending ? "Saving…" : "Save Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
