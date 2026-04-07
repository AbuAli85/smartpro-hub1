import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Gavel, Loader2, PhoneCall } from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

type Pulse = NonNullable<RouterOutputs["operations"]["getOwnerBusinessPulse"]>;
type Execution = NonNullable<Pulse["execution"]>;
type WorkItem = Execution["decisionWorkItems"][number];
type CollectionRow = Execution["collectionQueue"][number];

const COLLECTION_STATUSES = [
  "needs_follow_up",
  "promised_to_pay",
  "escalated",
  "disputed",
  "resolved",
] as const;

type ExecProps = {
  execution: Execution;
  companyId: number;
};

export function DecisionExecutionPanel({ execution, companyId }: ExecProps) {
  const utils = trpc.useUtils();
  const invalidate = useCallback(() => {
    void utils.operations.getOwnerBusinessPulse.invalidate();
  }, [utils]);

  const updateLeave = trpc.hr.updateLeave.useMutation({ onSuccess: () => { toast.success("Leave updated"); invalidate(); }, onError: (e) => toast.error(e.message) });
  const reviewExpense = trpc.financeHR.reviewExpense.useMutation({ onSuccess: () => { toast.success("Expense reviewed"); invalidate(); }, onError: (e) => toast.error(e.message) });
  const updateEmpReq = trpc.employeeRequests.updateStatus.useMutation({ onSuccess: () => { toast.success("Request updated"); invalidate(); }, onError: (e) => toast.error(e.message) });
  const sendQuote = trpc.quotations.send.useMutation({ onSuccess: () => { toast.success("Quotation sent"); invalidate(); }, onError: (e) => toast.error(e.message) });
  const approvePayroll = trpc.payroll.approveRun.useMutation({ onSuccess: () => { toast.success("Payroll approved"); invalidate(); }, onError: (e) => toast.error(e.message) });
  const markPaid = trpc.payroll.markPaid.useMutation({ onSuccess: () => { toast.success("Marked paid"); invalidate(); }, onError: (e) => toast.error(e.message) });

  const [busyKey, setBusyKey] = useState<string | null>(null);

  const runAction = async (item: WorkItem, actionKey: string) => {
    const k = `${item.workItemKey}:${actionKey}`;
    setBusyKey(k);
    try {
      if (item.entityType === "leave_request") {
        if (actionKey === "leave_approve") await updateLeave.mutateAsync({ id: item.entityId, status: "approved" });
        else if (actionKey === "leave_reject") {
          const ok = window.confirm("Reject this leave request?");
          if (!ok) return;
          await updateLeave.mutateAsync({ id: item.entityId, status: "rejected" });
        }
      } else if (item.entityType === "expense_claim") {
        if (actionKey === "expense_approve") await reviewExpense.mutateAsync({ id: item.entityId, action: "approved" });
        else if (actionKey === "expense_reject") {
          const ok = window.confirm("Reject this expense?");
          if (!ok) return;
          await reviewExpense.mutateAsync({ id: item.entityId, action: "rejected" });
        }
      } else if (item.entityType === "employee_request") {
        if (actionKey === "employee_request_approve") {
          await updateEmpReq.mutateAsync({ requestId: item.entityId, status: "approved", companyId });
        } else if (actionKey === "employee_request_reject") {
          const ok = window.confirm("Reject this request?");
          if (!ok) return;
          await updateEmpReq.mutateAsync({ requestId: item.entityId, status: "rejected", companyId });
        }
      } else if (item.entityType === "service_quotation" && actionKey === "quotation_send") {
        await sendQuote.mutateAsync({ id: item.entityId });
      } else if (item.entityType === "payroll_run") {
        if (actionKey === "payroll_approve_run") await approvePayroll.mutateAsync({ runId: item.entityId, companyId });
        else if (actionKey === "payroll_mark_paid") await markPaid.mutateAsync({ runId: item.entityId, companyId });
      } else if (actionKey === "contract_open_sign") {
        window.location.href = item.deepLink;
      }
    } finally {
      setBusyKey(null);
    }
  };

  if (execution.decisionWorkItems.length === 0) {
    return (
      <Card className="border-border/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gavel size={14} /> Approvals & decisions
          </CardTitle>
          <p className="text-[10px] text-muted-foreground font-normal">{execution.basis}</p>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No pending items in the execution queue.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/80 border-l-4 border-l-[var(--smartpro-orange)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Gavel size={14} className="text-[var(--smartpro-orange)]" />
          Approvals & decisions — act here
        </CardTitle>
        <p className="text-[10px] text-muted-foreground font-normal">{execution.basis}</p>
      </CardHeader>
      <CardContent className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {execution.decisionWorkItems.map((item) => (
          <div
            key={item.workItemKey}
            className="rounded-lg border border-border/70 p-3 space-y-2 bg-muted/20"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="text-xs font-semibold">{item.title}</p>
                <p className="text-[10px] text-muted-foreground line-clamp-2">{item.subtitle}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  {item.entityType.replace(/_/g, " ")} · {item.status}
                  {item.actorHint ? ` · ${item.actorHint}` : ""}
                </p>
              </div>
              <Link href={item.deepLink} className="text-[10px] text-[var(--smartpro-orange)] shrink-0">
                Open
              </Link>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {item.actions.map((a) => (
                <Button
                  key={a.actionKey}
                  type="button"
                  size="sm"
                  variant={a.tone === "destructive" ? "destructive" : a.tone === "secondary" ? "secondary" : "default"}
                  className="h-8 text-[11px]"
                  disabled={busyKey !== null}
                  onClick={() => runAction(item, a.actionKey)}
                >
                  {busyKey === `${item.workItemKey}:${a.actionKey}` ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    a.label
                  )}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

type CollectionProps = ExecProps & { canFinance: boolean };

export function CollectionsExecutionPanel({ execution, companyId, canFinance }: CollectionProps) {
  const utils = trpc.useUtils();
  const upsert = trpc.operations.upsertCollectionWorkItem.useMutation({
    onSuccess: () => {
      toast.success("Collection status saved");
      void utils.operations.getOwnerBusinessPulse.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingStatus, setPendingStatus] = useState<Record<string, string>>({});

  if (!canFinance || execution.collectionQueue.length === 0) {
    return null;
  }

  return (
    <Card className="border-border/80 border-l-4 border-l-red-300/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <PhoneCall size={14} className="text-red-700" />
          Collections execution queue
        </CardTitle>
        <p className="text-[10px] text-muted-foreground font-normal">
          Prioritised overdue receivables — set workflow status (persisted). Requires finance or company admin.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 max-h-[380px] overflow-y-auto">
        {execution.collectionQueue.map((row: CollectionRow) => {
          const key = `${row.sourceType}:${row.sourceId}`;
          return (
            <div key={key} className="rounded-lg border border-border/60 p-2 space-y-2 text-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-mono font-semibold">{row.invoiceLabel}</span>
                <span className="text-red-800 font-bold tabular-nums">OMR {row.amountOmr.toFixed(3)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {row.sourceType.replace(/_/g, " ")} · {row.daysPastDue}d past due · {row.agingBucket.replace("_", "–")}
              </p>
              <p className="text-[10px]">{row.recommendedAction}</p>
              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                <div className="flex-1 space-y-1">
                  <Select
                    value={pendingStatus[key] ?? row.workflowStatus}
                    onValueChange={(v) => setPendingStatus((s) => ({ ...s, [key]: v }))}
                  >
                    <SelectTrigger className="h-8 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLLECTION_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {s.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    placeholder="Note (optional)"
                    className="min-h-[52px] text-[11px]"
                    value={notes[key] ?? row.note ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [key]: e.target.value }))}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 shrink-0"
                  disabled={upsert.isPending}
                  onClick={() =>
                    upsert.mutate({
                      companyId,
                      sourceType: row.sourceType,
                      sourceId: row.sourceId,
                      workflowStatus: (pendingStatus[key] ?? row.workflowStatus) as (typeof COLLECTION_STATUSES)[number],
                      note: notes[key] ?? row.note ?? undefined,
                    })
                  }
                >
                  {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </div>
              <Link href={row.deepLink} className="text-[10px] text-[var(--smartpro-orange)] inline-block">
                Open billing context →
              </Link>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
