// Compare one company's key inputs on the trailing-twelve-month and fiscal-year bases. Usage: tsx basis-check.ts DATA_DIR TICKER[,TICKER]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractHistoricals } from '../../src/lib/finance/extract';
import { defaultAssumptions } from '../../src/lib/finance/assumptions';
const [dir, list] = process.argv.slice(2);
const market = JSON.parse(readFileSync(join(dir, 'market.json'), 'utf8'));
for (const t of list.split(',')) {
  const c = JSON.parse(readFileSync(join(dir, 'companies', `${t}.json`), 'utf8'));
  const h = extractHistoricals(c.facts);
  const ctx = { price: c.price?.close ?? null, rf: market.rf, erp: market.erp, subIndustry: c.subIndustry, marketCap: c.marketCap ?? null };
  console.log(`${t} FY${h.years.at(-1)} ttm ${h.ttm ? `${h.ttm.start}..${h.ttm.end}` : 'none'} mcap ${(c.marketCap?.value / 1e6).toFixed(0)} px ${c.price?.close}`);
  for (const b of ['ttm', 'fy'] as const) {
    const { a, src } = defaultAssumptions(h, ctx, b);
    console.log(`  ${b}: rev ${a.rev0?.toFixed(0)} ni ${a.ni0?.toFixed(0)} eq ${a.equity0?.toFixed(0)} debt ${a.debt.toFixed(0)} cash ${a.cash.toFixed(0)} g1 ${(a.g1 * 100).toFixed(1)}% shares ${a.shares?.toFixed(1)} (${src.shares})`);
  }
}
