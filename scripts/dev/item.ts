// Print one line item with its tags for the last 3 years: npx tsx scripts/dev/item.ts AMD debt
import { readFileSync } from 'node:fs';
import { extractHistoricals } from '../../src/lib/finance/extract';
const [t, item] = process.argv.slice(2);
const h = extractHistoricals(JSON.parse(readFileSync(`public/data/companies/${t}.json`, 'utf8')).facts);
for (const v of (h.items as any)[item].slice(-3)) console.log(v ? `${v.end} ${(v.value / 1e6).toFixed(0)} ${v.tag}` : '-');
