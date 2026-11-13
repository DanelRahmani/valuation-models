import { readFileSync } from 'node:fs';
import { parsePriceCsv, regressBeta } from '../../src/lib/finance/capm';
const [s, m] = process.argv.slice(2).map((p) => parsePriceCsv(readFileSync(p, 'utf8')));
for (const f of ['monthly', 'weekly'] as const) console.log(f, regressBeta(s, m, f).stats);
