/**
 * Direct SANAD Intelligence data import using raw SQL bulk inserts.
 * Bypasses Drizzle ORM row-by-row approach for speed and reliability.
 *
 * Usage: node scripts/import-sanad-direct.mjs
 */

import { createPool } from "mysql2/promise";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import XLSX from "xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../data/sanad-intelligence/import");

// ─── DB connection ────────────────────────────────────────────────────────────
const dbUrl = new URL(process.env.DATABASE_URL);
const pool = createPool({
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port || "3306"),
  user: dbUrl.username,
  password: dbUrl.password,
  database: dbUrl.pathname.slice(1).split("?")[0],
  ssl: { rejectUnauthorized: false },
  multipleStatements: false,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const GOVERNORATE_MAP = {
  "muscat": "muscat",
  "south batinah": "south_batinah",
  "south al batinah": "south_batinah",
  "south al-batinah": "south_batinah",
  "north al-sharqiya": "north_sharqiya",
  "north al sharqiya": "north_sharqiya",
  "north ash sharqiyah": "north_sharqiya",
  "north sharqiya": "north_sharqiya",
  "north batinah": "north_batinah",
  "north al batinah": "north_batinah",
  "north al-batinah": "north_batinah",
  "musandam": "musandam",
  "al-dhahirah": "dhahirah",
  "al dhahirah": "dhahirah",
  "ad dhahirah": "dhahirah",
  "dhahirah": "dhahirah",
  "al-dakhiliyah": "dakhiliyah",
  "al dakhiliyah": "dakhiliyah",
  "ad dakhiliyah": "dakhiliyah",
  "dakhiliyah": "dakhiliyah",
  "south al-sharqiya": "south_sharqiya",
  "south al sharqiya": "south_sharqiya",
  "south ash sharqiyah": "south_sharqiya",
  "south sharqiya": "south_sharqiya",
  "al-wusta'a": "wusta",
  "al wusta": "wusta",
  "al wusta'a": "wusta",
  "wusta": "wusta",
  "dhofar": "dhofar",
  "al-buraimi": "buraimi",
  "al buraimi": "buraimi",
  "buraimi": "buraimi",
};

function govKey(label) {
  const k = label.toLowerCase().replace(/\s+/g, " ").trim();
  return GOVERNORATE_MAP[k] || k.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function govLabel(label) {
  return label.replace(/\s+/g, " ").trim();
}

function normalizeYear(k) {
  const n = parseFloat(String(k));
  if (Number.isFinite(n) && n >= 2000 && n <= 2100) return Math.round(n);
  return null;
}

function readJson(filename) {
  const path = join(DATA_DIR, filename);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.error(`  ✗ Could not read ${filename}: ${e.message}`);
    return null;
  }
}

// ─── 1. Create import batch ───────────────────────────────────────────────────
async function createBatch() {
  const batchKey = `direct-import-${Date.now()}`;
  const [res] = await pool.execute(
    "INSERT INTO `sanad_intel_import_batches` (`batch_key`, `source_files`, `row_counts`, `notes`) VALUES (?, ?, ?, ?)",
    [batchKey, JSON.stringify([]), JSON.stringify({}), "Direct import script"]
  );
  return res.insertId;
}

// ─── 2. Import transactions + income → governorate_year_metrics ───────────────
async function importMetrics(batchId) {
  console.log("\n[1/5] Importing transaction & income metrics...");
  const txData = readJson("TransactionStatistics.json");
  const incData = readJson("SanadCenterIncome.json");
  if (!txData && !incData) return 0;

  // Build merged map: year → govLabel → { txCount, incomeOmr }
  const merged = new Map();
  const addToMap = (data, field) => {
    if (!data || typeof data !== "object") return;
    for (const [yk, govObj] of Object.entries(data)) {
      const year = normalizeYear(yk);
      if (!year || typeof govObj !== "object") continue;
      for (const [gl, val] of Object.entries(govObj)) {
        if (/^total/i.test(gl.trim())) continue;
        const n = parseFloat(String(val));
        if (!Number.isFinite(n)) continue;
        const key = `${year}|${gl.trim()}`;
        if (!merged.has(key)) merged.set(key, { year, governorateLabel: gl.trim(), txCount: null, incomeOmr: null });
        merged.get(key)[field] = n;
      }
    }
  };
  addToMap(txData, "txCount");
  addToMap(incData, "incomeOmr");

  if (merged.size === 0) { console.log("  ✗ No data parsed"); return 0; }

  // Delete existing rows for touched years
  const years = [...new Set([...merged.values()].map(r => r.year))];
  for (const yr of years) {
    await pool.execute("DELETE FROM `sanad_intel_governorate_year_metrics` WHERE `year` = ?", [yr]);
  }

  // Bulk insert
  let count = 0;
  for (const row of merged.values()) {
    const key = govKey(row.governorateLabel);
    const label = govLabel(row.governorateLabel);
    await pool.execute(
      `INSERT INTO \`sanad_intel_governorate_year_metrics\`
       (\`import_batch_id\`, \`year\`, \`governorate_key\`, \`governorate_label\`, \`transaction_count\`, \`income_amount\`, \`source_ref\`)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         \`transaction_count\` = COALESCE(VALUES(\`transaction_count\`), \`transaction_count\`),
         \`income_amount\` = COALESCE(VALUES(\`income_amount\`), \`income_amount\`),
         \`import_batch_id\` = VALUES(\`import_batch_id\`)`,
      [batchId, row.year, key, label, row.txCount ?? null, row.incomeOmr ?? null, "TransactionStatistics+Income"]
    );
    count++;
  }
  console.log(`  ✓ ${count} rows inserted into sanad_intel_governorate_year_metrics`);
  return count;
}

// ─── 3. Import workforce ──────────────────────────────────────────────────────
async function importWorkforce(batchId) {
  console.log("\n[2/5] Importing workforce statistics...");
  const data = readJson("SanadCenterEmployeesStatistics.json");
  if (!data) return 0;

  await pool.execute("DELETE FROM `sanad_intel_workforce_governorate`");

  let count = 0;
  for (const [gl, raw] of Object.entries(data)) {
    if (typeof raw !== "object" || !raw) continue;
    const key = govKey(gl);
    const label = govLabel(gl);
    const owners = parseInt(raw.ownerCount ?? raw.owners ?? 0) || 0;
    const staff = parseInt(raw.staffCount ?? raw.staff ?? 0) || 0;
    const total = parseInt(raw.totalWorkforce ?? raw.total ?? 0) || (owners + staff);
    const asOfYear = raw.year ? normalizeYear(raw.year) : null;

    await pool.execute(
      `INSERT INTO \`sanad_intel_workforce_governorate\`
       (\`import_batch_id\`, \`governorate_key\`, \`governorate_label\`, \`owner_count\`, \`staff_count\`, \`total_workforce\`, \`as_of_year\`, \`source_ref\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [batchId, key, label, owners, staff, total, asOfYear, "SanadCenterEmployeesStatistics.json"]
    );
    count++;
  }
  console.log(`  ✓ ${count} rows inserted into sanad_intel_workforce_governorate`);
  return count;
}

// ─── 4. Import geography stats ────────────────────────────────────────────────
async function importGeography(batchId) {
  console.log("\n[3/5] Importing geography center counts...");
  const data = readJson("SanadCenterStatistics.json");
  if (!data) return 0;

  await pool.execute("DELETE FROM `sanad_intel_geography_stats`");

  const rows = [];
  // Format: { Governorate: { Wilayat: { Village: count } } }
  for (const [govName, wilObj] of Object.entries(data)) {
    if (normalizeYear(govName) !== null) continue;
    if (typeof wilObj !== "object" || !wilObj) continue;
    const key = govKey(govName);
    const label = govLabel(govName);
    for (const [wilName, vilObj] of Object.entries(wilObj)) {
      if (typeof vilObj === "object" && vilObj !== null) {
        for (const [vilName, cnt] of Object.entries(vilObj)) {
          const n = parseInt(cnt) || 0;
          if (n > 0) rows.push([batchId, key, label, wilName.trim(), vilName.trim(), n, "SanadCenterStatistics.json"]);
        }
      } else {
        const n = parseInt(vilObj) || 0;
        if (n > 0) rows.push([batchId, key, label, wilName.trim(), "", n, "SanadCenterStatistics.json"]);
      }
    }
  }

  // Merge duplicates
  const merged = new Map();
  for (const r of rows) {
    const mk = `${r[1]}|${r[3]}|${r[4]}`;
    if (!merged.has(mk)) merged.set(mk, [...r]);
    else merged.get(mk)[5] += r[5];
  }

  let count = 0;
  for (const r of merged.values()) {
    await pool.execute(
      `INSERT INTO \`sanad_intel_geography_stats\`
       (\`import_batch_id\`, \`governorate_key\`, \`governorate_label\`, \`wilayat\`, \`village\`, \`center_count\`, \`source_ref\`)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE \`center_count\` = VALUES(\`center_count\`), \`import_batch_id\` = VALUES(\`import_batch_id\`)`,
      r
    );
    count++;
  }
  console.log(`  ✓ ${count} rows inserted into sanad_intel_geography_stats`);
  return count;
}

// ─── 5. Import most-used services ─────────────────────────────────────────────
async function importServices(batchId) {
  console.log("\n[4/5] Importing most-used services...");
  const data = readJson("MostUsedServices.json");
  if (!data) return 0;

  const rows = [];
  for (const [yk, list] of Object.entries(data)) {
    const year = normalizeYear(yk);
    if (!year || !Array.isArray(list)) continue;
    list.forEach((item, idx) => {
      if (typeof item !== "object" || !item) return;
      const demand = parseInt(item.demandVolume ?? item.volume ?? item.count ?? 0) || 0;
      rows.push([
        batchId, year,
        parseInt(item.rank ?? item.rankOrder ?? idx + 1) || idx + 1,
        item.serviceNameAr ?? null,
        item.serviceNameEn ?? null,
        item.authorityNameAr ?? null,
        item.authorityNameEn ?? null,
        demand,
        "MostUsedServices.json"
      ]);
    });
  }

  if (rows.length === 0) { console.log("  ✗ No service rows parsed"); return 0; }

  // Delete existing rows for touched years
  const years = [...new Set(rows.map(r => r[1]))];
  for (const yr of years) {
    await pool.execute("DELETE FROM `sanad_intel_service_usage_year` WHERE `year` = ?", [yr]);
  }

  let count = 0;
  for (const r of rows) {
    await pool.execute(
      `INSERT INTO \`sanad_intel_service_usage_year\`
       (\`import_batch_id\`, \`year\`, \`rank_order\`, \`service_name_ar\`, \`service_name_en\`, \`authority_name_ar\`, \`authority_name_en\`, \`demand_volume\`, \`source_ref\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      r
    );
    count++;
  }
  console.log(`  ✓ ${count} rows inserted into sanad_intel_service_usage_year`);
  return count;
}

// ─── 6. Import SANAD center directory ────────────────────────────────────────
async function importCenters(batchId) {
  console.log("\n[5/5] Importing SANAD center directory from XLSX...");
  const xlsxPath = join(DATA_DIR, "SanadCenterDirectory.xlsx");
  let buf;
  try { buf = readFileSync(xlsxPath); } catch (e) { console.error("  ✗ Cannot read XLSX:", e.message); return 0; }

  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  if (aoa.length < 2) { console.error("  ✗ XLSX has no data rows"); return 0; }

  const rawHeaders = (aoa[0] ?? []).map(c => String(c ?? ""));

  // Map headers using compound English/Arabic split
  const ALIASES = {
    "center name": "centerName", "sanad center name": "centerName", "اسم المركز": "centerName", "مركز سند": "centerName", "name": "centerName",
    "responsible": "responsiblePerson", "responsible person": "responsiblePerson", "contact person": "responsiblePerson",
    "الاسم": "responsiblePerson", "مسؤول": "responsiblePerson", "الموظف المسؤول": "responsiblePerson",
    "phone": "contactNumber", "mobile": "contactNumber", "contact": "contactNumber", "contact number": "contactNumber",
    "رقم الهاتف": "contactNumber", "الهاتف": "contactNumber", "رقم الاتصال": "contactNumber",
    "governorate": "governorateLabel", "المحافظة": "governorateLabel", "محافظة": "governorateLabel",
    "wilayat": "wilayat", "willayat": "wilayat", "الولاية": "wilayat", "ولاية": "wilayat",
    "village": "village", "القرية": "village", "قرية": "village",
  };

  function mapH(h) {
    const full = h.replace(/\s+/g, " ").trim().toLowerCase();
    if (ALIASES[full]) return ALIASES[full];
    const parts = full.split(/[/\\]/).map(p => p.replace(/['"]/g, "").trim());
    for (const p of parts) { if (p && ALIASES[p]) return ALIASES[p]; }
    return null;
  }

  const colMap = rawHeaders.map(mapH);
  console.log("  Headers mapped:", rawHeaders.map((h, i) => `${h} → ${colMap[i]}`).join(", "));

  // Simple fingerprint
  function fp(name, govKey, wilayat, village, contact) {
    const str = [name, govKey, wilayat, village, contact].map(s => String(s ?? "").toLowerCase().trim()).join("|");
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
    return Math.abs(hash).toString(16).padStart(8, "0") + str.length.toString(16);
  }

  let count = 0;
  let skipped = 0;
  for (let i = 1; i < aoa.length; i++) {
    const line = aoa[i];
    if (!Array.isArray(line)) continue;
    const acc = {};
    line.forEach((cell, ci) => {
      const key = colMap[ci];
      if (!key) return;
      acc[key] = cell === undefined || cell === null ? "" : String(cell).trim();
    });
    if (!acc.centerName && !acc.governorateLabel) { skipped++; continue; }
    const centerName = acc.centerName || "";
    const govLabel2 = (acc.governorateLabel || "").replace(/^\s+/, "");
    const key = govKey(govLabel2);
    const wilayat = acc.wilayat || "";
    const village = acc.village || "";
    const contact = acc.contactNumber || "";
    const responsible = acc.responsiblePerson || "";
    const fingerprint = fp(centerName, key, wilayat, village, contact);

    // Upsert center
    const [existing] = await pool.execute(
      "SELECT `id` FROM `sanad_intel_centers` WHERE `source_fingerprint` = ? LIMIT 1",
      [fingerprint]
    );

    let centerId;
    if (existing.length > 0) {
      centerId = existing[0].id;
      await pool.execute(
        `UPDATE \`sanad_intel_centers\` SET
          \`import_batch_id\` = ?, \`center_name\` = ?, \`responsible_person\` = ?,
          \`contact_number\` = ?, \`governorate_key\` = ?, \`governorate_label_raw\` = ?,
          \`wilayat\` = ?, \`village\` = ?, \`raw_row\` = ?
         WHERE \`id\` = ?`,
        [batchId, centerName, responsible || null, contact || null, key, govLabel2 || key, wilayat || null, village || null, JSON.stringify(acc), centerId]
      );
    } else {
      const [ins] = await pool.execute(
        `INSERT INTO \`sanad_intel_centers\`
         (\`import_batch_id\`, \`source_fingerprint\`, \`center_name\`, \`responsible_person\`, \`contact_number\`,
          \`governorate_key\`, \`governorate_label_raw\`, \`wilayat\`, \`village\`, \`raw_row\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [batchId, fingerprint, centerName, responsible || null, contact || null, key, govLabel2 || key, wilayat || null, village || null, JSON.stringify(acc)]
      );
      centerId = ins.insertId;

      // Seed center_operations row
      if (centerId) {
        try {
          await pool.execute(
            `INSERT IGNORE INTO \`sanad_intel_center_operations\` (\`center_id\`) VALUES (?)`,
            [centerId]
          );
        } catch (_) {}
      }
    }
    count++;
  }
  console.log(`  ✓ ${count} centers upserted (${skipped} rows skipped)`);
  return count;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== SANAD Intelligence Direct Import ===\n");
  const batchId = await createBatch();
  console.log(`Created import batch #${batchId}`);

  const rowCounts = {};
  rowCounts.metrics = await importMetrics(batchId);
  rowCounts.workforce = await importWorkforce(batchId);
  rowCounts.geography = await importGeography(batchId);
  rowCounts.services = await importServices(batchId);
  rowCounts.centers = await importCenters(batchId);

  // Update batch record
  await pool.execute(
    "UPDATE `sanad_intel_import_batches` SET `row_counts` = ?, `source_files` = ? WHERE `id` = ?",
    [
      JSON.stringify(rowCounts),
      JSON.stringify(["TransactionStatistics.json", "SanadCenterIncome.json", "SanadCenterEmployeesStatistics.json", "SanadCenterStatistics.json", "MostUsedServices.json", "SanadCenterDirectory.xlsx"]),
      batchId
    ]
  );

  console.log("\n=== Import Complete ===");
  console.log("Row counts:", rowCounts);
  await pool.end();
}

main().catch(e => { console.error("FATAL:", e.message, e.stack); process.exit(1); });
