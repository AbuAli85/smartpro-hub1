import { readFile, writeFile } from 'fs/promises';

const raw = await readFile('data/sanad-intelligence/import/MostUsedServices.json', 'utf8');
const data = JSON.parse(raw);

// Row 0 is header: { 'Most used...': 'Year/عام', 'Column2': 'Entities/جهات', 'Column4': 'Services/خدمات', 'Column6': 'Count/عد' }
// Row 1+: { 'Most used...': 2025, 'Column2': 'Ministry of Health', 'Column3': 'وزارة الصحة', 'Column4': 'Renew - Labour...', 'Column5': '...', 'Column6': 166597 }

const yearCol = Object.keys(data[0])[0];
const entityEnCol = 'Column2';
const entityArCol = 'Column3';
const serviceEnCol = 'Column4';
const serviceArCol = 'Column5';
const countCol = 'Column6';

const reshaped = {};
let currentYear = null;

for (let i = 1; i < data.length; i++) {
  const row = data[i];
  const yearVal = row[yearCol];
  if (yearVal && typeof yearVal === 'number' && yearVal >= 2000 && yearVal <= 2100) {
    currentYear = yearVal;
  }
  if (currentYear === null) continue;

  const count = parseFloat(row[countCol] || 0);
  if (Number.isNaN(count) || count <= 0) continue;

  if (reshaped[currentYear] === undefined) reshaped[currentYear] = [];
  reshaped[currentYear].push({
    rank: reshaped[currentYear].length + 1,
    serviceNameEn: String(row[serviceEnCol] || '').trim(),
    serviceNameAr: String(row[serviceArCol] || '').trim(),
    authorityNameEn: String(row[entityEnCol] || '').trim(),
    authorityNameAr: String(row[entityArCol] || '').trim(),
    demandVolume: count,
  });
}

await writeFile('data/sanad-intelligence/import/MostUsedServices.json', JSON.stringify(reshaped, null, 2));
const totalRows = Object.values(reshaped).reduce((s, arr) => s + arr.length, 0);
console.log('MostUsedServices reshaped:', Object.keys(reshaped).length, 'years,', totalRows, 'service rows');
console.log('Years:', Object.keys(reshaped));
