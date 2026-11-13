import { readFileSync } from 'node:fs';
import { extractHistoricals, trimCompanyfacts } from '../../src/lib/finance/extract';
const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const t = trimCompanyfacts(raw);
console.log('trimmed bytes', JSON.stringify(t).length);
const h = extractHistoricals(raw);
console.log(h.name, h.years.join(','), 'missing:', h.missing.join(','));
for (const [k, v] of Object.entries(h.items)) console.log(k.padEnd(22), v!.slice(-4).map((x) => (x ? (x.value / 1e6).toFixed(0) : '-')).join('\t'), v!.at(-1)?.tag ?? '');
