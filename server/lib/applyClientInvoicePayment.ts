import { and, eq } from "drizzle-orm";
import type { getDb } from "../db.client";
import { clientServiceInvoices, invoicePaymentRecords } from "../../drizzle/schema";
import { applyPayment } from "./billingEngine";

export type AppDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function applyInvoicePayment(
  db: AppDb,
  params: {
    invoiceId: number;
    companyId: number;
    amountOmr: number;
    paymentMethod?: "bank" | "cash" | "card" | "other";
    reference?: string | null;
    gateway?: "thawani" | "stripe" | null;
    gatewaySessionId?: string | null;
    gatewayPaymentId?: string | null;
    gatewayStatus?: string | null;
    paidAt?: Date;
  }
): Promise<{ balanceOmr: number; status: string }> {
  const [inv] = await db
    .select()
    .from(clientServiceInvoices)
    .where(and(eq(clientServiceInvoices.id, params.invoiceId), eq(clientServiceInvoices.companyId, params.companyId)))
    .limit(1);
  if (!inv) throw new Error("Invoice not found");
  const next = applyPayment(
    {
      totalOmr: Number(inv.totalOmr),
      amountPaidOmr: Number(inv.amountPaidOmr),
      balanceOmr: Number(inv.balanceOmr),
      status: inv.status as "draft" | "sent" | "partial" | "paid" | "overdue" | "void",
    },
    params.amountOmr
  );
  await db.insert(invoicePaymentRecords).values({
    invoiceId: params.invoiceId,
    amountOmr: String(params.amountOmr),
    paidAt: params.paidAt ?? new Date(),
    paymentMethod: params.paymentMethod ?? "card",
    reference: params.reference ?? null,
    gateway: params.gateway ?? null,
    gatewaySessionId: params.gatewaySessionId ?? null,
    gatewayPaymentId: params.gatewayPaymentId ?? null,
    gatewayStatus: params.gatewayStatus ?? null,
  });
  await db
    .update(clientServiceInvoices)
    .set({
      amountPaidOmr: String(next.amountPaidOmr),
      balanceOmr: String(next.balanceOmr),
      status: next.status,
    })
    .where(eq(clientServiceInvoices.id, params.invoiceId));
  return { balanceOmr: next.balanceOmr, status: next.status };
}
