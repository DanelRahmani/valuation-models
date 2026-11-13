// Print 5 years of key lines: npx tsx scripts/dev/hist.ts KO [rawDir]   (rawDir: full companyfacts files named TICKER.json)
import { readFileSync } from 'node:fs';
import { extractHistoricals } from '../../src/lib/finance/extract';
const [t, raw] = process.argv.slice(2);
const h = extractHistoricals(raw ? JSON.parse(readFileSync(`${raw}/${t}.json`, 'utf8')) : JSON.parse(readFileSync(`public/data/companies/${t}.json`, 'utf8')).facts);
const keys = ['revenue', 'operatingIncome', 'impairments', 'netIncome', 'cfo', 'capex', 'da', 'debt', 'cash'] as const;
console.log(''.padEnd(16), h.years.slice(-5).map((y) => String(y).padStart(8)).join(''));
for (const k of keys) console.log(k.padEnd(16), (h.items[k] ?? []).slice(-5).map((v) => (v ? (v.value / 1e6).toFixed(0) : '-').padStart(8)).join(''));
