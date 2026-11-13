import { readFileSync, readdirSync } from 'node:fs';
import { extractHistoricals } from '../../src/lib/finance/extract';
for (const f of readdirSync('tests/fixtures/companies')) {
  const c = JSON.parse(readFileSync(`tests/fixtures/companies/${f}`, 'utf8'));
  const h = extractHistoricals(c.facts);
  const g = (k: string) => { const v = (h.items as any)[k]?.at(-1); return v ? `${(v.value / 1e6).toFixed(0)} [${v.tag.slice(0, 60)}]` : 'null'; };
  console.log(c.ticker, h.yearEnds.at(-1), '| rev', g('revenue'), '| ebit', g('operatingIncome'), '| ni', g('netIncome'), '| da', g('da'), '| debt', g('debt'), '| dil', g('dilutedShares'), '| latest', h.latestShares ? (h.latestShares.value / 1e6).toFixed(0) : null, '| imp', g('impairments'), '| capex', g('capex'));
}
