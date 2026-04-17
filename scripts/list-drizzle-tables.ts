/**
 * One-off: list SQL table names from drizzle/schema (same logic as schemaDriftGuard).
 */
import * as schema from "../drizzle/schema";

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

const tables: string[] = [];
for (const [, exportVal] of Object.entries(schema)) {
  const name = extractTableName(exportVal);
  if (name) tables.push(name);
}
tables.sort();
console.log(JSON.stringify({ count: tables.length, tables }, null, 2));
