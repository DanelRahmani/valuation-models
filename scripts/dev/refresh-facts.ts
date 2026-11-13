/**
 * Re-trim SEC facts for existing company files without touching prices or betas
 * (use after adding tags to TAG_MAP). SEC_USER_AGENT="Name contact" npx tsx scripts/dev/refresh-facts.ts [AMD,MSFT] [--raw DIR]
 * --raw DIR re-trims from already downloaded companyfacts files named TICKER.json instead of calling the SEC.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractHistoricals, trimCompanyfacts } from '../../src/lib/finance/extract';
import * as S from '../snapshot/sources';

const rawDir = process.argv.includes('--raw') ? process.argv[process.argv.indexOf('--raw') + 1] : null;
const ua = process.env.SEC_USER_AGENT;
if (!ua && !rawDir) throw new Error('Set SEC_USER_AGENT');
const dir = join(process.cwd(), 'public', 'data', 'companies');
const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2].split(',') : undefined;
let ok = 0;
for (const f of readdirSync(dir)) {
  const p = join(dir, f);
  const c = JSON.parse(readFileSync(p, 'utf8'));
  if (only && !only.includes(c.ticker)) continue;
  try {
    const rawPath = rawDir ? join(rawDir, `${c.ticker}.json`) : null;
    const raw = rawPath && existsSync(rawPath) ? JSON.parse(readFileSync(rawPath, 'utf8')) : await S.retry(`SEC ${c.cik}`, () => S.secOne(ua!, c.cik));
    const t = trimCompanyfacts(raw);
    if (!extractHistoricals(t).years.length) throw new Error('no annual data');
    c.facts = t;
    writeFileSync(p, JSON.stringify(c));
    ok++;
  } catch (e) {
    console.log('WARN', c.ticker, (e as Error).message);
  }
  if (!rawDir) await S.sleep(150);
}
console.log('refreshed', ok);
