/**
 * Classifies Drizzle table exports by how often the symbol appears in files
 * that import from drizzle/schema (reduces false positives for short names).
 */
import { readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import * as schema from "../drizzle/schema";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["server", "client", "shared", "scripts"];

function extractTableName(tableObj: unknown): string | null {
  if (!tableObj || typeof tableObj !== "object") return null;
  for (const sym of Object.getOwnPropertySymbols(tableObj)) {
    if (sym.description === "drizzle:Name") {
      const val = (tableObj as Record<symbol, unknown>)[sym];
      if (typeof val === "string") return val;
    }
  }
  return null;
}

function walkTsFiles(dir: string, out: string[]): void {
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
      walkTsFiles(p, out);
    } else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) out.push(p);
  }
}

function isSchemaConsumer(source: string): boolean {
  return /from\s+["'][^"']*drizzle\/schema["']/.test(source);
}

function countWord(haystack: string, sym: string): number {
  const re = new RegExp(`\\b${sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
  let n = 0;
  while (re.exec(haystack) !== null) n++;
  return n;
}

function main(): void {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walkTsFiles(join(ROOT, d), files);

  const schemaFiles: { path: string; source: string }[] = [];
  for (const f of files) {
    const source = readFileSync(f, "utf8");
    if (isSchemaConsumer(source)) schemaFiles.push({ path: f, source });
  }

  const tableExports: { exportKey: string; sqlName: string }[] = [];
  for (const [exportKey, exportVal] of Object.entries(schema)) {
    const sqlName = extractTableName(exportVal);
    if (sqlName) tableExports.push({ exportKey, sqlName });
  }

  const rows: {
    exportKey: string;
    sqlName: string;
    refCount: number;
    fileHits: number;
  }[] = [];

  for (const { exportKey, sqlName } of tableExports) {
    let refCount = 0;
    let fileHits = 0;
    for (const { path, source } of schemaFiles) {
      const c = countWord(source, exportKey);
      if (c > 0) {
        refCount += c;
        fileHits++;
      }
    }
    rows.push({ exportKey, sqlName, refCount, fileHits });
  }

  rows.sort((a, b) => b.refCount - a.refCount);

  function tierOf(refCount: number): 1 | 2 | 3 {
    if (refCount === 0) return 3;
    if (refCount >= 20) return 1;
    if (refCount >= 5) return 2;
    return 3;
  }
  type Row = (typeof rows)[number];
  const byTier: { tier1: Row[]; tier2: Row[]; tier3: Row[] } = { tier1: [], tier2: [], tier3: [] };
  for (const r of rows) {
    const t = tierOf(r.refCount);
    if (t === 1) byTier.tier1.push(r);
    else if (t === 2) byTier.tier2.push(r);
    else byTier.tier3.push(r);
  }

  console.log(
    JSON.stringify(
      {
        totalTables: tableExports.length,
        schemaConsumerFiles: schemaFiles.length,
        tierCuts: { tier1: "refCount>=20", tier2: "5–19", tier3: "0–4 or 0 refs" },
        tierCounts: {
          tier1: byTier.tier1.length,
          tier2: byTier.tier2.length,
          tier3: byTier.tier3.length,
        },
        tier1: byTier.tier1.map((r) => r.sqlName),
        tier2: byTier.tier2.map((r) => r.sqlName),
        tier3: byTier.tier3.map((r) => r.sqlName),
        ranked: rows,
      },
      null,
      2,
    ),
  );
}

main();
