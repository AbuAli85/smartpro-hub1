import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  Send,
  Download,
  Ban,
  DollarSign,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceStatus = "draft" | "review_ready" | "issued" | "sent" | "paid" | "cancelled";

type PaymentMethod = "bank" | "cash" | "card" | "other";

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

type PaymentRecord = {
  id: number;
  amountOmr: string;
  paidAt: string;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  createdAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtOmr(v: string | null | undefined): string {
  if (v == null) return "0.000";
  return parseFloat(v).toFixed(3);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank: "Bank transfer",
  cash: "Cash",
  card: "Card",
  other: "Other",
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

// ─── Void reason modal ────────────────────────────────────────────────────────

function VoidInvoiceDialog({
  open,
  invoiceId,
  onClose,
  onVoided,
}: {
  open: boolean;
  invoiceId: number;
  onClose: () => void;
  onVoided: () => void;
}) {
  const [reason, setReason] = useState("");

  const voidInvoice = trpc.attendanceBilling.voidAttendanceInvoice.useMutation({
    onSuccess: () => {
      toast.success("Invoice voided");
      setReason("");
      onVoided();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit() {
    if (reason.trim().length < 5) {
      toast.error("Void reason must be at least 5 characters.");
      return;
    }
    voidInvoice.mutate({ invoiceId, voidReason: reason.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void invoice #{invoiceId}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Voiding an issued invoice marks it cancelled and records a reason. This cannot be undone.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="void-reason">Void reason</Label>
            <Textarea
              id="void-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe why this invoice is being voided…"
            />
            <p className="text-xs text-muted-foreground">{reason.length}/500</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={voidInvoice.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={voidInvoice.isPending || reason.trim().length < 5}
          >
            {voidInvoice.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Void invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Record Payment modal ─────────────────────────────────────────────────────

function RecordPaymentModal({
  open,
  invoiceId,
  outstandingOmr,
  onClose,
  onSuccess,
}: {
  open: boolean;
  invoiceId: number;
  outstandingOmr: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [paidAt, setPaidAt] = useState(todayYmd);

  const recordPayment = trpc.attendanceBilling.recordAttendanceInvoicePayment.useMutation({
    onSuccess: () => {
      toast.success("Payment recorded");
      resetForm();
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setAmount("");
    setPaymentMethod("bank");
    setReference("");
    setNotes("");
    setPaidAt(todayYmd());
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  const parsedAmount = parseFloat(amount);
  const amountValid = !isNaN(parsedAmount) && parsedAmount > 0;
  const amountExceeds = amountValid && parsedAmount > outstandingOmr + 0.001;
  const canSubmit = amountValid && !amountExceeds && !recordPayment.isPending;

  function handleSubmit() {
    if (!canSubmit) return;
    if (amountExceeds) {
      toast.error(`Amount exceeds outstanding balance of ${outstandingOmr.toFixed(3)} OMR.`);
      return;
    }
    recordPayment.mutate({
      invoiceId,
      amountOmr: parsedAmount,
      paymentMethod,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
      paidAt,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment — Invoice #{invoiceId}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Outstanding balance callout */}
          <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
            Outstanding balance: <span className="font-semibold">{outstandingOmr.toFixed(3)} OMR</span>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Amount (OMR)</Label>
            <Input
              id="pay-amount"
              type="number"
              step="0.001"
              min="0.001"
              placeholder="0.000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={amountExceeds ? "border-red-400" : undefined}
            />
            {amountExceeds && (
              <p className="text-xs text-red-600">
                Exceeds outstanding balance of {outstandingOmr.toFixed(3)} OMR.
              </p>
            )}
          </div>

          {/* Payment method */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-method">Payment method</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
              <SelectTrigger id="pay-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">Bank transfer</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Paid date */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-date">Payment date</Label>
            <Input
              id="pay-date"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>

          {/* Reference */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">Reference (optional)</Label>
            <Input
              id="pay-ref"
              placeholder="Cheque / transfer number…"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={255}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-notes">Notes (optional)</Label>
            <Textarea
              id="pay-notes"
              rows={2}
              placeholder="Any additional notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={recordPayment.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {recordPayment.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const { data: invoice, isLoading } = trpc.attendanceBilling.getAttendanceInvoice.useQuery(
    { invoiceId: invoiceId! },
    { enabled: open && invoiceId != null },
  );

  const { data: payments } = trpc.attendanceBilling.listAttendanceInvoicePayments.useQuery(
    { invoiceId: invoiceId! },
    { enabled: open && invoiceId != null && (invoice?.status === "issued" || invoice?.status === "sent" || invoice?.status === "paid") },
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

  const issueInvoice = trpc.attendanceBilling.issueAttendanceInvoice.useMutation({
    onSuccess: (result) => {
      if (result.skipped) {
        toast.info("Invoice was already issued.");
      } else {
        toast.success("Invoice issued successfully.");
      }
      utils.attendanceBilling.listAttendanceInvoices.invalidate();
      utils.attendanceBilling.getAttendanceInvoice.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const markSent = trpc.attendanceBilling.markAttendanceInvoiceSent.useMutation({
    onSuccess: () => {
      toast.success("Invoice marked as sent.");
      utils.attendanceBilling.listAttendanceInvoices.invalidate();
      utils.attendanceBilling.getAttendanceInvoice.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function invalidateAfterPayment() {
    utils.attendanceBilling.listAttendanceInvoices.invalidate();
    utils.attendanceBilling.getAttendanceInvoice.invalidate();
    utils.attendanceBilling.listAttendanceInvoicePayments.invalidate();
  }

  function formatTime(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  const lines: BillingLine[] = (invoice?.billingLinesJson as BillingLine[] | undefined) ?? [];
  const status = invoice?.status as InvoiceStatus | undefined;
  const canCancel = status === "draft" || status === "review_ready";
  const canIssue = status === "draft" || status === "review_ready";
  const canMarkSent = status === "issued";
  const canRecordPayment = status === "issued" || status === "sent";
  const canVoid = status === "issued" || status === "sent";

  const artifactUrl = invoice && "htmlArtifactUrl" in invoice
    ? (invoice as { htmlArtifactUrl?: string | null }).htmlArtifactUrl
    : null;

  const sentAt = invoice && "sentAt" in invoice
    ? (invoice as { sentAt?: string | null }).sentAt
    : null;

  const amountPaidOmr = invoice && "amountPaidOmr" in invoice
    ? (invoice as { amountPaidOmr?: string | null }).amountPaidOmr
    : null;

  const balanceOmr = invoice && "balanceOmr" in invoice
    ? (invoice as { balanceOmr?: string | null }).balanceOmr
    : null;

  const outstandingNum = balanceOmr != null ? parseFloat(balanceOmr) : 0;
  const showPaymentProgress = status === "issued" || status === "sent" || status === "paid";

  const paymentRows = (payments ?? []) as PaymentRecord[];

  return (
    <>
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
                {sentAt && (
                  <div>
                    <span className="text-muted-foreground">Sent to client</span>
                    <div className="mt-1 font-medium">{fmtDate(sentAt)}</div>
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
                {showPaymentProgress && amountPaidOmr != null && (
                  <>
                    <div className="flex justify-between text-emerald-700 border-t pt-1 mt-1">
                      <span>Paid</span>
                      <span>{fmtOmr(amountPaidOmr)} OMR</span>
                    </div>
                    <div className="flex justify-between font-semibold text-orange-700">
                      <span>Outstanding</span>
                      <span>{fmtOmr(balanceOmr)} OMR</span>
                    </div>
                  </>
                )}
              </div>

              {/* HTML artifact download */}
              {artifactUrl && (
                <a
                  href={artifactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download invoice (HTML)
                </a>
              )}

              {/* Notes */}
              {invoice.notes && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Notes</span>
                  <p className="mt-1 whitespace-pre-wrap">{invoice.notes}</p>
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

              {/* Payment history */}
              {showPaymentProgress && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Payment history</h3>
                  {paymentRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead>Reference</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paymentRows.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell>{fmtDate(p.paidAt)}</TableCell>
                              <TableCell className="font-medium">{fmtOmr(p.amountOmr)} OMR</TableCell>
                              <TableCell>{PAYMENT_METHOD_LABELS[p.paymentMethod]}</TableCell>
                              <TableCell className="text-muted-foreground text-xs">
                                {p.reference ?? "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2">
                {canIssue && (
                  <Button
                    size="sm"
                    onClick={() => issueInvoice.mutate({ invoiceId: invoice.id })}
                    disabled={issueInvoice.isPending}
                  >
                    {issueInvoice.isPending ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-1" />
                    )}
                    Issue invoice
                  </Button>
                )}

                {canMarkSent && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-teal-700 border-teal-200 hover:bg-teal-50"
                    onClick={() => markSent.mutate({ invoiceId: invoice.id })}
                    disabled={markSent.isPending}
                  >
                    {markSent.isPending ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-1" />
                    )}
                    Mark as sent
                  </Button>
                )}

                {canRecordPayment && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                    onClick={() => setPaymentModalOpen(true)}
                  >
                    <DollarSign className="w-4 h-4 mr-1" />
                    Record payment
                  </Button>
                )}

                {canVoid && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-orange-600 border-orange-200 hover:bg-orange-50"
                    onClick={() => setVoidDialogOpen(true)}
                  >
                    <Ban className="w-4 h-4 mr-1" />
                    Void invoice
                  </Button>
                )}

                {canCancel && (
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
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {invoiceId != null && (
        <>
          <VoidInvoiceDialog
            open={voidDialogOpen}
            invoiceId={invoiceId}
            onClose={() => setVoidDialogOpen(false)}
            onVoided={() => {
              setVoidDialogOpen(false);
              utils.attendanceBilling.listAttendanceInvoices.invalidate();
              utils.attendanceBilling.getAttendanceInvoice.invalidate();
              onClose();
            }}
          />
          <RecordPaymentModal
            open={paymentModalOpen}
            invoiceId={invoiceId}
            outstandingOmr={outstandingNum}
            onClose={() => setPaymentModalOpen(false)}
            onSuccess={() => {
              setPaymentModalOpen(false);
              invalidateAfterPayment();
            }}
          />
        </>
      )}
    </>
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
            Issue and manage attendance invoices. Download HTML artifacts for issued invoices.
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
          {rows.map((inv) => {
            const invStatus = inv.status as InvoiceStatus;
            const showProgress = invStatus === "issued" || invStatus === "sent" || invStatus === "paid";
            const invAmountPaid = "amountPaidOmr" in inv ? (inv as { amountPaidOmr?: string | null }).amountPaidOmr : null;
            const invSentAt = "sentAt" in inv ? (inv as { sentAt?: string | null }).sentAt : null;
            const totalNum = parseFloat(inv.totalOmr);
            const paidNum = invAmountPaid != null ? parseFloat(invAmountPaid) : 0;
            const progressPct = totalNum > 0 ? Math.min(100, (paidNum / totalNum) * 100) : 0;

            return (
              <Card
                key={inv.id}
                className="cursor-pointer hover:shadow-sm transition-shadow"
                onClick={() => setSelectedId(inv.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-muted-foreground">
                          {inv.invoiceNumber}
                        </span>
                        <InvoiceStatusBadge status={invStatus} />
                        {inv.htmlArtifactUrl && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-emerald-600">
                            <Download className="w-3 h-3" />
                            HTML
                          </span>
                        )}
                        {invSentAt && (
                          <span className="text-xs text-teal-600">
                            Sent {fmtDate(invSentAt)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium truncate">{inv.clientDisplayName}</p>
                      <p className="text-xs text-muted-foreground">
                        Period: {inv.periodStart} → {inv.periodEnd}
                      </p>
                      {inv.dueDateYmd && (
                        <p className="text-xs text-muted-foreground">Due: {inv.dueDateYmd}</p>
                      )}
                      {showProgress && invAmountPaid != null && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <CreditCard className="w-3 h-3" />
                              Paid {fmtOmr(invAmountPaid)} / {fmtOmr(inv.totalOmr)} OMR
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                invStatus === "paid" ? "bg-green-500" : "bg-emerald-400",
                              )}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
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
            );
          })}
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
