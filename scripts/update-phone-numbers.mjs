/**
 * Fast bulk phone number update from SanadCenterDirectory.csv
 * Uses a single UPDATE ... CASE statement for all rows.
 *
 * Run: node scripts/update-phone-numbers.mjs
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
  { pattern: /مسقط|muscat|maskat/i, key: "muscat" },
  { pattern: /ظفار|dhofar|ẓufār|salalah/i, key: "dhofar" },
  { pattern: /شمال\s*الباطنة|north\s*al\s*batinah|al\s*batinah\s*north/i, key: "north_batinah" },
  { pattern: /جنوب\s*الباطنة|south\s*al\s*batinah/i, key: "south_batinah" },
  { pattern: /شمال\s*الشرقية|north\s*al\s*sharqiyah/i, key: "north_sharqiyah" },
  { pattern: /جنوب\s*الشرقية|south\s*al\s*sharqiyah/i, key: "south_sharqiyah" },
  { pattern: /الداخلية|al\s*dakhiliyah|dakhliyah|nizwa/i, key: "dakhliyah" },
  { pattern: /الظاهرة|al\s*dhahirah|dhahirah|ibri/i, key: "dhahirah" },
  { pattern: /البريمي|al\s*buraimi|buraimi/i, key: "buraimi" },
  { pattern: /الوسطى|al\s*wusta|wusta/i, key: "wusta" },
  { pattern: /مسندم|musandam|khasab/i, key: "musandam" },
];

function collapseWhitespace(s) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function governorateKey(raw) {
  const label = collapseWhitespace(raw);
  if (!label) return "unknown";
  for (const { pattern, key } of ALIAS_TO_KEY) {
    if (pattern.test(label)) return key;
  }
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 120) || "unknown";
}

// OLD fingerprint format: includes empty contactNumber at end (matches DB rows)
function fingerprint(centerName, govKey, wilayat, village) {
  const payload = [
    collapseWhitespace(centerName).toLowerCase(),
    govKey,
    collapseWhitespace(wilayat).toLowerCase(),
    collapseWhitespace(village).toLowerCase(),
    "", // empty contactNumber — matches old import format
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
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

async function readCsv() {
  const map = new Map(); // fingerprint -> phone
  const rl = createInterface({ input: createReadStream(CSV_PATH), crlfDelay: Infinity });

  let isFirst = true;
  let colPhone = 0, colName = 2, colVillage = 3, colWilayat = 4, colGov = 5;

  for await (const rawLine of rl) {
    const line = isFirst ? stripBom(rawLine) : rawLine;
    if (!line.trim()) { isFirst = false; continue; }
    const fields = parseCsvLine(line);

    if (isFirst) {
      const headers = fields.map((h) => h.trim().toLowerCase());
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (h.includes("contact number") || h.includes("رقم الاتصال")) colPhone = i;
        else if (h.includes("sanad center name") || h.includes("مركز سند")) colName = i;
        else if (h.includes("village") || h.includes("قرية")) colVillage = i;
        else if (h.includes("willayat") || h.includes("wilayat") || h.includes("ولاية")) colWilayat = i;
        else if (h.includes("governorate") || h.includes("محافظة")) colGov = i;
      }
      isFirst = false;
      continue;
    }

    const phone = (fields[colPhone] ?? "").trim();
    const name = (fields[colName] ?? "").trim();
    const gov = (fields[colGov] ?? "").trim();
    const wilayat = (fields[colWilayat] ?? "").trim();
    const village = (fields[colVillage] ?? "").trim();

    if (!name) continue;

    const govKey = governorateKey(gov);
    const fp = fingerprint(name, govKey, wilayat, village);
    if (phone) map.set(fp, phone);
  }

  return map;
}

async function main() {
  console.log("[phone-update] Reading CSV...");
  const phoneMap = await readCsv();
  console.log(`[phone-update] CSV: ${phoneMap.size} rows with phone numbers`);

  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Fetch all centres
  const [rows] = await conn.query(
    "SELECT id, source_fingerprint, contact_number FROM sanad_intel_centers"
  );
  console.log(`[phone-update] DB: ${rows.length} centres`);

  // Build update pairs: {id, phone} for rows that need updating
  const toUpdate = [];
  let skipped = 0;
  let notFound = 0;

  for (const row of rows) {
    const phone = phoneMap.get(row.source_fingerprint);
    if (!phone) {
      notFound++;
      continue;
    }
    if (row.contact_number === phone) {
      skipped++;
      continue;
    }
    toUpdate.push({ id: row.id, phone });
  }

  console.log(`[phone-update] To update: ${toUpdate.length}, already correct: ${skipped}, no match: ${notFound}`);

  if (toUpdate.length === 0) {
    console.log("[phone-update] Nothing to update.");
    await conn.end();
    return;
  }

  // Bulk update using a single INSERT ... ON DUPLICATE KEY UPDATE via temp table approach
  // Or use chunked UPDATE with CASE WHEN
  const CHUNK_SIZE = 200;
  let totalUpdated = 0;

  for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
    const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
    const caseClause = chunk.map(() => "WHEN id = ? THEN ?").join(" ");
    const ids = chunk.map((r) => r.id);
    const params = chunk.flatMap((r) => [r.id, r.phone]);

    const sql = `UPDATE sanad_intel_centers SET contact_number = CASE ${caseClause} END WHERE id IN (${ids.map(() => "?").join(",")})`;
    const [result] = await conn.query(sql, [...params, ...ids]);
    totalUpdated += result.affectedRows;
    process.stdout.write(`\r[phone-update] Updated ${totalUpdated}/${toUpdate.length}...`);
  }

  await conn.end();
  console.log(`\n[phone-update] Done! Updated ${totalUpdated} centres with phone numbers.`);
}

main().catch((e) => {
  console.error("[phone-update] ERROR:", e.message);
  process.exit(1);
});
