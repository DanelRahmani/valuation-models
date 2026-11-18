// Print a company's revenue rows (all tags) from 2023 on, with filing dates, and its TTM windows.
import { readFileSync } from 'node:fs';
import { extractHistoricals, TAG_MAP } from '../../src/lib/finance/extract';
const t = process.argv[2];
const c = JSON.parse(readFileSync(`public/data/companies/${t}.json`, 'utf8'));
for (const tag of TAG_MAP.revenue) for (const r of c.facts.tags[tag] ?? []) if (r.start && r.end >= '2023-06') console.log(tag.slice(0, 22).padEnd(22), r.start, r.end, r.form.padEnd(5), r.filed, (r.val / 1e9).toFixed(2));
const h = extractHistoricals(c.facts);
console.log('ttm', h.ttm?.items.revenue?.value! / 1e9, 'prior', h.ttm?.prior?.revenue?.value! / 1e9, h.ttm?.prior?.revenue?.end);
