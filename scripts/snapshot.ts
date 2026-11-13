/**
 * Monthly data snapshot. Run by .github/workflows/snapshot.yml, or locally:
 *   SEC_USER_AGENT="Name contact@example.com" npx tsx scripts/snapshot.ts [--only NVDA,AAPL] [--skip-prices] [--facts-dir DIR]
 *
 * Writes public/data/{index.json, market.json, companies/*.json}. Raw prices are never written:
 * only beta statistics and the latest close. If too much fails, nothing is written and the exit code is 1.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trimCompanyfacts, extractHistoricals } from '../src/lib/finance/extract';
import { regressBeta, type PricePoint } from '../src/lib/finance/capm';
import { guessIndustry } from '../src/lib/finance/industry';
import type { CompanyFile, IndexFile, MarketFile, SnapshotBeta } from '../src/lib/finance/types';
import * as S from './snapshot/sources';

const OUT = join(process.cwd(), 'public', 'data');
const COMPANIES = join(OUT, 'companies');
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const only = arg('--only')?.split(',').map((s) => s.trim().toUpperCase());
const skipPrices = process.argv.includes('--skip-prices');
const factsDir = arg('--facts-dir');
const today = new Date().toISOString().slice(0, 10);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const readJson = <T>(p: string): T | null => (existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : null);
const fileFor = (t: string) => join(COMPANIES, `${t.replace(/[^A-Z0-9.-]/gi, '_')}.json`);

async function main() {
  const ua = process.env.SEC_USER_AGENT;
  if (!ua && !factsDir) throw new Error('Set SEC_USER_AGENT (e.g. "Valuation Models contact@example.com").');
  mkdirSync(COMPANIES, { recursive: true });
  const prevIndex = readJson<IndexFile>(join(OUT, 'index.json'));
  const prevMarket = readJson<MarketFile>(join(OUT, 'market.json'));

  /* 1. Constituents. */
  let list = await S.retry('S&P 500 list', S.sp500).catch((e) => {
    log('WARN', e.message, '- keeping previous list');
    if (!prevIndex) throw e;
    return prevIndex.companies;
  });
  if (only) list = list.filter((c) => only.includes(c.ticker));
  log(`Constituents: ${list.length}`);

  /* 2. Market-wide data: Treasury yield, ERP, Damodaran industries. Previous values on failure. */
  const rf = await S.retry('10y Treasury (treasury.gov)', S.treasuryGov10y, 2)
    .catch((e) => (log('WARN', e.message), S.retry('10y Treasury (FRED)', S.treasury10y, 2)))
    .catch((e) => {
      log('WARN', e.message, '- keeping previous rate');
      return prevMarket
        ? { rate: prevMarket.rf, date: prevMarket.rfDate, source: prevMarket.rfSource ?? 'previous run' }
        : { rate: 0.042, date: 'default', source: 'Default' };
    });
  const erp = await S.retry('ERP', S.damodaranErp).catch((e) => {
    log('WARN', e.message);
    return prevMarket ? { erp: prevMarket.erp, label: prevMarket.erpSource } : { erp: 0.045, label: 'Default 4.5%' };
  });
  const industries = await S.retry('Damodaran industries', S.damodaranIndustries).catch((e) => {
    log('WARN', e.message);
    return prevMarket?.industries ?? [];
  });
  const market: MarketFile = { asOf: today, rf: rf.rate, rfDate: rf.date, rfSource: rf.source, erp: erp.erp, erpSource: erp.label, industries };
  log(`rf ${rf.rate} (${rf.date}), ERP ${erp.erp}, industries ${industries.length}`);

  /* 3. Fundamentals: bulk zip first, per-company fallback, local directory for development. */
  const wanted = new Set(list.map((c) => c.cik));
  let facts = new Map<string, unknown>();
  if (factsDir) {
    for (const f of readdirSync(factsDir).filter((f) => f.endsWith('.json'))) {
      const j = JSON.parse(readFileSync(join(factsDir, f), 'utf8'));
      const cik = String(j.cik).padStart(10, '0');
      if (wanted.has(cik)) facts.set(cik, j);
    }
  } else {
    try {
      log('Downloading SEC bulk companyfacts.zip');
      facts = await S.secBulk(ua!, wanted, join(tmpdir(), 'companyfacts.zip'));
      log(`Bulk: found ${facts.size}/${wanted.size}`);
    } catch (e) {
      log('WARN bulk failed:', (e as Error).message, '- falling back to per-company requests');
    }
    for (const cik of wanted) {
      if (facts.has(cik)) continue;
      try {
        facts.set(cik, await S.retry(`SEC ${cik}`, () => S.secOne(ua!, cik)));
      } catch (e) {
        log('WARN', (e as Error).message);
      }
      await S.sleep(200); // ≤5 requests/second, under SEC's 10/s limit
    }
  }

  /* 4. Prices → beta statistics. Nasdaq first, Yahoo second, previous value third. */
  let spy: PricePoint[] | null = null;
  if (!skipPrices) {
    spy = await S.retry('SPY Nasdaq', () => S.nasdaqPrices('SPY', true)).catch(async (e) => {
      log('WARN', e.message, '- trying Yahoo');
      return S.retry('SPY Yahoo', () => S.yahooPrices('SPY')).catch((e2) => (log('WARN', e2.message), null));
    });
    if (!spy) log('WARN market series unavailable; keeping previous betas');
  }

  const failures: string[] = [];
  let priceFailures = 0;
  const results: CompanyFile[] = [];
  for (const c of list) {
    const prev = readJson<CompanyFile>(fileFor(c.ticker));
    const raw = facts.get(c.cik);
    let trimmed = raw ? trimCompanyfacts(raw) : prev?.facts;
    if (!trimmed) {
      failures.push(c.ticker);
      log('FAIL fundamentals', c.ticker);
      continue;
    }
    try {
      const h = extractHistoricals(trimmed);
      if (!h.years.length) throw new Error('no annual data');
    } catch (e) {
      failures.push(c.ticker);
      log('FAIL extract', c.ticker, (e as Error).message);
      trimmed = prev?.facts;
      if (!trimmed) continue;
    }

    let beta: SnapshotBeta | null = prev?.beta ? { ...prev.beta, source: 'previous' } : null;
    let price = prev?.price ?? null;
    if (spy) {
      let px: PricePoint[] | null = null;
      let source: SnapshotBeta['source'] = 'nasdaq';
      try {
        px = await S.retry(`${c.ticker} Nasdaq`, () => S.nasdaqPrices(c.ticker), 2);
      } catch {
        try {
          px = await S.retry(`${c.ticker} Yahoo`, () => S.yahooPrices(c.ticker), 2);
          source = 'yahoo';
        } catch (e) {
          log('WARN prices', c.ticker, (e as Error).message);
        }
      }
      if (px) {
        try {
          const { stats } = regressBeta(px, spy, 'monthly');
          beta = { ...stats, source, asOf: today };
          price = { close: px.at(-1)!.close, date: px.at(-1)!.date };
        } catch (e) {
          log('WARN beta', c.ticker, (e as Error).message);
        }
      } else if (!prev?.beta) priceFailures++;
      await S.sleep(250);
    }

    results.push({
      ticker: c.ticker,
      cik: c.cik,
      name: c.name,
      sector: c.sector,
      subIndustry: c.subIndustry,
      industry: guessIndustry(c.subIndustry, industries.map((i) => i.name)) ?? '',
      facts: trimmed,
      beta,
      price,
    });
  }

  /* 5. Gate: write nothing if too much failed. */
  const failRate = failures.length / Math.max(1, list.length);
  const priceFailRate = priceFailures / Math.max(1, list.length);
  log(`Done: ${results.length} companies, fundamentals failed ${failures.length}, prices without fallback ${priceFailures}`);
  if (failRate > 0.05) throw new Error(`Fundamentals failed for ${(failRate * 100).toFixed(1)}% of companies (limit 5%). Nothing written.`);
  if (priceFailRate > 0.25) throw new Error(`Prices failed for ${(priceFailRate * 100).toFixed(1)}% with no previous beta (limit 25%). Nothing written.`);

  for (const r of results) writeFileSync(fileFor(r.ticker), JSON.stringify(r));
  const index: IndexFile = {
    asOf: today,
    companies: (only && prevIndex ? mergeIndex(prevIndex.companies, results) : results).map(({ ticker, name, cik, sector, subIndustry }) => ({ ticker, name, cik, sector, subIndustry })),
    failures,
  };
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
  writeFileSync(join(OUT, 'market.json'), JSON.stringify(market));
  log('Written.');
}

function mergeIndex(prev: IndexFile['companies'], now: CompanyFile[]) {
  const m = new Map(prev.map((c) => [c.ticker, c]));
  for (const c of now) m.set(c.ticker, c);
  return [...m.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
}

main().catch((e) => {
  console.error('SNAPSHOT FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
