/** Multiples model per company with the site's defaults: npx tsx scripts/dev/multiples-check.ts INTC PLTR KO */
import { readFileSync } from 'node:fs';
import { companyDefaults } from '../../src/lib/valuate';
import { runAll } from '../../src/lib/finance/run';
const market = JSON.parse(readFileSync('public/data/market.json', 'utf8'));
for (const t of process.argv.slice(2)) {
  const c = JSON.parse(readFileSync(`public/data/companies/${t}.json`, 'utf8'));
  const d = companyDefaults(c, market);
  const out = runAll(d.h, d.a, d.src);
  const r = out.results.find((x) => x.id === 'multiples')!;
  const v = out.values.sheets.Multiples;
  const rows = ['pe', 'ev_ebitda', 'ev_sales', 'pb', 'peg'].map((k) => `${k}=${v[k]?.[2] != null ? v[k][2]!.toFixed(0) : '–'}`).join(' ');
  console.log(t.padEnd(5), 'price', c.price.close, '| multiples', r.perShare?.toFixed(2), '|', rows, '| ev/sales mult', v.ev_sales?.[1]?.toFixed(2), r.sheet.message ?? '');
}
