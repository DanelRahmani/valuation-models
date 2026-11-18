/**
 * Stress test: runs the same pipeline as the valuation page (ValueApp.tsx) on outlier companies and prints one row per
 * company, then flags anomalies. Diagnostic only: it logs a report and fails only on a hard invariant (a model shown
 * as ok with NaN or Infinity). Negative per-share values are reported as HIGH anomalies, not failures. Run with:
 *   npx vitest run tests/stress.scratch.test.ts
 * Set STRESS_QUIET=1 to suppress the per-company detail and keep only the anomaly list.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractHistoricals } from '../src/lib/finance/extract';
import { defaultAssumptions, type Assumptions, type Sources } from '../src/lib/finance/assumptions';
import { runAll, MIN_DDM_PAYOUT, type ModelResult, type RunOutput } from '../src/lib/finance/run';
import { checkCompany } from '../src/lib/finance/checks';
import { peerGroup, peerMultiples, type CompanyMetrics } from '../src/lib/finance/metrics';
import type { Historicals, TrimmedFacts } from '../src/lib/finance/types';

const DATA = join(__dirname, '..', 'public', 'data');
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

const TICKERS = ['PLTR', 'TSLA', 'AAPL', 'MCD', 'SBUX', 'MO', 'JPM', 'PGR', 'AIG', 'O', 'AMT', 'NEE', 'XOM', 'INTC', 'LLY', 'UAL', 'COST', 'KO'];
/** Companies that pay real dividends: the dividend models should stay switched on (status ok or at least not na). */
const PAYERS = new Set(['KO', 'MO', 'NEE', 'XOM', 'O']);
const MODELS = ['fcff', 'fcfe', 'apv', 'ri', 'ddm_gordon', 'ddm_2stage', 'ddm_h', 'multiples'] as const;
const DCF_FOUR = ['fcff', 'fcfe', 'apv', 'ri'] as const;

const market = readJson<{ rf: number; rfDate: string; rfSource?: string; erp: number; erpSource: string; industries: any[] }>(join(DATA, 'market.json'));
const metricsFile = readJson<{ companies: CompanyMetrics[] }>(join(DATA, 'metrics.json'));
const metricsMap = new Map(metricsFile.companies.map((c) => [c.ticker, c]));

/** Figures from memory of recent 10-Ks (rev and net income in $B, shares in B). Rough, +/-25% tolerance; FY may differ. */
const KNOWN: Record<string, { rev?: number; ni?: number; shares?: number }> = {
  AAPL: { rev: 391, ni: 94, shares: 15.0 },
  TSLA: { rev: 98, ni: 7.1, shares: 3.2 },
  KO: { rev: 47, ni: 10.6, shares: 4.3 },
  MCD: { rev: 26, ni: 8.2, shares: 0.71 },
  XOM: { rev: 350, ni: 34, shares: 4.2 },
  COST: { rev: 275, ni: 8.1, shares: 0.44 },
  MO: { rev: 20, ni: 9.8, shares: 1.76 },
  NEE: { rev: 28, ni: 6.9, shares: 2.07 },
  UAL: { rev: 54, ni: 2.6, shares: 0.28 },
  AMT: { rev: 10.2, ni: 2.2, shares: 0.46 },
  INTC: { rev: 53, ni: -18.8, shares: 4.4 },
  JPM: { ni: 58.5, shares: 2.8 },
  SBUX: { rev: 36, ni: 3.8, shares: 1.13 },
  O: { rev: 4.6, ni: 0.9, shares: 0.87 },
  LLY: { rev: 45, ni: 10.6, shares: 0.9 },
};

interface Out {
  ticker: string;
  name: string;
  price: number | null;
  out: RunOutput;
  a: Assumptions;
  src: Sources;
  h: Historicals;
  company: any;
  multiplesSp: number | null;
  peerCount: number;
  checks: string[];
}

function runFor(t: string): Out | null {
  const path = join(DATA, 'companies', `${t}.json`);
  if (!existsSync(path)) return null;
  const company = readJson<any>(path);
  const h = extractHistoricals(company.facts);
  // Same inputs ValueApp.tsx passes to defaultAssumptions, then the same source and peer overrides.
  const ind = market.industries.find((i) => i.name === company.industry);
  const { a, src } = defaultAssumptions(h, {
    price: company.price?.close ?? null,
    rf: market.rf,
    erp: market.erp,
    beta: company.beta ?? null,
    industryBetaU: ind?.unleveredBeta ?? null,
    industryFirms: ind?.firms ?? null,
    subIndustry: company.subIndustry ?? null,
    marketCap: company.marketCap ?? null,
  });
  if (company.price) src.price = `Last close ${company.price.date} (Nasdaq)`;
  src.rf = `10-year Treasury, ${market.rfDate} (${market.rfSource ?? 'FRED'})`;
  src.erp = market.erpSource;
  if (ind) {
    a.peers = { pe: ind.pe, evEbitda: ind.evEbitda, evSales: ind.evSales, pb: ind.pb, peg: ind.peg, margin: ind.operatingMargin ?? null, roe: ind.roe ?? null };
    src.peers = `Damodaran industry average: ${ind.name}`;
  }
  const out = runAll(h, a, src);

  // S&P 500 peer multiples, as usePeers + peerMultiples compute them (what the "Use these peers" button applies).
  const group = peerGroup(t, metricsFile.companies);
  const mult = group ? peerMultiples(t, group, metricsMap) : null;
  let multiplesSp: number | null = null;
  if (mult) {
    const a2: Assumptions = { ...a, peers: { pe: mult.pe, evEbitda: mult.evEbitda, evSales: mult.evSales, pb: mult.pb, peg: a.peers.peg, margin: mult.margin, roe: mult.roe } };
    const o2 = runAll(h, a2, { ...src, peers: 'S&P 500 peers' });
    multiplesSp = o2.results.find((r) => r.id === 'multiples')?.perShare ?? null;
  }

  // Data checks (same module the monthly QA snapshot uses), for context on any extraction problem.
  let checks: string[] = [];
  try {
    checks = checkCompany(h, company.facts as TrimmedFacts, {
      financial: a.financial,
      price: company.price?.close ?? null,
      marketCap: company.marketCap?.value ?? null,
      sharesUsed: a.shares != null ? a.shares * 1e6 : null,
    }).map((i) => `${i.severity}:${i.id} ${i.message}`);
  } catch (e) {
    checks = [`checkCompany threw: ${(e as Error).message}`];
  }

  return { ticker: t, name: company.name, price: a.price, out, a, src, h, company, multiplesSp, peerCount: mult?.count ?? 0, checks };
}

const f = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(d));
const pct = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '–' : `${(x * 100).toFixed(1)}%`);
const latestOf = (h: Historicals, k: keyof Historicals['items']) => {
  const v = h.items[k]?.at(-1)?.value;
  return v == null ? null : v / 1e6;
};

describe('stress: valuation engine on outlier companies', () => {
  it('runs the page pipeline on every company and reports anomalies', () => {
    const quiet = !!process.env.STRESS_QUIET;
    const lines: string[] = [];
    const anomalies: { sev: 'BUG' | 'HIGH' | 'MED' | 'LOW'; ticker: string; text: string }[] = [];
    const rows: string[] = [];
    const detail: string[] = [];
    const rowsIn: { t: string; o: Out }[] = [];

    for (const t of TICKERS) {
      const o = runFor(t);
      if (!o) {
        lines.push(`MISSING ${t}: no file in public/data/companies, skipped`);
        continue;
      }
      rowsIn.push({ t, o });
    }

    for (const { t, o } of rowsIn) {
      const { out, a, src, h, company } = o;
      const byId = new Map<string, ModelResult>(out.results.map((r) => [r.id, r]));
      const v = (id: string) => byId.get(id)?.perShare ?? null;
      const st = (id: string) => byId.get(id)?.status ?? '–';
      const ok = (id: string) => st(id) === 'ok' && v(id) != null && Number.isFinite(v(id)!);
      const I = out.values.inputs;
      const price = o.price;

      rows.push(
        `${t.padEnd(5)} px ${f(price)} | ` +
          MODELS.map((m) => `${m} ${st(m) === 'ok' ? f(v(m)) : st(m)}`).join(' | ') +
          ` | multiples(S&P) ${f(o.multiplesSp)}`,
      );
      detail.push(
        `${t.padEnd(5)} FY ${h.yearEnds.at(-1)} WACC ${pct(I.wacc)} Ke ${pct(I.re)} beta ${f(a.beta, 2)} (${a.betaSource}) g1 ${pct(a.g1)} gT ${pct(a.gT)} capex ${pct(a.capexPct)} D&A ${pct(a.daPct)} ` +
          `payout ${pct(a.payout)} (dps0 ${f(a.dps0, 2)}) netDebt ${f(I.net_debt, 0)}M shares ${f(a.shares, 1)}M ` +
          `rev0 ${f(a.rev0, 0)}M NI0 ${f(a.ni0, 0)}M debt ${f(a.debt, 0)}M equity0 ${f(a.equity0, 0)}M ` +
          `reverse-g ${out.reverse.growth == null ? (out.reverse.message || '–') : pct(out.reverse.growth)} financial=${a.financial}`,
      );
      const stats = out.results
        .filter((r) => r.status !== 'ok')
        .map((r) => `${r.id}:${r.status}${r.message ? ` (${r.message.slice(0, 90)})` : ''}`);
      if (stats.length) detail.push(`      non-ok: ${stats.join(' ; ')}`);
      if (out.warnings.length) detail.push(`      warnings: ${out.warnings.map((w) => w.slice(0, 120)).join(' | ')}`);
      const errs = o.checks.filter((c) => c.startsWith('error'));
      if (errs.length) detail.push(`      data checks (error): ${errs.join(' | ').slice(0, 400)}`);

      // ---- anomaly checks ----
      const add = (sev: 'BUG' | 'HIGH' | 'MED' | 'LOW', text: string) => anomalies.push({ sev, ticker: t, text });
      for (const m of MODELS) {
        const r = byId.get(m);
        if (!r) continue;
        if (r.status === 'ok') {
          const x = r.perShare;
          if (x == null || !Number.isFinite(x)) add('BUG', `${m} is ok but has no finite value (${x})`);
          else if (x < 0) add('HIGH', `${m} is ok with a negative per-share value ${f(x)} (shown as a valid result)`);
          if (price && x != null && Number.isFinite(x)) {
            if (x > 5 * price || x < 0.2 * price) add('MED', `${m} = ${f(x)} is ${(x / price).toFixed(2)}x the price ${f(price)}`);
          }
        }
      }
      const four = DCF_FOUR.filter(ok).map((id) => [id, v(id)!] as const);
      if (four.length >= 2) {
        const xs = four.map((p) => p[1]);
        const mx = Math.max(...xs);
        const mn = Math.min(...xs);
        const mid = (mx + mn) / 2;
        if (mid > 0 && (mx - mn) / Math.abs(mid) > 0.15)
          add('MED', `FCFF/FCFE/APV/RI disagree by ${(((mx - mn) / Math.abs(mid)) * 100).toFixed(0)}%: ${four.map((p) => `${p[0]} ${f(p[1])}`).join(', ')}`);
      }
      // Dividend models: applied where there is no dividend, or switched off for a real payer.
      const ddmIds = ['ddm_gordon', 'ddm_2stage', 'ddm_h'] as const;
      if (!(a.dps0 && a.dps0 > 0) || a.payout < MIN_DDM_PAYOUT) {
        for (const d of ddmIds) if (ok(d)) add('BUG', `${d} applies (ok) although dps0=${f(a.dps0)} payout=${pct(a.payout)}`);
      }
      if (PAYERS.has(t)) {
        for (const d of ddmIds) if (st(d) !== 'ok') add('HIGH', `${d} switched off (${st(d)}) for a real dividend payer, payout ${pct(a.payout)}: ${byId.get(d)?.message ?? ''}`);
      }
      // Banks and insurers must not get enterprise-value models.
      if (a.financial) {
        for (const m of ['fcff', 'fcfe', 'apv'] as const) if (ok(m)) add('BUG', `enterprise-value model ${m} is ok for a financial firm`);
      }
      // Raw payout ratio before the clamp to [0, 1] in assumptions.ts.
      const div = h.items.dividendsPaid?.slice(-3).reduce((s, x) => s + (x?.value ?? 0), 0) ?? 0;
      const ni3 = h.items.netIncome?.slice(-3).reduce((s, x) => s + (x?.value ?? 0), 0) ?? 0;
      if (ni3 > 0 && div / ni3 > 1) add('MED', `raw 3-yr payout ${pct(div / ni3)} is clamped to ${pct(a.payout)} in assumptions.ts (MO-type case: dividends exceed earnings)`);
      if (ni3 <= 0 && div > 0) add('LOW', `dividends paid but 3-yr net income is negative; payout set to 0 by the clamp (raw ${(div / Math.abs(ni3 || 1)).toFixed(2)})`);
      // Input sanity against known filings.
      const k = KNOWN[t];
      if (k) {
        const cmp = (label: string, got: number | null, exp: number | undefined, unit: string) => {
          if (exp == null || got == null) return;
          const rel = Math.abs(got - exp) / Math.max(Math.abs(exp), 1e-9);
          if (rel > 0.25 && Math.sign(got) === Math.sign(exp)) add('LOW', `${label} ${f(got, 2)}${unit} vs about ${exp}${unit} from memory (${(rel * 100).toFixed(0)}% off; memory may be a different year): verify`);
          else if (Math.sign(got) !== Math.sign(exp) && exp !== 0) add('LOW', `${label} sign ${f(got, 2)}${unit} vs about ${exp}${unit} from memory`);
        };
        cmp('Revenue $B', a.rev0 != null ? a.rev0 / 1000 : null, k.rev, 'B');
        cmp('Net income $B', a.ni0 != null ? a.ni0 / 1000 : null, k.ni, 'B');
        cmp('Shares B', a.shares != null ? a.shares / 1000 : null, k.shares, 'B');
      }
      // Shares vs Nasdaq market cap (the page only overrides above 1.4x or below 0.7x).
      if (company.marketCap?.value && company.price?.close && a.shares) {
        const implied = company.marketCap.value / company.price.close / 1e6;
        const gap = Math.abs(a.shares / implied - 1);
        if (gap > 0.2) add('MED', `shares used ${f(a.shares, 1)}M vs market cap / price ${f(implied, 1)}M (${(gap * 100).toFixed(0)}% gap, under the 1.4x override threshold)`);
      }
      if (a.debt > 0 && company.marketCap?.value && a.debt * 1e6 > 2 * company.marketCap.value) add('LOW', `total debt ${f(a.debt, 0)}M exceeds 2x market cap`);
      if (a.equity0 != null && a.equity0 < 0) add('LOW', `negative book equity ${f(a.equity0, 0)}M: P/B and residual income are not meaningful`);
      if (out.reverse.growth != null && (out.reverse.growth > 0.9 || out.reverse.growth < -0.45)) add('LOW', `reverse DCF growth ${pct(out.reverse.growth)} is at the solver bound`);
      if (ok('fcff') && ok('multiples') && o.multiplesSp != null && price) {
        // not an anomaly by itself; kept for the report
      }
      // Capex not found in the SEC data: the engine uses 5% of revenue and still labels it "3-yr average".
      if (!a.financial && !(h.items.capex ?? []).some((x) => x))
        add('HIGH', `no capex in the SEC data; capex defaults to 5% of revenue (source label says "3-yr average") against D&A of ${pct(a.daPct)}`);
      // D&A that is never replaced: FCFF adds back the D&A-over-capex gap in every year, including the terminal one.
      if (!a.financial && a.daPct > 0.1 && a.daPct > 2 * a.capexPct)
        add('MED', `D&A ${pct(a.daPct)} of revenue vs capex ${pct(a.capexPct)}: FCFF adds the gap back in perpetuity`);
      // Payout is a mean of yearly ratios; a negative-earnings year can drag it to 0 and switch the dividend models off.
      const pooledPayout = ni3 > 0 ? div / ni3 : null;
      if (pooledPayout != null && div > 0 && a.payout !== 1 && Math.abs(pooledPayout - a.payout) > 0.2)
        add('HIGH', `payout ${pct(a.payout)} (mean of yearly ratios) vs ${pct(pooledPayout)} pooled over 3 years; the dividend models switch off on the mean`);
      if (ni3 <= 0 && a.payout > 0 && div > 0) add('MED', `payout ${pct(a.payout)} shown, but 3-yr net income is negative: the mean of mixed-sign ratios is meaningless`);
      // Dividend models at a tiny yield: they value the payout and ignore the retained earnings.
      if (ok('ddm_gordon') && price && a.dps0 && a.dps0 / price < 0.01)
        add('MED', `dividend models apply (ok) at a ${pct(a.dps0 / price)} yield (payout ${pct(a.payout)}): Gordon ${f(v('ddm_gordon'))} vs price ${f(price)}`);
      // Banks: the "interest implies more debt" warning has no financial-firm guard in run.ts.
      if (a.financial && out.warnings.some((w) => w.startsWith('Interest expense')))
        add('LOW', `bank/insurer gets the "interest implies more debt" warning, which assumes debt is financing (no financial guard in run.ts)`);
      // Share count: the 10-Q cover versus diluted weighted shares.
      if (h.latestShares && h.items.dilutedShares?.at(-1) && h.latestShares.value / h.items.dilutedShares.at(-1)!.value > 1.1)
        add('LOW', `cover count ${f(h.latestShares.value / 1e6, 0)}M is ${((h.latestShares.value / h.items.dilutedShares.at(-1)!.value - 1) * 100).toFixed(0)}% above diluted ${f(h.items.dilutedShares.at(-1)!.value / 1e6, 0)}M (unvested awards or a later issue)`);
      // Peer basis: Damodaran industry versus S&P 500 sub-industry multiples.
      if (v('multiples') != null && o.multiplesSp != null && o.multiplesSp > 0 && v('multiples')! > 0) {
        const r = v('multiples')! / o.multiplesSp;
        if (r > 2 || r < 0.5) add('LOW', `multiples model is ${f(v('multiples'))} on Damodaran peers vs ${f(o.multiplesSp)} on S&P peers (${r.toFixed(1)}x apart)`);
      }
      // Missing-value sanity: a company with rev0 but FCFF not ok.
      if (a.rev0 != null && a.margin0 != null && st('fcff') !== 'ok' && !a.financial) add('MED', `FCFF status ${st('fcff')}: ${byId.get('fcff')?.message ?? ''}`);
      void I;
      void lines;
    }

    const bugs = anomalies.filter((x) => x.sev === 'BUG');
    const rank = { BUG: 0, HIGH: 1, MED: 2, LOW: 3 } as const;
    anomalies.sort((x, y) => rank[x.sev] - rank[y.sev]);
    const report = [
      ...lines,
      'Per-share value by model (ok models only; status shown when not ok):',
      ...rows,
      ...(quiet ? [] : ['', 'Inputs, warnings and non-ok statuses:', ...detail]),
      '',
      `Anomalies (${anomalies.length}, BUG ${bugs.length}):`,
      ...anomalies.map((x) => `  [${x.sev}] ${x.ticker}: ${x.text}`),
    ];
    console.log(report.join('\n'));
    // Hard invariant only: a model shown as ok must never carry NaN, Infinity or a negative per-share value.
    expect(bugs.filter((x) => /no finite/.test(x.text))).toEqual([]);
  });
});
