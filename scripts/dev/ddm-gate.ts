// Companies whose dividend models the 1% yield gate switches off (they pass the 20% payout test).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { extractHistoricals } from '../../src/lib/finance/extract';
import { defaultAssumptions } from '../../src/lib/finance/assumptions';
import { MIN_DDM_PAYOUT, MIN_DDM_YIELD } from '../../src/lib/finance/run';
const D = join(process.cwd(), 'public', 'data');
const market = JSON.parse(readFileSync(join(D, 'market.json'), 'utf8'));
const off: string[] = [];
let on = 0;
for (const f of readdirSync(join(D, 'companies'))) {
  const c = JSON.parse(readFileSync(join(D, 'companies', f), 'utf8'));
  const { a } = defaultAssumptions(extractHistoricals(c.facts), { price: c.price?.close ?? null, rf: market.rf, erp: market.erp, subIndustry: c.subIndustry ?? null, marketCap: c.marketCap ?? null });
  if (!a.dps0 || !a.price || a.payout < MIN_DDM_PAYOUT) continue;
  const y = a.dps0 / a.price;
  if (y < MIN_DDM_YIELD) off.push(`${c.ticker} ${(y * 100).toFixed(2)}%`);
  else on++;
}
console.log(`dividend models still on: ${on}; switched off by the yield gate: ${off.length}\n${off.join(', ')}`);
