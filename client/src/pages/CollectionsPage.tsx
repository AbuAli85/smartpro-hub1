import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertCircle, Mail, MessageCircle, PhoneCall, RefreshCw } from "lucide-react";
import { fmtDate } from "@/lib/dateUtils";

const WORKFLOW_OPTIONS = [
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "promised_to_pay", label: "Promised to pay" },
  { value: "escalated", label: "Escalated" },
  { value: "disputed", label: "Disputed" },
  { value: "resolved", label: "Resolved" },
] as const;

function bucketLabel(key: string): string {
  if (key === "0_30") return "0–30 d";
  if (key === "31_60") return "31–60 d";
  return "61+ d";
}

export default function CollectionsPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const canPlatform = user ? canAccessGlobalAdminProcedures(user) : false;

  const myCompany = trpc.companies.myCompany.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: !canPlatform && activeCompanyId != null },
  );
  const tenantRole = myCompany.data?.member?.role;
  const canTenantCollections =
    tenantRole === "company_admin" || tenantRole === "finance_admin";
  const allowed = canPlatform || canTenantCollections;

  const companiesList = trpc.companies.list.useQuery(undefined, { enabled: canPlatform });
  const [filterCompanyId, setFilterCompanyId] = useState<number | "all">("all");

  const effectiveCompanyId =
    canPlatform && filterCompanyId !== "all" ? filterCompanyId : !canPlatform ? activeCompanyId ?? undefined : undefined;

  const agingQuery = trpc.collections.getAgingSnapshot.useQuery(
    { companyId: effectiveCompanyId },
    { enabled: allowed && (canPlatform || activeCompanyId != null) },
  );

  const linesQuery = trpc.collections.getOverdueLines.useQuery(
    { companyId: effectiveCompanyId },
    { enabled: allowed && (canPlatform || activeCompanyId != null) },
  );

  const queueCompanyId =
    canPlatform && filterCompanyId !== "all"
      ? filterCompanyId
      : !canPlatform
        ? activeCompanyId ?? undefined
        : undefined;

  const queueQuery = trpc.collections.getActionQueue.useQuery(
    { companyId: queueCompanyId, limit: 80 },
    { enabled: allowed && queueCompanyId != null },
  );

  const waConfigured = trpc.collections.whatsappReminderConfigured.useQuery(undefined, { enabled: allowed });

  const utils = trpc.useUtils();
  const upsert = trpc.collections.upsertWorkItem.useMutation({
    onSuccess: () => {
      toast.success("Collection case updated");
      void utils.collections.getOverdueLines.invalidate();
      void utils.collections.getActionQueue.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const sendEmail = trpc.collections.sendReminderEmail.useMutation({
    onSuccess: () => toast.success("Reminder email sent"),
    onError: (e) => toast.error(e.message),
  });

  const sendWa = trpc.collections.sendReminderWhatsApp.useMutation({
    onSuccess: () => toast.success("WhatsApp reminder sent"),
    onError: (e) => toast.error(e.message),
  });

  const employeesQuery = trpc.hr.listEmployees.useQuery(
    { companyId: queueCompanyId, status: "active" },
    { enabled: allowed && queueCompanyId != null },
  );

  const [gratuityEmployeeId, setGratuityEmployeeId] = useState<number | "">("");
  const gratuityQuery = trpc.payroll.getGratuityEstimate.useQuery(
    { employeeId: typeof gratuityEmployeeId === "number" ? gratuityEmployeeId : 0, companyId: queueCompanyId },
    { enabled: allowed && queueCompanyId != null && typeof gratuityEmployeeId === "number" },
  );

  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const companyOptions = useMemo(() => {
    const list = companiesList.data ?? [];
    return list.map((c) => ({ id: c.id, name: c.name }));
  }, [companiesList.data]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground text-sm">Sign in…</div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle size={22} /> Access restricted
            </CardTitle>
            <CardDescription>
              Collections is available to platform admins and to company admin / finance admin in a workspace.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!canPlatform && !activeCompanyId) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground text-sm">
        Select a company workspace to use collections.
      </div>
    );
  }

  const aging = agingQuery.data;
  const lines = linesQuery.data ?? [];
  const queue = queueQuery.data ?? [];

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <PhoneCall className="h-7 w-7 text-primary" />
            Collections & AR
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Aging snapshot, overdue lines, collection cases, manual email and WhatsApp reminders, and end-of-service
            gratuity estimates for offboarding planning.
          </p>
        </div>
        {canPlatform && (
          <div className="flex flex-col gap-1 min-w-[220px]">
            <Label className="text-xs text-muted-foreground">Company scope</Label>
            <Select
              value={filterCompanyId === "all" ? "all" : String(filterCompanyId)}
              onValueChange={(v) => setFilterCompanyId(v === "all" ? "all" : Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="All companies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies (aging)</SelectItem>
                {companyOptions.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Action queue & gratuity require a specific company — pick one above.
            </p>
          </div>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Aging & lines</TabsTrigger>
          <TabsTrigger value="queue">Action queue</TabsTrigger>
          <TabsTrigger value="gratuity">Gratuity (EOS)</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">PRO officer billing (at risk)</CardTitle>
                <CardDescription>
                  {aging?.basis ? "Overdue or pending past due." : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {agingQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : aging ? (
                  <div className="space-y-2">
                    <p className="text-lg font-semibold">OMR {aging.officerPro.totalOmr.toFixed(3)}</p>
                    <p className="text-xs text-muted-foreground">{aging.officerPro.rowCount} invoice(s)</p>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {aging.officerPro.buckets.map((b) => (
                        <div key={b.key} className="rounded-lg border p-2 text-center">
                          <div className="text-[10px] text-muted-foreground">{bucketLabel(b.key)}</div>
                          <div className="text-sm font-medium">{b.omr.toFixed(3)}</div>
                          <div className="text-[10px] text-muted-foreground">{b.count} inv.</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Subscription invoices (at risk)</CardTitle>
              </CardHeader>
              <CardContent>
                {agingQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : aging ? (
                  <div className="space-y-2">
                    <p className="text-lg font-semibold">OMR {aging.platformSubscription.totalOmr.toFixed(3)}</p>
                    <p className="text-xs text-muted-foreground">{aging.platformSubscription.rowCount} invoice(s)</p>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {aging.platformSubscription.buckets.map((b) => (
                        <div key={b.key} className="rounded-lg border p-2 text-center">
                          <div className="text-[10px] text-muted-foreground">{bucketLabel(b.key)}</div>
                          <div className="text-sm font-medium">{b.omr.toFixed(3)}</div>
                          <div className="text-[10px] text-muted-foreground">{b.count} inv.</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Overdue & at-risk lines</CardTitle>
              <CardDescription>
                Update workflow status to drive the collection case; reminders use company email / phone from the
                profile unless you override in the mutation (API).
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {linesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No at-risk receivable lines for this scope.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3">Company</th>
                      <th className="py-2 pr-3">Source</th>
                      <th className="py-2 pr-3">Invoice</th>
                      <th className="py-2 pr-3">Due</th>
                      <th className="py-2 pr-3">Days</th>
                      <th className="py-2 pr-3">OMR</th>
                      <th className="py-2 pr-3">Workflow</th>
                      <th className="py-2 pr-3">Note</th>
                      <th className="py-2 pr-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((row) => {
                      const key = `${row.sourceType}:${row.sourceId}`;
                      const note = noteDrafts[key] ?? row.note ?? "";
                      return (
                        <tr key={key} className="border-b border-border/60">
                          <td className="py-2 pr-3 whitespace-nowrap">{row.companyName}</td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline">{row.sourceType.replace(/_/g, " ")}</Badge>
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">{row.invoiceLabel}</td>
                          <td className="py-2 pr-3">{row.dueDate ? fmtDate(row.dueDate) : "—"}</td>
                          <td className="py-2 pr-3">{row.daysPastDue}</td>
                          <td className="py-2 pr-3">{row.amountOmr.toFixed(3)}</td>
                          <td className="py-2 pr-3">
                            <Select
                              value={row.workflowStatus}
                              onValueChange={(v) => {
                                upsert.mutate({
                                  companyId: row.companyId,
                                  sourceType: row.sourceType as "pro_billing_cycle" | "subscription_invoice",
                                  sourceId: row.sourceId,
                                  workflowStatus: v as (typeof WORKFLOW_OPTIONS)[number]["value"],
                                  note: note || undefined,
                                });
                              }}
                            >
                              <SelectTrigger className="h-8 w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {WORKFLOW_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-2 pr-3 min-w-[140px]">
                            <Textarea
                              className="min-h-[52px] text-xs"
                              value={note}
                              onChange={(e) => setNoteDrafts((s) => ({ ...s, [key]: e.target.value }))}
                              onBlur={() => {
                                if ((row.note ?? "") === note) return;
                                upsert.mutate({
                                  companyId: row.companyId,
                                  sourceType: row.sourceType as "pro_billing_cycle" | "subscription_invoice",
                                  sourceId: row.sourceId,
                                  workflowStatus: row.workflowStatus as (typeof WORKFLOW_OPTIONS)[number]["value"],
                                  note: note || null,
                                });
                              }}
                              placeholder="Internal note…"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex flex-col gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 h-8"
                                disabled={sendEmail.isPending}
                                onClick={() =>
                                  sendEmail.mutate({
                                    companyId: row.companyId,
                                    sourceType: row.sourceType as "pro_billing_cycle" | "subscription_invoice",
                                    sourceId: row.sourceId,
                                  })
                                }
                              >
                                <Mail size={14} /> Email
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 h-8"
                                disabled={sendWa.isPending || !waConfigured.data?.configured}
                                title={
                                  !waConfigured.data?.configured
                                    ? "Configure WHATSAPP_TEMPLATE_COLLECTION_REMINDER"
                                    : undefined
                                }
                                onClick={() =>
                                  sendWa.mutate({
                                    companyId: row.companyId,
                                    sourceType: row.sourceType as "pro_billing_cycle" | "subscription_invoice",
                                    sourceId: row.sourceId,
                                  })
                                }
                              >
                                <MessageCircle size={14} /> WhatsApp
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prioritized follow-ups</CardTitle>
              <CardDescription>
                Open items only (resolved workflow excluded). Same company scope as above — platform users must pick a
                company.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {queueCompanyId == null ? (
                <p className="text-sm text-muted-foreground">Select a company to load the queue.</p>
              ) : queueQuery.isLoading ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
                </p>
              ) : queue.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items in queue.</p>
              ) : (
                <ul className="space-y-3">
                  {queue.map((q) => (
                    <li
                      key={`${q.sourceType}:${q.sourceId}`}
                      className="border rounded-lg p-3 flex flex-wrap gap-3 justify-between"
                    >
                      <div>
                        <div className="font-medium">{q.invoiceLabel}</div>
                        <div className="text-xs text-muted-foreground">
                          {q.sourceType.replace(/_/g, " ")} · {q.daysPastDue} d · {bucketLabel(q.agingBucket)} ·{" "}
                          <Badge variant="secondary">{q.workflowStatus}</Badge>
                        </div>
                        <div className="text-sm mt-1">OMR {q.amountOmr.toFixed(3)}</div>
                        {q.note ? <div className="text-xs mt-2 text-muted-foreground">{q.note}</div> : null}
                      </div>
                      <div className="text-xs text-muted-foreground max-w-xs">{q.recommendedAction}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gratuity" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">End-of-service gratuity (Art. 39 estimate)</CardTitle>
              <CardDescription>
                Uses payroll data for the selected employee. Planning only — not legal advice. Requires a company scope.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {queueCompanyId == null ? (
                <p className="text-sm text-muted-foreground">Select a company (workspace or filter) to list employees.</p>
              ) : (
                <>
                  <div className="max-w-md space-y-2">
                    <Label>Employee</Label>
                    <Select
                      value={gratuityEmployeeId === "" ? "" : String(gratuityEmployeeId)}
                      onValueChange={(v) => setGratuityEmployeeId(v ? Number(v) : "")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {(employeesQuery.data ?? []).map((e) => (
                          <SelectItem key={e.id} value={String(e.id)}>
                            {e.firstName} {e.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {gratuityQuery.data && (
                    <div className="rounded-lg border p-4 space-y-1 text-sm max-w-lg">
                      <p>
                        <span className="text-muted-foreground">Gratuity (OMR):</span>{" "}
                        <strong>{gratuityQuery.data.gratuityOmr.toFixed(3)}</strong>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Daily wage:</span>{" "}
                        {gratuityQuery.data.dailyWageOmr.toFixed(3)}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Equivalent days:</span>{" "}
                        {gratuityQuery.data.equivalentDays.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">{gratuityQuery.data.disclaimer}</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
