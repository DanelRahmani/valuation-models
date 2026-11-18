// Why does a company's FCFF value move between the 10-K and TTM bases? Swaps one input group at a time from FY to TTM.
// Usage: npx tsx scripts/dev/why-value.ts [TICKER]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { companyDefaults } from '../../src/lib/valuate';
import { runAll, avgGrowth5 } from '../../src/lib/finance/run';
import type { Assumptions } from '../../src/lib/finance/assumptions';

const t = process.argv[2] ?? 'NVDA';
const D = join(process.cwd(), 'public', 'data');
const market = JSON.parse(readFileSync(join(D, 'market.json'), 'utf8'));
const company = JSON.parse(readFileSync(join(D, 'companies', `${t}.json`), 'utf8'));
const fy = companyDefaults(company, market, undefined, 'fy');
const tt = companyDefaults(company, market, undefined, 'ttm');
const run = (a: Assumptions, h = tt.h) => {
  const o = runAll(h, a, tt.src);
  const v = o.values.sheets.FCFF;
  return { ps: o.results.find((r) => r.id === 'fcff')!.perShare!, rev5: v.revenue[5]!, rev10: v.revenue[10]!, ebit10: v.ebit?.[10] ?? null, g5: avgGrowth5(o.values)!, tv: v.tv_share?.[0] };
};
const show = (label: string, a: Assumptions, h = tt.h) => {
  const r = run(a, h);
  console.log(`${label.padEnd(44)} $${r.ps.toFixed(0).padStart(4)}  avg g 1-5 ${(r.g5 * 100).toFixed(1)}%  revenue yr5 $${(r.rev5 / 1e3).toFixed(0)}B  yr10 $${(r.rev10 / 1e3).toFixed(0)}B`);
};
const f = fy.a;
const x = tt.a;
console.log(`FY: rev0 ${f.rev0?.toFixed(0)} g1 ${(f.g1 * 100).toFixed(1)}% margin ${(f.margin0! * 100).toFixed(1)}% | TTM: rev0 ${x.rev0?.toFixed(0)} g1 ${(x.g1 * 100).toFixed(1)}% margin ${(x.margin0! * 100).toFixed(1)}%`);
show('10-K basis', f, fy.h);
show('10-K + TTM revenue base only', { ...f, rev0: x.rev0 }, fy.h);
show('10-K + TTM revenue base and growth', { ...f, rev0: x.rev0, g1: x.g1 }, fy.h);
show('10-K + TTM revenue, growth and margin', { ...f, rev0: x.rev0, g1: x.g1, margin0: x.margin0, marginTarget: x.marginTarget }, fy.h);
show('TTM basis (all)', x);
show('TTM, but growth starts from FY growth', { ...x, g1: f.g1 });
show('TTM, base-rate growth path', { ...x, growthMode: 'base' });
show('TTM, margin fades to 45% over 5 yrs', { ...x, marginTarget: 0.45, marginYears: 5 });
