/**
 * Management cadence — Today / This week / This month review windows derived from the same
 * authoritative aggregates as the owner pulse (cash, AR, decisions, risk, delivery).
 */

import type { ExecutiveRevenueSnapshot } from "./executiveRevenueSnapshot";
import type {
  AgedReceivablesSnapshot,
  ClientHealthTopRow,
  DecisionsQueueSnapshot,
  ExecutiveInsightSummary,
  RiskComplianceSnapshot,
} from "./controlTower";

export type CadenceWindowId = "today" | "this_week" | "this_month";

export type ManagementCadenceWindow = {
  id: CadenceWindowId;
  label: string;
  /** Cash received in this period (paid PRO + subscription); see revenue snapshot basis */
  cashReceivedOmr: number;
  cashPeriodLabel: string;
  /** Point-in-time — same value across windows; see agedReceivables basis */
  receivablesAtRiskOmr: number;
  receivablesBasis: string;
  overdueInvoiceCount: number;
  decisionsOpenCount: number;
  contractsPendingSignature: number;
  renewalWorkflowsFailed: number;
  slaOpenBreaches: number;
  teamTasksOverdue: number;
  teamTasksBlocked: number;
  clientRiskAccountsCount: number;
  headline: string;
  reviewBullets: string[];
  topActions: Array<{ label: string; href: string }>;
};

export type ManagementCadenceBundle = {
  basis: string;
  generatedAt: string;
  windows: Record<CadenceWindowId, ManagementCadenceWindow>;
};

export type ManagementCadenceInput = {
  revenue: ExecutiveRevenueSnapshot;
  agedReceivables: AgedReceivablesSnapshot;
  decisionsQueue: DecisionsQueueSnapshot;
  riskCompliance: RiskComplianceSnapshot;
  insightSummary: ExecutiveInsightSummary;
  clientHealthTop: ClientHealthTopRow[];
  delivery: {
    employeeTasksOverdue: number;
    employeeTasksBlocked: number;
  };
  overdueArInvoiceCount: number;
  now?: Date;
};

export function buildManagementCadenceBundle(input: ManagementCadenceInput): ManagementCadenceBundle {
  const now = input.now ?? new Date();
  const ar = input.agedReceivables.combinedAtRiskOmr;
  const arBasis = input.agedReceivables.basis;
  const decOpen = input.decisionsQueue.totalOpenCount;
  const rc = input.riskCompliance;
  const topActions = input.decisionsQueue.items.slice(0, 5).map((i) => ({ label: i.label, href: i.href }));
  const clientRiskN = input.clientHealthTop.length;

  const basis =
    "Cadence windows reuse paid cash from the executive revenue snapshot (today / week-to-date Mon–Sun / month-to-date). Receivables, decisions, and risk figures are point-in-time as of this request, not period-allocated.";

  const mkWindow = (
    id: CadenceWindowId,
    label: string,
    cash: number,
    cashPeriodLabel: string,
    headline: string,
    reviewBullets: string[],
  ): ManagementCadenceWindow => ({
    id,
    label,
    cashReceivedOmr: cash,
    cashPeriodLabel,
    receivablesAtRiskOmr: ar,
    receivablesBasis: arBasis,
    overdueInvoiceCount: input.overdueArInvoiceCount,
    decisionsOpenCount: decOpen,
    contractsPendingSignature: rc.contractsPendingSignature,
    renewalWorkflowsFailed: rc.renewalWorkflowsFailed,
    slaOpenBreaches: rc.slaOpenBreaches,
    teamTasksOverdue: input.delivery.employeeTasksOverdue,
    teamTasksBlocked: input.delivery.employeeTasksBlocked,
    clientRiskAccountsCount: clientRiskN,
    headline,
    reviewBullets,
    topActions,
  });

  const windows: Record<CadenceWindowId, ManagementCadenceWindow> = {
    today: mkWindow(
      "today",
      "Today — daily ops",
      input.revenue.combinedPaid.todayOmr,
      "Today (midnight–now, local)",
      `Daily ops — ${fmtDate(now)}`,
      [
        `Cash received today: OMR ${input.revenue.combinedPaid.todayOmr.toFixed(3)} (PRO + subscription, paid basis).`,
        decOpen > 0 ? `${decOpen} decision queue item(s) need attention across modules.` : "No open cross-module decision queue items.",
        input.overdueArInvoiceCount > 0
          ? `${input.overdueArInvoiceCount} overdue invoice row(s); OMR ${ar.toFixed(3)} at risk (aged receivables).`
          : "No overdue receivable rows in the current aging snapshot.",
        rc.slaOpenBreaches > 0 ? `${rc.slaOpenBreaches} open SLA breach(es) to clear.` : "No open SLA breaches in the snapshot.",
        ...input.insightSummary.bullets.slice(0, 2),
      ],
    ),
    this_week: mkWindow(
      "this_week",
      "This week — management review",
      input.revenue.combinedPaid.weekOmr,
      "This ISO week (Mon–now)",
      `Weekly management review — week of ${weekLabel(now)}`,
      [
        `Cash received this week: OMR ${input.revenue.combinedPaid.weekOmr.toFixed(3)}.`,
        `Receivables at risk (now): OMR ${ar.toFixed(3)} — ${arBasis.slice(0, 120)}${arBasis.length > 120 ? "…" : ""}`,
        rc.contractsPendingSignature > 0
          ? `${rc.contractsPendingSignature} contract(s) awaiting signature.`
          : "No contracts pending signature.",
        rc.renewalWorkflowsFailed > 0
          ? `${rc.renewalWorkflowsFailed} renewal workflow run(s) failed — check renewal centre.`
          : "No failed renewal workflow runs in the snapshot.",
        input.delivery.employeeTasksOverdue + input.delivery.employeeTasksBlocked > 0
          ? `Team tasks: ${input.delivery.employeeTasksOverdue} overdue, ${input.delivery.employeeTasksBlocked} blocked.`
          : "No overdue or blocked employee resolution tasks.",
      ],
    ),
    this_month: mkWindow(
      "this_month",
      "This month — executive review",
      input.revenue.combinedPaid.monthToDateOmr,
      "Month to date",
      `Monthly executive review — ${monthYearLabel(now)}`,
      [
        `Cash received month-to-date: OMR ${input.revenue.combinedPaid.monthToDateOmr.toFixed(3)}.`,
        clientRiskN > 0
          ? `${clientRiskN} account(s) in the client health spotlight — review ranked portfolio.`
          : "No accounts in the top client health spotlight.",
        `Compliance snapshot: expiring employee docs (7d): ${rc.employeeDocsExpiring7Days}; company docs (30d): ${rc.companyDocsExpiring30Days}; permits (7d): ${rc.workPermitsExpiring7Days}.`,
        input.insightSummary.headline,
      ],
    ),
  };

  return { basis, generatedAt: now.toISOString(), windows };
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function weekLabel(d: Date): string {
  const s = new Date(d);
  const day = s.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  s.setDate(s.getDate() + diff);
  return fmtDate(s);
}

function monthYearLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
