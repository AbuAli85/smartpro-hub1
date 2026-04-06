import mysql from "mysql2/promise";
import { randomUUID } from "crypto";

const baseUrl = process.env.DATABASE_URL.split("?")[0];
const conn = await mysql.createConnection({
  uri: baseUrl,
  ssl: { rejectUnauthorized: false },
});

const TEMPLATE_KEY = "promoter_assignment_contract_bilingual";
const GOOGLE_DOC_ID = "1dG719K4jYFrEh8O9VChyMYWblflxW2tdFp2n4gpVhs0";

// Check if already seeded
const [existing] = await conn.execute(
  "SELECT id FROM document_templates WHERE `key` = ? AND company_id = 0 LIMIT 1",
  [TEMPLATE_KEY]
);
if (existing.length > 0) {
  console.log("Template already seeded, id:", existing[0].id);
  await conn.end();
  process.exit(0);
}

const templateId = randomUUID();
await conn.execute(
  `INSERT INTO document_templates
    (id, company_id, \`key\`, name, category, entity_type, document_source, google_doc_id, language, version, status, output_formats)
   VALUES (?, 0, ?, ?, 'contract', 'promoter_assignment', 'google_docs', ?, 'ar-en', 1, 'active', JSON_ARRAY('pdf'))`,
  [templateId, TEMPLATE_KEY, "Promoter Assignment Contract - Bilingual", GOOGLE_DOC_ID]
);
console.log("Template inserted:", templateId);

const placeholders = [
  ["first_party_name_ar",  "First party (AR)",  "first_party.company_name_ar", "string"],
  ["first_party_name_en",  "First party (EN)",  "first_party.company_name_en", "string"],
  ["first_party_crn",      "First party CR",    "first_party.cr_number",       "string"],
  ["second_party_name_ar", "Second party (AR)", "second_party.company_name_ar","string"],
  ["second_party_name_en", "Second party (EN)", "second_party.company_name_en","string"],
  ["second_party_crn",     "Second party CR",   "second_party.cr_number",      "string"],
  ["location_ar",          "Location AR",       "assignment.location_ar",      "string"],
  ["location_en",          "Location EN",       "assignment.location_en",      "string"],
  ["promoter_name_ar",     "Promoter name AR",  "promoter.full_name_ar",       "string"],
  ["promoter_name_en",     "Promoter name EN",  "promoter.full_name_en",       "string"],
  ["id_card_number",       "ID card number",    "promoter.id_card_number",     "string"],
  ["contract_start_date",  "Start date",        "assignment.start_date",       "date"],
  ["contract_end_date",    "End date",          "assignment.end_date",         "date"],
];

for (const [placeholder, label, sourcePath, dataType] of placeholders) {
  await conn.execute(
    `INSERT INTO document_template_placeholders
      (id, template_id, placeholder, label, source_path, data_type, required)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [randomUUID(), templateId, placeholder, label, sourcePath, dataType]
  );
  console.log("  Placeholder seeded:", placeholder, "→", sourcePath);
}

await conn.end();
console.log("Done — 13 placeholders registered for template", TEMPLATE_KEY);
