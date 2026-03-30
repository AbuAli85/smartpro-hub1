import { z } from "zod";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  payrollRuns,
  payrollLineItems,
  employees,
  employeeSalaryConfigs,
  salaryLoans,
} from "../../drizzle/schema";
import { storagePut } from "../storage";
import { getActiveCompanyMembership, requireNotAuditor } from "../_core/membership";

/** PASI contribution: 7% employee, 11.5% employer for Omani nationals */
function calcPasi(basicSalary: number, isOmani: boolean) {
  if (!isOmani) return 0;
  return Math.round(basicSalary * 0.07 * 1000) / 1000;
}

/** Build HTML payslip content */
function buildPayslipHtml(params: {
  companyName: string;
  employeeName: string;
  employeeId: number;
  month: number;
  year: number;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  overtimePay: number;
  grossSalary: number;
  pasiDeduction: number;
  incomeTax: number;
  loanDeduction: number;
  absenceDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  bankAccount?: string | null;
  bankName?: string | null;
}) {
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const fmt = (n: number) => `OMR ${n.toFixed(3)}`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #222; margin: 0; padding: 20px; }
  .header { background: #1a1a2e; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { margin: 0; font-size: 18px; }
  .header p { margin: 4px 0 0; font-size: 11px; opacity: 0.7; }
  .badge { background: #e53e3e; color: white; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: bold; }
  .section { margin: 16px 0; }
  .section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin: 0 0 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 8px; }
  td:last-child { text-align: right; font-weight: 500; }
  .total-row td { font-weight: bold; border-top: 2px solid #222; font-size: 13px; }
  .net-box { background: #f0fff4; border: 2px solid #38a169; border-radius: 8px; padding: 12px 16px; text-align: center; margin: 16px 0; }
  .net-box .label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
  .net-box .amount { font-size: 24px; font-weight: bold; color: #276749; margin: 4px 0; }
  .footer { font-size: 10px; color: #999; text-align: center; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>${params.companyName}</h1>
    <p>Payslip for ${monthNames[params.month - 1]} ${params.year}</p>
  </div>
  <span class="badge">PAYSLIP</span>
</div>
<div style="padding: 16px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px;">
  <div class="section">
    <h3>Employee Information</h3>
    <table>
      <tr><td>Employee Name</td><td>${params.employeeName}</td></tr>
      <tr><td>Employee ID</td><td>#${params.employeeId}</td></tr>
      <tr><td>Pay Period</td><td>${monthNames[params.month - 1]} ${params.year}</td></tr>
      ${params.bankName ? `<tr><td>Bank</td><td>${params.bankName}</td></tr>` : ""}
      ${params.bankAccount ? `<tr><td>Account</td><td>****${params.bankAccount.slice(-4)}</td></tr>` : ""}
    </table>
  </div>
  <div class="section">
    <h3>Earnings</h3>
    <table>
      <tr><td>Basic Salary</td><td>${fmt(params.basicSalary)}</td></tr>
      ${params.housingAllowance > 0 ? `<tr><td>Housing Allowance</td><td>${fmt(params.housingAllowance)}</td></tr>` : ""}
      ${params.transportAllowance > 0 ? `<tr><td>Transport Allowance</td><td>${fmt(params.transportAllowance)}</td></tr>` : ""}
      ${params.otherAllowances > 0 ? `<tr><td>Other Allowances</td><td>${fmt(params.otherAllowances)}</td></tr>` : ""}
      ${params.overtimePay > 0 ? `<tr><td>Overtime Pay</td><td>${fmt(params.overtimePay)}</td></tr>` : ""}
      <tr class="total-row"><td>Gross Salary</td><td>${fmt(params.grossSalary)}</td></tr>
    </table>
  </div>
  <div class="section">
    <h3>Deductions</h3>
    <table>
      ${params.pasiDeduction > 0 ? `<tr><td>PASI Contribution (7%)</td><td>- ${fmt(params.pasiDeduction)}</td></tr>` : ""}
      ${params.incomeTax > 0 ? `<tr><td>Income Tax</td><td>- ${fmt(params.incomeTax)}</td></tr>` : ""}
      ${params.loanDeduction > 0 ? `<tr><td>Loan Deduction</td><td>- ${fmt(params.loanDeduction)}</td></tr>` : ""}
      ${params.absenceDeduction > 0 ? `<tr><td>Absence Deduction</td><td>- ${fmt(params.absenceDeduction)}</td></tr>` : ""}
      ${params.otherDeductions > 0 ? `<tr><td>Other Deductions</td><td>- ${fmt(params.otherDeductions)}</td></tr>` : ""}
      <tr class="total-row"><td>Total Deductions</td><td>- ${fmt(params.totalDeductions)}</td></tr>
    </table>
  </div>
  <div class="net-box">
    <div class="label">Net Salary</div>
    <div class="amount">${fmt(params.netSalary)}</div>
  </div>
  <div class="footer">
    This is a computer-generated payslip and does not require a signature.<br/>
    Generated by SmartPRO Business Hub on ${new Date().toLocaleDateString()}
  </div>
</div>
</body>
</html>`;
}

/** Build WPS CSV content (Oman MoL format) */
function buildWpsCsv(lines: Array<{
  employeeName: string;
  employeeId: number;
  ibanNumber?: string | null;
  bankName?: string | null;
  netSalary: number;
  month: number;
  year: number;
}>) {
  const header = "Seq,Employee_ID,Employee_Name,Bank_Name,IBAN,Net_Salary_OMR,Month,Year";
  const rows = lines.map((l, i) =>
    [i + 1, l.employeeId, `"${l.employeeName}"`, l.bankName ?? "", l.ibanNumber ?? "", l.netSalary.toFixed(3), l.month, l.year].join(",")
  );
  return [header, ...rows].join("\n");
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const payrollRouter = router({
  /** List all payroll runs for the company */
  listRuns: protectedProcedure
    .input(z.object({ year: z.number().optional(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const m = await getActiveCompanyMembership(ctx.user.id);
      if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not a company member" });
      const conditions = [eq(payrollRuns.companyId, m.companyId)];
      if (input.year) conditions.push(eq(payrollRuns.periodYear, input.year));
      if (input.status) conditions.push(eq(payrollRuns.status, input.status as any));
      const runs = await db
        .select()
        .from(payrollRuns)
        .where(and(...conditions))
        .orderBy(desc(payrollRuns.periodYear), desc(payrollRuns.periodMonth));
      return runs;
    }),

  /** Get a single run with all line items */
  getRun: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const m = await getActiveCompanyMembership(ctx.user.id);
      if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not a company member" });
      const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, input.runId), eq(payrollRuns.companyId, m.companyId))).limit(1);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll run not found" });
      const lines = await db
        .select({
          line: payrollLineItems,
          emp: { firstName: employees.firstName, lastName: employees.lastName, nationality: employees.nationality },
        })
        .from(payrollLineItems)
        .leftJoin(employees, eq(payrollLineItems.employeeId, employees.id))
        .where(and(eq(payrollLineItems.payrollRunId, input.runId), eq(payrollLineItems.companyId, m.companyId)));
      return { run, lines };
    }),

  /** Create a new payroll run (draft) — auto-populates from employee records */
  createRun: protectedProcedure
    .input(z.object({
      month: z.number().min(1).max(12),
      year: z.number().min(2020).max(2040),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const m = await getActiveCompanyMembership(ctx.user.id);
      if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not a company member" });
      requireNotAuditor(m.role, "External Auditors cannot create payroll runs.");
      // Check for duplicate run
      const [existing] = await db.select({ id: payrollRuns.id }).from(payrollRuns)
        .where(and(eq(payrollRuns.companyId, m.companyId), eq(payrollRuns.periodMonth, input.month), eq(payrollRuns.periodYear, input.year)))
        .limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: `A payroll run for ${input.month}/${input.year} already exists` });
      // Get all active employees with salary
      const empList = await db.select().from(employees)
        .where(and(eq(employees.companyId, m.companyId), eq(employees.status, "active")));
      if (!empList.length) throw new TRPCError({ code: "BAD_REQUEST", message: "No active employees found" });
      // Create the run
      const [runResult] = await db.insert(payrollRuns).values({
        companyId: m.companyId,
        periodMonth: input.month,
        periodYear: input.year,
        status: "draft",
        employeeCount: empList.length,
        notes: input.notes,
      });
      const runId = (runResult as any).insertId as number;
      // Auto-populate line items
      let totalGross = 0, totalDeductions = 0, totalNet = 0;
      for (const emp of empList) {
        const basic = Number(emp.salary ?? 0);
        const housing = Number((emp as any).housingAllowance ?? 0);
        const transport = Number((emp as any).transportAllowance ?? 0);
        const gross = basic + housing + transport;
        const isOmani = emp.nationality?.toLowerCase() === "omani" || emp.nationality?.toLowerCase() === "oman";
        const pasi = calcPasi(basic, isOmani);
        const totalDed = pasi;
        const net = gross - totalDed;
        totalGross += gross;
        totalDeductions += totalDed;
        totalNet += net;
        await db.insert(payrollLineItems).values({
          payrollRunId: runId,
          companyId: m.companyId,
          employeeId: emp.id,
          basicSalary: String(basic),
          housingAllowance: String(housing),
          transportAllowance: String(transport),
          grossSalary: String(gross),
          pasiDeduction: String(pasi),
          totalDeductions: String(totalDed),
          netSalary: String(net),
        });
      }
      // Update run totals
      await db.update(payrollRuns).set({
        totalGross: String(Math.round(totalGross * 1000) / 1000),
        totalDeductions: String(Math.round(totalDeductions * 1000) / 1000),
        totalNet: String(Math.round(totalNet * 1000) / 1000),
      }).where(eq(payrollRuns.id, runId));
      return { runId, employeeCount: empList.length, totalNet };
    }),

  /** Update a single line item (manual adjustment) */
  updateLineItem: protectedProcedure
    .input(z.object({
      lineId: z.number(),
      housingAllowance: z.number().optional(),
      transportAllowance: z.number().optional(),
      otherAllowances: z.number().optional(),
      overtimePay: z.number().optional(),
      loanDeduction: z.number().optional(),
      absenceDeduction: z.number().optional(),
      otherDeductions: z.number().optional(),
      bankAccount: z.string().optional(),
      bankName: z.string().optional(),
      ibanNumber: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const m = await getActiveCompanyMembership(ctx.user.id);
      if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not a company member" });
      requireNotAuditor(m.role, "External Auditors cannot modify payroll line items.");
      const [line] = await db.select().from(payrollLineItems).where(and(eq(payrollLineItems.id, input.lineId), eq(payrollLineItems.companyId, m.companyId))).limit(1);
      if (!line) throw new TRPCError({ code: "NOT_FOUND", message: "Line item not found" });
      // Recalculate
      const basic = Number(line.basicSalary);
      const housing = input.housingAllowance ?? Number(line.housingAllowance ?? 0);
      const transport = input.transportAllowance ?? Number(line.transportAllowance ?? 0);
      const other = input.otherAllowances ?? Number(line.otherAllowances ?? 0);
      const overtime = input.overtimePay ?? Number(line.overtimePay ?? 0);
      const gross = basic + housing + transport + other + overtime;
      const pasi = Number(line.pasiDeduction ?? 0);
      const loan = input.loanDeduction ?? Number(line.loanDeduction ?? 0);
      const absence = input.absenceDeduction ?? Number(line.absenceDeduction ?? 0);
      const otherDed = input.otherDeductions ?? Number(line.otherDeductions ?? 0);
      const totalDed = pasi + loan + absence + otherDed;
      const net = gross - totalDed;
      await db.update(payrollLineItems).set({
        housingAllowance: String(housing),
        transportAllowance: String(transport),
        otherAllowances: String(other),
        overtimePay: String(overtime),
        grossSalary: String(Math.round(gross * 1000) / 1000),
        loanDeduction: String(loan),
        absenceDeduction: String(absence),
        otherDeductions: String(otherDed),
        totalDeductions: String(Math.round(totalDed * 1000) / 1000),
        netSalary: String(Math.round(net * 1000) / 1000),
        bankAccount: input.bankAccount ?? line.bankAccount,
        bankName: input.bankName ?? line.bankName,
        ibanNumber: input.ibanNumber ?? line.ibanNumber,
        notes: input.notes ?? line.notes,
      }).where(eq(payrollLineItems.id, input.lineId));
      return { success: true };
    }),

  /** Approve a payroll run */
  approveRun: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const m = await getActiveCompanyMembership(ctx.user.id);
      if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not a company member" });
      requireNotAuditor(m.role, "External Auditors cannot approve payroll runs.");
      if (m.role !== "company_admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can approve payroll" });
      await db.update(payrollRuns).set({ status: "approved", approvedByUserId: ctx.user.id, approvedAt: new Date() })
        .where(and(eq(payrollRuns.id, input.runId), eq(payrollRuns.companyId, m.companyId)));
      return { success: true };
    }),

  /** Mark payroll run as paid */
  markPaid: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const m = await getActiveCompanyMembership(ctx.user.id);
      if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not a company member" });
      requireNotAuditor(m.role, "External Auditors cannot mark payroll as paid.");
      if (m.role !== "company_admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can mark payroll paid" });
      await db.update(payrollRuns).set({ status: "paid", paidAt: new Date() })
        .where(and(eq(payrollRuns.id, input.runId), eq(payrollRuns.companyId, m.companyId)));
      await db.update(payrollLineItems).set({ status: "paid" }).where(
        and(eq(payrollLineItems.payrollRunId, input.runId), eq(payrollLineItems.companyId, m.companyId)),
      );
      return { success: true };
    }),

  /** Generate payslip HTML and store to S3 for a single line item */
  generatePayslip: protectedProcedure
    .input(z.object({ lineId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const m = await getActiveCompanyMembership(ctx.user.id);
      if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not a company member" });
      const [row] = await db
        .select({
          line: payrollLineItems,
          run: { periodMonth: payrollRuns.periodMonth, periodYear: payrollRuns.periodYear },
          emp: { firstName: employees.firstName, lastName: employees.lastName, nationality: employees.nationality },
        })
        .from(payrollLineItems)
        .leftJoin(payrollRuns, eq(payrollLineItems.payrollRunId, payrollRuns.id))
        .leftJoin(employees, eq(payrollLineItems.employeeId, employees.id))
        .where(and(eq(payrollLineItems.id, input.lineId), eq(payrollLineItems.companyId, m.companyId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Line item not found" });
      const html = buildPayslipHtml({
        companyName: "Company",
        employeeName: `${row.emp?.firstName ?? ""} ${row.emp?.lastName ?? ""}`.trim(),
        employeeId: row.line.employeeId,
        month: row.run?.periodMonth ?? 1,
        year: row.run?.periodYear ?? new Date().getFullYear(),
        basicSalary: Number(row.line.basicSalary),
        housingAllowance: Number(row.line.housingAllowance ?? 0),
        transportAllowance: Number(row.line.transportAllowance ?? 0),
        otherAllowances: Number(row.line.otherAllowances ?? 0),
        overtimePay: Number(row.line.overtimePay ?? 0),
        grossSalary: Number(row.line.grossSalary),
        pasiDeduction: Number(row.line.pasiDeduction ?? 0),
        incomeTax: Number(row.line.incomeTax ?? 0),
        loanDeduction: Number(row.line.loanDeduction ?? 0),
        absenceDeduction: Number(row.line.absenceDeduction ?? 0),
        otherDeductions: Number(row.line.otherDeductions ?? 0),
        totalDeductions: Number(row.line.totalDeductions),
        netSalary: Number(row.line.netSalary),
        bankAccount: row.line.bankAccount,
        bankName: row.line.bankName,
      });
      const key = `payslips/${m.companyId}/${row.run?.periodYear}-${row.run?.periodMonth}/emp-${row.line.employeeId}-${Date.now()}.html`;
      const { url } = await storagePut(key, Buffer.from(html, "utf-8"), "text/html");
      await db
        .update(payrollLineItems)
        .set({ payslipUrl: url, payslipKey: key })
        .where(and(eq(payrollLineItems.id, input.lineId), eq(payrollLineItems.companyId, m.companyId)));
      return { url };
    }),

  /** Generate WPS file for a payroll run and store to S3 */
  generateWpsFile: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const m = await getActiveCompanyMembership(ctx.user.id);
      if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not a company member" });
      const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, input.runId), eq(payrollRuns.companyId, m.companyId))).limit(1);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      if (run.status === "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Approve the payroll run before generating WPS file" });
      const lines = await db
        .select({
          line: payrollLineItems,
          emp: { firstName: employees.firstName, lastName: employees.lastName },
        })
        .from(payrollLineItems)
        .leftJoin(employees, eq(payrollLineItems.employeeId, employees.id))
        .where(and(eq(payrollLineItems.payrollRunId, input.runId), eq(payrollLineItems.companyId, m.companyId)));
      const csv = buildWpsCsv(lines.map(r => ({
        employeeName: `${r.emp?.firstName ?? ""} ${r.emp?.lastName ?? ""}`.trim(),
        employeeId: r.line.employeeId,
        ibanNumber: r.line.ibanNumber,
        bankName: r.line.bankName,
        netSalary: Number(r.line.netSalary),
        month: run.periodMonth,
        year: run.periodYear,
      })));
      const key = `wps/${m.companyId}/${run.periodYear}-${run.periodMonth}-wps-${Date.now()}.csv`;
      const { url } = await storagePut(key, Buffer.from(csv, "utf-8"), "text/csv");
      await db.update(payrollRuns).set({ wpsFileUrl: url, wpsFileKey: key, wpsSubmittedAt: new Date() }).where(eq(payrollRuns.id, input.runId));
      return { url };
    }),

  /** Get payroll summary stats */
  getSummary: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const m = await getActiveCompanyMembership(ctx.user.id);
      if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not a company member" });
      const runs = await db.select().from(payrollRuns).where(eq(payrollRuns.companyId, m.companyId)).orderBy(desc(payrollRuns.periodYear), desc(payrollRuns.periodMonth)).limit(12);
      const totalPaidYTD = runs.filter(r => r.status === "paid").reduce((s, r) => s + Number(r.totalNet ?? 0), 0);
      const pendingApproval = runs.filter(r => r.status === "draft" || r.status === "processing").length;
      const lastRun = runs[0] ?? null;
      return { totalPaidYTD, pendingApproval, lastRun, recentRuns: runs.slice(0, 6) };
    }),

  // ─── SALARY CONFIG ──────────────────────────────────────────────────────────
  /** List salary configs for all employees in the company */
  listSalaryConfigs: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const m = await getActiveCompanyMembership(ctx.user.id);
      if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not a company member" });
      const configs = await db
        .select({
          id: employeeSalaryConfigs.id,
          employeeId: employeeSalaryConfigs.employeeId,
          basicSalary: employeeSalaryConfigs.basicSalary,
          housingAllowance: employeeSalaryConfigs.housingAllowance,
          transportAllowance: employeeSalaryConfigs.transportAllowance,
          otherAllowances: employeeSalaryConfigs.otherAllowances,
          pasiRate: employeeSalaryConfigs.pasiRate,
          incomeTaxRate: employeeSalaryConfigs.incomeTaxRate,
          effectiveFrom: employeeSalaryConfigs.effectiveFrom,
          effectiveTo: employeeSalaryConfigs.effectiveTo,
          notes: employeeSalaryConfigs.notes,
          employeeFirstName: employees.firstName,
          employeeLastName: employees.lastName,
          employeeNationality: employees.nationality,
        })
        .from(employeeSalaryConfigs)
        .leftJoin(employees, eq(employeeSalaryConfigs.employeeId, employees.id))
        .where(eq(employeeSalaryConfigs.companyId, m.companyId))
        .orderBy(employees.firstName);
      return configs;
    }),

  /** Create or update salary config for an employee */
  upsertSalaryConfig: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      basicSalary: z.number().min(0),
      housingAllowance: z.number().min(0).default(0),
      transportAllowance: z.number().min(0).default(0),
      otherAllowances: z.number().min(0).default(0),
      pasiRate: z.number().min(0).max(100).default(11.5),
      incomeTaxRate: z.number().min(0).max(100).default(0),
      effectiveFrom: z.string(),
      effectiveTo: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const m = await getActiveCompanyMembership(ctx.user.id);
      if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not a company member" });
      // verify employee belongs to company
      const [emp] = await db.select({ id: employees.id }).from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, m.companyId)));
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      // close any existing active config
      await db.update(employeeSalaryConfigs)
        .set({ effectiveTo: new Date(input.effectiveFrom) })
        .where(and(
          eq(employeeSalaryConfigs.employeeId, input.employeeId),
          eq(employeeSalaryConfigs.companyId, m.companyId),
          sql`effective_to IS NULL`,
        ));
      const insertData: any = {
        employeeId: input.employeeId,
        companyId: m.companyId,
        basicSalary: String(input.basicSalary),
        housingAllowance: String(input.housingAllowance),
        transportAllowance: String(input.transportAllowance),
        otherAllowances: String(input.otherAllowances),
        pasiRate: String(input.pasiRate),
        incomeTaxRate: String(input.incomeTaxRate),
        effectiveFrom: new Date(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        notes: input.notes ?? null,
      };
      const [newConfig] = await db.insert(employeeSalaryConfigs).values(insertData).$returningId();
      return { id: newConfig.id };
    }),

  // ─── SALARY LOANS ───────────────────────────────────────────────────────────
  /** List salary loans for the company */
  listLoans: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const m = await getActiveCompanyMembership(ctx.user.id);
      if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not a company member" });
      const loans = await db
        .select({
          id: salaryLoans.id,
          employeeId: salaryLoans.employeeId,
          loanAmount: salaryLoans.loanAmount,
          monthlyDeduction: salaryLoans.monthlyDeduction,
          balanceRemaining: salaryLoans.balanceRemaining,
          status: salaryLoans.status,
          startMonth: salaryLoans.startMonth,
          startYear: salaryLoans.startYear,
          reason: salaryLoans.reason,
          createdAt: salaryLoans.createdAt,
          employeeFirstName: employees.firstName,
          employeeLastName: employees.lastName,
        })
        .from(salaryLoans)
        .leftJoin(employees, eq(salaryLoans.employeeId, employees.id))
        .where(eq(salaryLoans.companyId, m.companyId))
        .orderBy(desc(salaryLoans.createdAt));
      return loans;
    }),

  /** Create a new salary loan */
  createLoan: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      loanAmount: z.number().positive(),
      monthlyDeduction: z.number().positive(),
      startMonth: z.number().min(1).max(12),
      startYear: z.number().min(2020),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const m = await getActiveCompanyMembership(ctx.user.id);
      if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not a company member" });
      const [emp] = await db.select({ id: employees.id }).from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, m.companyId)));
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      const [loan] = await db.insert(salaryLoans).values({
        employeeId: input.employeeId,
        companyId: m.companyId,
        loanAmount: String(input.loanAmount),
        monthlyDeduction: String(input.monthlyDeduction),
        balanceRemaining: String(input.loanAmount),
        status: "active",
        startMonth: input.startMonth,
        startYear: input.startYear,
        reason: input.reason ?? null,
        approvedBy: ctx.user.id,
      }).$returningId();
      return { id: loan.id };
    }),

  /** Update loan balance (called after payroll deduction) */
  updateLoanBalance: protectedProcedure
    .input(z.object({
      loanId: z.number(),
      deductedAmount: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const m = await getActiveCompanyMembership(ctx.user.id);
      if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not a company member" });
      const [loan] = await db.select().from(salaryLoans)
        .where(and(eq(salaryLoans.id, input.loanId), eq(salaryLoans.companyId, m.companyId)));
      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
      const newBalance = Math.max(0, Number(loan.balanceRemaining) - input.deductedAmount);
      const newStatus = newBalance <= 0 ? "completed" : "active";
      await db.update(salaryLoans)
        .set({ balanceRemaining: String(newBalance), status: newStatus })
        .where(eq(salaryLoans.id, input.loanId));
      return { newBalance, status: newStatus };
    }),

  /** Cancel a loan */
  cancelLoan: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const m = await getActiveCompanyMembership(ctx.user.id);
      if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not a company member" });
      await db.update(salaryLoans)
        .set({ status: "cancelled" })
        .where(and(eq(salaryLoans.id, input.loanId), eq(salaryLoans.companyId, m.companyId)));
      return { success: true };
    }),
});
