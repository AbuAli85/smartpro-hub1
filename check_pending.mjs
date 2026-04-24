import fs from 'fs';
const journal = JSON.parse(fs.readFileSync('drizzle/meta/_journal.json','utf8'));
const journalTags = new Set(journal.entries.map(e => e.tag));
const sqlFiles = fs.readdirSync('drizzle').filter(f => f.match(/^\d+_.*\.sql$/)).map(f => f.replace('.sql',''));
const pending = sqlFiles.filter(f => !journalTags.has(f));
console.log('Pending migrations:', pending.length ? JSON.stringify(pending) : 'None');
console.log('Total SQL files:', sqlFiles.length);
console.log('Total journal entries:', journal.entries.length);
