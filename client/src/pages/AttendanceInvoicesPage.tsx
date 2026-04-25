import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  AlertTriangle,
  Receipt,
  XCircle,
  FileText,
  RefreshCw,
  Loader2,
  ExternalLink,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceStatus = "draft" | "review_ready" | "issued" | "sent" | "paid" | "cancelled";

type BillingLine = {
  itemId: number;
  employeeId: number;
  attendanceDate: string;
  employeeDisplayName: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  durationMinutes: number | null;
  snapshotMissing?: boolean;
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const cfg: Record<InvoiceStatus, { cls: string; icon: React.ReactNode; label: string }> = {
    draft: {
      cls: "bg-gray-100 text-gray-700 border-gray-200",
      icon: <FileText className="w-3 h-3" />,
      label: "Draft",
    },
    review_ready: {
      cls: "bg-blue-50 text-blue-700 border-blue-200",
      icon: <Clock className="w-3 h-3" />,
      label: "Review ready",
    },
    issued: {
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: <CheckCircle2 className="w-3 h-3" />,
      label: "Issued",
    },
    sent: {
      cls: "bg-teal-50 text-teal-700 border-teal-200",
      icon: <Receipt className="w-3 h-3" />,
      label: "Sent",
    },
    paid: {
      cls: "bg-green-50 text-green-700 border-green-200",
      icon: <CheckCircle2 className="w-3 h-3" />,
      label: "Paid",
    },
    cancelled: {
      cls: "bg-red-50 text-red-400 border-red-200",
      icon: <XCircle className="w-3 h-3" />,
      label: "Cancelled",
    },
  };
  const { cls, icon, label } = cfg[status] ?? cfg.draft;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", cls)}>
      {icon}
      {label}
    </span>
  );
}

// ─── Invoice detail sheet ─────────────────────────────────────────────────────

function InvoiceDetailSheet({
  invoiceId,
  open,
  onClose,
}: {
  invoiceId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();

  const { data: invoice, isLoading } = trpc.attendanceBilling.getAttendanceInvoice.useQuery(
    { invoiceId: invoiceId! },
    { enabled: open && invoiceId != null },
  );

  const cancelInvoice = trpc.attendanceBilling.cancelAttendanceInvoice.useMutation({
    onSuccess: () => {
      toast.success("Invoice cancelled");
      utils.attendanceBilling.listAttendanceInvoices.invalidate();
      utils.attendanceBilling.getAttendanceInvoice.invalidate();
      utils.attendanceBilling.getAttendanceBillingCandidate.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  function formatTime(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  const lines: BillingLine[] = (invoice?.billingLinesJson as BillingLine[] | undefined) ?? [];
  const canCancel = invoice?.status === "draft" || invoice?.status === "review_ready";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Invoice #{invoiceId}</SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {invoice && (
          <div className="mt-4 space-y-4">
            {/* Invoice number + status */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold">{invoice.invoiceNumber}</span>
              <InvoiceStatusBadge status={invoice.status as InvoiceStatus} />
            </div>

            {/* Summary grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Client</span>
                <div className="mt-1 font-medium">{invoice.clientDisplayName}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Period</span>
                <div className="mt-1 font-medium">
                  {invoice.periodStart} → {invoice.periodEnd}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Total hours</span>
                <div className="mt-1 font-medium">
                  {invoice.totalHours != null ? `${invoice.totalHours}h` : "—"}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Rate / hour</span>
                <div className="mt-1 font-medium">{invoice.ratePerHourOmr} OMR</div>
              </div>
              {invoice.dueDateYmd && (
                <div>
                  <span className="text-muted-foreground">Due date</span>
                  <div className="mt-1 font-medium">{invoice.dueDateYmd}</div>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Source candidate</span>
                <div className="mt-1">
                  <Link
                    href="/finance/attendance-billing"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    Candidate #{invoice.candidateId}
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>

            {/* Financials */}
            <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{invoice.subtotalOmr} OMR</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT ({invoice.vatRatePct}%)</span>
                <span>{invoice.vatOmr} OMR</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                <span>Total</span>
                <span>{invoice.totalOmr} OMR</span>
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="text-sm">
                <span className="text-muted-foreground">Notes</span>
                <p className="mt-1">{invoice.notes}</p>
              </div>
            )}

            {/* Snapshot warning override */}
            {invoice.snapshotWarningOverrideReason && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Snapshot warning override recorded</p>
                  <p className="mt-0.5 text-xs">{invoice.snapshotWarningOverrideReason}</p>
                </div>
              </div>
            )}

            {/* Billing lines */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Billing lines ({lines.length})</h3>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No billing lines.</p>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Check-in</TableHead>
                        <TableHead>Check-out</TableHead>
                        <TableHead className="text-right">Minutes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => (
                        <TableRow
                          key={line.itemId}
                          className={line.snapshotMissing ? "bg-amber-50" : undefined}
                        >
                          <TableCell className="font-medium">
                            {line.employeeDisplayName ?? `#${line.employeeId}`}
                            {line.snapshotMissing && (
                              <span className="ml-1 text-amber-600 text-xs">(no snapshot)</span>
                            )}
                          </TableCell>
                          <TableCell>{line.attendanceDate}</TableCell>
                          <TableCell>{formatTime(line.checkInAt)}</TableCell>
                          <TableCell>{formatTime(line.checkOutAt)}</TableCell>
                          <TableCell className="text-right">
                            {line.durationMinutes ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Actions */}
            {canCancel && (
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => cancelInvoice.mutate({ invoiceId: invoice.id })}
                  disabled={cancelInvoice.isPending}
                >
                  {cancelInvoice.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4 mr-1" />
                  )}
                  Cancel invoice
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AttendanceInvoicesPage() {
  const { activeCompanyId } = useActiveCompany();
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: invoices, isLoading, refetch } =
    trpc.attendanceBilling.listAttendanceInvoices.useQuery(
      { status: statusFilter === "all" ? undefined : statusFilter },
      { enabled: activeCompanyId != null },
    );

  const rows = invoices ?? [];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Attendance Invoices</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Draft invoices converted from approved attendance billing candidates.
            No issuance or payment in this phase.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/finance/attendance-billing">
            <Button variant="outline" size="sm">
              <FileText className="w-4 h-4 mr-1" />
              View candidates
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={cn("w-4 h-4 mr-1", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as InvoiceStatus | "all")}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="review_ready">Review ready</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Receipt className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No attendance invoices found.</p>
            <Link href="/finance/attendance-billing" className="mt-2 text-xs text-blue-600 hover:underline">
              Convert a candidate to create one →
            </Link>
          </CardContent>
        </Card>
      )}

      {!isLoading && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((inv) => (
            <Card
              key={inv.id}
              className="cursor-pointer hover:shadow-sm transition-shadow"
              onClick={() => setSelectedId(inv.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-muted-foreground">
                        {inv.invoiceNumber}
                      </span>
                      <InvoiceStatusBadge status={inv.status as InvoiceStatus} />
                    </div>
                    <p className="text-sm font-medium truncate">{inv.clientDisplayName}</p>
                    <p className="text-xs text-muted-foreground">
                      Period: {inv.periodStart} → {inv.periodEnd}
                    </p>
                    {inv.dueDateYmd && (
                      <p className="text-xs text-muted-foreground">Due: {inv.dueDateYmd}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-sm font-semibold">{inv.totalOmr} OMR</p>
                    <p className="text-xs text-muted-foreground">
                      {inv.totalDurationMinutes != null
                        ? `${Math.round((inv.totalDurationMinutes / 60) * 10) / 10}h`
                        : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <InvoiceDetailSheet
        invoiceId={selectedId}
        open={selectedId != null}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
