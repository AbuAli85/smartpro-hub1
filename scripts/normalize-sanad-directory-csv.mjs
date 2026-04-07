/**
 * One-off / repeatable: clean SanadCenterDirectory.csv (header, trim, whitespace).
 * Run: node scripts/normalize-sanad-directory-csv.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, "../data/sanad-intelligence/import/SanadCenterDirectory.csv");

function esc(cell) {
  const s = String(cell);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function normSpaces(s) {
  return s.replace(/\s+/g, " ").trim();
}

const raw = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
const lines = raw.split(/\r?\n/);

const header = [
  "Contact Number / رقم الاتصال",
  "Contact Person / الموظف المسؤول",
  "SANAD Center Name / مركز سند",
  "Village / قرية",
  "Willayat / ولاية",
  "Governorate / محافظة",
]
  .map(esc)
  .join(",");

const out = [header];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  const parts = line.split(",");
  if (parts.length !== 6) {
    console.error(`Bad column count at line ${i + 1}: expected 6 fields, got ${parts.length}`);
    process.exit(1);
  }
  out.push(parts.map(normSpaces).map(esc).join(","));
}

fs.writeFileSync(csvPath, `${out.join("\n")}\n`, "utf8");
console.log(`Wrote ${out.length} lines to ${csvPath}`);
