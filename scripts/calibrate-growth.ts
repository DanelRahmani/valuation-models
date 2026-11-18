/**
 * Backtest behind the "base rates" growth path (GROWTH_CAL in src/lib/finance/assumptions.ts). Run locally:
 *   npx tsx scripts/calibrate-growth.ts   (from the repository root)
 *
 * For every non-financial company in public/data/companies, it measures how much of a year's revenue growth above the
 * cross-company median survives k years later: the slope of (g[t+k] - median[t+k]) on (g[t] - median[t]), pooled over
 * companies and years. Growth is winsorised to [-50%, +100%] so a merger year cannot dominate. It prints:
 * - the median growth per year (the "typical" rate),
 * - the k-year persistence for all years, and without the 2020-22 COVID swing,
 * - the same for companies growing above 20%.
 * Read the output and update GROWTH_CAL by hand; nothing is written.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { extractHistoricals } from '../src/lib/finance/extract';
import { isFinancialFirm } from '../src/lib/finance/assumptions';

const DIR = join(process.cwd(), 'public', 'data', 'companies');
const W = (g: number) => Math.max(-0.5, Math.min(1, g));
const median = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
const slope = (x: number[], y: number[]) => {
  const mx = x.reduce((s, v) => s + v, 0) / x.length;
  const my = y.reduce((s, v) => s + v, 0) / y.length;
  let sxy = 0;
  let sxx = 0;
  x.forEach((v, i) => {
    sxy += (v - mx) * (y[i] - my);
    sxx += (v - mx) ** 2;
  });
  return sxy / sxx;
};

const series: Map<number, number>[] = [];
for (const f of readdirSync(DIR)) {
  const c = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  if (isFinancialFirm(c.subIndustry)) continue;
  const h = extractHistoricals(c.facts);
  const rev = h.items.revenue ?? [];
  const m = new Map<number, number>();
  for (let i = 1; i < rev.length; i++) {
    const a = rev[i - 1]?.value;
    const b = rev[i]?.value;
    if (a && b && a > 0 && b > 0) m.set(h.years[i], b / a - 1);
  }
  series.push(m);
}

const byYear = new Map<number, number[]>();
for (const m of series) for (const [y, g] of m) (byYear.get(y) ?? byYear.set(y, []).get(y)!).push(g);
// Years with too few filers (the first year of data, or a year only early filers have reported) are left out.
const yMed = new Map([...byYear].filter(([, v]) => v.length >= 100).map(([y, v]) => [y, median(v)]));
const years = [...yMed.keys()].sort();
console.log(`${series.length} non-financial companies, ${years[0]}-${years.at(-1)}`);
console.log(`Typical (median) growth by year: ${years.map((y) => `${y} ${(yMed.get(y)! * 100).toFixed(1)}%`).join(', ')}`);
console.log(`Typical growth, median of the yearly medians: ${(median([...yMed.values()]) * 100).toFixed(1)}%\n`);

const covid = (y: number) => y >= 2020 && y <= 2022;
for (const k of [1, 2, 3, 4, 5]) {
  const all: [number[], number[]] = [[], []];
  const calm: [number[], number[]] = [[], []];
  const fast: [number[], number[]] = [[], []];
  for (const m of series)
    for (const [y, g] of m) {
      const g2 = m.get(y + k);
      if (g2 == null || !yMed.has(y) || !yMed.has(y + k)) continue;
      const dx = W(g) - yMed.get(y)!;
      const dy = W(g2) - yMed.get(y + k)!;
      all[0].push(dx), all[1].push(dy);
      if (!covid(y) && !covid(y + k)) calm[0].push(dx), calm[1].push(dy);
      if (g > 0.2) fast[0].push(dx), fast[1].push(dy);
    }
  const s = (p: [number[], number[]]) => (p[0].length >= 30 ? `${slope(...p).toFixed(2)} (n=${p[0].length})` : `– (n=${p[0].length})`);
  console.log(`Excess growth left after ${k} year${k > 1 ? 's' : ''}: all ${s(all)} | without 2020-22 ${s(calm)} | growing >20% ${s(fast)}`);
}
