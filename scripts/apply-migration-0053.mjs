import { createConnection } from "mysql2/promise";

const conn = await createConnection(process.env.DATABASE_URL);

await conn.execute(`CREATE TABLE IF NOT EXISTS \`customer_invoice_links\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`customer_account_id\` int NOT NULL,
  \`invoice_id\` int NOT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT (now()),
  \`updated_at\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`customer_invoice_links_id\` PRIMARY KEY(\`id\`),
  UNIQUE KEY \`uq_cil_account_invoice\` (\`customer_account_id\`,\`invoice_id\`),
  KEY \`idx_cil_account\` (\`customer_account_id\`),
  KEY \`idx_cil_invoice\` (\`invoice_id\`)
)`);

console.log("✓ customer_invoice_links created/verified");
await conn.end();
console.log("Migration 0053 applied successfully.");
