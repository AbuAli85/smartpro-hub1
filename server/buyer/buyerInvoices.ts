/**
 * Buyer-scoped invoice reads — only rows linked via `customer_invoice_links`
 * and verified against the buyer's provider company.
 */
import { and, count, desc, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../drizzle/schema";
import { customerAccounts, customerInvoiceLinks, proBillingCycles } from "../../drizzle/schema";
import type { BuyerContext } from "./buyerContext";

export type BuyerInvoiceListItem = {
  id: number;
  reference: string;
  issueDate: string | null;
  dueDate: string | null;
  status: string;
  amount: string;
  currency: string;
  documentUrl: string | null;
};

type ProBillingStatus = "pending" | "paid" | "overdue" | "cancelled" | "waived";

function issueDateFromBilling(row: {
  billingYear: number;
  billingMonth: number;
  createdAt: Date | null;
}): string | null {
  try {
    const d = new Date(row.billingYear, row.billingMonth - 1, 1);
    if (Number.isNaN(d.getTime())) return row.createdAt ? new Date(row.createdAt).toISOString().slice(0, 10) : null;
    return d.toISOString().slice(0, 10);
  } catch {
    return row.createdAt ? new Date(row.createdAt).toISOString().slice(0, 10) : null;
  }
}

function mapRow(row: {
  id: number;
  invoiceNumber: string;
  billingYear: number;
  billingMonth: number;
  status: ProBillingStatus;
  amountOmr: string | null;
  dueDate: Date | null;
  createdAt: Date | null;
}): BuyerInvoiceListItem {
  return {
    id: row.id,
    reference: row.invoiceNumber,
    issueDate: issueDateFromBilling(row),
    dueDate: row.dueDate ? new Date(row.dueDate).toISOString().slice(0, 10) : null,
    status: row.status,
    amount: row.amountOmr != null ? String(row.amountOmr) : "0",
    currency: "OMR",
    documentUrl: null,
  };
}

function scopeWhere(buyer: BuyerContext, status?: ProBillingStatus) {
  return and(
    eq(customerInvoiceLinks.customerAccountId, buyer.customerAccountId),
    eq(customerAccounts.id, buyer.customerAccountId),
    eq(customerAccounts.providerCompanyId, buyer.providerCompanyId),
    eq(proBillingCycles.companyId, buyer.providerCompanyId),
    status ? eq(proBillingCycles.status, status) : undefined,
  );
}

export async function queryBuyerInvoicesForAccount(
  db: MySql2Database<typeof schema>,
  buyer: BuyerContext,
  opts: { page: number; pageSize: number; status?: ProBillingStatus },
): Promise<{ items: BuyerInvoiceListItem[]; total: number }> {
  const page = Math.max(1, opts.page);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize));
  const offset = (page - 1) * pageSize;

  const whereClause = scopeWhere(buyer, opts.status);

  const [countRow] = await db
    .select({ total: count() })
    .from(customerInvoiceLinks)
    .innerJoin(proBillingCycles, eq(proBillingCycles.id, customerInvoiceLinks.invoiceId))
    .innerJoin(customerAccounts, eq(customerAccounts.id, customerInvoiceLinks.customerAccountId))
    .where(whereClause);

  const total = Number(countRow?.total ?? 0);

  const rows = await db
    .select({
      id: proBillingCycles.id,
      invoiceNumber: proBillingCycles.invoiceNumber,
      billingYear: proBillingCycles.billingYear,
      billingMonth: proBillingCycles.billingMonth,
      status: proBillingCycles.status,
      amountOmr: proBillingCycles.amountOmr,
      dueDate: proBillingCycles.dueDate,
      createdAt: proBillingCycles.createdAt,
    })
    .from(customerInvoiceLinks)
    .innerJoin(proBillingCycles, eq(proBillingCycles.id, customerInvoiceLinks.invoiceId))
    .innerJoin(customerAccounts, eq(customerAccounts.id, customerInvoiceLinks.customerAccountId))
    .where(whereClause)
    .orderBy(desc(proBillingCycles.billingYear), desc(proBillingCycles.billingMonth))
    .limit(pageSize)
    .offset(offset);

  return { items: rows.map(mapRow), total };
}
