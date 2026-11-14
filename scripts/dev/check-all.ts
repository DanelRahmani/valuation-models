/** Run the data checks on every company: npx tsx scripts/dev/check-all.ts [--json out.json] */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { checkCompany } from '../../src/lib/finance/checks';
import { extractHistoricals, trimCompanyfacts } from '../../src/lib/finance/extract';
import { defaultAssumptions, isFinancialFirm } from '../../src/lib/finance/assumptions';
const dir = 'public/data/companies';
const m = JSON.parse(readFileSync('public/data/market.json', 'utf8'));
const byId: Record<string, { error: string[]; warn: string[] }> = {};
const all: Record<string, unknown> = {};
for (const f of readdirSync(dir)) {
  const c = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  const t = trimCompanyfacts(c.facts);
  const h = extractHistoricals(t);
  const financial = isFinancialFirm(c.subIndustry);
  const { a } = defaultAssumptions(h, { price: c.price?.close ?? null, rf: m.rf, erp: m.erp, marketCap: c.marketCap ?? null, subIndustry: c.subIndustry });
  const issues = checkCompany(h, t, { financial, price: c.price?.close, marketCap: c.marketCap?.value, sharesUsed: a.shares ? a.shares * 1e6 : null, today: m.asOf });
  all[c.ticker] = issues;
  for (const i of issues) ((byId[i.id] ??= { error: [], warn: [] })[i.severity]).push(`${c.ticker}: ${i.message}`);
}
for (const [id, v] of Object.entries(byId)) {
  console.log(`\n## ${id}  errors ${v.error.length}  warnings ${v.warn.length}`);
  for (const e of v.error.slice(0, 40)) console.log('  E', e);
  for (const w of v.warn.slice(0, 6)) console.log('  w', w);
}
const i = process.argv.indexOf('--json');
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(all, null, 1));
