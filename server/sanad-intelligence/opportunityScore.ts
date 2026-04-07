/**
 * Governorate opportunity scoring (transparent heuristic, easy to tune).
 *
 * Inputs (latest selected year): transactions T, income I, centers C, workforce W.
 * Derived: incomePerCenter = I/max(C,1), txPerCenter = T/max(C,1), wfPerCenter = W/max(C,1)
 *
 * Normalization: for each metric vector across governorates, compute max>0 and norm(x)=x/max.
 *
 * Components (weights sum ~1 before clamp):
 * - demandSignal = 0.32*norm(T) + 0.22*norm(I)  — market pull
 * - productivitySignal = 0.18*norm(incomePerCenter) + 0.12*norm(txPerCenter) — yield per node
 * - capacitySignal = 0.10*norm(wfPerCenter) — people intensity
 * - coverageGap = 0.06 * (1 - norm(C)) * norm(T) — high transactions but thin footprint
 *
 * Final: score = round(min(100, 100 * (demandSignal + productivitySignal + capacitySignal + coverageGap)))
 *
 * Recommendation labels combine score bands with simple structural rules (centers vs tx per center).
 */
export type GovOpportunityInput = {
  governorateKey: string;
  governorateLabel: string;
  transactions: number;
  income: number;
  centers: number;
  workforce: number;
  /** 0–1 optional boost from service-demand relevance (keyword overlap with digitization targets). */
  serviceRelevance?: number;
};

export type GovOpportunityRow = GovOpportunityInput & {
  incomePerCenter: number;
  transactionsPerCenter: number;
  workforcePerCenter: number;
  opportunityScore: number;
  recommendation: string;
};

function norm(x: number, max: number): number {
  if (max <= 0 || !Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x / max));
}

export function computeGovernorateOpportunityRows(rows: GovOpportunityInput[]): GovOpportunityRow[] {
  if (rows.length === 0) return [];

  const maxT = Math.max(...rows.map((r) => r.transactions), 0);
  const maxI = Math.max(...rows.map((r) => r.income), 0);
  const maxC = Math.max(...rows.map((r) => r.centers), 0);
  const maxW = Math.max(...rows.map((r) => r.workforce), 0);

  const ipc = rows.map((r) => (r.centers > 0 ? r.income / r.centers : 0));
  const tpc = rows.map((r) => (r.centers > 0 ? r.transactions / r.centers : 0));
  const wpc = rows.map((r) => (r.centers > 0 ? r.workforce / r.centers : 0));

  const maxIpc = Math.max(...ipc, 0);
  const maxTpc = Math.max(...tpc, 0);
  const maxWpc = Math.max(...wpc, 0);

  return rows.map((r, i) => {
    const incomePerCenter = r.centers > 0 ? r.income / r.centers : 0;
    const transactionsPerCenter = r.centers > 0 ? r.transactions / r.centers : 0;
    const workforcePerCenter = r.centers > 0 ? r.workforce / r.centers : 0;

    const demandSignal = 0.32 * norm(r.transactions, maxT) + 0.22 * norm(r.income, maxI);
    const productivitySignal = 0.18 * norm(ipc[i] ?? 0, maxIpc) + 0.12 * norm(tpc[i] ?? 0, maxTpc);
    const capacitySignal = 0.1 * norm(wpc[i] ?? 0, maxWpc);
    const coverageGap = maxT > 0 && maxC > 0 ? 0.06 * (1 - norm(r.centers, maxC)) * norm(r.transactions, maxT) : 0;
    const svc = typeof r.serviceRelevance === "number" ? Math.max(0, Math.min(1, r.serviceRelevance)) * 0.08 : 0;

    const raw = demandSignal + productivitySignal + capacitySignal + coverageGap + svc;
    const opportunityScore = Math.round(Math.min(100, Math.max(0, raw * 100)));

    const recommendation = pickRecommendation({
      centers: r.centers,
      transactions: r.transactions,
      income: r.income,
      transactionsPerCenter,
      opportunityScore,
      maxCenters: maxC,
      maxTpc,
    });

    return {
      ...r,
      incomePerCenter,
      transactionsPerCenter,
      workforcePerCenter,
      opportunityScore,
      recommendation,
    };
  });
}

function pickRecommendation(args: {
  centers: number;
  transactions: number;
  income: number;
  transactionsPerCenter: number;
  opportunityScore: number;
  maxCenters: number;
  maxTpc: number;
}): string {
  const { centers, transactions, income, transactionsPerCenter, opportunityScore, maxCenters, maxTpc } = args;

  const dense = maxCenters > 0 && centers >= maxCenters * 0.65;
  const thin = maxCenters > 0 && centers <= maxCenters * 0.2;
  const highTpc = maxTpc > 0 && transactionsPerCenter >= maxTpc * 0.75;
  const lowTpc = maxTpc > 0 && transactionsPerCenter <= maxTpc * 0.35;

  if (thin && transactions > 0 && income > 0) return "Low coverage / assess white space";
  if (dense && lowTpc) return "Dense network / optimize productivity";
  if (opportunityScore >= 72 && transactions > 0 && income > 0) return "High demand / high opportunity";
  if (opportunityScore >= 55 && (highTpc || income > 0)) return "Strengthen operations";
  if (opportunityScore < 45 && thin) return "Expand partnerships";
  if (dense && highTpc) return "Mature footprint / deepen services";
  return "Monitor / mixed signals";
}
