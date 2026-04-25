/**
 * Phase 12E — Attendance invoice issuance and HTML artifact generation.
 *
 * Exports:
 *  - buildAttendanceInvoiceHtml  pure function — no I/O, safe to unit-test
 *  - issueAttendanceInvoice      issues the invoice and stores the HTML artifact
 */

import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { attendanceInvoices } from "../../drizzle/schema";
import { storagePut } from "../storage";
import {
  assertAttendanceInvoiceTransition,
  canIssueAttendanceInvoice,
  type AttendanceInvoiceStatus,
} from "../../shared/attendanceInvoiceStateMachine";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type CompanyInfo = {
  name: string;
  taxNumber?: string | null;
  crNumber?: string | null;
  address?: string | null;
};

type BillingLine = {
  itemId?: number;
  employeeId: number;
  employeeDisplayName?: string | null;
  attendanceDate: string;
  durationMinutes?: number | null;
  [k: string]: unknown;
};

// ─── HTML builder ──────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(ymd: string): string {
  // "2026-04-01" → "01 Apr 2026"
  try {
    return new Date(ymd + "T00:00:00Z").toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return ymd;
  }
}

export function buildAttendanceInvoiceHtml(
  invoice: {
    invoiceNumber: string;
    issuedAt: Date;
    dueDateYmd?: string | null;
    clientDisplayName: string;
    periodStart: string;
    periodEnd: string;
    billingLinesJson: BillingLine[];
    subtotalOmr: string;
    vatRatePct: string;
    vatOmr: string;
    totalOmr: string;
    notes?: string | null;
  },
  company: CompanyInfo,
): string {
  const issuedDateStr = invoice.issuedAt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const dueDateStr = invoice.dueDateYmd ? fmtDate(invoice.dueDateYmd) : "On receipt";

  // Supplier block
  const supplierLines: string[] = [`<strong>${esc(company.name)}</strong>`];
  if (company.address) supplierLines.push(esc(company.address));
  if (company.taxNumber) supplierLines.push(`Tax No.: ${esc(company.taxNumber)}`);
  if (company.crNumber) supplierLines.push(`CR No.: ${esc(company.crNumber)}`);

  // Billing line rows
  const lineRows = invoice.billingLinesJson
    .map((l) => {
      const name = l.employeeDisplayName ? esc(l.employeeDisplayName) : `Employee #${l.employeeId}`;
      const mins = l.durationMinutes != null ? `${l.durationMinutes} min` : "—";
      return `<tr>
        <td>${esc(l.attendanceDate)}</td>
        <td>${name}</td>
        <td style="text-align:right">${mins}</td>
      </tr>`;
    })
    .join("");

  const notesHtml = invoice.notes
    ? `<div style="margin-top:16px;font-size:13px;color:#555"><strong>Notes:</strong><br>${esc(invoice.notes)}</div>`
    : "";

  const vatPct = parseFloat(invoice.vatRatePct);
  const vatLabel = isNaN(vatPct) ? invoice.vatRatePct : vatPct.toFixed(2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Tax Invoice ${esc(invoice.invoiceNumber)}</title>
<style>
  body { font-family: system-ui, Arial, sans-serif; padding: 32px; color: #111; font-size: 14px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 24px; }
  .block { margin-bottom: 16px; }
  .label { color: #666; font-size: 12px; margin-bottom: 2px; }
  table { border-collapse: collapse; width: 100%; margin-top: 12px; }
  th, td { border: 1px solid #ddd; padding: 8px 10px; }
  th { background: #f5f5f5; text-align: left; }
  .totals { margin-top: 16px; float: right; min-width: 280px; }
  .totals td { border: none; padding: 4px 8px; }
  .totals .grand { font-weight: bold; border-top: 2px solid #111; }
  .footer { margin-top: 40px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 8px; }
</style>
</head>
<body>

<div class="meta">
  <div>
    <h1>Tax Invoice</h1>
    <div class="label">Invoice No.</div>
    <div style="font-weight:bold;font-family:monospace">${esc(invoice.invoiceNumber)}</div>
  </div>
  <div style="text-align:right">
    <div class="label">Issue date</div>
    <div>${issuedDateStr}</div>
    <div class="label" style="margin-top:8px">Due date</div>
    <div>${dueDateStr}</div>
  </div>
</div>

<div style="display:flex;gap:40px;margin-bottom:24px">
  <div class="block">
    <div class="label">From (Supplier)</div>
    <div>${supplierLines.join("<br/>")}</div>
  </div>
  <div class="block">
    <div class="label">Bill to (Client)</div>
    <div><strong>${esc(invoice.clientDisplayName)}</strong></div>
  </div>
</div>

<div class="block">
  <div class="label">Billing period</div>
  <div>${fmtDate(invoice.periodStart)} — ${fmtDate(invoice.periodEnd)}</div>
</div>

<table>
  <thead>
    <tr>
      <th>Date</th>
      <th>Employee</th>
      <th style="text-align:right">Duration</th>
    </tr>
  </thead>
  <tbody>
    ${lineRows || '<tr><td colspan="3" style="color:#999;text-align:center">No billing lines</td></tr>'}
  </tbody>
</table>

<div style="overflow:hidden">
  <table class="totals">
    <tbody>
      <tr>
        <td>Subtotal</td>
        <td style="text-align:right">${esc(invoice.subtotalOmr)} OMR</td>
      </tr>
      <tr>
        <td>VAT (${esc(vatLabel)}%)</td>
        <td style="text-align:right">${esc(invoice.vatOmr)} OMR</td>
      </tr>
      <tr class="grand">
        <td>Total</td>
        <td style="text-align:right">${esc(invoice.totalOmr)} OMR</td>
      </tr>
    </tbody>
  </table>
</div>

${notesHtml}

<div class="footer">Generated by SmartPRO &mdash; attendance-centered billing artifact.</div>
</body>
</html>`;
}

// ─── issueAttendanceInvoice ────────────────────────────────────────────────────

type DbClient = Awaited<ReturnType<typeof import("../db.client").requireDb>>;

export async function issueAttendanceInvoice(
  db: DbClient,
  input: {
    companyId: number;
    invoiceId: number;
    userId: number;
    companyInfo: CompanyInfo;
  },
): Promise<{ skipped: boolean; invoice: typeof attendanceInvoices.$inferSelect; artifactUrl?: string }> {
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

  // 2. Idempotency: already-issued/sent → skip
  if (status === "issued" || status === "sent") {
    return { skipped: true, invoice, artifactUrl: invoice.htmlArtifactUrl ?? undefined };
  }

  // 3. Terminal-state guards
  if (status === "paid") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot issue a paid invoice.",
    });
  }
  if (status === "cancelled") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot issue a cancelled invoice.",
    });
  }

  // 4. State machine guard (covers draft → issued, review_ready → issued)
  if (!canIssueAttendanceInvoice(status)) {
    // This branch is a safety net; assertAttendanceInvoiceTransition below will also throw.
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot issue invoice from status '${status}'.`,
    });
  }
  assertAttendanceInvoiceTransition(status, "issued");

  // 5. Build HTML artifact
  const issuedAt = new Date();
  const lines = Array.isArray(invoice.billingLinesJson)
    ? (invoice.billingLinesJson as BillingLine[])
    : [];

  const html = buildAttendanceInvoiceHtml(
    {
      invoiceNumber: invoice.invoiceNumber,
      issuedAt,
      dueDateYmd: invoice.dueDateYmd,
      clientDisplayName: invoice.clientDisplayName,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      billingLinesJson: lines,
      subtotalOmr: invoice.subtotalOmr,
      vatRatePct: invoice.vatRatePct,
      vatOmr: invoice.vatOmr,
      totalOmr: invoice.totalOmr,
      notes: invoice.notes,
    },
    input.companyInfo,
  );

  // 6. Store artifact (best-effort — if storage fails we still issue)
  let artifactKey: string | null = null;
  let artifactUrl: string | null = null;
  try {
    const up = await storagePut(
      `attendance-invoices/${input.companyId}/${input.invoiceId}/issued.html`,
      html,
      "text/html",
    );
    artifactKey = up.key;
    artifactUrl = up.url;
  } catch (err) {
    console.error(
      `[billing] artifact upload failed for invoice ${input.invoiceId}:`,
      err instanceof Error ? err.message : err,
    );
  }

  // 7. Persist
  await db
    .update(attendanceInvoices)
    .set({
      status: "issued",
      issuedAt,
      issuedByUserId: input.userId,
      htmlArtifactKey: artifactKey,
      htmlArtifactUrl: artifactUrl,
      updatedAt: issuedAt,
    })
    .where(eq(attendanceInvoices.id, input.invoiceId));

  console.log(
    `[billing] invoice ${invoice.invoiceNumber} (id=${input.invoiceId}) issued` +
      ` userId=${input.userId} companyId=${input.companyId} artifact=${artifactKey ?? "none"}`,
  );

  const updated: typeof attendanceInvoices.$inferSelect = {
    ...invoice,
    status: "issued",
    issuedAt,
    issuedByUserId: input.userId,
    htmlArtifactKey: artifactKey,
    htmlArtifactUrl: artifactUrl,
    updatedAt: issuedAt,
  };

  return { skipped: false, invoice: updated, artifactUrl: artifactUrl ?? undefined };
}
