// Mirrors ValueApp's default flow for a snapshot ticker: node scripts/dev/site-check.ts AMD [--inputs]
import { readFileSync } from 'node:fs';
import { extractHistoricals } from '../../src/lib/finance/extract';
import { defaultAssumptions } from '../../src/lib/finance/assumptions';
import { runAll } from '../../src/lib/finance/run';
const t = process.argv[2];
const c = JSON.parse(readFileSync(`public/data/companies/${t}.json`, 'utf8'));
const m = JSON.parse(readFileSync('public/data/market.json', 'utf8'));
const ind = m.industries.find((i: any) => i.name === c.industry);
const h = extractHistoricals(c.facts);
const { a, src } = defaultAssumptions(h, { price: c.price?.close ?? null, rf: m.rf, erp: m.erp, beta: c.beta ?? null, industryBetaU: ind?.unleveredBeta ?? null, industryFirms: ind?.firms ?? null, subIndustry: c.subIndustry, marketCap: c.marketCap ?? null });
if (ind) a.peers = { pe: ind.pe, evEbitda: ind.evEbitda, evSales: ind.evSales, pb: ind.pb, peg: ind.peg };

const o = runAll(h, a, src);
if (process.argv.includes('--inputs')) { console.log(JSON.stringify(h, null, 0).slice(0, 4000)); console.log(o.values.inputs); }
console.log(t, 'price', c.price?.close, 'beta', c.beta?.beta, 'industry', c.industry);
for (const r of o.results) console.log(' ', r.id.padEnd(12), r.status.padEnd(12), r.perShare?.toFixed(2) ?? '-', r.message ?? '');
console.log(' warnings', o.warnings);
