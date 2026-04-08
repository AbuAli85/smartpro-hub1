/**
 * Build SanadCenterDirectory.csv from SanadCenterDirectory.json (array of row objects).
 * Skips trailing template rows where the contact field is non-numeric text.
 *
 * Run: node scripts/json-to-sanad-directory-csv.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "../data/sanad-intelligence/import");
const jsonPath = path.join(dir, "SanadCenterDirectory.json");
const csvPath = path.join(dir, "SanadCenterDirectory.csv");

function esc(cell) {
  const s = String(cell ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function contactKey(obj) {
  return Object.keys(obj).find((k) => /رقم الاتصال|contact number/i.test(k)) ?? "";
}

function isDataRow(obj) {
  const k = contactKey(obj);
  if (!k) return false;
  const v = obj[k];
  if (typeof v === "number" && Number.isFinite(v)) return true;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return true;
  return false;
}

const raw = fs.readFileSync(jsonPath, "utf8").replace(/^\uFEFF/, "");
const rows = JSON.parse(raw);
if (!Array.isArray(rows)) throw new Error("Expected JSON array");

const header =
  "Contact Number/رقم الاتصال ,Contact Person /'الموظف المسؤول,SANAD Center Name /'مركز سند,Village/'قرية,Willayat/'ولاية,Governorate/'محافظة";

const keys = {
  contact: "Contact Number/رقم الاتصال ",
  person: "Contact Person /'الموظف المسؤول",
  center: "SANAD Center Name /'مركز سند",
  village: "Village/'قرية",
  wilayat: "Willayat/'ولاية",
  governorate: "Governorate/'محافظة",
};

const lines = [header];
let used = 0;
for (const obj of rows) {
  if (!obj || typeof obj !== "object") continue;
  if (!isDataRow(obj)) continue;
  const ck = contactKey(obj);
  let phone = obj[ck];
  if (typeof phone === "number") phone = String(Math.trunc(phone));
  else phone = String(phone ?? "").trim();

  const person = String(obj[keys.person] ?? "").trim();
  const center = String(obj[keys.center] ?? "").trim();
  const village = String(obj[keys.village] ?? "").trim();
  const wilayat = String(obj[keys.wilayat] ?? "").trim();
  const governorate = String(obj[keys.governorate] ?? "").trim();

  lines.push([phone, person, center, village, wilayat, governorate].map(esc).join(","));
  used++;
}

fs.writeFileSync(csvPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${used} data rows + header → ${csvPath}`);
