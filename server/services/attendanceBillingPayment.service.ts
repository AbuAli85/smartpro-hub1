/**
 * Phase 12F — Attendance invoice manual payment recording.
 *
 * Exports:
 *  - computeAttendanceInvoiceBalance  pure helper — no I/O
 *  - recordAttendanceInvoicePayment   inserts a payment record and updates the invoice
 */

import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { attendanceInvoices, attendanceInvoicePaymentRecords } from "../../drizzle/schema";
import {
  canRecordAttendanceInvoicePayment,
  type AttendanceInvoiceStatus,
} from "../../shared/attendanceInvoiceStateMachine";

// ─── Types ─────────────────────────────────────────────────────────────────────

type DbClient = Awaited<ReturnType<typeof import("../db.client").requireDb>>;

export type RecordPaymentInput = {
  companyId: number;
  invoiceId: number;
  userId: number;
  amountOmr: number;
  paymentMethod: "bank" | "cash" | "card" | "other";
  reference?: string | null;
  notes?: string | null;
  paidAt?: Date;
};

export type RecordPaymentResult = {
  paymentId: number | null;
  invoiceId: number;
  newAmountPaidOmr: string;
  balanceOmr: string;
  newStatus: AttendanceInvoiceStatus;
};

// ─── Pure helpers ──────────────────────────────────────────────────────────────

/** Round to 3 decimal places (OMR standard). */
function round3(n: number): string {
  return (Math.round(n * 1000) / 1000).toFixed(3);
}

/**
 * Compute the outstanding balance for an attendance invoice.
 * Both arguments are decimal strings from the DB (e.g. "84.000", "0.000").
 */
export function computeAttendanceInvoiceBalance(
  totalOmr: string,
  amountPaidOmr: string,
): number {
  return parseFloat(totalOmr) - parseFloat(amountPaidOmr);
}

// ─── recordAttendanceInvoicePayment ───────────────────────────────────────────

export async function recordAttendanceInvoicePayment(
  db: DbClient,
  input: RecordPaymentInput,
): Promise<RecordPaymentResult> {
  // 1. Load invoice
  const rows = await db
    .select()
    .from(attendanceInvoices)
    .where(
      and(
        eq(attendanceInvoices.id, input.invoiceId),
        eq(attendanceInvoices.companyId, input.companyId),
      ),
    )
    .limit(1);

  const invoice = rows[0];
  if (!invoice) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Attendance invoice not found." });
  }

  const status = invoice.status as AttendanceInvoiceStatus;

  // 2. Status gate
  if (!canRecordAttendanceInvoicePayment(status)) {
    if (status === "paid") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This invoice is already fully paid.",
      });
    }
    if (status === "cancelled") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot record payment for a cancelled invoice.",
      });
    }
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot record payment for invoice with status '${status}'. Invoice must be issued or sent.`,
    });
  }

  // 3. Compute outstanding balance
  const outstanding = computeAttendanceInvoiceBalance(invoice.totalOmr, invoice.amountPaidOmr);

  // 4. Amount guards
  if (input.amountOmr <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Payment amount must be greater than 0.",
    });
  }
  if (input.amountOmr > outstanding + 0.001) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Payment of ${round3(input.amountOmr)} OMR exceeds outstanding balance of ${round3(outstanding)} OMR.`,
    });
  }

  // 5. Compute new totals
  const newAmountPaid = parseFloat(invoice.amountPaidOmr) + input.amountOmr;
  const newBalance = parseFloat(invoice.totalOmr) - newAmountPaid;
  const newStatus: AttendanceInvoiceStatus = newBalance <= 0.001 ? "paid" : status;
  const paidAt = input.paidAt ?? new Date();

  // 6. Insert payment record
  await db.insert(attendanceInvoicePaymentRecords).values({
    attendanceInvoiceId: input.invoiceId,
    companyId: input.companyId,
    amountOmr: round3(input.amountOmr),
    paidAt,
    paymentMethod: input.paymentMethod,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    createdByUserId: input.userId,
  });

  // Fetch the inserted payment id
  const paymentRows = await db
    .select({ id: attendanceInvoicePaymentRecords.id })
    .from(attendanceInvoicePaymentRecords)
    .where(
      and(
        eq(attendanceInvoicePaymentRecords.attendanceInvoiceId, input.invoiceId),
        eq(attendanceInvoicePaymentRecords.companyId, input.companyId),
        eq(attendanceInvoicePaymentRecords.createdByUserId, input.userId),
      ),
    )
    .limit(1);

  const paymentId = paymentRows[0]?.id ?? null;

  // 7. Update invoice
  await db
    .update(attendanceInvoices)
    .set({
      amountPaidOmr: round3(newAmountPaid),
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(attendanceInvoices.id, input.invoiceId));

  console.log(
    `[billing] payment recorded invoice=${input.invoiceId} amount=${round3(input.amountOmr)} OMR` +
      ` method=${input.paymentMethod} newStatus=${newStatus}` +
      ` userId=${input.userId} companyId=${input.companyId}`,
  );

  return {
    paymentId,
    invoiceId: input.invoiceId,
    newAmountPaidOmr: round3(newAmountPaid),
    balanceOmr: round3(Math.max(newBalance, 0)),
    newStatus,
  };
}
