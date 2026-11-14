/** Add Nasdaq market caps to existing company files without re-running prices: npx tsx scripts/dev/refresh-marketcap.ts [AMD,MSFT] */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as S from '../snapshot/sources';

const dir = join(process.cwd(), 'public', 'data', 'companies');
const only = process.argv[2]?.split(',');
const files = readdirSync(dir).filter((f) => !only || only.includes(f.replace(/\.json$/, '')));
let ok = 0;
for (let i = 0; i < files.length; i += 4) {
  await Promise.all(
    files.slice(i, i + 4).map(async (f) => {
      const p = join(dir, f);
      const c = JSON.parse(readFileSync(p, 'utf8'));
      try {
        const value = await S.retry(`${c.ticker} market cap`, () => S.nasdaqMarketCap(c.ticker), 2);
        c.marketCap = { value, date: c.price?.date ?? new Date().toISOString().slice(0, 10) };
        writeFileSync(p, JSON.stringify(c));
        ok++;
      } catch (e) {
        console.log('WARN', c.ticker, (e as Error).message);
      }
    }),
  );
  await S.sleep(300);
}
console.log('market caps', ok, '/', files.length);
