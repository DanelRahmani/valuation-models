// List companies whose newer 10-Q was rejected by the basis check (ttmSkipped).
import { readFileSync, readdirSync } from 'node:fs';
import { extractHistoricals } from '../../src/lib/finance/extract';
const out: string[] = [];
for (const f of readdirSync('public/data/companies')) {
  const c = JSON.parse(readFileSync(`public/data/companies/${f}`, 'utf8'));
  const h = extractHistoricals(c.facts);
  if (h.ttmSkipped) out.push(c.ticker);
}
console.log(`basis check rejected ${out.length}: ${out.join(', ')}`);
