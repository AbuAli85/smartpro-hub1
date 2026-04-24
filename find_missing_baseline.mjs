import { readFileSync } from 'fs';

const sql = readFileSync('drizzle/0070_drizzle_baseline_schema_recovery.sql', 'utf8');
const inBaseline = new Set([...sql.matchAll(/CREATE TABLE IF NOT EXISTS `([^`]+)`/g)].map(m => m[1]));

const schemaContent = readFileSync('drizzle/schema.ts', 'utf8');
const tableNames = [...schemaContent.matchAll(/mysqlTable\(['"]([^'"]+)['"]/g)].map(m => m[1]);
const inSchema = new Set(tableNames);

const missing = [...inSchema].filter(t => !inBaseline.has(t));
const extra = [...inBaseline].filter(t => !inSchema.has(t));
console.log('In schema but NOT in baseline:', missing);
console.log('In baseline but NOT in schema:', extra);
console.log('Schema count:', inSchema.size, 'Baseline count:', inBaseline.size);
