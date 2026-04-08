import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../drizzle/schema";
import { computeGovernorateOpportunityRows } from "./opportunityScore";
import { governorateKeyFromLabel } from "./normalize";

type DB = MySql2Database<typeof schema>;

export async function getLatestMetricYear(db: DB): Promise<number | null> {
  const r = await db
    .select({ y: sql<number>`max(${schema.sanadIntelGovernorateYearMetrics.year})`.mapWith(Number) })
    .from(schema.sanadIntelGovernorateYearMetrics);
  return r[0]?.y ?? null;
}

export async function getOverviewSummary(db: DB) {
  const latestYear = await getLatestMetricYear(db);

  const [centerCountRow] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.sanadIntelCenters);

  const wf = await db.select().from(schema.sanadIntelWorkforceGovernorate);
  const totalOwners = wf.reduce((s, r) => s + (r.ownerCount ?? 0), 0);
  const totalStaff = wf.reduce((s, r) => s + (r.staffCount ?? 0), 0);
  const totalWorkforce = wf.reduce((s, r) => s + (r.totalWorkforce ?? 0), 0);

  let latestTransactions = 0;
  let latestIncome = 0;
  if (latestYear !== null) {
    const m = await db
      .select({
        t: sql<number>`coalesce(sum(${schema.sanadIntelGovernorateYearMetrics.transactionCount}),0)`.mapWith(Number),
        i: sql<string>`coalesce(sum(${schema.sanadIntelGovernorateYearMetrics.incomeAmount}),0)`,
      })
      .from(schema.sanadIntelGovernorateYearMetrics)
      .where(eq(schema.sanadIntelGovernorateYearMetrics.year, latestYear));
    latestTransactions = m[0]?.t ?? 0;
    latestIncome = parseFloat(m[0]?.i ?? "0") || 0;
  }

  const centersByGov = await db
    .select({
      governorateKey: schema.sanadIntelCenters.governorateKey,
      governorateLabel: schema.sanadIntelCenters.governorateLabelRaw,
      n: sql<number>`count(*)`.mapWith(Number),
    })
    .from(schema.sanadIntelCenters)
    .groupBy(schema.sanadIntelCenters.governorateKey, schema.sanadIntelCenters.governorateLabelRaw)
    .orderBy(desc(sql`count(*)`))
    .limit(8);

  let topGovByTx: { key: string; label: string; value: number }[] = [];
  let topGovByIncome: { key: string; label: string; value: number }[] = [];
  if (latestYear !== null) {
    topGovByTx = (
      await db
        .select({
          key: schema.sanadIntelGovernorateYearMetrics.governorateKey,
          label: schema.sanadIntelGovernorateYearMetrics.governorateLabel,
          value: schema.sanadIntelGovernorateYearMetrics.transactionCount,
        })
        .from(schema.sanadIntelGovernorateYearMetrics)
        .where(eq(schema.sanadIntelGovernorateYearMetrics.year, latestYear))
        .orderBy(desc(schema.sanadIntelGovernorateYearMetrics.transactionCount))
        .limit(8)
    ).map((r) => ({ key: r.key, label: r.label, value: r.value }));

    topGovByIncome = (
      await db
        .select({
          key: schema.sanadIntelGovernorateYearMetrics.governorateKey,
          label: schema.sanadIntelGovernorateYearMetrics.governorateLabel,
          value: schema.sanadIntelGovernorateYearMetrics.incomeAmount,
        })
        .from(schema.sanadIntelGovernorateYearMetrics)
        .where(eq(schema.sanadIntelGovernorateYearMetrics.year, latestYear))
        .orderBy(desc(schema.sanadIntelGovernorateYearMetrics.incomeAmount))
        .limit(8)
    ).map((r) => ({
      key: r.key,
      label: r.label,
      value: parseFloat(String(r.value)) || 0,
    }));
  }

  const topGovByWorkforce = [...wf]
    .sort((a, b) => (b.totalWorkforce ?? 0) - (a.totalWorkforce ?? 0))
    .slice(0, 8)
    .map((r) => ({ key: r.governorateKey, label: r.governorateLabel, value: r.totalWorkforce ?? 0 }));

  const txTrend = await db
    .select({
      year: schema.sanadIntelGovernorateYearMetrics.year,
      total: sql<number>`sum(${schema.sanadIntelGovernorateYearMetrics.transactionCount})`.mapWith(Number),
    })
    .from(schema.sanadIntelGovernorateYearMetrics)
    .groupBy(schema.sanadIntelGovernorateYearMetrics.year)
    .orderBy(asc(schema.sanadIntelGovernorateYearMetrics.year));

  const incomeTrend = await db
    .select({
      year: schema.sanadIntelGovernorateYearMetrics.year,
      total: sql<string>`sum(${schema.sanadIntelGovernorateYearMetrics.incomeAmount})`,
    })
    .from(schema.sanadIntelGovernorateYearMetrics)
    .groupBy(schema.sanadIntelGovernorateYearMetrics.year)
    .orderBy(asc(schema.sanadIntelGovernorateYearMetrics.year));

  const totalCentersAll = centerCountRow?.n ?? 0;
  const top3CenterShare =
    centersByGov.length > 0 && totalCentersAll > 0
      ? centersByGov.slice(0, 3).reduce((s, g) => s + g.n, 0) / totalCentersAll
      : 0;

  const interpretation = buildExecutiveInterpretation({
    latestYear,
    totalCenters: totalCentersAll,
    latestTransactions,
    latestIncome,
    top3CenterShare,
  });

  return {
    latestYear,
    totals: {
      centers: totalCentersAll,
      owners: totalOwners,
      staff: totalStaff,
      workforce: totalWorkforce > 0 ? totalWorkforce : totalOwners + totalStaff,
      latestYearTransactions: latestTransactions,
      latestYearIncome: latestIncome,
    },
    topGovernorates: {
      byCenters: centersByGov.map((r) => ({ key: r.governorateKey, label: r.governorateLabel, value: r.n })),
      byTransactions: topGovByTx,
      byIncome: topGovByIncome,
      byWorkforce: topGovByWorkforce,
    },
    trends: {
      transactions: txTrend.map((r) => ({ year: r.year, total: r.total })),
      income: incomeTrend.map((r) => ({ year: r.year, total: parseFloat(String(r.total)) || 0 })),
    },
    geography: {
      top3CenterShare,
      concentrationNote:
        top3CenterShare >= 0.55
          ? "Network is concentrated in a small number of governorates — prioritise balance or specialisation."
          : top3CenterShare >= 0.35
            ? "Moderate geographic concentration — room to grow secondary regions."
            : "Centres are relatively spread — focus on yield and service depth per node.",
    },
    interpretation,
  };
}

function buildExecutiveInterpretation(args: {
  latestYear: number | null;
  totalCenters: number;
  latestTransactions: number;
  latestIncome: number;
  top3CenterShare: number;
}): string[] {
  const lines: string[] = [];
  if (args.latestYear === null) {
    lines.push("Import SANAD intelligence datasets to activate KPIs and regional views.");
    return lines;
  }
  lines.push(`Figures below use ${args.latestYear} as the latest year on file for transactions and income.`);
  if (args.totalCenters > 0 && args.latestTransactions > 0) {
    const tpc = args.latestTransactions / args.totalCenters;
    lines.push(`Blended load: ~${Math.round(tpc).toLocaleString()} transactions per centre (national blend, not per-governorate).`);
  }
  if (args.latestIncome > 0 && args.totalCenters > 0) {
    lines.push(
      `Reported income divided by directory centres suggests ~${(args.latestIncome / args.totalCenters).toFixed(1)} income units per centre (currency as per source file).`,
    );
  }
  if (args.top3CenterShare >= 0.5) {
    lines.push("Executive takeaway: expansion capital may go further in under-served governorates if demand data supports it.");
  }
  return lines;
}

export async function listCenters(
  db: DB,
  input: {
    search?: string;
    governorateKey?: string;
    wilayat?: string;
    partnerStatus?: (typeof schema.sanadIntelCenterOperations.$inferSelect)["partnerStatus"];
    limit: number;
    offset: number;
  },
) {
  const search = input.search?.trim();
  const conds = [];

  if (input.governorateKey) conds.push(eq(schema.sanadIntelCenters.governorateKey, input.governorateKey));
  if (input.wilayat?.trim()) conds.push(like(schema.sanadIntelCenters.wilayat, `%${input.wilayat.trim()}%`));
  if (input.partnerStatus)
    conds.push(eq(schema.sanadIntelCenterOperations.partnerStatus, input.partnerStatus));

  if (search) {
    const q = `%${search}%`;
    conds.push(
      or(
        like(schema.sanadIntelCenters.centerName, q),
        like(schema.sanadIntelCenters.responsiblePerson, q),
        like(schema.sanadIntelCenters.contactNumber, q),
        like(schema.sanadIntelCenters.village, q),
        like(schema.sanadIntelCenters.wilayat, q),
        like(schema.sanadIntelCenters.governorateLabelRaw, q),
      )!,
    );
  }

  const whereClause = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select({
      center: schema.sanadIntelCenters,
      ops: schema.sanadIntelCenterOperations,
    })
    .from(schema.sanadIntelCenters)
    .leftJoin(
      schema.sanadIntelCenterOperations,
      eq(schema.sanadIntelCenterOperations.centerId, schema.sanadIntelCenters.id),
    )
    .where(whereClause)
    .orderBy(asc(schema.sanadIntelCenters.centerName))
    .limit(input.limit)
    .offset(input.offset);

  const [countRow] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.sanadIntelCenters)
    .leftJoin(
      schema.sanadIntelCenterOperations,
      eq(schema.sanadIntelCenterOperations.centerId, schema.sanadIntelCenters.id),
    )
    .where(whereClause);

  return { rows, total: countRow?.n ?? 0 };
}

export async function getCenterDetail(db: DB, id: number) {
  const [row] = await db
    .select({
      center: schema.sanadIntelCenters,
      ops: schema.sanadIntelCenterOperations,
    })
    .from(schema.sanadIntelCenters)
    .leftJoin(
      schema.sanadIntelCenterOperations,
      eq(schema.sanadIntelCenterOperations.centerId, schema.sanadIntelCenters.id),
    )
    .where(eq(schema.sanadIntelCenters.id, id))
    .limit(1);

  if (!row) return null;

  type ComplianceRow = {
    item: typeof schema.sanadIntelCenterComplianceItems.$inferSelect;
    req: typeof schema.sanadIntelLicenseRequirements.$inferSelect;
  };
  let compliance: ComplianceRow[] = [];
  try {
    compliance = await db
      .select({
        item: schema.sanadIntelCenterComplianceItems,
        req: schema.sanadIntelLicenseRequirements,
      })
      .from(schema.sanadIntelCenterComplianceItems)
      .innerJoin(
        schema.sanadIntelLicenseRequirements,
        eq(schema.sanadIntelLicenseRequirements.id, schema.sanadIntelCenterComplianceItems.requirementId),
      )
      .where(eq(schema.sanadIntelCenterComplianceItems.centerId, id))
      .orderBy(asc(schema.sanadIntelLicenseRequirements.sortOrder));
  } catch (e) {
    console.warn("[sanad-intelligence] getCenterDetail: compliance query failed; returning empty checklist", e);
  }

  return { ...row, compliance };
}

export async function getRegionalOpportunity(db: DB, year: number) {
  const metrics = await db
    .select()
    .from(schema.sanadIntelGovernorateYearMetrics)
    .where(eq(schema.sanadIntelGovernorateYearMetrics.year, year));

  const centerCounts = await db
    .select({
      k: schema.sanadIntelCenters.governorateKey,
      n: sql<number>`count(*)`.mapWith(Number),
    })
    .from(schema.sanadIntelCenters)
    .groupBy(schema.sanadIntelCenters.governorateKey);

  const centerMap = new Map(centerCounts.map((c) => [c.k, c.n]));

  const wfRows = await db.select().from(schema.sanadIntelWorkforceGovernorate);
  const wfMap = new Map(wfRows.map((w) => [w.governorateKey, w]));

  const services = await db
    .select()
    .from(schema.sanadIntelServiceUsageYear)
    .where(eq(schema.sanadIntelServiceUsageYear.year, year))
    .orderBy(asc(schema.sanadIntelServiceUsageYear.rankOrder))
    .limit(20);

  const svcRel = nationalServiceRelevanceScore(services);

  const keys = new Set<string>();
  metrics.forEach((m) => keys.add(m.governorateKey));
  centerMap.forEach((_, k) => keys.add(k));
  wfMap.forEach((_, k) => keys.add(k));

  const inputs = Array.from(keys).map((key) => {
    const m = metrics.find((x) => x.governorateKey === key);
    const w = wfMap.get(key);
    const label =
      m?.governorateLabel ?? w?.governorateLabel ?? governorateKeyFromLabel(key.replace(/_/g, " ")).label;
    return {
      governorateKey: key,
      governorateLabel: label,
      transactions: m?.transactionCount ?? 0,
      income: parseFloat(String(m?.incomeAmount ?? 0)) || 0,
      centers: centerMap.get(key) ?? 0,
      workforce: w?.totalWorkforce ?? 0,
      serviceRelevance: svcRel,
    };
  });

  const ranked = computeGovernorateOpportunityRows(inputs).sort((a, b) => b.opportunityScore - a.opportunityScore);
  return { year, rows: ranked, serviceRelevanceNational: svcRel };
}

function nationalServiceRelevanceScore(
  services: { serviceNameEn: string | null; serviceNameAr: string | null }[],
): number {
  const re = /work\s*permit|visa|labor|labour|residence|commercial|cr\b|typing|attest|mol|mol\b|passport/i;
  if (!services.length) return 0;
  let hits = 0;
  for (const s of services.slice(0, 15)) {
    const t = `${s.serviceNameEn ?? ""} ${s.serviceNameAr ?? ""}`;
    if (re.test(t)) hits++;
  }
  return Math.min(1, hits / 5);
}

export async function getTopServices(db: DB, year: number) {
  return db
    .select()
    .from(schema.sanadIntelServiceUsageYear)
    .where(eq(schema.sanadIntelServiceUsageYear.year, year))
    .orderBy(asc(schema.sanadIntelServiceUsageYear.rankOrder));
}

export async function getWorkforce(db: DB) {
  return db.select().from(schema.sanadIntelWorkforceGovernorate).orderBy(desc(schema.sanadIntelWorkforceGovernorate.totalWorkforce));
}

export async function listGovernorateKeysFromCenters(db: DB) {
  const rows = await db
    .selectDistinct({
      key: schema.sanadIntelCenters.governorateKey,
      label: schema.sanadIntelCenters.governorateLabelRaw,
    })
    .from(schema.sanadIntelCenters)
    .orderBy(asc(schema.sanadIntelCenters.governorateLabelRaw));
  const byKey = new Map<string, string>();
  for (const r of rows) {
    if (!byKey.has(r.key)) byKey.set(r.key, r.label);
  }
  return Array.from(byKey.entries()).map(([key, label]) => ({ key, label }));
}

export async function listWilayatForGovernorate(db: DB, governorateKey: string) {
  return db
    .selectDistinct({ wilayat: schema.sanadIntelCenters.wilayat })
    .from(schema.sanadIntelCenters)
    .where(eq(schema.sanadIntelCenters.governorateKey, governorateKey))
    .orderBy(asc(schema.sanadIntelCenters.wilayat));
}
