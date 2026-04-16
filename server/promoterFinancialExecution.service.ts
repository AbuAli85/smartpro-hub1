/**
 * Phase 3 — promoter payroll runs & invoices from frozen staging snapshots.
 */

import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  companies,
  employees,
  promoterInvoiceLines,
  promoterInvoices,
  promoterPayrollRunLines,
  promoterPayrollRuns,
} from "../drizzle/schema";
import { getPayrollStagingRows, getBillingStagingRows } from "./promoterAssignmentOps.service";
import { computePromoterPayrollAccrualOmr, classifyProfitabilityView } from "../shared/promoterAssignmentProfitability";
import {
  canIncludePayrollStagingRow,
  canIncludeBillingStagingRow,
  type ExecutionAcknowledgment,
} from "../shared/promoterAssignmentExecutionApprovalPolicy";
import {
  resolvePromoterAssignmentCommercial,
  countPeriodCalendarDays,
} from "../shared/promoterAssignmentCommercialResolution";
import { createAuditLog } from "./repositories/audit.repository";
import { storagePut } from "./storage";
import type { MySql2Database } from "drizzle-orm/mysql2";

export type DbLike = MySql2Database<Record<string, never>>;

function parseSalaryOmr(salary: string | null | undefined): number | null {
  if (salary == null || String(salary).trim() === "") return null;
  const n = Number(salary);
  return Number.isFinite(n) ? n : null;
}

export async function createPromoterPayrollRunFromStaging(
  db: DbLike,
  params: {
    activeCompanyId: number;
    isPlatformAdmin: boolean;
    periodStartYmd: string;
    periodEndYmd: string;
    createdByUserId: number;
    warningAck?: ExecutionAcknowledgment | null;
  },
) {
  const rows = await getPayrollStagingRows(db, {
    activeCompanyId: params.activeCompanyId,
    isPlatformAdmin: params.isPlatformAdmin,
    periodStartYmd: params.periodStartYmd,
    periodEndYmd: params.periodEndYmd,
  });

  const included: typeof rows = [];
  const excluded: { assignmentId: string; reason: string }[] = [];

  for (const r of rows) {
    const gate = canIncludePayrollStagingRow(
      { readiness: r.readiness, blockers: r.blockers, warnings: r.warnings },
      params.warningAck,
    );
    if (!gate.allowed) {
      excluded.push({ assignmentId: r.assignmentId, reason: gate.reason });
      continue;
    }
    included.push(r);
  }

  if (included.length === 0) {
    return { run: null as null, excluded, message: "No eligible payroll staging rows for this period." };
  }

  let totalAccrued = 0;
  const linePayloads: (typeof promoterPayrollRunLines.$inferInsert)[] = [];

  for (const r of included) {
    const [emp] = await db
      .select({ salary: employees.salary })
      .from(employees)
      .where(eq(employees.id, r.employeeId))
      .limit(1);
    const comm = resolvePromoterAssignmentCommercial(
      {
        assignmentStatus: r.assignmentStatus as "active",
        billingModel: null,
        billingRate: null,
        currencyCode: "OMR",
        rateSource: null,
        employeeSalary: emp?.salary != null ? String(emp.salary) : null,
      },
      { intent: "payroll" },
    );
    const monthly = parseSalaryOmr(comm.payrollBasisAmount);
    const pd = countPeriodCalendarDays(params.periodStartYmd, params.periodEndYmd);
    const accrued =
      monthly != null
        ? computePromoterPayrollAccrualOmr({
            monthlySalaryOmr: monthly,
            periodStartYmd: params.periodStartYmd,
            periodEndYmd: params.periodEndYmd,
            overlapDays: r.overlapDays,
          })
        : 0;
    totalAccrued += accrued;

    linePayloads.push({
      companyId: params.activeCompanyId,
      runId: 0,
      assignmentId: r.assignmentId,
      employeeId: r.employeeId,
      brandCompanyId: r.firstPartyCompanyId,
      clientSiteId: r.clientSiteId,
      readinessSnapshot: r.readiness,
      blockersJson: r.blockers,
      warningsJson: r.warnings,
      payrollNote: r.payrollNote,
      monthlySalaryBasisOmr: monthly != null ? String(monthly) : null,
      periodCalendarDays: pd,
      overlapDays: r.overlapDays,
      accruedPayOmr: String(accrued),
      stagingRowSnapshotJson: { ...r, snapshotAt: new Date().toISOString() },
    });
  }

  const [runInsert] = await db
    .insert(promoterPayrollRuns)
    .values({
      companyId: params.activeCompanyId,
      periodStartYmd: params.periodStartYmd,
      periodEndYmd: params.periodEndYmd,
      status: "draft",
      totalAccruedOmr: String(Math.round(totalAccrued * 1000) / 1000),
      lineCount: linePayloads.length,
      stagingSnapshotJson: {
        periodStartYmd: params.periodStartYmd,
        periodEndYmd: params.periodEndYmd,
        rowCount: included.length,
      },
      warningAckJson: params.warningAck ? { ...params.warningAck } : null,
      createdByUserId: params.createdByUserId,
    })
    .$returningId();

  const runId = Number((runInsert as { insertId?: number }).insertId ?? (runInsert as { id?: number }).id ?? 0);
  if (!runId) throw new Error("promoter payroll run insert failed");

  for (const line of linePayloads) {
    line.runId = runId;
  }
  await db.insert(promoterPayrollRunLines).values(linePayloads);

  await createAuditLog({
    userId: params.createdByUserId,
    companyId: params.activeCompanyId,
    action: "payroll_run_created",
    entityType: "promoter_payroll_run",
    entityId: runId,
    newValues: {
      periodStartYmd: params.periodStartYmd,
      periodEndYmd: params.periodEndYmd,
      lineCount: linePayloads.length,
      totalAccruedOmr: totalAccrued,
    },
  });

  const [run] = await db.select().from(promoterPayrollRuns).where(eq(promoterPayrollRuns.id, runId)).limit(1);
  return { run, excluded };
}

export async function listPromoterPayrollRuns(
  db: DbLike,
  params: { companyId: number },
  limit = 50,
) {
  return db
    .select()
    .from(promoterPayrollRuns)
    .where(eq(promoterPayrollRuns.companyId, params.companyId))
    .orderBy(desc(promoterPayrollRuns.createdAt))
    .limit(limit);
}

export async function getPromoterPayrollRunDetail(db: DbLike, params: { companyId: number; runId: number }) {
  const [run] = await db
    .select()
    .from(promoterPayrollRuns)
    .where(and(eq(promoterPayrollRuns.id, params.runId), eq(promoterPayrollRuns.companyId, params.companyId)))
    .limit(1);
  if (!run) return null;
  const lines = await db
    .select()
    .from(promoterPayrollRunLines)
    .where(and(eq(promoterPayrollRunLines.runId, params.runId), eq(promoterPayrollRunLines.companyId, params.companyId)));
  return { run, lines };
}

export async function updatePromoterPayrollRunStatus(
  db: DbLike,
  params: {
    companyId: number;
    runId: number;
    status: (typeof promoterPayrollRuns.$inferInsert)["status"];
    userId: number;
    extra?: Partial<typeof promoterPayrollRuns.$inferInsert>;
  },
) {
  await db
    .update(promoterPayrollRuns)
    .set({
      status: params.status,
      ...params.extra,
      updatedAt: new Date(),
    })
    .where(and(eq(promoterPayrollRuns.id, params.runId), eq(promoterPayrollRuns.companyId, params.companyId)));

  const action =
    params.status === "approved"
      ? "payroll_run_approved"
      : params.status === "exported"
        ? "payroll_run_exported"
        : params.status === "paid"
          ? "payroll_run_marked_paid"
          : "payroll_run_status_changed";
  await createAuditLog({
    userId: params.userId,
    companyId: params.companyId,
    action,
    entityType: "promoter_payroll_run",
    entityId: params.runId,
    newValues: { status: params.status },
  });
}

export async function exportPromoterPayrollRunCsv(
  db: DbLike,
  params: { companyId: number; runId: number; userId: number },
): Promise<{ csvText: string; url?: string; key?: string }> {
  const detail = await getPromoterPayrollRunDetail(db, params);
  if (!detail) throw new Error("Run not found");
  if (detail.run.status !== "approved" && detail.run.status !== "exported" && detail.run.status !== "paid") {
    throw new Error("Approve the payroll run before export.");
  }
  const headers = [
    "assignment_id",
    "employee_id",
    "brand_company_id",
    "accrued_pay_omr",
    "readiness",
    "overlap_days",
  ];
  const lines = [headers.join(",")];
  for (const l of detail.lines) {
    lines.push(
      [
        l.assignmentId,
        l.employeeId,
        l.brandCompanyId,
        l.accruedPayOmr,
        l.readinessSnapshot,
        l.overlapDays,
      ].join(","),
    );
  }
  const csvText = lines.join("\n");
  let url: string | undefined;
  let key: string | undefined;
  try {
    const up = await storagePut(
      `promoter-payroll/${params.companyId}/${params.runId}/export.csv`,
      csvText,
      "text/csv",
    );
    url = up.url;
    key = up.key;
    await db
      .update(promoterPayrollRuns)
      .set({
        exportCsvKey: key,
        exportCsvUrl: url,
        exportedAt: new Date(),
        exportedByUserId: params.userId,
        status: "exported",
        updatedAt: new Date(),
      })
      .where(and(eq(promoterPayrollRuns.id, params.runId), eq(promoterPayrollRuns.companyId, params.companyId)));
    await createAuditLog({
      userId: params.userId,
      companyId: params.companyId,
      action: "payroll_run_exported",
      entityType: "promoter_payroll_run",
      entityId: params.runId,
      newValues: { key },
    });
  } catch {
    /* storage optional — still return CSV body */
  }
  return { csvText, url, key };
}

export async function createPromoterInvoicesFromStaging(
  db: DbLike,
  params: {
    activeCompanyId: number;
    isPlatformAdmin: boolean;
    periodStartYmd: string;
    periodEndYmd: string;
    monthlyBillingMode: "flat_if_any_overlap" | "prorated_by_calendar_days";
    createdByUserId: number;
    warningAck?: ExecutionAcknowledgment | null;
  },
) {
  const rows = await getBillingStagingRows(db, {
    activeCompanyId: params.activeCompanyId,
    isPlatformAdmin: params.isPlatformAdmin,
    periodStartYmd: params.periodStartYmd,
    periodEndYmd: params.periodEndYmd,
    monthlyBillingMode: params.monthlyBillingMode,
  });

  const byClient = new Map<number, typeof rows>();
  for (const r of rows) {
    const gate = canIncludeBillingStagingRow(
      { readiness: r.readiness, blockers: r.blockers, warnings: r.warnings },
      params.warningAck,
    );
    if (!gate.allowed) continue;
    const cid = r.firstPartyCompanyId;
    const arr = byClient.get(cid) ?? [];
    arr.push(r);
    byClient.set(cid, arr);
  }

  const created: { id: number; invoiceNumber: string; clientCompanyId: number }[] = [];
  for (const [clientCompanyId, clientRows] of byClient) {
    if (clientRows.length === 0) continue;
    let subtotal = 0;
    for (const r of clientRows) {
      subtotal += r.billableAmount ?? 0;
    }
    const invNum = `INV-${params.activeCompanyId}-${clientCompanyId}-${params.periodStartYmd}-${params.periodEndYmd}`;
    const [ins] = await db
      .insert(promoterInvoices)
      .values({
        companyId: params.activeCompanyId,
        invoiceNumber: invNum,
        clientCompanyId,
        periodStartYmd: params.periodStartYmd,
        periodEndYmd: params.periodEndYmd,
        currencyCode: clientRows[0]?.currencyCode ?? "OMR",
        subtotalOmr: String(Math.round(subtotal * 1000) / 1000),
        totalOmr: String(Math.round(subtotal * 1000) / 1000),
        status: "draft",
        monthlyBillingMode: params.monthlyBillingMode,
        warningAckJson: params.warningAck ? { ...params.warningAck } : null,
        createdByUserId: params.createdByUserId,
      })
      .$returningId();
    const invoiceId = Number((ins as { insertId?: number }).insertId ?? 0);
    if (!invoiceId) continue;

    for (const r of clientRows) {
      await db.insert(promoterInvoiceLines).values({
        companyId: params.activeCompanyId,
        invoiceId,
        assignmentId: r.assignmentId,
        employeeId: r.employeeId,
        brandCompanyId: r.firstPartyCompanyId,
        clientSiteId: r.clientSiteId,
        billingModel: r.billingModel,
        billableUnits: r.billableUnits != null ? String(r.billableUnits) : null,
        unitRateOmr: r.billingRate != null ? String(r.billingRate) : null,
        lineTotalOmr: String(r.billableAmount ?? 0),
        monthlyBillingMode: r.monthlyBillingMode,
        monthlyProrationSensitive: r.monthlyProrationSensitive,
        monthlyEstimateOnly: r.monthlyEstimateOnly,
        readinessSnapshot: r.readiness,
        blockersJson: r.blockers,
        warningsJson: r.warnings,
        stagingRowSnapshotJson: { ...r, snapshotAt: new Date().toISOString() },
      });
    }
    created.push({ id: invoiceId, invoiceNumber: invNum, clientCompanyId });
    await createAuditLog({
      userId: params.createdByUserId,
      companyId: params.activeCompanyId,
      action: "invoice_created",
      entityType: "promoter_invoice",
      entityId: invoiceId,
      newValues: { invoiceNumber: invNum, clientCompanyId, lineCount: clientRows.length },
    });
  }
  return { created };
}

export async function issuePromoterInvoice(
  db: DbLike,
  params: { companyId: number; invoiceId: number; userId: number },
) {
  const [inv] = await db
    .select()
    .from(promoterInvoices)
    .where(and(eq(promoterInvoices.id, params.invoiceId), eq(promoterInvoices.companyId, params.companyId)))
    .limit(1);
  if (!inv) throw new Error("Invoice not found");
  if (inv.status !== "draft" && inv.status !== "review_ready") throw new Error("Invoice cannot be issued from this status");

  const lines = await db
    .select()
    .from(promoterInvoiceLines)
    .where(and(eq(promoterInvoiceLines.invoiceId, params.invoiceId), eq(promoterInvoiceLines.companyId, params.companyId)));

  const [client] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, inv.clientCompanyId))
    .limit(1);

  const html = buildInvoiceHtml({
    invoiceNumber: inv.invoiceNumber,
    clientName: client?.name ?? `Company ${inv.clientCompanyId}`,
    periodStart: inv.periodStartYmd,
    periodEnd: inv.periodEndYmd,
    totalOmr: inv.totalOmr,
    lines: lines.map((l) => ({
      assignmentId: l.assignmentId,
      description: `Assignment ${l.assignmentId} — employee ${l.employeeId}`,
      amount: l.lineTotalOmr,
    })),
  });

  let htmlUrl: string | undefined;
  let htmlKey: string | undefined;
  try {
    const up = await storagePut(
      `promoter-invoices/${params.companyId}/${params.invoiceId}/invoice.html`,
      html,
      "text/html",
    );
    htmlUrl = up.url;
    htmlKey = up.key;
  } catch {
    /* optional */
  }

  await db
    .update(promoterInvoices)
    .set({
      status: "issued",
      issuedAt: new Date(),
      issuedByUserId: params.userId,
      htmlArtifactKey: htmlKey ?? null,
      htmlArtifactUrl: htmlUrl ?? null,
      updatedAt: new Date(),
    })
    .where(eq(promoterInvoices.id, params.invoiceId));

  await createAuditLog({
    userId: params.userId,
    companyId: params.companyId,
    action: "invoice_issued",
    entityType: "promoter_invoice",
    entityId: params.invoiceId,
    newValues: { invoiceNumber: inv.invoiceNumber },
  });

  return { html, htmlUrl };
}

function buildInvoiceHtml(p: {
  invoiceNumber: string;
  clientName: string;
  periodStart: string;
  periodEnd: string;
  totalOmr: string;
  lines: { assignmentId: string; description: string; amount: string }[];
}) {
  const rows = p.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.description)}</td><td style="text-align:right">${escapeHtml(String(l.amount))} OMR</td></tr>`,
    )
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice ${escapeHtml(p.invoiceNumber)}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px}</style></head><body>
<h1>Tax invoice</h1><p><strong>No.</strong> ${escapeHtml(p.invoiceNumber)}</p>
<p><strong>Bill to:</strong> ${escapeHtml(p.clientName)}</p>
<p><strong>Period:</strong> ${escapeHtml(p.periodStart)} — ${escapeHtml(p.periodEnd)}</p>
<table><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
<p><strong>Total:</strong> ${escapeHtml(p.totalOmr)} OMR</p>
<p style="font-size:12px;color:#666">Generated by SmartPRO — assignment-centered billing snapshot.</p>
</body></html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function listPromoterInvoices(db: DbLike, params: { companyId: number }, limit = 50) {
  return db
    .select()
    .from(promoterInvoices)
    .where(eq(promoterInvoices.companyId, params.companyId))
    .orderBy(desc(promoterInvoices.createdAt))
    .limit(limit);
}

export async function getProfitabilitySummary(
  db: DbLike,
  params: {
    activeCompanyId: number;
    isPlatformAdmin: boolean;
    periodStartYmd: string;
    periodEndYmd: string;
    mode: "forecast" | "executed";
  },
) {
  const forecastPay = await getPayrollStagingRows(db, {
    activeCompanyId: params.activeCompanyId,
    isPlatformAdmin: params.isPlatformAdmin,
    periodStartYmd: params.periodStartYmd,
    periodEndYmd: params.periodEndYmd,
  });
  const forecastBill = await getBillingStagingRows(db, {
    activeCompanyId: params.activeCompanyId,
    isPlatformAdmin: params.isPlatformAdmin,
    periodStartYmd: params.periodStartYmd,
    periodEndYmd: params.periodEndYmd,
    monthlyBillingMode: "flat_if_any_overlap",
  });

  let forecastRevenue = 0;
  let forecastCost = 0;
  for (const b of forecastBill) {
    if (b.readiness !== "blocked") forecastRevenue += b.billableAmount ?? 0;
  }
  for (const p of forecastPay) {
    if (p.readiness === "blocked") continue;
    const [emp] = await db
      .select({ salary: employees.salary })
      .from(employees)
      .where(eq(employees.id, p.employeeId))
      .limit(1);
    const comm = resolvePromoterAssignmentCommercial(
      {
        assignmentStatus: p.assignmentStatus as "active",
        billingModel: null,
        billingRate: null,
        currencyCode: "OMR",
        rateSource: null,
        employeeSalary: emp?.salary != null ? String(emp.salary) : null,
      },
      { intent: "payroll" },
    );
    const monthly = parseSalaryOmr(comm.payrollBasisAmount);
    if (monthly != null) {
      forecastCost += computePromoterPayrollAccrualOmr({
        monthlySalaryOmr: monthly,
        periodStartYmd: params.periodStartYmd,
        periodEndYmd: params.periodEndYmd,
        overlapDays: p.overlapDays,
      });
    }
  }

  let executedRevenue = 0;
  let executedCost = 0;
  const invRows = await db
    .select()
    .from(promoterInvoices)
    .where(
      and(
        eq(promoterInvoices.companyId, params.activeCompanyId),
        lte(promoterInvoices.periodStartYmd, params.periodEndYmd),
        gte(promoterInvoices.periodEndYmd, params.periodStartYmd),
      ),
    );
  for (const inv of invRows) {
    if (!["issued", "sent", "partially_paid", "paid"].includes(inv.status)) continue;
    executedRevenue += Number(inv.totalOmr);
  }

  const runRows = await db
    .select()
    .from(promoterPayrollRuns)
    .where(
      and(
        eq(promoterPayrollRuns.companyId, params.activeCompanyId),
        lte(promoterPayrollRuns.periodStartYmd, params.periodEndYmd),
        gte(promoterPayrollRuns.periodEndYmd, params.periodStartYmd),
      ),
    );
  const runIds = runRows.filter((r) => ["approved", "exported", "paid"].includes(r.status)).map((r) => r.id);
  if (runIds.length) {
    const costAgg = await db
      .select({ s: sql<string>`coalesce(sum(${promoterPayrollRunLines.accruedPayOmr}),0)` })
      .from(promoterPayrollRunLines)
      .where(
        and(
          eq(promoterPayrollRunLines.companyId, params.activeCompanyId),
          inArray(promoterPayrollRunLines.runId, runIds),
        ),
      );
    executedCost = Number(costAgg[0]?.s ?? 0);
  }

  const view =
    params.mode === "forecast"
      ? classifyProfitabilityView({ hasForecastComponents: true, hasExecutedComponents: false })
      : classifyProfitabilityView({ hasForecastComponents: false, hasExecutedComponents: true });

  const margin =
    params.mode === "forecast"
      ? forecastRevenue - forecastCost
      : executedRevenue - executedCost;
  const denom = params.mode === "forecast" ? forecastRevenue : executedRevenue;
  const marginPct = denom > 0 ? (margin / denom) * 100 : null;

  return {
    view: params.mode === "forecast" ? ("forecast" as const) : ("executed" as const),
    revenue: params.mode === "forecast" ? forecastRevenue : executedRevenue,
    payrollCost: params.mode === "forecast" ? forecastCost : executedCost,
    grossMargin: margin,
    grossMarginPercent: marginPct,
    meta: {
      forecastRevenue,
      forecastCost,
      executedRevenue,
      executedCost,
      profitabilityViewLabel: view,
    },
  };
}
