/** Distribution of multiples value / price across all companies: npx tsx scripts/dev/multiples-all.ts */
import { readFileSync, readdirSync } from 'node:fs';
import { companyDefaults } from '../../src/lib/valuate';
import { runAll } from '../../src/lib/finance/run';
const market = JSON.parse(readFileSync('public/data/market.json', 'utf8'));
const b = { lt033: [] as string[], ok: 0, gt3: [] as string[], single: 0, none: 0 };
for (const f of readdirSync('public/data/companies')) {
  const c = JSON.parse(readFileSync(`public/data/companies/${f}`, 'utf8'));
  const d = companyDefaults(c, market);
  const r = runAll(d.h, d.a, d.src).results.find((x) => x.id === 'multiples')!;
  if (r.sheet.message?.startsWith('Based on one')) b.single++;
  if (r.perShare == null || !c.price) { b.none++; continue; }
  const q = r.perShare / c.price.close;
  if (q < 0.33) b.lt033.push(`${c.ticker}(${q.toFixed(2)})`);
  else if (q > 3) b.gt3.push(`${c.ticker}(${q.toFixed(2)})`);
  else b.ok++;
}
console.log('within 0.33-3x:', b.ok, '| one multiple only:', b.single, '| no value:', b.none);
console.log('>3x', b.gt3.length, b.gt3.join(' '));
console.log('<0.33x', b.lt033.length, b.lt033.join(' '));
