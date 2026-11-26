/**
 * Ready-made scenarios, calibrated to published evidence where there is some (see docs/research/scenario-calibration.md).
 * Each is a story plus changes relative to the company's own base case, so the same template fits any company. Where no
 * base rate exists, the number is a judgment call and the template says so.
 */
import type { Assumptions } from '@/lib/finance/assumptions';
import type { Change, PathChange } from '@/lib/scenarios/types';
import { modelGrowthPath } from '@/lib/scenarios/apply';

export interface Source {
  label: string;
  url?: string;
}

export interface ScenarioTemplate {
  id: string;
  name: string;
  story: string;
  /** What it changes, in plain words. */
  why: string;
  /** Where the numbers come from: the evidence, and which numbers are judgment. */
  basis: string;
  sources: Source[];
  /** Works for banks and insurers too (no cash-flow levers). */
  financial: boolean;
  build: (a: Assumptions) => { changes: Change[]; paths?: PathChange[] };
  /** A note when the template will do little for this company, shown before it is used. */
  caution?: (a: Assumptions) => string | null;
}

/* ------------------------------------------------------------------ Evidence ------------------------------------------------------------------ */

const S = {
  famaFrench: { label: 'Fama & French (2000), Forecasting profitability and earnings', url: 'https://ideas.repec.org/a/ucp/jnlbus/v73y2000i2p161-75.html' },
  mckinsey: { label: 'McKinsey, The strategic yardstick you can’t afford to ignore', url: 'https://www.mckinsey.com/capabilities/strategy-and-corporate-finance/our-insights/the-strategic-yardstick-you-cant-afford-to-ignore' },
  aspe: { label: 'ASPE (2021), Medicare Part D generic competition and prices', url: 'https://aspe.hhs.gov/sites/default/files/migrated_legacy_files//198346/medicare-part-d-generic-comp.pdf' },
  sia2009: { label: 'SIA: global chip sales down 9% in 2009', url: 'https://semiconductors.org/global-chip-sales-decline-in-2009' },
  sia2023: { label: 'SIA: global chip sales down 8.2% in 2023', url: 'https://design-reuse.com/news/55644/2023-semiconductor-sales.html' },
  wsts2001: { label: 'WSTS: chip sales forecast down 32% in 2001', url: 'https://www.theregister.co.uk/2001/10/23/world_chip_sales_down/' },
  nvdaFy23: { label: 'NVIDIA fiscal 2023 results (operating margin 37% → 16%)', url: 'https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-fourth-quarter-and-fiscal-2023' },
  lbnl: { label: 'Berkeley Lab, Queued Up: 2026 edition', url: 'https://eta-publications.lbl.gov/publications/us-interconnection-queue-data-0' },
  dominion: { label: 'Bloomberg (2024): seven-year wait for data-centre hookups in Virginia', url: 'https://www.bloomberg.com/news/articles/2024-08-29/data-centers-face-seven-year-wait-for-power-hookups-in-virginia' },
  hamilton: { label: 'Hamilton (2022), oil shocks and the economy (slides)', url: 'https://www.eia.gov/finance/markets/reports_presentations/2022/Hamilton_EIA2022_slides.pdf' },
  kilian: { label: 'Kilian (2008), the economic effects of energy price shocks', url: 'https://www.bankofcanada.ca/wp-content/uploads/2010/08/kilian.pdf' },
  vci: { label: 'German chemical output in the 2022 gas crisis (VCI, via CHEManager)', url: 'https://chemanager-online.com/en/news/german-chemicals-stagger-under-energy-burden' },
  bernankeKuttner: { label: 'Bernanke & Kuttner (2005), stock market reaction to Fed policy', url: 'https://econpapers.repec.org/RePEc:bla:jfinan:v:60:y:2005:i:3:p:1221-1257' },
  dechow: { label: 'Dechow, Sloan & Soliman (2004), Implied equity duration', url: 'https://deepblue.lib.umich.edu/items/82a14f0a-ea44-44d1-8a86-3d19483f23ad' },
  growthBacktest: { label: 'This site’s S&P 500 growth backtest, 2017-2025 (scripts/calibrate-growth.ts)' },
  ckl: { label: 'Chan, Karceski & Lakonishok (2003), The level and persistence of growth rates' },
} satisfies Record<string, Source>;

/** Profitability reverts toward its mean at about 38% a year (Fama & French, 2000). */
const REVERT = 0.38;

/** Margin above the industry (Damodaran) margin, when both are known and the company is above it. */
const gapToIndustry = (a: Assumptions) =>
  a.peers.margin != null && a.marginTarget != null && a.marginTarget > a.peers.margin ? a.marginTarget - a.peers.margin : null;

/** Below this share of revenue, capex scenarios barely move the value (fabless chip designers, software). */
const LOW_CAPEX = 0.05;
const capexCaution = (a: Assumptions) =>
  a.capexPct < LOW_CAPEX
    ? `Little effect here: capex is only ${(a.capexPct * 100).toFixed(1)}% of revenue. For a company like this, an investment boom shows up in its customers' spending, so a demand shock or growth cap tells that story better.`
    : null;
const noGapCaution = (a: Assumptions) =>
  gapToIndustry(a) == null ? 'No industry margin is set (or this company is not above it), so a fixed cut of 10 points is used instead. Pick a Damodaran industry in the sidebar to calibrate it.' : null;

const c = (lever: Change['lever'], op: Change['op'], value: number): Change => ({ lever, op, value });
const blanks = () => Array.from({ length: 10 }, () => null as number | null);
const allYears = (v: number) => Array.from({ length: 10 }, () => v);

/* ------------------------------------------------------------------ Templates ------------------------------------------------------------------ */

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'new-competition',
    name: 'New competition',
    story: 'Rivals, or customers building their own (custom chips, private labels), slowly erode pricing power.',
    why: 'The slow squeeze: the margin closes half its lead over the industry within five years, and growth runs 3 points slower every year. It ends at the same margin as the new-entrant shock, but without the shock’s one-time loss of a fifth of revenue, so the two differ in timing and in that loss.',
    basis:
      'A small majority of top-quintile companies are still there ten years later and about half drop out (McKinsey), so half the lead is kept. Generic-drug entry cuts prices about 20% within two to three years once three competitors arrive (ASPE). The 3-point growth drag is a judgment call.',
    sources: [S.mckinsey, S.aspe, S.famaFrench],
    financial: false,
    caution: noGapCaution,
    build: (a) => {
      const gap = gapToIndustry(a);
      return {
        changes: [c('marginTarget', 'add', gap != null ? -gap / 2 : -0.1), c('marginYears', 'set', 5)],
        paths: [{ lever: 'growth', mode: 'add', values: allYears(-0.03) }],
      };
    },
  },
  {
    id: 'new-entrant-shock',
    name: 'New-entrant shock',
    story: 'A rival product (a cheap TPU, Huawei Ascend, a custom ASIC) suddenly takes off in year 3, takes share and forces prices down.',
    why: 'The sudden version of new competition: in year 3 revenue drops 20% for good (share taken by the rival) and the margin falls by half its lead over the industry plus 5 points. The 5 points fade at 38% a year; the rest is permanent. Growth runs 3 points slower afterwards.',
    basis:
      'Price drop: about 20% once three competitors enter (ASPE, generic drugs). Recovery: profitability reverts about 38% a year (Fama & French). Permanent part: about half of top performers keep their edge for a decade (McKinsey). The year-3 timing and the growth drag are judgment calls.',
    sources: [S.aspe, S.famaFrench, S.mckinsey],
    financial: false,
    caution: noGapCaution,
    build: (a) => {
      const gap = gapToIndustry(a);
      const permanent = gap != null ? gap / 2 : 0.1;
      const drop = permanent + 0.05;
      return {
        changes: [
          c('shockYear', 'set', 3),
          c('shockRevLoss', 'set', 0.2),
          c('shockMarginDrop', 'set', drop),
          c('shockPermanent', 'set', permanent / drop),
          c('shockRecovery', 'set', REVERT),
          c('shockGrowthCut', 'set', 0.03),
        ],
      };
    },
  },
  {
    id: 'margin-reverts',
    name: 'Margin reverts to industry (base rate)',
    story: 'The moat is ordinary: margins revert to the industry average at the pace the average company’s do.',
    why: 'At 38% a year, about 90% of the lead over the industry is gone after five years. The target is set there.',
    basis: 'The average reversion speed of corporate profitability (Fama & French, 2000). Exceptional firms revert more slowly; that is the bull case.',
    sources: [S.famaFrench],
    financial: false,
    caution: noGapCaution,
    build: (a) => {
      const gap = gapToIndustry(a);
      return { changes: gap != null ? [c('marginTarget', 'add', -gap * (1 - Math.pow(1 - REVERT, 5))), c('marginYears', 'set', 5)] : [c('marginTarget', 'add', -0.1), c('marginYears', 'set', 5)] };
    },
  },
  {
    id: 'demand-shock',
    name: 'Demand shock (one bad year)',
    story: 'Customers cut spending for a year: sales fall, then climb back toward the old path.',
    why: 'Next year revenue falls 12% (in absolute terms, not just below trend) and the margin drops 10 points. Half of the lost revenue and half of the margin dip come back each following year, so by year 5 the company is nearly back on its base path.',
    basis:
      'Chip-industry sales fell 32% in 2001, 9% in 2009, about 12% in 2019 and 8% in 2023; −12% is a typical bad year, not the worst. NVIDIA’s own operating margin fell about 22 points in fiscal 2023 and was back within a year. Profitability below its mean reverts faster than average (Fama & French). The 50% yearly recovery is a judgment call between those.',
    sources: [S.wsts2001, S.sia2009, S.sia2023, S.nvdaFy23, S.famaFrench],
    financial: false,
    build: (a) => {
      // A −12% year in absolute terms is a drop below the base path that depends on how fast the company was growing.
      const g = modelGrowthPath(a)[1];
      const loss = Math.min(0.9, Math.max(0, 1 - (1 - 0.12) / (1 + g)));
      return {
        changes: [
          c('shockYear', 'set', 1),
          c('shockRevLoss', 'set', loss),
          c('shockRevRecovery', 'set', 0.5),
          c('shockMarginDrop', 'set', 0.1),
          c('shockPermanent', 'set', 0),
          c('shockRecovery', 'set', 0.5),
        ],
      };
    },
  },
  {
    id: 'growth-fades',
    name: 'Growth fades at base rates',
    story: 'The boom behaves like most booms: it does not last.',
    why: 'Only 30% of growth above a typical company’s is left each following year, the pace measured on S&P 500 companies, instead of the research default of 70%.',
    basis: 'This site’s backtest finds 23-33% of excess growth left after one year; growth rates have little persistence in general (Chan, Karceski & Lakonishok).',
    sources: [S.growthBacktest, S.ckl],
    financial: false,
    caution: (a) =>
      a.g1 <= (a.gTypical ?? 0.06)
        ? 'This company is growing slower than a typical one, so a faster fade pulls its growth up toward typical and raises the value. Base rates work both ways.'
        : null,
    build: () => ({ changes: [c('gDecay', 'set', 0.3)] }),
  },
  {
    id: 'energy-crunch',
    name: 'Energy crunch (grid full)',
    story: 'The grid is full: new data centres and factories wait years for power; gas turbines fill part of the gap at a higher cost.',
    why: 'Written for power users: revenue growth is capped at 15% a year for five years, power costs take 3 margin points, and own generation adds a fifth to capex. A utility or turbine maker may gain instead: flip the signs.',
    basis:
      'The median wait from grid request to operation is now over five years (Berkeley Lab), and up to seven for large data centres in Virginia (Dominion, via Bloomberg). The 15% cap, the margin and the capex numbers are judgment calls: there is no history of a grid-capacity limit on this scale.',
    sources: [S.lbnl, S.dominion],
    financial: false,
    build: () => ({ changes: [c('growthCap', 'set', 0.15), c('growthCapYears', 'set', 5), c('marginTarget', 'add', -0.03), c('capexPct', 'scale', 1.2)] }),
  },
  {
    id: 'energy-price-shock',
    name: 'Energy price shock (1973, 1979, 2022)',
    story: 'Oil or gas prices spike: energy-heavy producers cut output and margins shrink for a year or two.',
    why: 'Next year, volume falls 6% and the margin drops 5 points, recovering at 38% a year. Fits energy-intensive firms (chemicals, metals, airlines, fertiliser); for others it is too harsh.',
    basis:
      'German chemical output fell about 6% in the 2022 gas crisis (VCI). The macro effect of oil shocks is real but smaller than often assumed (Kilian; Hamilton). Recovery follows profitability’s average reversion (Fama & French). The 5-point margin hit is a judgment call.',
    sources: [S.vci, S.hamilton, S.kilian, S.famaFrench],
    financial: false,
    build: () => ({
      changes: [c('shockYear', 'set', 1), c('shockRevLoss', 'set', 0.06), c('shockMarginDrop', 'set', 0.05), c('shockPermanent', 'set', 0), c('shockRecovery', 'set', REVERT)],
    }),
  },
  {
    id: 'rate-shock',
    name: 'Rate shock (Volcker-style)',
    story: 'Inflation returns: the 10-year Treasury runs at 10% for two years, then settles one point above today.',
    why: 'Years 1-2 are discounted at the spike, everything after at a lasting +1 point. The cost of debt moves with it.',
    basis:
      'The 10-year yield was above 10% in 1980-81. Long-duration (growth) stocks are the most sensitive to discount rates (Dechow, Sloan & Soliman). The 10% level is a stress test, not a forecast.',
    sources: [S.dechow, S.bernankeKuttner],
    financial: false,
    build: () => {
      const v = blanks();
      v[0] = 0.1;
      v[1] = 0.1;
      return { changes: [c('rf', 'add', 0.01)], paths: [{ lever: 'rf', mode: 'set', values: v }] };
    },
  },
  {
    id: 'rates-high',
    name: 'Rates stay high',
    story: 'No return to cheap money: a lasting rise like 2022’s.',
    why: 'Two points on the risk-free rate for good, about the size of the 2022 rise in the 10-year yield.',
    basis: 'Unexpected rate moves shift stock prices mainly through discount rates (Bernanke & Kuttner); long-duration stocks move most (Dechow, Sloan & Soliman).',
    sources: [S.bernankeKuttner, S.dechow],
    financial: true,
    build: () => ({ changes: [c('rf', 'add', 0.02)] }),
  },
  {
    id: 'rate-cut',
    name: 'Rate cut',
    story: 'Borrowing gets much cheaper, as in a recession response.',
    why: 'Two points off the risk-free rate. Terminal growth is capped at the risk-free rate, so it may fall with it.',
    basis: 'The mirror image of rates staying high; surprise cuts lift stock prices (Bernanke & Kuttner). In a real recession, a demand shock usually comes with it: combine the two.',
    sources: [S.bernankeKuttner],
    financial: true,
    build: () => ({ changes: [c('rf', 'add', -0.02)] }),
  },
  {
    id: 'capex-high',
    name: 'Capex stays high',
    story: 'The investment cycle never ends: data centres, fabs, grid connections.',
    why: 'Capex half again as large and held for all ten years instead of fading to depreciation.',
    basis: 'A judgment call: there is no reliable base rate for how long investment cycles last. The default fade to depreciation reflects that mature firms spend roughly what they depreciate.',
    sources: [],
    financial: false,
    caution: capexCaution,
    // D&A is left alone: with the operating margin fixed, more D&A would only add cash (no cost), raising the value.
    build: () => ({ changes: [c('capexPct', 'scale', 1.5), c('capexHighYears', 'set', 10)] }),
  },
  {
    id: 'capex-normalises',
    name: 'Capex high, then normalises',
    story: 'The build-out runs three more years, then spending falls back to maintenance.',
    why: 'Capex half again as large for three years, then a straight line down to depreciation by year 10.',
    basis: 'A judgment call on the length of the cycle; the end point (capex equal to depreciation) is the standard mature-company assumption.',
    sources: [],
    financial: false,
    caution: capexCaution,
    build: () => ({ changes: [c('capexPct', 'scale', 1.5), c('capexHighYears', 'set', 3)] }),
  },
  {
    id: 'riskier',
    name: 'Riskier than the market thinks',
    story: 'A few big customers, regulation or export controls make the business riskier.',
    why: 'Beta up 0.3. The discount rate rises; the cash flows stay the same.',
    basis: 'A judgment call. Compare it with the 95% range shown under the regression beta in the sidebar: a move inside that range is well within what the data allow.',
    sources: [],
    financial: true,
    build: () => ({ changes: [c('beta', 'add', 0.3)] }),
  },
  {
    id: 'bull-moat',
    name: 'Bull: moat holds',
    story: 'Software and ecosystem lock-in keep pricing power.',
    why: 'Growth fades more slowly (75% of the excess kept each year instead of 70%) and margins edge 3 points higher.',
    basis: 'About half of top performers keep their edge for a decade (McKinsey): this is the half that does. The 75% fade and the 3 points are judgment calls; small changes to the fade compound hugely for a fast grower.',
    sources: [S.mckinsey],
    financial: false,
    build: () => ({ changes: [c('gDecay', 'set', 0.75), c('marginTarget', 'add', 0.03)] }),
  },
];
