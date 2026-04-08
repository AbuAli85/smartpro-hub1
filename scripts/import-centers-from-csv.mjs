/**
 * Clean, fast import of SANAD centres from SanadCenterDirectory.csv
 * Uses bulk INSERT with ON DUPLICATE KEY UPDATE for idempotency.
 * Fingerprint: name|governorateKey|wilayat|village (no phone, new format)
 *
 * Run: node scripts/import-centers-from-csv.mjs
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import mysql from "mysql2/promise";

const CSV_PATH = new URL(
  "../data/sanad-intelligence/import/SanadCenterDirectory.csv",
  import.meta.url
).pathname;

const ALIAS_TO_KEY = [
  { pattern: /مسقط|muscat|maskat/i, key: "muscat", label: "Muscat" },
  { pattern: /ظفار|dhofar|ẓufār|salalah/i, key: "dhofar", label: "Dhofar" },
  { pattern: /شمال\s*الباطنة|north\s*al\s*batinah/i, key: "north_batinah", label: "North Al Batinah" },
  { pattern: /جنوب\s*الباطنة|south\s*al\s*batinah/i, key: "south_batinah", label: "South Al Batinah" },
  { pattern: /شمال\s*الشرقية|north\s*al\s*sharqiyah/i, key: "north_sharqiyah", label: "North Ash Sharqiyah" },
  { pattern: /جنوب\s*الشرقية|south\s*al\s*sharqiyah/i, key: "south_sharqiyah", label: "South Ash Sharqiyah" },
  { pattern: /الداخلية|al\s*dakhiliyah|dakhliyah|nizwa/i, key: "dakhliyah", label: "Ad Dakhiliyah" },
  { pattern: /الظاهرة|al\s*dhahirah|dhahirah|ibri/i, key: "dhahirah", label: "Ad Dhahirah" },
  { pattern: /البريمي|al\s*buraimi|buraimi/i, key: "buraimi", label: "Al Buraimi" },
  { pattern: /الوسطى|al\s*wusta|wusta/i, key: "wusta", label: "Al Wusta" },
  { pattern: /مسندم|musandam|khasab/i, key: "musandam", label: "Musandam" },
];

function collapseWhitespace(s) {
  // Remove tatweel (ـ U+0640) and collapse whitespace
  return (s ?? "").replace(/\u0640/g, "").replace(/\s+/g, " ").trim();
}

function governorateKey(raw) {
  const label = collapseWhitespace(raw);
  if (!label) return { key: "unknown", label: "Unknown" };
  for (const { pattern, key, label: lbl } of ALIAS_TO_KEY) {
    if (pattern.test(label)) return { key, label: lbl };
  }
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 120);
  return { key: slug || "unknown", label };
}

function fingerprint(centerName, govKey, wilayat, village) {
  // New format (no phone) — matches normalize.ts fingerprintCenterRow
  const payload = [
    collapseWhitespace(centerName).toLowerCase(),
    govKey,
    collapseWhitespace(wilayat).toLowerCase(),
    collapseWhitespace(village).toLowerCase(),
  ].join("|");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function stripBom(str) {
  return str.charCodeAt(0) === 0xfeff ? str.slice(1) : str;
}

function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === "," && !inQuote) { fields.push(cur); cur = ""; }
    else { cur += ch; }
  }
  fields.push(cur);
  return fields;
}

async function readCsv() {
  const rows = [];
  const rl = createInterface({ input: createReadStream(CSV_PATH), crlfDelay: Infinity });

  let isFirst = true;
  let colPhone = 0, colPerson = 1, colName = 2, colVillage = 3, colWilayat = 4, colGov = 5;

  for await (const rawLine of rl) {
    const line = isFirst ? stripBom(rawLine) : rawLine;
    if (!line.trim()) { isFirst = false; continue; }
    const fields = parseCsvLine(line);

    if (isFirst) {
      const headers = fields.map((h) => h.trim().toLowerCase());
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (h.includes("contact number") || h.includes("رقم الاتصال")) colPhone = i;
        else if (h.includes("contact person") || h.includes("الموظف")) colPerson = i;
        else if (h.includes("sanad center name") || h.includes("مركز سند")) colName = i;
        else if (h.includes("village") || h.includes("قرية")) colVillage = i;
        else if (h.includes("willayat") || h.includes("wilayat") || h.includes("ولاية")) colWilayat = i;
        else if (h.includes("governorate") || h.includes("محافظة")) colGov = i;
      }
      isFirst = false;
      continue;
    }

    const phone = (fields[colPhone] ?? "").trim();
    const person = (fields[colPerson] ?? "").trim();
    const name = (fields[colName] ?? "").trim();
    const village = (fields[colVillage] ?? "").trim();
    const wilayat = (fields[colWilayat] ?? "").trim();
    const govRaw = (fields[colGov] ?? "").trim();

    if (!name) continue;
    // Skip template/header rows
    if (name.includes("SANAD Center Name") || name.includes("مركز سند")) continue;

    const { key: govKey, label: govLabel } = governorateKey(govRaw);
    const fp = fingerprint(name, govKey, wilayat, village);

    rows.push({ fp, name, person, village, wilayat, govKey, govLabel, phone: phone || null });
  }

  return rows;
}

async function main() {
  console.log("[csv-import] Reading CSV...");
  const rows = await readCsv();
  console.log(`[csv-import] CSV: ${rows.length} rows`);

  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Get or create a batch
  const batchKey = `csv-import-${new Date().toISOString().slice(0, 10)}`;
  const [existing] = await conn.query("SELECT id FROM sanad_intel_import_batches WHERE batch_key = ?", [batchKey]);
  let batchId;
  if (existing.length > 0) {
    batchId = existing[0].id;
  } else {
    const [ins] = await conn.query(
      "INSERT INTO sanad_intel_import_batches (batch_key, source_files, created_at) VALUES (?, ?, NOW())",
      [batchKey, JSON.stringify(["SanadCenterDirectory.csv"])]
    );
    batchId = ins.insertId;
  }
  console.log(`[csv-import] Batch ID: ${batchId}`);

  // Bulk insert in chunks of 100
  const CHUNK = 100;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const values = chunk.flatMap((r) => [
      r.fp, r.name, r.person || null, r.wilayat || null, r.village || null,
      r.govKey, r.phone, batchId
    ]);

    const sql = `
      INSERT INTO sanad_intel_centers
        (source_fingerprint, center_name, responsible_person, wilayat, village, governorate_key, contact_number, import_batch_id)
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE
        center_name = VALUES(center_name),
        responsible_person = VALUES(responsible_person),
        wilayat = VALUES(wilayat),
        village = VALUES(village),
        governorate_key = VALUES(governorate_key),
        contact_number = COALESCE(VALUES(contact_number), contact_number),
        import_batch_id = VALUES(import_batch_id)
    `;

    const [result] = await conn.query(sql, values);
    // affectedRows: 1 = insert, 2 = update
    inserted += result.affectedRows - (result.changedRows ?? 0);
    updated += result.changedRows ?? 0;
    process.stdout.write(`\r[csv-import] Progress: ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }

  console.log(`\n[csv-import] Done! Inserted: ${inserted}, Updated: ${updated}`);

  // Insert operations rows for any centres that don't have one
  const [missingOps] = await conn.query(`
    SELECT c.id FROM sanad_intel_centers c
    LEFT JOIN sanad_intel_center_operations o ON o.center_id = c.id
    WHERE o.center_id IS NULL
  `);

  if (missingOps.length > 0) {
    const opPlaceholders = missingOps.map(() => "(?, ?)").join(", ");
    const opValues = missingOps.flatMap((r) => [r.id, "unknown"]);
    await conn.query(
      `INSERT INTO sanad_intel_center_operations (center_id, partner_status) VALUES ${opPlaceholders}`,
      opValues
    );
    console.log(`[csv-import] Created ${missingOps.length} operations rows`);
  }

  // Final stats
  const [stats] = await conn.query(
    "SELECT COUNT(*) as total, COUNT(contact_number) as with_phone FROM sanad_intel_centers"
  );
  console.log(`[csv-import] Final: ${stats[0].total} centres, ${stats[0].with_phone} with phone`);

  await conn.end();
}

main().catch((e) => {
  console.error("[csv-import] ERROR:", e.message);
  process.exit(1);
});
