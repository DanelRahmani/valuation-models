/** Print every peer group so odd groupings can be spotted: npx tsx scripts/dev/peer-audit.ts */
import { readFileSync } from 'node:fs';
import { peerGroup } from '../../src/lib/finance/metrics';
const m = JSON.parse(readFileSync('public/data/metrics.json', 'utf8')).companies;
const groups = new Map<string, Set<string>>();
for (const c of m) {
  const g = peerGroup(c.ticker, m)!;
  const key = `${g.basis}: ${g.name}`;
  (groups.get(key) ?? groups.set(key, new Set()).get(key)!).add(c.ticker);
}
for (const [k, v] of [...groups].sort((a, b) => b[1].size - a[1].size)) console.log(String(v.size).padStart(3), k, '|', [...v].slice(0, 14).join(' '));
