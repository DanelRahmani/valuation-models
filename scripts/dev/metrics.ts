/** Write public/data/metrics.json from the current company files: npx tsx scripts/dev/metrics.ts */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMetrics } from '../snapshot/metrics';
const dir = join(process.cwd(), 'public', 'data');
const market = JSON.parse(readFileSync(join(dir, 'market.json'), 'utf8'));
const companies = readdirSync(join(dir, 'companies')).map((f) => JSON.parse(readFileSync(join(dir, 'companies', f), 'utf8')));
const m = buildMetrics(companies, market);
writeFileSync(join(dir, 'metrics.json'), JSON.stringify(m));
console.log('metrics', m.companies.length, 'rows', (JSON.stringify(m).length / 1024).toFixed(0), 'KB');
