/**
 * Company metrics shared by the peer rankings, the comparison view and the value-creation panel.
 * All money values are in dollars; ratios are plain decimals.
 */
import { current } from './extract';
import type { Historicals } from './types';

export interface CompanyMetrics {
  ticker: string;
  name: string;
  sector: string;
  subIndustry: string;
  financial: boolean;
  revenue: number | null;
  /** Operating margin, latest year. */
  margin: number | null;
  /** Median revenue growth over the last three years. */
  growth: number | null;
  /** After-tax operating income / (equity + debt - cash). Return on equity for banks and insurers. */
  roic: number | null;
  /** True when invested capital is too small for ROIC to mean anything (cash about equals book capital). */
  roicNm: boolean;
  /** Net income / book equity. */
  roe: number | null;
  /** Net debt / EBITDA. Not meaningful for banks and insurers. */
  leverage: number | null;
  evEbitda: number | null;
  evSales: number | null;
  pe: number | null;
  pb: number | null;
  marketCap: number | null;
}

const ok = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);

/** Median of the last three annual growth rates (the same rule as the forecast default). */
export function medianGrowth(h: Historicals): number | null {
  const revs = (h.items.revenue ?? []).slice(-4);
  const g = revs
    .map((v, i) => (i && v && revs[i - 1] && revs[i - 1]!.value > 0 ? v.value / revs[i - 1]!.value - 1 : NaN))
    .filter(Number.isFinite)
    .sort((x, y) => x - y);
  return g.length ? g[Math.floor(g.length / 2)] : null;
}

/**
 * When cash cancels out most of a company's capital, invested capital (equity + debt - cash) is a sliver and ROIC
 * stops measuring anything: Palantir's cash almost equals its book equity, which would show 655%. ROIC is reported as
 * not meaningful when invested capital is under this share of gross capital (book equity, if positive, plus debt).
 * Measured against capital, not revenue, so thin-margin, high-turnover businesses such as Costco are not caught.
 */
export const ROIC_MIN_CAPITAL_SHARE = 0.25;

export interface YearPoint {
  year: number;
  /** After-tax return on invested capital (or on equity for financials). Null when not meaningful. */
  roic: number | null;
  /** ROIC is not meaningful this year: invested capital is under 25% of gross capital, or not positive. */
  roicNm: boolean;
  roe: number | null;
  dividends: number;
  buybacks: number;
  capex: number;
  acquisitions: number;
  /** Stock-based compensation / revenue. */
  sbcShare: number | null;
  /** Net debt / EBITDA. */
  leverage: number | null;
  /** Operating income / interest expense. */
  coverage: number | null;
}

/** Ten-year value-creation series from the filings. `tax` is the rate used for after-tax operating income. */
export function valueCreationSeries(h: Historicals, tax: number, financial = false): YearPoint[] {
  const at = (k: keyof Historicals['items'], i: number) => h.items[k]?.[i]?.value ?? null;
  return h.years.map((year, i) => {
    const ebit = at('operatingIncome', i);
    const equity = at('equity', i);
    const debt = at('debt', i) ?? 0;
    const cash = (at('cash', i) ?? 0) + (at('shortTermInvestments', i) ?? 0);
    const ni = at('netIncome', i);
    const rev = at('revenue', i);
    const da = at('da', i) ?? 0;
    const interest = at('interestExpense', i);
    const sbc = at('sbc', i);
    const invested = ok(equity) ? equity + debt - cash : null;
    const roe = ok(ni) && ok(equity) && equity > 0 ? ni / equity : null;
    let roic: number | null = null;
    let roicNm = false;
    if (financial) roic = roe;
    else if (ok(ebit) && invested != null) {
      const gross = Math.max(0, equity ?? 0) + debt;
      roicNm = invested <= 0 || gross <= 0 || invested < ROIC_MIN_CAPITAL_SHARE * gross;
      if (!roicNm) roic = (ebit * (1 - tax)) / invested;
    }
    const ebitda = ok(ebit) ? ebit + da : null;
    return {
      year,
      roic,
      roicNm,
      roe,
      dividends: Math.abs(at('dividendsPaid', i) ?? 0),
      buybacks: Math.abs(at('buybacks', i) ?? 0),
      capex: Math.abs(at('capex', i) ?? 0),
      acquisitions: Math.abs(at('acquisitions', i) ?? 0),
      sbcShare: ok(sbc) && ok(rev) && rev > 0 ? sbc / rev : null,
      leverage: !financial && ebitda && ebitda > 0 ? (debt - cash) / ebitda : null,
      coverage: !financial && ok(ebit) && ok(interest) && interest > 0 ? ebit / interest : null,
    };
  });
}

export function computeMetrics(
  h: Historicals,
  c: { ticker: string; name: string; sector: string; subIndustry: string },
  o: { tax: number; shares: number | null; price: number | null; financial: boolean },
): CompanyMetrics {
  // Multiples on the trailing twelve months when 10-Q data exist, as financial sites and the valuation page use.
  const rev = current(h, 'revenue');
  const ebit = current(h, 'operatingIncome');
  const ni = current(h, 'netIncome');
  const eq = current(h, 'equity');
  const da = current(h, 'da') ?? 0;
  const debt = current(h, 'debt') ?? 0;
  const cash = (current(h, 'cash') ?? 0) + (current(h, 'shortTermInvestments') ?? 0);
  const mcap = o.price != null && o.shares ? o.price * o.shares * 1e6 : null;
  const ebitda = ebit != null ? ebit + da : null;
  const last = valueCreationSeries(h, o.tax, o.financial).at(-1);
  return {
    ticker: c.ticker,
    name: c.name,
    sector: c.sector,
    subIndustry: c.subIndustry,
    financial: o.financial,
    revenue: rev,
    margin: !o.financial && ok(rev) && rev > 0 && ok(ebit) ? ebit / rev : null,
    growth: medianGrowth(h),
    roic: last?.roic ?? null,
    roicNm: last?.roicNm ?? false,
    roe: last?.roe ?? null,
    leverage: last?.leverage ?? null,
    evEbitda: !o.financial && mcap != null && ebitda && ebitda > 0 ? (mcap + debt - cash) / ebitda : null,
    evSales: !o.financial && mcap != null && rev && rev > 0 ? (mcap + debt - cash) / rev : null,
    pe: mcap != null && ni && ni > 0 ? mcap / ni : null,
    pb: mcap != null && eq && eq > 0 ? mcap / eq : null,
    marketCap: mcap,
  };
}

/* ------------------------------------------------------------------ Peers ------------------------------------------------------------------ */

export const MIN_PEERS = 4;

/**
 * Small GICS sub-industries folded into one peer group with their closest neighbours, so a company is compared with
 * businesses like it rather than with its whole sector (Ford with GM and Tesla, not with all 50 consumer companies).
 * Sub-industries not listed keep their own GICS name.
 */
const MERGE: [string, string[]][] = [
  ['Automakers and parts', ['Automobile Manufacturers', 'Automotive Parts & Equipment', 'Distributors']],
  ['Retailers', ['Broadline Retail', 'Apparel Retail', 'Home Improvement Retail', 'Other Specialty Retail', 'Computer & Electronics Retail', 'Homefurnishing Retail', 'Automotive Retail']],
  ['Hotels, cruises and casinos', ['Hotels, Resorts & Cruise Lines', 'Casinos & Gaming']],
  ['Apparel and footwear', ['Apparel, Accessories & Luxury Goods', 'Footwear']],
  ['Transportation', ['Rail Transportation', 'Passenger Airlines', 'Cargo Ground Transportation', 'Air Freight & Logistics', 'Passenger Ground Transportation']],
  ['Business services', ['Human Resource & Employment Services', 'Data Processing & Outsourced Services', 'Research & Consulting Services', 'Diversified Support Services']],
  ['Machinery and conglomerates', ['Construction Machinery & Heavy Transportation Equipment', 'Agricultural & Farm Machinery', 'Industrial Conglomerates']],
  ['Electrical equipment', ['Electrical Components & Equipment', 'Heavy Electrical Equipment']],
  ['Industrial machinery and distribution', ['Industrial Machinery & Supplies & Components', 'Trading Companies & Distributors']],
  ['Chemicals', ['Commodity Chemicals', 'Fertilizers & Agricultural Chemicals', 'Industrial Gases', 'Specialty Chemicals']],
  ['Metals and mining', ['Steel', 'Copper', 'Gold']],
  ['Building products and materials', ['Building Products', 'Construction Materials']],
  ['Packaging', ['Paper & Plastic Packaging Products & Materials', 'Metal, Glass & Plastic Containers']],
  ['Food producers', ['Packaged Foods & Meats', 'Agricultural Products & Services', 'Food Distributors']],
  ['Beverages', ['Soft Drinks & Non-alcoholic Beverages', 'Distillers & Vintners']],
  ['Household and personal care', ['Household Products', 'Personal Care Products']],
  ['Food and staples retail', ['Consumer Staples Merchandise Retail', 'Food Retail']],
  ['Oil and gas producers', ['Integrated Oil & Gas', 'Oil & Gas Exploration & Production']],
  ['Oil and gas midstream and refining', ['Oil & Gas Storage & Transportation', 'Oil & Gas Refining & Marketing']],
  ['Health care providers and services', ['Health Care Facilities', 'Health Care Services']],
  ['Medical devices and supplies', ['Health Care Equipment', 'Health Care Supplies']],
  ['Electronic components and equipment', ['Electronic Components', 'Electronic Manufacturing Services', 'Electronic Equipment & Instruments']],
  ['IT services and infrastructure', ['IT Consulting & Other Services', 'Internet Services & Infrastructure', 'Technology Distributors']],
  ['Payments and consumer finance', ['Transaction & Payment Processing Services', 'Consumer Finance']],
  ['Property, casualty and multi-line insurance', ['Property & Casualty Insurance', 'Multi-line Insurance', 'Reinsurance', 'Multi-Sector Holdings']],
  ['Electric utilities and power producers', ['Electric Utilities', 'Independent Power Producers & Energy Traders']],
  ['Multi, gas and water utilities', ['Multi-Utilities', 'Gas Utilities', 'Water Utilities']],
  ['Telecom and cable', ['Cable & Satellite', 'Integrated Telecommunication Services', 'Wireless Telecommunication Services']],
  ['Media and entertainment', ['Movies & Entertainment', 'Broadcasting', 'Publishing', 'Interactive Home Entertainment']],
  ['Internet and advertising', ['Interactive Media & Services', 'Advertising']],
];
const GROUP_OF = new Map(MERGE.flatMap(([g, subs]) => subs.map((s) => [s, g] as const)));
/** Peer-group name for a GICS sub-industry; REIT sub-industries form one group. */
export const groupOf = (subIndustry: string) => GROUP_OF.get(subIndustry) ?? (/REITs$/.test(subIndustry) ? 'REITs' : subIndustry);

export interface PeerGroup {
  basis: 'sub-industry' | 'sector';
  name: string;
  /** Tickers in the group, the company included. */
  members: string[];
}

/**
 * Peers from the S&P 500 itself: the company's GICS sub-industry when it has at least MIN_PEERS members, otherwise
 * its sector. Share classes of the same company (GOOG/GOOGL, FOX/FOXA, NWS/NWSA) count once.
 */
export function peerGroup(ticker: string, all: Pick<CompanyMetrics, 'ticker' | 'name' | 'sector' | 'subIndustry'>[]): PeerGroup | null {
  const me = all.find((c) => c.ticker === ticker);
  if (!me) return null;
  const dedupe = (list: typeof all) => {
    const seen = new Map<string, string>();
    for (const c of list) {
      const key = c.name.replace(/\s*\(?class [a-c]\)?/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (!seen.has(key) || c.ticker === ticker) seen.set(key, c.ticker);
    }
    return [...seen.values()];
  };
  const g = groupOf(me.subIndustry);
  const sub = dedupe(all.filter((c) => groupOf(c.subIndustry) === g));
  if (sub.length >= MIN_PEERS) return { basis: 'sub-industry', name: g, members: sub };
  return { basis: 'sector', name: me.sector, members: dedupe(all.filter((c) => c.sector === me.sector)) };
}

export const median = (xs: number[]): number | null => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Share of peers (excluding the company) with a lower value, 0 to 1. Null when there is nothing to compare. */
export function percentile(value: number | null, peers: (number | null)[]): number | null {
  if (!ok(value)) return null;
  const xs = peers.filter(ok);
  if (!xs.length) return null;
  const below = xs.filter((x) => x < value).length;
  const equal = xs.filter((x) => x === value).length;
  return (below + equal / 2) / xs.length;
}

/** Median peer multiples (excluding the company), for the multiples model. Outliers above 100x are dropped. */
export function peerMultiples(ticker: string, group: PeerGroup, metrics: Map<string, CompanyMetrics>) {
  const peers = group.members.filter((t) => t !== ticker).map((t) => metrics.get(t)).filter((m): m is CompanyMetrics => !!m);
  const med = (k: 'pe' | 'evEbitda' | 'evSales' | 'pb', cap = 100) => median(peers.map((p) => p[k]).filter((x): x is number => ok(x) && x > 0 && x < cap));
  const margin = median(peers.map((p) => p.margin).filter((x): x is number => ok(x) && x > -1 && x < 1));
  const roe = median(peers.map((p) => p.roe).filter((x): x is number => ok(x) && x > -1 && x < 2));
  return { pe: med('pe'), evEbitda: med('evEbitda'), evSales: med('evSales', 50), pb: med('pb', 50), margin, roe, count: peers.length };
}
