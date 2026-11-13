/** Re-apply guessIndustry to existing company files (after editing the FIXED map): npx tsx scripts/dev/remap-industries.ts */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { guessIndustry } from '../../src/lib/finance/industry';
const dir = join(process.cwd(), 'public', 'data', 'companies');
const names: string[] = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'market.json'), 'utf8')).industries.map((i: { name: string }) => i.name);
let changed = 0;
const unmatched = new Set<string>();
for (const f of readdirSync(dir)) {
  const p = join(dir, f);
  const c = JSON.parse(readFileSync(p, 'utf8'));
  const ind = guessIndustry(c.subIndustry, names) ?? '';
  if (!ind) unmatched.add(c.subIndustry);
  if (ind !== c.industry) {
    console.log(c.ticker.padEnd(6), c.subIndustry, ':', c.industry || '(none)', '->', ind || '(none)');
    c.industry = ind;
    writeFileSync(p, JSON.stringify(c));
    changed++;
  }
}
console.log('changed', changed, 'unmatched', [...unmatched]);
