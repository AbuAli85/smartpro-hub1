/**
 * One-time / CI seed for platform document templates (Google Docs keys + placeholders).
 * Does not run during user-facing PDF generation.
 *
 *   npx tsx scripts/seed-document-templates.ts
 */
import { getDb } from "../server/db";
import { seedDocumentGenerationBootstrap } from "../server/modules/document-generation/documentGeneration.repository";

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("Database unavailable");
    process.exit(1);
  }
  await seedDocumentGenerationBootstrap(db);
  console.log("Document templates bootstrap completed (idempotent).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
