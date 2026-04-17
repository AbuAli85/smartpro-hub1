import fs from 'fs';
const journal = JSON.parse(fs.readFileSync('drizzle/meta/_journal.json','utf8'));
const applied = new Set(journal.entries.map(e => e.tag));
const sqlFiles = fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).map(f => f.replace('.sql','')).sort();
const pending = sqlFiles.filter(f => !applied.has(f));
console.log('Applied migrations:', journal.entries.length);
console.log('Total SQL files:', sqlFiles.length);
if (pending.length > 0) {
  console.log('PENDING:', pending.join(', '));
} else {
  console.log('Pending: none');
}
