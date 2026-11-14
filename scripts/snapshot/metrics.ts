/** Builds public/data/metrics.json: one compact row per company for peer rankings and comparisons. */
import { defaultAssumptions, isFinancialFirm } from '../../src/lib/finance/assumptions';
import { extractHistoricals } from '../../src/lib/finance/extract';
import { computeMetrics, type CompanyMetrics } from '../../src/lib/finance/metrics';
import type { CompanyFile, MarketFile } from '../../src/lib/finance/types';

export interface MetricsFile {
  asOf: string;
  companies: CompanyMetrics[];
}

const round = (x: number | null, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

export function buildMetrics(companies: CompanyFile[], market: MarketFile): MetricsFile {
  const rows = companies.map((c) => {
    const h = extractHistoricals(c.facts);
    const financial = isFinancialFirm(c.subIndustry);
    const { a } = defaultAssumptions(h, { price: c.price?.close ?? null, rf: market.rf, erp: market.erp, marketCap: c.marketCap ?? null, subIndustry: c.subIndustry });
    const m = computeMetrics(h, c, { tax: a.tax, shares: a.shares, price: c.price?.close ?? null, financial });
    return {
      ...m,
      revenue: m.revenue != null ? Math.round(m.revenue) : null,
      marketCap: m.marketCap != null ? Math.round(m.marketCap) : null,
      margin: round(m.margin),
      growth: round(m.growth),
      roic: round(m.roic),
      leverage: round(m.leverage, 2),
      evEbitda: round(m.evEbitda, 2),
      evSales: round(m.evSales, 2),
      pe: round(m.pe, 2),
      pb: round(m.pb, 2),
    };
  });
  return { asOf: market.asOf, companies: rows.sort((x, y) => x.ticker.localeCompare(y.ticker)) };
}
