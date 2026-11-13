/** Refresh Damodaran industry data in market.json only: npx tsx scripts/dev/refresh-industries.ts */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as S from '../snapshot/sources';
const p = join(process.cwd(), 'public', 'data', 'market.json');
const m = JSON.parse(readFileSync(p, 'utf8'));
m.industries = await S.retry('Damodaran industries', S.damodaranIndustries);
writeFileSync(p, JSON.stringify(m));
console.log('industries', m.industries.length);
