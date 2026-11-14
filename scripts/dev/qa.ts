/**
 * Run the snapshot's quality gate on the current public data and write public/data/qa.json:
 *   npx tsx scripts/dev/qa.ts [--ref-dir DIR]
 * --ref-dir: saved Nasdaq financials responses ({ fin: data }) named TICKER.json; otherwise fetched live.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gateFailures, loadExceptions, runQa } from '../snapshot/qa';
import * as S from '../snapshot/sources';
import type { CompanyFile } from '../../src/lib/finance/types';

const dir = join(process.cwd(), 'public', 'data');
const market = JSON.parse(readFileSync(join(dir, 'market.json'), 'utf8'));
const companies: CompanyFile[] = readdirSync(join(dir, 'companies')).map((f) => JSON.parse(readFileSync(join(dir, 'companies', f), 'utf8')));
const refDir = process.argv.includes('--ref-dir') ? process.argv[process.argv.indexOf('--ref-dir') + 1] : null;
const refs = new Map<string, S.NasdaqAnnual[] | null>();
for (const c of companies) {
  if (refDir) {
    const p = join(refDir, `${c.ticker}.json`);
    const fin = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).fin : null;
    refs.set(c.ticker, fin?.incomeStatementTable?.rows ? S.parseNasdaqFinancials(fin) : null);
  } else refs.set(c.ticker, await S.nasdaqFinancials(c.ticker).catch(() => null));
}
const qa = runQa(companies, market, refs, loadExceptions());
console.log(JSON.stringify(qa.summary, null, 1));
const byId: Record<string, number> = {};
for (const issues of Object.values(qa.companies)) for (const i of issues) byId[`${i.severity} ${i.id}`] = (byId[`${i.severity} ${i.id}`] ?? 0) + 1;
console.log(byId);
writeFileSync(join(dir, 'qa.json'), JSON.stringify(qa));
const fails = gateFailures(qa);
console.log(fails.length ? `GATE WOULD BLOCK:\n- ${fails.join('\n- ')}` : 'Gate passes: the snapshot would be published.');
