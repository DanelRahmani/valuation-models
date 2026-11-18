// Decompose the residual-income vs FCFE gap: cash (RI has it inside book, earning nothing) and terminal reinvestment.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractHistoricals } from '../../src/lib/finance/extract';
import { defaultAssumptions } from '../../src/lib/finance/assumptions';
import { runAll } from '../../src/lib/finance/run';
const D = join(process.cwd(), 'public', 'data');
const market = JSON.parse(readFileSync(join(D, 'market.json'), 'utf8'));
for (const t of (process.argv[2] ?? 'O,NEE,UAL,AMT,XOM,COST,PLTR,NVDA,KO').split(',')) {
  const c = JSON.parse(readFileSync(join(D, 'companies', `${t}.json`), 'utf8'));
  const h = extractHistoricals(c.facts);
  const ind = market.industries.find((i: any) => i.name === c.industry);
  const { a, src } = defaultAssumptions(h, { price: c.price?.close ?? null, rf: market.rf, erp: market.erp, beta: c.beta ?? null, industryBetaU: ind?.unleveredBeta ?? null, industryFirms: ind?.firms ?? null, subIndustry: c.subIndustry ?? null, marketCap: c.marketCap ?? null });
  const o = runAll(h, a, src);
  const v = o.values;
  const F = v.sheets.FCFE, R = v.sheets.ResidualIncome, i = v.inputs;
  const N = 10;
  const eqF = F.equity[0]!, eqR = R.equity[0]!;
  const cash = (i.cash ?? 0) + (i.sti ?? 0);
  const term = R.pv_tv[N]! + F.df[N]! * R.book[N]! - F.pv_tv[N]!;
  const g = i.g_terminal!;
  const reinv = F.ni[N]! - F.fcfe[N]!;
  console.log(`${t}: FCFE ${eqF.toFixed(0)} RI ${eqR.toFixed(0)} gap ${(eqR - eqF).toFixed(0)} = -cash ${(-cash).toFixed(0)} + terminal ${term.toFixed(0)} (resid ${(eqR - eqF + cash - term).toFixed(1)}) | yr10 equity reinvest ${reinv.toFixed(0)} vs g*book ${(g * R.book[N - 1]!).toFixed(0)}  book0 ${R.book[0]!.toFixed(0)} ni1 ${F.ni[1]!.toFixed(0)}`);
}
