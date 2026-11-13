import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractHistoricals } from '../src/lib/finance/extract';

describe('extract', () => {
  it('nvda revenue extracted from fixture', () => {
    const json = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'nvda.json'), 'utf8'));
    const h = extractHistoricals(json);
    const idx = h.years.indexOf(2025);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(h.items.revenue![idx]?.value).toBe(130497000000);
    expect(h.items.revenue![idx]?.tag).toBe('Revenues');
  });
});
