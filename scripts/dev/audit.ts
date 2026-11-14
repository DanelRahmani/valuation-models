// Runs every snapshot company through the site's default flow and writes a diagnostics table.
// npx tsx scripts/dev/audit.ts [out.json] [--raw DIR]  (--raw: re-trim from full companyfacts files named TICKER.json)
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extractHistoricals } from '../../src/lib/finance/extract';
import { defaultAssumptions } from '../../src/lib/finance/assumptions';
import { runAll } from '../../src/lib/finance/run';
const m = JSON.parse(readFileSync('public/data/market.json', 'utf8'));
const dir = 'public/data/companies';
const rawDir = process.argv.includes('--raw') ? process.argv[process.argv.indexOf('--raw') + 1] : null;
const rows: any[] = [];
for (const f of readdirSync(dir)) {
  const c = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  const ind = m.industries.find((i: any) => i.name === c.industry);
  try {
    const rawPath = rawDir ? `${rawDir}/${c.ticker}.json` : null;
    const h = extractHistoricals(rawPath && existsSync(rawPath) ? JSON.parse(readFileSync(rawPath, 'utf8')) : c.facts);
    const { a, src } = defaultAssumptions(h, { price: c.price?.close ?? null, rf: m.rf, erp: m.erp, beta: c.beta ?? null, industryBetaU: ind?.unleveredBeta ?? null, industryFirms: ind?.firms ?? null, subIndustry: c.subIndustry, marketCap: c.marketCap ?? null });
    if (ind) a.peers = { pe: ind.pe, evEbitda: ind.evEbitda, evSales: ind.evSales, pb: ind.pb, peg: ind.peg };
    const o = runAll(h, a, src);
    const I = o.values.inputs;
    const r: any = { t: c.ticker, sector: c.sector, ind: c.industry, fy: h.years.at(-1), fyEnd: h.yearEnds.at(-1), price: c.price?.close, priceDate: c.price?.date,
      shares: I.shares, mcap: I.mcap, rev: I.rev_0, ebit: I.ebit_0, ni: I.ni_0, da: I.da_0, eq: I.equity_0, debt: a.debt, cash: I.cash, sti: I.sti,
      sharesSrc: src.shares, debtSrc: src.debt, ebitTag: h.items.operatingIncome?.at(-1)?.tag, revTag: h.items.revenue?.at(-1)?.tag,
      tax: I.tax, beta: I.beta_l, wacc: I.wacc, g1: I.g_stage1, margin: I.margin_0, daPct: I.da_pct, capexPct: I.capex_pct,
      missing: h.missing, tags: Object.fromEntries(Object.entries(h.items).map(([k, v]) => [k, v?.at(-1)?.tag ?? null])),
      lastEnds: Object.fromEntries(Object.entries(h.items).map(([k, v]) => [k, v?.at(-1)?.end ?? null])), srcTax: src.tax, warnings: o.warnings, reverse: o.reverse };
    for (const x of o.results) r[x.id] = x.status === 'ok' ? x.perShare : x.status;
    rows.push(r);
  } catch (e) { rows.push({ t: c.ticker, error: (e as Error).message }); }
}
writeFileSync(process.argv[2]?.startsWith('--') ? 'audit.json' : process.argv[2] ?? 'audit.json', JSON.stringify(rows, null, 1));
console.log('rows', rows.length, 'errors', rows.filter((r) => r.error).length);
