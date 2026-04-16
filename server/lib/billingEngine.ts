/**
 * Client billing & cash-flow helpers — pure OMR math (no DB).
 * VAT placeholder: 0 until Oman VAT rate is configured per tenant.
 */

/** OMR 3-decimal rounding (fils). */
export function omr(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function dailyWageFromBasicMonthly(basicMonthlyOmr: number): number {
  if (basicMonthlyOmr <= 0) return 0;
  return omr(basicMonthlyOmr / 30);
}

/**
 * End-of-service gratuity estimate — Oman Labour Law Art. 39 (planning / HR).
 * Simplified: 15 days’ wage per year for the first 3 years, 30 days’ wage per year thereafter.
 * Not legal advice; actual entitlement depends on contract type and termination reason.
 */
export function estimateGratuityArticle39(params: {
  basicSalaryOmr: number;
  yearsOfService: number;
}): { gratuityOmr: number; dailyWageOmr: number; equivalentDays: number } {
  const daily = dailyWageFromBasicMonthly(params.basicSalaryOmr);
  if (daily <= 0 || params.yearsOfService <= 0) {
    return { gratuityOmr: 0, dailyWageOmr: daily, equivalentDays: 0 };
  }
  const y = Math.min(Math.max(params.yearsOfService, 0), 80);
  const fullYears = Math.floor(y);
  const frac = y - fullYears;
  let days = 0;
  for (let i = 0; i < fullYears; i++) {
    days += i < 3 ? 15 : 30;
  }
  if (frac > 0) {
    days += frac * (fullYears < 3 ? 15 : 30);
  }
  return {
    gratuityOmr: omr(days * daily),
    dailyWageOmr: daily,
    equivalentDays: days,
  };
}

export type InvoiceLineInput = { quantity: number; unitRateOmr: number; vatRatePct?: number };

export function calculateInvoice(
  lines: InvoiceLineInput[],
  options?: { vatRatePctDefault?: number }
): { subtotalOmr: number; vatOmr: number; totalOmr: number } {
  const defaultVat = options?.vatRatePctDefault ?? 0;
  let subtotal = 0;
  let vat = 0;
  for (const l of lines) {
    const line = omr(l.quantity * l.unitRateOmr);
    subtotal = omr(subtotal + line);
    const rate = (l.vatRatePct ?? defaultVat) / 100;
    vat = omr(vat + line * rate);
  }
  return { subtotalOmr: subtotal, vatOmr: vat, totalOmr: omr(subtotal + vat) };
}

export type InvoiceBalanceState = {
  totalOmr: number;
  amountPaidOmr: number;
  balanceOmr: number;
  status: "draft" | "sent" | "partial" | "paid" | "overdue" | "void";
};

export function applyPayment(
  invoice: Pick<InvoiceBalanceState, "totalOmr" | "amountPaidOmr" | "balanceOmr" | "status">,
  paymentAmountOmr: number
): {
  amountPaidOmr: number;
  balanceOmr: number;
  status: InvoiceBalanceState["status"];
} {
  if (invoice.status === "void") {
    throw new Error("Cannot apply payment to a void invoice");
  }
  if (paymentAmountOmr <= 0) {
    throw new Error("Payment amount must be positive");
  }
  const paid = omr(Number(invoice.amountPaidOmr) + paymentAmountOmr);
  const balance = omr(Number(invoice.totalOmr) - paid);
  if (balance < -0.0005) {
    throw new Error("Payment exceeds outstanding balance");
  }
  const b = Math.max(0, balance);
  const status: InvoiceBalanceState["status"] = b <= 0.0005 ? "paid" : "partial";
  return { amountPaidOmr: paid, balanceOmr: b, status };
}

/**
 * Reverse a recorded payment (after a gateway refund). Does not create a new payment row;
 * use when the PSP refund is the source of truth.
 */
export function applyRefund(
  invoice: Pick<InvoiceBalanceState, "totalOmr" | "amountPaidOmr" | "balanceOmr" | "status">,
  refundOmr: number
): { amountPaidOmr: number; balanceOmr: number; status: InvoiceBalanceState["status"] } {
  if (invoice.status === "void") {
    throw new Error("Cannot refund a void invoice");
  }
  if (refundOmr <= 0) {
    throw new Error("Refund amount must be positive");
  }
  const paid = omr(Number(invoice.amountPaidOmr) - refundOmr);
  if (paid < -0.0005) {
    throw new Error("Refund exceeds recorded payments");
  }
  const amountPaidOmr = Math.max(0, paid);
  const balanceOmr = omr(Number(invoice.totalOmr) - amountPaidOmr);
  const status: InvoiceBalanceState["status"] =
    balanceOmr <= 0.0005 ? "paid" : amountPaidOmr <= 0.0005 ? "sent" : "partial";
  return { amountPaidOmr, balanceOmr, status };
}

/** AR aging buckets (amounts in OMR). */
export type AgingBuckets = {
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  days91Plus: number;
  totalOutstanding: number;
};

export function buildAgingSummary(
  rows: Array<{ balanceOmr: number; dueDate: Date | string }>,
  now: Date = new Date()
): AgingBuckets {
  const buckets: AgingBuckets = {
    current: 0,
    days1To30: 0,
    days31To60: 0,
    days61To90: 0,
    days91Plus: 0,
    totalOutstanding: 0,
  };
  const t0 = now.getTime();
  for (const r of rows) {
    const bal = omr(Number(r.balanceOmr));
    if (bal <= 0) continue;
    buckets.totalOutstanding = omr(buckets.totalOutstanding + bal);
    const due = typeof r.dueDate === "string" ? new Date(r.dueDate) : r.dueDate;
    const daysPast = Math.floor((t0 - due.getTime()) / 86400000);
    if (daysPast <= 0) buckets.current = omr(buckets.current + bal);
    else if (daysPast <= 30) buckets.days1To30 = omr(buckets.days1To30 + bal);
    else if (daysPast <= 60) buckets.days31To60 = omr(buckets.days31To60 + bal);
    else if (daysPast <= 90) buckets.days61To90 = omr(buckets.days61To90 + bal);
    else buckets.days91Plus = omr(buckets.days91Plus + bal);
  }
  return buckets;
}

export type CashFlowMonth = { monthIndex: number; inflowOmr: number; outflowOmr: number; netOmr: number; closingOmr: number };

export function projectCashFlow(params: {
  openingBalanceOmr: number;
  /** One entry per month in order (e.g. 12 months). */
  monthlyNetOmr: number[];
}): CashFlowMonth[] {
  let closing = omr(params.openingBalanceOmr);
  return params.monthlyNetOmr.map((net, monthIndex) => {
    const inflow = net > 0 ? net : 0;
    const outflow = net < 0 ? -net : 0;
    closing = omr(closing + net);
    return {
      monthIndex,
      inflowOmr: omr(inflow),
      outflowOmr: omr(outflow),
      netOmr: omr(net),
      closingOmr: closing,
    };
  });
}
