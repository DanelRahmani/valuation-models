import { latest } from './extract';
import type { Historicals, LineItem, SnapshotBeta } from './types';
import type { InputDef } from './calcsheet';

/** Every user-editable number, in $ millions and millions of shares unless noted. */
export interface Assumptions {
  price: number | null;
  rf: number;
  erp: number;
  beta: number;
  betaSource: 'regression' | 'blume' | 'industry' | 'manual';
  rd: number;
  tax: number;
  rev0: number | null;
  margin0: number | null;
  marginTarget: number | null;
  marginYears: number;
  daPct: number;
  capexPct: number;
  nwcPct: number;
  g1: number;
  gT: number;
  terminalMethod: 'gordon' | 'exit';
  exitMultiple: number;
  cash: number;
  sti: number;
  debt: number;
  shares: number | null;
  equity0: number | null;
  ni0: number | null;
  dps0: number | null;
  payout: number;
  hHalfLife: number;
  peers: { pe: number | null; evEbitda: number | null; evSales: number | null; pb: number | null; peg: number | null };
  aiMode: boolean;
  /** Banks, insurers, brokers and asset managers: valued on equity (residual income, dividends, P/E, P/B), not enterprise value. */
  financial: boolean;
  /** Return on equity, used by the financial-firm residual income model. */
  roe: number | null;
  /** Set when the latest margin looks depressed by one-off charges and the forecast starts from the 5-yr median instead. */
  oneOff?: { year: number; latest: number; adjusted: number; charges: number; tag: string } | null;
  newShares: number;
  scenarios: Record<'bear' | 'base' | 'bull', { g1: number; margin: number; capexPct: number; prob: number }>;
}

/** Where each default came from, for the source badges. */
export type Sources = Partial<Record<keyof Assumptions, string>>;

const M = 1e6;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function lastN(h: Historicals, item: LineItem, n = 3): number[] {
  return (h.items[item] ?? []).slice(-n).map((v) => v?.value ?? NaN);
}

function avgRatio(h: Historicals, num: LineItem, den: LineItem, n = 3): number | null {
  const a = lastN(h, num, n);
  const b = lastN(h, den, n);
  const r = a.map((x, i) => x / b[i]).filter((x) => Number.isFinite(x));
  return r.length ? r.reduce((x, y) => x + y, 0) / r.length : null;
}

/** Below this R², stock returns say too little about market risk and the industry beta is used instead. */
export const MIN_BETA_R2 = 0.2;

/** An industry beta from fewer firms than this is as noisy as one company's regression. */
export const MIN_INDUSTRY_FIRMS = 10;

export function defaultBetaMethod(reg: SnapshotBeta | null, industryFirms: number | null | undefined): 'blume' | 'industry' | 'manual' {
  const industryOk = (industryFirms ?? 0) >= MIN_INDUSTRY_FIRMS;
  if (reg && reg.r2 >= MIN_BETA_R2) return 'blume';
  if (industryOk) return 'industry';
  return reg ? 'blume' : 'manual';
}

/** GICS sub-industries whose debt is operating funding rather than financing. */
const FINANCIAL_SUBINDUSTRIES = [
  /bank/i,
  /insurance(?! brokers)/i,
  /reinsurance/i,
  /consumer finance/i,
  /investment banking/i,
  /asset management/i,
  /multi-sector holdings/i,
];
export const isFinancialFirm = (subIndustry?: string | null) => !!subIndustry && FINANCIAL_SUBINDUSTRIES.some((r) => r.test(subIndustry));

export interface MarketContext {
  price?: number | null;
  rf?: number;
  erp?: number;
  beta?: SnapshotBeta | null;
  industryBetaU?: number | null;
  industryFirms?: number | null;
  /** GICS sub-industry, to recognise banks and insurers. */
  subIndustry?: string | null;
  /** Market capitalisation in dollars from the snapshot, to catch stale share counts. */
  marketCap?: { value: number; date: string } | null;
}

export function defaultAssumptions(h: Historicals, mkt: MarketContext): { a: Assumptions; src: Sources } {
  const src: Sources = {};
  const tagOf = (i: LineItem) => h.items[i]?.at(-1)?.tag;
  const fy = h.years.at(-1);

  const rf = mkt.rf ?? 0.042;
  src.rf = mkt.rf != null ? '10-year Treasury (FRED DGS10)' : 'Default 4.2%';
  const erp = mkt.erp ?? 0.045;
  src.erp = mkt.erp != null ? 'Damodaran implied ERP' : 'Default 4.5%';

  const rev = latest(h, 'revenue');
  const ebit = latest(h, 'operatingIncome');
  const ni = latest(h, 'netIncome');
  // Shares: the latest cover-page count (10-K or 10-Q, so later splits count). Companies with several share
  // classes often report only one class there; if it is far below diluted shares, diluted shares are used.
  const cover = h.latestShares?.value ?? latest(h, 'sharesOutstanding');
  const diluted = latest(h, 'dilutedShares');
  let sharesRaw = cover;
  src.shares = h.latestShares ? `Cover page of the ${h.latestShares.tag.includes('10-Q') ? '10-Q' : '10-K'} dated ${h.latestShares.end}` : `${tagOf('sharesOutstanding')}, latest 10-K`;
  if (diluted != null && (cover == null || cover < 0.6 * diluted)) {
    sharesRaw = diluted;
    src.shares = cover == null ? 'Diluted weighted shares, latest 10-K' : 'Diluted weighted shares, latest 10-K (the cover page lists only one share class)';
  }
  // Cross-check against the market: a split, reverse split or merger after the latest filing moves the share
  // count by 1.5x or more. Small gaps (share classes, buybacks) are left alone.
  const implied = mkt.marketCap && mkt.price ? mkt.marketCap.value / mkt.price : null;
  if (implied != null && (sharesRaw == null || implied / sharesRaw > 1.4 || implied / sharesRaw < 0.7)) {
    src.shares =
      sharesRaw == null
        ? `Market cap / price (Nasdaq, ${mkt.marketCap!.date}); no total share count in SEC data`
        : `Market cap / price (Nasdaq, ${mkt.marketCap!.date}); the filed count of ${(sharesRaw / M).toFixed(0)}M predates a split or merger`;
    sharesRaw = implied;
  }
  const shares = sharesRaw != null ? sharesRaw / M : null;

  const cash = (latest(h, 'cash') ?? 0) / M;
  const sti = (latest(h, 'shortTermInvestments') ?? 0) / M;
  const debt = (latest(h, 'debt') ?? 0) / M;
  src.cash = `FY${fy} 10-K`;
  src.sti = `FY${fy} 10-K`;
  src.debt = `FY${fy} 10-K, total debt (${tagOf('debt') ?? 'none reported'})`;

  // Pooled 3-yr effective rate (sum of tax / sum of pre-tax income), so one year of tax benefits
  // cannot swing it. A negative or implausible rate is not sustainable, so the statutory rate is used.
  const pt3 = lastN(h, 'pretaxIncome');
  const pairs = lastN(h, 'taxExpense')
    .map((t, i) => [t, pt3[i]])
    .filter(([t, p]) => Number.isFinite(t) && Number.isFinite(p));
  const ptTotal = pairs.reduce((s, [, p]) => s + p, 0);
  const pooled = pairs.length && ptTotal > 0 ? pairs.reduce((s, [t]) => s + t, 0) / ptTotal : null;
  const tax = pooled != null && pooled >= 0 && pooled <= 0.4 ? Math.min(pooled, 0.35) : 0.21;
  src.tax =
    pooled == null
      ? 'US statutory 21%'
      : pooled < 0 || pooled > 0.4
        ? `US statutory 21% (3-yr effective rate of ${(pooled * 100).toFixed(0)}% is not sustainable)`
        : '3-yr effective tax rate (total tax / total pre-tax income)';

  const interest = latest(h, 'interestExpense');
  const rdRaw = interest != null && debt > 0 ? interest / M / debt : null;
  const rd = rdRaw != null ? clamp(rdRaw, rf + 0.01, rf + 0.08) : rf + 0.01;
  src.rd = rdRaw != null ? 'Interest expense / debt, between risk-free + 1% and + 8%' : 'Risk-free + 1%';

  // Beta: see defaultBetaMethod. Blume-adjusted regression when the regression explains enough, else the
  // industry beta relevered at this company's debt-to-equity, else 1.
  const mcap = mkt.price != null && shares != null ? mkt.price * shares : null;
  let beta = 1;
  let betaSource: Assumptions['betaSource'] = 'manual';
  const method = defaultBetaMethod(mkt.beta ?? null, mkt.industryBetaU != null && mcap ? mkt.industryFirms ?? MIN_INDUSTRY_FIRMS : 0);
  if (method === 'blume' && mkt.beta) {
    beta = mkt.beta.blume;
    betaSource = 'blume';
    src.beta = 'Blume-adjusted regression beta: 0.67β + 0.33';
  } else if (method === 'industry' && mkt.industryBetaU != null && mcap) {
    beta = mkt.industryBetaU * (1 + (1 - tax) * (debt / mcap));
    betaSource = 'industry';
    src.beta = mkt.beta
      ? `Damodaran industry beta, relevered (the regression's R² of ${mkt.beta.r2.toFixed(2)} is too low to rely on)`
      : 'Damodaran industry beta, relevered';
  } else src.beta = 'Default 1.0';

  const margin0 = rev && ebit != null ? ebit / rev : null;
  src.margin0 = `FY${fy} operating margin`;
  src.marginTarget = 'Held at current margin';

  // One-off charges: impairments of goodwill, intangibles and long-lived assets are non-cash and do not recur, but
  // they sink that year's operating margin. When they exceed 1% of revenue, the forecast adds them back.
  const imp = h.items.impairments?.at(-1);
  const oneOff =
    margin0 != null && rev && ebit != null && imp && imp.value > 0.01 * rev && fy != null
      ? { year: fy, latest: margin0, adjusted: (ebit + imp.value) / rev, charges: imp.value / M, tag: imp.tag }
      : null;
  if (oneOff) src.marginTarget = `FY${fy} margin before $${oneOff.charges.toFixed(0)}M of impairments (${oneOff.tag})`;

  const cagrYears = Math.min(3, h.years.length - 1);
  const revs = h.items.revenue ?? [];
  const r0 = revs.at(-1 - cagrYears)?.value;
  // Median of the last three annual growth rates rather than the CAGR: one merger year (Smurfit Westrock) or
  // post-COVID rebound (Las Vegas Sands, Carnival) would otherwise be projected for five more years.
  const yoy = revs
    .slice(-4)
    .map((v, i, arr) => (i && v && arr[i - 1] && arr[i - 1]!.value > 0 ? v.value / arr[i - 1]!.value - 1 : NaN))
    .filter(Number.isFinite)
    .sort((x, y) => x - y);
  const cagr = yoy.length ? yoy[Math.floor(yoy.length / 2)] : null;
  void r0;
  const g1 = cagr != null ? clamp(cagr, -0.1, 0.2) : 0.05;
  src.g1 =
    cagr == null
      ? 'Default 5%'
      : `Median revenue growth of the last ${yoy.length} years${cagr > 0.2 ? ` (${(cagr * 100).toFixed(0)}%), capped at 20%: few large companies sustain more for five years` : cagr < -0.1 ? `, floored at -10%` : ''}`;
  const gT = Math.min(0.025, rf);
  src.gT = 'Long-run nominal growth, capped at the risk-free rate';

  const daPct = avgRatio(h, 'da', 'revenue') ?? 0.04;
  const capexPct = avgRatio(h, 'capex', 'revenue') ?? 0.05;
  src.daPct = '3-yr average';
  src.capexPct = '3-yr average';
  src.nwcPct = 'Default: 10% of each new dollar of revenue';

  const div = latest(h, 'dividendsPaid');
  const dps0 = div != null && shares ? div / M / shares : null;
  src.dps0 = div != null ? `${tagOf('dividendsPaid')} / shares` : 'No dividends reported';
  const payout = clamp(avgRatio(h, 'dividendsPaid', 'netIncome') ?? 0, 0, 1);
  src.payout = '3-yr dividends / net income';

  const ebitda = ebit != null ? ebit + (latest(h, 'da') ?? 0) : null;
  src.exitMultiple = 'Default 12x EBITDA';
  void ebitda;

  const financial = isFinancialFirm(mkt.subIndustry);
  const roeAvg = avgRatio(h, 'netIncome', 'equity');
  const roe = roeAvg != null ? clamp(roeAvg, -0.1, 0.4) : null;
  src.roe = '3-yr average net income / book equity';
  let g1Final = g1;
  if (financial) {
    // Bank and insurer "revenue" is not comparable across filers; grow book equity at its own 3-yr pace instead.
    const eq = h.items.equity ?? [];
    const e0 = eq.at(-1 - cagrYears)?.value;
    const e1 = eq.at(-1)?.value;
    const eqCagr = e0 && e1 && e0 > 0 && e1 > 0 && cagrYears > 0 ? Math.pow(e1 / e0, 1 / cagrYears) - 1 : null;
    g1Final = eqCagr != null ? clamp(eqCagr, 0, 0.12) : 0.04;
    src.g1 = eqCagr != null ? `${cagrYears}-yr book equity growth, bounded 0-12%` : 'Default 4%';
  }

  const m = margin0 ?? 0.1;
  const a: Assumptions = {
    price: mkt.price ?? null,
    rf,
    erp,
    beta,
    betaSource,
    rd,
    tax,
    rev0: rev != null ? rev / M : null,
    margin0,
    marginTarget: oneOff ? oneOff.adjusted : margin0,
    marginYears: oneOff ? 1 : 5,
    oneOff,
    daPct,
    capexPct,
    nwcPct: 0.1,
    g1: g1Final,
    gT,
    financial,
    roe,
    terminalMethod: 'gordon',
    exitMultiple: 12,
    cash,
    sti,
    debt,
    shares,
    equity0: latest(h, 'equity') != null ? latest(h, 'equity')! / M : null,
    ni0: ni != null ? ni / M : null,
    dps0,
    payout,
    hHalfLife: 5,
    peers: { pe: null, evEbitda: null, evSales: null, pb: null, peg: null },
    aiMode: false,
    newShares: 0,
    scenarios: {
      bear: { g1: Math.max(g1 - 0.1, -0.05), margin: m * 0.6, capexPct: capexPct * 1.5, prob: 0.25 },
      base: { g1, margin: m, capexPct, prob: 0.5 },
      bull: { g1: Math.min(g1 + 0.1, 0.5), margin: Math.min(m * 1.3, 0.7), capexPct, prob: 0.25 },
    },
  };
  return { a, src };
}

/** The Inputs sheet: one named cell per assumption, plus derived cost-of-capital formulas. */
export function inputDefs(a: Assumptions, src: Sources, h: Historicals): InputDef[] {
  const ebit0 = a.rev0 != null && a.margin0 != null ? a.rev0 * a.margin0 : null;
  const da0 = latest(h, 'da');
  const I = (key: string, label: string, value: InputDef['value'], fmt: InputDef['fmt'], group: InputDef['group'], source = '', note?: string): InputDef => ({
    key,
    label,
    value,
    fmt,
    group,
    source,
    note,
  });
  const defs: InputDef[] = [
    I('price', 'Share price', a.price, 'usd', 'Market', src.price ?? 'You'),
    I('rf', 'Risk-free rate (10-yr Treasury)', a.rf, 'pct', 'Market', src.rf),
    I('erp', 'Equity risk premium', a.erp, 'pct', 'Market', src.erp),
    I('shares', 'Shares outstanding (M)', a.shares, 'shares', 'Company', src.shares),
    I('cash', 'Cash and equivalents ($M)', a.cash, 'usdm', 'Company', src.cash),
    I('sti', 'Short-term investments ($M)', a.sti, 'usdm', 'Company', src.sti),
    I('debt', 'Total debt ($M)', a.debt, 'usdm', 'Company', src.debt),
    I('net_debt', 'Net debt ($M)', '=debt-cash-sti', 'usdm', 'Company', 'Debt - cash - short-term investments'),
    I('rev_0', 'Revenue, last fiscal year ($M)', a.rev0, 'usdm', 'Company', 'Latest 10-K'),
    I('ebit_0', 'Operating income, last fiscal year ($M)', ebit0, 'usdm', 'Company', 'Latest 10-K'),
    I('da_0', 'D&A, last fiscal year ($M)', da0 != null ? da0 / 1e6 : null, 'usdm', 'Company', 'Latest 10-K'),
    I('ni_0', 'Net income, last fiscal year ($M)', a.ni0, 'usdm', 'Company', 'Latest 10-K'),
    I('equity_0', 'Book equity ($M)', a.equity0, 'usdm', 'Company', 'Latest 10-K'),
    I('dps_0', 'Dividend per share, last fiscal year', a.dps0, 'usd', 'Company', src.dps0),
    I('tax', 'Tax rate', a.tax, 'pct', 'Cost of capital', src.tax),
    I('beta_l', 'Levered beta', a.beta, 'beta', 'Cost of capital', src.beta),
    I('mcap', 'Market capitalisation ($M)', '=price*shares', 'usdm', 'Cost of capital', 'Price × shares'),
    I('de_ratio', 'Debt / equity (market)', '=debt/mcap', 'pct', 'Cost of capital', 'Debt / market cap'),
    I('w_debt', 'Debt weight D/(D+E)', '=debt/(debt+mcap)', 'pct', 'Cost of capital', ''),
    I('re', 'Cost of equity (CAPM)', '=rf+beta_l*erp', 'pct', 'Cost of capital', 'rf + β × ERP'),
    I('rd', 'Pre-tax cost of debt', a.rd, 'pct', 'Cost of capital', src.rd),
    I('wacc', 'WACC', '=(1-w_debt)*re+w_debt*rd*(1-tax)', 'pct', 'Cost of capital', 'E/V × re + D/V × rd × (1 - t)'),
    I('beta_u', 'Unlevered beta (Hamada)', '=beta_l/(1+(1-tax)*de_ratio)', 'beta', 'Cost of capital', 'β / (1 + (1 - t) D/E)'),
    I('ru', 'Unlevered cost of equity', '=rf+beta_u*erp', 'pct', 'Cost of capital', 'rf + βu × ERP'),
    I('g_stage1', a.financial ? 'Book equity growth, years 1-5' : 'Revenue growth, years 1-5', a.g1, 'pct', 'Forecast', src.g1),
    I('roe', 'Return on equity', a.roe, 'pct', 'Forecast', src.roe),
    I('g_terminal', 'Terminal growth', a.gT, 'pct', 'Forecast', src.gT),
    I('margin_0', 'Operating margin, now', a.margin0, 'pct', 'Forecast', src.margin0),
    I('margin_target', 'Operating margin, target', a.marginTarget, 'pct', 'Forecast', src.marginTarget),
    I('margin_years', 'Years to reach target margin', a.marginYears, 'num', 'Forecast', 'Default 5'),
    I('da_pct', 'D&A, % of revenue', a.daPct, 'pct', 'Forecast', src.daPct),
    I('capex_pct', 'Capex, % of revenue', a.capexPct, 'pct', 'Forecast', src.capexPct),
    I('nwc_pct', 'Working capital, % of revenue change', a.nwcPct, 'pct', 'Forecast', src.nwcPct),
    I('exit_multiple', 'Exit EV/EBITDA multiple', a.exitMultiple, 'x', 'Forecast', src.exitMultiple),
    I('h_half_life', 'H-model half-life (years)', a.hHalfLife, 'num', 'Forecast', 'Half of a 10-year fade'),
    I('pe_peer', 'Peer P/E', a.peers.pe, 'x', 'Peers', src.peers ?? 'You'),
    I('ev_ebitda_peer', 'Peer EV/EBITDA', a.peers.evEbitda, 'x', 'Peers', src.peers ?? 'You'),
    I('ev_sales_peer', 'Peer EV/Sales', a.peers.evSales, 'x', 'Peers', src.peers ?? 'You'),
    I('pb_peer', 'Peer P/B', a.peers.pb, 'x', 'Peers', src.peers ?? 'You'),
    I('peg_peer', 'Peer PEG', a.peers.peg, 'x', 'Peers', src.peers ?? 'You'),
  ];
  if (a.aiMode) {
    defs.push(I('new_shares', 'New shares from conversions / SBC (M)', a.newShares, 'shares', 'Scenarios', 'You'));
    for (const s of ['bear', 'base', 'bull'] as const) {
      const sc = a.scenarios[s];
      const name = s[0].toUpperCase() + s.slice(1);
      defs.push(
        I(`g1_${s}`, `${name}: growth, years 1-5`, sc.g1, 'pct', 'Scenarios', 'You'),
        I(`margin_${s}`, `${name}: target margin`, sc.margin, 'pct', 'Scenarios', 'You'),
        I(`capex_${s}`, `${name}: capex, % of revenue`, sc.capexPct, 'pct', 'Scenarios', 'You'),
        I(`prob_${s}`, `${name}: probability`, sc.prob, 'pct', 'Scenarios', 'You'),
      );
    }
  }
  return defs;
}
