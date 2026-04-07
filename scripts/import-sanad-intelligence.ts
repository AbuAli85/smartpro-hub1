/**
 * SANAD Network Intelligence — batch import from JSON/XLSX under data/sanad-intelligence/import/
 *
 * Expected filenames (any subset):
 * - TransactionStatistics.json
 * - SanadCenterIncome.json
 * - SanadCenterEmployeesStatistics.json
 * - SanadCenterStatistics.json
 * - MostUsedServices.json
 * - SanadCenterDirectory.xlsx
 *
 * Run: pnpm sanad-intel:import
 * Override directory: SANAD_INTEL_IMPORT_DIR=/path/to/folder pnpm sanad-intel:import
 */

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import * as XLSX from "xlsx";
import * as schema from "../drizzle/schema";
import { fingerprintCenterRow, governorateKeyFromLabel } from "../server/sanad-intelligence/normalize";
import {
  directoryRowFromArray,
  isDirectoryTemplateOrHeaderRow,
  mapDirectoryHeaders,
  parseGeographyCenterCounts,
  parseMostUsedServices,
  parseWorkforceByGovernorate,
  parseYearGovernorateCounts,
  parseYearGovernorateIncome,
} from "../server/sanad-intelligence/parseSources";
import { ensureLicenseRequirementCodes } from "../server/sanad-intelligence/licenseSeed";
import { nanoid } from "nanoid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_IMPORT_DIR = path.join(ROOT, "data", "sanad-intelligence", "import");

async function readJsonIfExists(file: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as unknown;
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return null;
    throw e;
  }
}

async function main() {
  const dir = process.env.SANAD_INTEL_IMPORT_DIR ?? DEFAULT_IMPORT_DIR;
  await fs.mkdir(dir, { recursive: true });

  if (!process.env.DATABASE_URL) {
    console.error("[sanad-intel] DATABASE_URL is required.");
    process.exit(1);
  }

  const db = drizzle(process.env.DATABASE_URL, { schema, mode: "default" });

  const batchKey = createHash("sha256")
    .update(`${Date.now()}-${nanoid()}`)
    .digest("hex")
    .slice(0, 32);

  const sourceFiles: string[] = [];
  const rowCounts: Record<string, number> = {};

  const batchIns = await db
    .insert(schema.sanadIntelImportBatches)
    .values({ batchKey, sourceFiles: [], rowCounts: {}, notes: `import from ${dir}` });

  const batchId = Number((batchIns as unknown as [{ insertId?: number }])[0]?.insertId ?? 0);
  if (!batchId) {
    console.error("[sanad-intel] Failed to create import batch.");
    process.exit(1);
  }

  type Merged = {
    governorateKey: string;
    governorateLabel: string;
    transactions: number;
    income: number;
  };
  const govYear = new Map<string, Merged>(); // `${year}|${gkey}`

  const txPath = path.join(dir, "TransactionStatistics.json");
  const txData = await readJsonIfExists(txPath);
  if (txData) {
    sourceFiles.push("TransactionStatistics.json");
    const parsed = parseYearGovernorateCounts(txData);
    rowCounts.transactionRows = parsed.length;
    for (const row of parsed) {
      const { key, label } = governorateKeyFromLabel(row.governorateLabel);
      const k = `${row.year}|${key}`;
      const cur = govYear.get(k) ?? { governorateKey: key, governorateLabel: label, transactions: 0, income: 0 };
      cur.transactions = row.value;
      cur.governorateLabel = label;
      govYear.set(k, cur);
    }
  } else {
    console.warn("[sanad-intel] Missing TransactionStatistics.json (optional)");
  }

  const incPath = path.join(dir, "SanadCenterIncome.json");
  const incData = await readJsonIfExists(incPath);
  if (incData) {
    sourceFiles.push("SanadCenterIncome.json");
    const parsed = parseYearGovernorateIncome(incData);
    rowCounts.incomeRows = parsed.length;
    for (const row of parsed) {
      const { key, label } = governorateKeyFromLabel(row.governorateLabel);
      const k = `${row.year}|${key}`;
      const cur = govYear.get(k) ?? { governorateKey: key, governorateLabel: label, transactions: 0, income: 0 };
      cur.income = row.value;
      cur.governorateLabel = label;
      govYear.set(k, cur);
    }
  } else {
    console.warn("[sanad-intel] Missing SanadCenterIncome.json (optional)");
  }

  const yearsTouched = new Set<number>();
  for (const k of govYear.keys()) {
    yearsTouched.add(parseInt(k.split("|")[0], 10));
  }

  if (yearsTouched.size > 0) {
    await db
      .delete(schema.sanadIntelGovernorateYearMetrics)
      .where(inArray(schema.sanadIntelGovernorateYearMetrics.year, [...yearsTouched]));
    for (const [compound, m] of govYear.entries()) {
      const year = parseInt(compound.split("|")[0], 10);
      await db.insert(schema.sanadIntelGovernorateYearMetrics).values({
        importBatchId: batchId,
        year,
        governorateKey: m.governorateKey,
        governorateLabel: m.governorateLabel,
        transactionCount: m.transactions,
        incomeAmount: String(m.income),
        sourceRef: "TransactionStatistics.json+SanadCenterIncome.json",
      });
    }
    rowCounts.governorateYearMetrics = govYear.size;
  }

  const empPath = path.join(dir, "SanadCenterEmployeesStatistics.json");
  const empData = await readJsonIfExists(empPath);
  if (empData) {
    sourceFiles.push("SanadCenterEmployeesStatistics.json");
    const parsed = parseWorkforceByGovernorate(empData);
    rowCounts.workforceRows = parsed.length;
    await db.delete(schema.sanadIntelWorkforceGovernorate);
    for (const w of parsed) {
      await db.insert(schema.sanadIntelWorkforceGovernorate).values({
        importBatchId: batchId,
        governorateKey: w.governorateKey,
        governorateLabel: w.governorateLabel,
        ownerCount: w.ownerCount,
        staffCount: w.staffCount,
        totalWorkforce: w.totalWorkforce,
        asOfYear: w.asOfYear ?? null,
        sourceRef: "SanadCenterEmployeesStatistics.json",
      });
    }
  }

  const geoPath = path.join(dir, "SanadCenterStatistics.json");
  const geoData = await readJsonIfExists(geoPath);
  if (geoData) {
    sourceFiles.push("SanadCenterStatistics.json");
    const parsed = parseGeographyCenterCounts(geoData);
    rowCounts.geographyRows = parsed.length;
    await db.delete(schema.sanadIntelGeographyStats);
    for (const g of parsed) {
      await db.insert(schema.sanadIntelGeographyStats).values({
        importBatchId: batchId,
        governorateKey: g.governorateKey,
        governorateLabel: g.governorateLabel,
        wilayat: g.wilayat || null,
        village: g.village || null,
        centerCount: g.centerCount,
        sourceRef: "SanadCenterStatistics.json",
      });
    }
  }

  const svcPath = path.join(dir, "MostUsedServices.json");
  const svcData = await readJsonIfExists(svcPath);
  if (svcData) {
    sourceFiles.push("MostUsedServices.json");
    const parsed = parseMostUsedServices(svcData);
    rowCounts.serviceUsageRows = parsed.length;
    const svcYears = new Set(parsed.map((r) => r.year));
    if (svcYears.size > 0) {
      await db
        .delete(schema.sanadIntelServiceUsageYear)
        .where(inArray(schema.sanadIntelServiceUsageYear.year, [...svcYears]));
    }
    for (const s of parsed) {
      await db.insert(schema.sanadIntelServiceUsageYear).values({
        importBatchId: batchId,
        year: s.year,
        rankOrder: s.rankOrder,
        serviceNameAr: s.serviceNameAr ?? null,
        serviceNameEn: s.serviceNameEn ?? null,
        authorityNameAr: s.authorityNameAr ?? null,
        authorityNameEn: s.authorityNameEn ?? null,
        demandVolume: s.demandVolume,
        sourceRef: "MostUsedServices.json",
      });
    }
  }

  const xlsxPath = path.join(dir, "SanadCenterDirectory.xlsx");
  try {
    const buf = await fs.readFile(xlsxPath);
    sourceFiles.push("SanadCenterDirectory.xlsx");
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("No sheet in workbook");
    const sheet = wb.Sheets[sheetName];
    if (!sheet) throw new Error("Missing sheet");
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) as unknown[][];
    if (aoa.length < 2) throw new Error("Sheet has no rows");
    const headerRow = (aoa[0] ?? []).map((c) => String(c ?? ""));
    const colMap = mapDirectoryHeaders(headerRow);
    let n = 0;
    for (let i = 1; i < aoa.length; i++) {
      const line = aoa[i];
      if (!Array.isArray(line)) continue;
      const rec = directoryRowFromArray(line as unknown[], colMap);
      if (!rec || !rec.centerName) continue;
      if (isDirectoryTemplateOrHeaderRow(rec)) continue;
      const { key, label } = governorateKeyFromLabel(rec.governorateLabel || "Unknown");
      const fp = fingerprintCenterRow({
        centerName: rec.centerName,
        governorateKey: key,
        wilayat: rec.wilayat,
        village: rec.village,
        contactNumber: rec.contactNumber,
      });
      const [existingCenter] = await db
        .select({ id: schema.sanadIntelCenters.id })
        .from(schema.sanadIntelCenters)
        .where(eq(schema.sanadIntelCenters.sourceFingerprint, fp))
        .limit(1);

      let centerId: number;
      if (existingCenter?.id) {
        centerId = existingCenter.id;
        await db
          .update(schema.sanadIntelCenters)
          .set({
            importBatchId: batchId,
            centerName: rec.centerName,
            responsiblePerson: rec.responsiblePerson || null,
            contactNumber: rec.contactNumber || null,
            governorateKey: key,
            governorateLabelRaw: rec.governorateLabel || label,
            wilayat: rec.wilayat || null,
            village: rec.village || null,
            rawRow: rec.raw,
          })
          .where(eq(schema.sanadIntelCenters.id, centerId));
      } else {
        const ins = await db.insert(schema.sanadIntelCenters).values({
          importBatchId: batchId,
          sourceFingerprint: fp,
          centerName: rec.centerName,
          responsiblePerson: rec.responsiblePerson || null,
          contactNumber: rec.contactNumber || null,
          governorateKey: key,
          governorateLabelRaw: rec.governorateLabel || label,
          wilayat: rec.wilayat || null,
          village: rec.village || null,
          rawRow: rec.raw,
        });
        centerId = Number((ins as unknown as [{ insertId?: number }])[0]?.insertId ?? 0);
        if (!centerId) {
          const [again] = await db
            .select({ id: schema.sanadIntelCenters.id })
            .from(schema.sanadIntelCenters)
            .where(eq(schema.sanadIntelCenters.sourceFingerprint, fp))
            .limit(1);
          centerId = again?.id ?? 0;
        }
      }

      if (centerId) {
        const [hasOps] = await db
          .select({ c: schema.sanadIntelCenterOperations.centerId })
          .from(schema.sanadIntelCenterOperations)
          .where(eq(schema.sanadIntelCenterOperations.centerId, centerId))
          .limit(1);
        if (!hasOps) await db.insert(schema.sanadIntelCenterOperations).values({ centerId });
      }
      n++;
    }
    rowCounts.directoryRows = n;
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") console.warn("[sanad-intel] Directory XLSX:", err);
    else console.warn("[sanad-intel] Missing SanadCenterDirectory.xlsx (optional)");
  }

  await ensureLicenseRequirementCodes(db);

  await db
    .update(schema.sanadIntelImportBatches)
    .set({ sourceFiles, rowCounts })
    .where(eq(schema.sanadIntelImportBatches.id, batchId));

  console.log("[sanad-intel] Import complete. batch_id=%s files=%s rows=%j", batchId, sourceFiles.join(", "), rowCounts);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
