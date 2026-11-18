// Every NVIDIA figure quoted in the blog post "One company, six answers", on the TTM (10-Q) or 10-K basis.
// Usage: npx tsx scripts/dev/post-numbers.ts [ttm|fy] [TICKER]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { companyDefaults } from '../../src/lib/valuate';
import { runAll, avgGrowth5 } from '../../src/lib/finance/run';

const basis = (process.argv[2] ?? 'ttm') as 'fy' | 'ttm';
const t = process.argv[3] ?? 'NVDA';
const D = join(process.cwd(), 'public', 'data');
const market = JSON.parse(readFileSync(join(D, 'market.json'), 'utf8'));
const company = JSON.parse(readFileSync(join(D, 'companies', `${t}.json`), 'utf8'));
const d = companyDefaults(company, market, undefined, basis);
const out = runAll(d.h, d.a, d.src);
const v = out.values;
const i = v.inputs;
const px = i.price!;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log(`basis ${d.a.basis} (${d.h.ttm ? `TTM to ${d.h.ttm.end}` : 'no TTM'}), price ${px} (${company.price.date}), beta method ${d.betaChoice}`);
for (const r of out.results)
  console.log(`  ${r.id.padEnd(13)} ${r.status === 'ok' && r.perShare != null ? `$${r.perShare.toFixed(2)}  ${((r.perShare / px - 1) * 100).toFixed(0)}%` : `${r.status}: ${r.message?.slice(0, 100)}`}`);
const four = ['fcff', 'fcfe', 'apv', 'ri'].map((id) => out.results.find((r) => r.id === id)!.perShare!);
console.log(`four agree within ${pct(Math.max(...four) / Math.min(...four) - 1)}`);
const rev = v.sheets.FCFF.revenue;
const g5 = avgGrowth5(v)!;
console.log(`latest growth ${pct(d.a.g1)}; model avg growth yrs 1-5 ${pct(g5)}; revenue x${(rev[5]! / rev[0]!).toFixed(1)} in 5 yrs`);
console.log(`reverse DCF ${pct(out.reverse.growth!)} at margin ${pct(d.a.margin0!)}; gap ${((out.reverse.growth! - g5) * 100).toFixed(1)} points`);
const b = company.beta;
const lo = b.beta - 1.96 * b.se;
const hi = b.beta + 1.96 * b.se;
console.log(`regression beta ${b.beta.toFixed(2)} (95% ${lo.toFixed(2)} to ${hi.toFixed(2)}), blume ${b.blume.toFixed(2)}, used ${d.a.beta.toFixed(2)}, re ${pct(i.re!)}`);
console.log(`re over the adjusted-beta range ${pct(i.rf! + (0.67 * lo + 0.33) * i.erp!)} to ${pct(i.rf! + (0.67 * hi + 0.33) * i.erp!)}`);
console.log(`dividends / earnings ${pct(d.a.payout)}; total payout ${pct(d.a.totalPayout ?? 0)}`);
