/**
 * One place that turns a company file into default assumptions and model results, so the company page, the
 * comparison view and the home-page hero always agree.
 */
import { defaultAssumptions, defaultBetaMethod, isFinancialFirm, type Assumptions, type Sources } from './finance/assumptions';
import { extractHistoricals, type Basis } from './finance/extract';
import { runAll, type RunOutput } from './finance/run';
import type { CompanyFile, Historicals, IndustryRow, MarketFile } from './finance/types';
import type { BetaChoice } from './share';

let marketP: Promise<MarketFile | null> | null = null;
export const loadMarket = () => (marketP ??= fetch('/data/market.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));

const companyCache = new Map<string, Promise<CompanyFile | null>>();
export const loadCompany = (ticker: string) => {
  const t = ticker.toUpperCase();
  if (!companyCache.has(t)) companyCache.set(t, fetch(`/data/companies/${t}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return companyCache.get(t)!;
};

export interface Defaults {
  h: Historicals;
  a: Assumptions;
  src: Sources;
  ind: IndustryRow | undefined;
  betaChoice: BetaChoice;
  /** Industry beta relevered at this company's debt-to-equity. */
  relevered: number | null;
}

/** Default assumptions for a company, with the beta set by the suggested method and Damodaran peer multiples. */
export function companyDefaults(company: CompanyFile, market: MarketFile | null, h = extractHistoricals(company.facts), basis: Basis = 'ttm'): Defaults {
  const ind = market?.industries.find((i) => i.name === company.industry);
  const { a, src } = defaultAssumptions(h, {
    price: company.price?.close ?? null,
    rf: market?.rf,
    erp: market?.erp,
    beta: company.beta ?? null,
    industryBetaU: ind?.unleveredBeta ?? null,
    industryFirms: ind?.firms ?? null,
    subIndustry: company.subIndustry ?? null,
    marketCap: company.marketCap ?? null,
  }, basis);
  if (company.price) src.price = `Last close ${company.price.date} (Nasdaq)`;
  if (market) {
    src.rf = `10-year Treasury, ${market.rfDate} (${market.rfSource ?? 'FRED'})`;
    src.erp = market.erpSource;
  }
  if (ind) {
    a.peers = { pe: ind.pe, evEbitda: ind.evEbitda, evSales: ind.evSales, pb: ind.pb, peg: ind.peg, margin: ind.operatingMargin ?? null, roe: ind.roe ?? null };
    src.peers = `Damodaran industry average: ${ind.name}`;
  }
  const mcap = a.price != null && a.shares ? a.price * a.shares : null;
  const relevered = ind?.unleveredBeta != null && mcap ? ind.unleveredBeta * (1 + (1 - a.tax) * (a.debt / mcap)) : null;
  const betaChoice = defaultBetaMethod(company.beta ?? null, ind?.unleveredBeta != null && company.price != null ? ind.firms : 0) as BetaChoice;
  return { h, a, src, ind, betaChoice, relevered };
}

export interface Valued extends Defaults {
  company: CompanyFile;
  out: RunOutput;
  financial: boolean;
}

export async function valueTicker(ticker: string): Promise<Valued | null> {
  const [market, company] = await Promise.all([loadMarket(), loadCompany(ticker)]);
  if (!company) return null;
  const d = companyDefaults(company, market);
  return { ...d, company, out: runAll(d.h, d.a, d.src), financial: isFinancialFirm(company.subIndustry) };
}
