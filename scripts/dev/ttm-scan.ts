// Sanity scan of trailing-twelve-month figures across public/data: coverage and outliers against the last fiscal year.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { extractHistoricals, latest } from '../../src/lib/finance/extract';
import type { LineItem } from '../../src/lib/finance/types';
const D = join(process.cwd(), 'public', 'data', 'companies');
let n = 0, withTtm = 0, withPrior = 0;
const odd: string[] = [];
const missing: Record<string, number> = {};
for (const f of readdirSync(D)) {
  const c = JSON.parse(readFileSync(join(D, f), 'utf8'));
  const h = extractHistoricals(c.facts);
  n++;
  if (!h.ttm) continue;
  withTtm++;
  if (h.ttm.prior?.revenue) withPrior++;
  for (const k of ['revenue', 'netIncome', 'operatingIncome', 'equity', 'debt', 'cash', 'da', 'capex'] as LineItem[]) {
    const t = h.ttm.items[k]?.value, a = latest(h, k);
    if (a != null && t == null) missing[k] = (missing[k] ?? 0) + 1;
    if (t == null || a == null || !a) continue;
    const r = t / a;
    const lim = k === 'revenue' ? [0.75, 1.6] : k === 'equity' ? [0.5, 2] : null;
    if (lim && (r < lim[0] || r > lim[1])) odd.push(`${c.ticker} ${k} ${(a / 1e6).toFixed(0)} -> ${(t / 1e6).toFixed(0)}`);
  }
}
console.log(`companies ${n}, with TTM ${withTtm}, with prior-year TTM ${withPrior}`);
console.log('annual item present but TTM missing:', missing);
console.log('outliers:\n' + odd.join('\n'));
