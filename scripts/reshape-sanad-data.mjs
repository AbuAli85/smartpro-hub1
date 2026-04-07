/**
 * Reshapes SANAD intelligence JSON files from transposed array format
 * (array of row objects with "Governorate" + year columns)
 * into the format expected by parseSources.ts
 * (object keyed by year, each value an object keyed by governorate)
 */
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'data', 'sanad-intelligence', 'import');

function normalizeYearKey(k) {
  // handles "2016", "2024.000", etc.
  const n = parseInt(String(k).replace(/\..*$/, ''), 10);
  return n >= 2000 && n <= 2100 ? n : null;
}

function getGovernorateLabel(row) {
  return (row['Governorate'] || row['محافظة'] || '').trim();
}

/**
 * Transposes array-of-rows into { year: { governorate: value } }
 */
function transposeToYearGov(rows, valueKey = null) {
  const out = {};
  for (const row of rows) {
    const gov = getGovernorateLabel(row);
    if (!gov) continue;
    for (const [k, v] of Object.entries(row)) {
      const year = normalizeYearKey(k);
      if (year === null) continue;
      const numVal = valueKey ? parseFloat(row[valueKey] || 0) : parseFloat(v);
      if (!isFinite(numVal)) continue;
      if (!out[year]) out[year] = {};
      out[year][gov] = numVal;
    }
  }
  return out;
}

async function reshapeTransactionStatistics() {
  const raw = await readFile(path.join(DIR, 'TransactionStatistics.json'), 'utf8');
  const data = JSON.parse(raw);
  // data is array of { "Governorate": "Muscat", "2016": 1910057, ... }
  const reshaped = transposeToYearGov(data);
  await writeFile(path.join(DIR, 'TransactionStatistics.json'), JSON.stringify(reshaped, null, 2));
  console.log('✓ TransactionStatistics reshaped:', Object.keys(reshaped).length, 'years');
}

async function reshapeSanadCenterIncome() {
  const raw = await readFile(path.join(DIR, 'SanadCenterIncome.json'), 'utf8');
  const data = JSON.parse(raw);
  // data has { Transactions: [...], Sheet1: [...] }
  const rows = data.Transactions || data.Sheet1 || data;
  const arr = Array.isArray(rows) ? rows : Object.values(rows);
  const reshaped = transposeToYearGov(arr);
  await writeFile(path.join(DIR, 'SanadCenterIncome.json'), JSON.stringify(reshaped, null, 2));
  console.log('✓ SanadCenterIncome reshaped:', Object.keys(reshaped).length, 'years');
}

async function reshapeSanadCenterEmployeesStatistics() {
  const raw = await readFile(path.join(DIR, 'SanadCenterEmployeesStatistics.json'), 'utf8');
  const data = JSON.parse(raw);
  // data is array of { "Governorate": "Muscat", "المالك/Owners": 123, "الموظفين/Staffs": 456 }
  // parseWorkforceByGovernorate expects { "Muscat": { ownerCount: 123, staffCount: 456 } }
  const reshaped = {};
  for (const row of data) {
    const gov = getGovernorateLabel(row);
    if (!gov) continue;
    const owners = parseFloat(
      row['المالك/Owners'] ?? row['Owners'] ?? row['Owner'] ?? row['أصحاب المراكز'] ?? 0
    );
    const staff = parseFloat(
      row['الموظفين/Staffs'] ?? row['Staffs'] ?? row['Staff'] ?? row['الموظفين'] ?? 0
    );
    reshaped[gov] = {
      ownerCount: isFinite(owners) ? owners : 0,
      staffCount: isFinite(staff) ? staff : 0,
      totalWorkforce: (isFinite(owners) ? owners : 0) + (isFinite(staff) ? staff : 0),
    };
  }
  await writeFile(path.join(DIR, 'SanadCenterEmployeesStatistics.json'), JSON.stringify(reshaped, null, 2));
  console.log('✓ SanadCenterEmployeesStatistics reshaped:', Object.keys(reshaped).length, 'governorates');
}

async function reshapeMostUsedServices() {
  const raw = await readFile(path.join(DIR, 'MostUsedServices.json'), 'utf8');
  const data = JSON.parse(raw);
  // data is array of rows with year column headers and service name columns
  // parseMostUsedServices expects { "2016": [ { rank, serviceNameAr, serviceNameEn, demandVolume }, ... ] }
  
  // First, find the header row to understand column structure
  // The file has rows like: { "Most used ten Services / العشر خدمات الأكثر استخداماً": "Year/عام", "Column2": ..., "Column4": ..., "Column6": ... }
  // Let's inspect the actual structure
  console.log('MostUsedServices sample row 0:', JSON.stringify(data[0]).slice(0, 300));
  console.log('MostUsedServices sample row 1:', JSON.stringify(data[1]).slice(0, 300));
  console.log('MostUsedServices sample row 2:', JSON.stringify(data[2]).slice(0, 300));
  
  // The structure appears to be a spreadsheet-style export where:
  // Row 0 is a header row with year values
  // Subsequent rows have service data
  // Let's try to parse it as-is and see what years are present
  const yearCols = {};
  for (const [k, v] of Object.entries(data[0] || {})) {
    const year = normalizeYearKey(v);
    if (year !== null) yearCols[k] = year;
  }
  console.log('Year columns found:', yearCols);
  
  // If no year columns found in header, try a different approach
  if (Object.keys(yearCols).length === 0) {
    // Maybe the data is already in a usable format or needs different parsing
    // Just write it as-is and let the import script handle it
    console.log('⚠ MostUsedServices: could not detect year columns, keeping as-is');
    return;
  }
  
  const reshaped = {};
  for (const [col, year] of Object.entries(yearCols)) {
    reshaped[year] = [];
  }
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const serviceNameKey = Object.keys(data[0])[0]; // first column = service name
    const serviceNameAr = String(row[serviceNameKey] || '').trim();
    for (const [col, year] of Object.entries(yearCols)) {
      const val = parseFloat(row[col] || 0);
      if (!isFinite(val) || val <= 0) continue;
      reshaped[year].push({
        rank: reshaped[year].length + 1,
        serviceNameAr,
        demandVolume: val,
      });
    }
  }
  
  await writeFile(path.join(DIR, 'MostUsedServices.json'), JSON.stringify(reshaped, null, 2));
  const totalRows = Object.values(reshaped).reduce((s, arr) => s + arr.length, 0);
  console.log('✓ MostUsedServices reshaped:', Object.keys(reshaped).length, 'years,', totalRows, 'service rows');
}

async function reshapeSanadCenterStatistics() {
  const raw = await readFile(path.join(DIR, 'SanadCenterStatistics.json'), 'utf8');
  const data = JSON.parse(raw);
  // data is array of { "Governorate": "Muscat", "Willayat": "...", "Village": "...", count fields }
  // parseGeographyRows expects nested: { "Muscat": { "Willayat": { "Village": count } } }
  // OR the flat array format may work with parseSanadCenterStatistics
  // Let's check what columns are present
  console.log('SanadCenterStatistics sample:', JSON.stringify(data[0]).slice(0, 300));
  console.log('SanadCenterStatistics sample 2:', JSON.stringify(data[1]).slice(0, 300));
  
  // Build nested structure: { governorate: { wilayat: { village: count } } }
  const reshaped = {};
  for (const row of data) {
    const gov = (row['Governorate'] || row['محافظة'] || '').trim();
    const wil = (row['Willayat'] || row['ولاية'] || row['Wilayat'] || '').trim();
    const vil = (row['Village'] || row['قرية'] || row['القرية'] || '').trim();
    // Find the count - look for numeric fields
    let count = 0;
    for (const [k, v] of Object.entries(row)) {
      if (k === 'Governorate' || k === 'محافظة' || k === 'Willayat' || k === 'ولاية' || k === 'Village' || k === 'قرية' || k === 'القرية') continue;
      const n = parseFloat(v);
      if (isFinite(n) && n > 0) { count = n; break; }
    }
    if (!gov) continue;
    if (!reshaped[gov]) reshaped[gov] = {};
    const wilKey = wil || '_';
    if (!reshaped[gov][wilKey]) reshaped[gov][wilKey] = {};
    const vilKey = vil || '_';
    reshaped[gov][wilKey][vilKey] = (reshaped[gov][wilKey][vilKey] || 0) + count;
  }
  
  await writeFile(path.join(DIR, 'SanadCenterStatistics.json'), JSON.stringify(reshaped, null, 2));
  console.log('✓ SanadCenterStatistics reshaped:', Object.keys(reshaped).length, 'governorates');
}

// Run all reshaping
try {
  await reshapeTransactionStatistics();
  await reshapeSanadCenterIncome();
  await reshapeSanadCenterEmployeesStatistics();
  await reshapeMostUsedServices();
  await reshapeSanadCenterStatistics();
  console.log('\n✅ All files reshaped. Ready to run pnpm sanad-intel:import');
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
}
