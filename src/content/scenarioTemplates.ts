/**
 * Ready-made scenarios. Each is a story plus changes relative to the company's own base case, so the same template fits
 * any company. The numbers are starting points to adjust, not research results.
 */
import type { Assumptions } from '@/lib/finance/assumptions';
import type { Change, PathChange } from '@/lib/scenarios/types';

export interface ScenarioTemplate {
  id: string;
  name: string;
  story: string;
  /** Who it fits and what to watch, in the voice of the model notes. */
  why: string;
  /** Works for banks and insurers too (no cash-flow levers). */
  financial: boolean;
  build: (a: Assumptions) => { changes: Change[]; paths?: PathChange[] };
}

const c = (lever: Change['lever'], op: Change['op'], value: number): Change => ({ lever, op, value });
const blanks = () => Array.from({ length: 10 }, () => null as number | null);

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'new-competition',
    name: 'New competition',
    story: 'Rivals, or customers building their own (custom chips, private labels), slowly erode pricing power.',
    why: 'The slow squeeze: margins drift down over five years and the boom fades faster. Competition pulls high returns toward the cost of capital, usually not all the way.',
    financial: false,
    build: () => ({ changes: [c('marginTarget', 'add', -0.15), c('marginYears', 'set', 5), c('gDecay', 'add', -0.15)] }),
  },
  {
    id: 'new-entrant-shock',
    name: 'New-entrant shock',
    story: 'A rival product (a cheap TPU, Huawei Ascend, a custom ASIC) suddenly takes off in year 3, takes share and forces prices down.',
    why: 'The sudden version of new competition: a one-time step down in revenue and margin, partly won back later. A later shock leaves more good years before it.',
    financial: false,
    build: () => ({
      changes: [c('shockYear', 'set', 3), c('shockRevLoss', 'set', 0.2), c('shockMarginDrop', 'set', 0.2), c('shockRecovery', 'set', 0.25), c('shockGrowthCut', 'set', 0.03)],
    }),
  },
  {
    id: 'margin-reverts',
    name: 'Margin reverts to industry',
    story: 'The moat is weaker than it looks; margins drift halfway to the industry average.',
    why: 'Uses the Damodaran industry margin when one is set for this company; otherwise takes five points off.',
    financial: false,
    build: (a) => ({
      changes:
        a.peers.margin != null && a.marginTarget != null
          ? [c('marginTarget', 'set', (a.marginTarget + a.peers.margin) / 2), c('marginYears', 'set', 7)]
          : [c('marginTarget', 'add', -0.05), c('marginYears', 'set', 7)],
    }),
  },
  {
    id: 'capex-high',
    name: 'Capex stays high',
    story: 'The investment cycle never ends: data centres, fabs, grid connections.',
    why: 'Capex half again as large and held for all ten years instead of fading to depreciation; depreciation rises with it.',
    financial: false,
    build: () => ({ changes: [c('capexPct', 'scale', 1.5), c('capexHighYears', 'set', 10), c('daPct', 'scale', 1.2)] }),
  },
  {
    id: 'capex-normalises',
    name: 'Capex high, then normalises',
    story: 'The build-out runs three more years, then spending falls back to maintenance.',
    why: 'Capex half again as large for three years, then a straight line down to depreciation by year 10.',
    financial: false,
    build: (a) => ({ changes: [c('capexPct', 'scale', 1.5), c('capexHighYears', 'set', 3), c('capexNormal', 'set', a.daPct)] }),
  },
  {
    id: 'growth-fades',
    name: 'Growth fades faster',
    story: 'The boom was demand pulled forward, not a new normal.',
    why: 'Starts from lower growth and lets the excess over a typical company fade faster.',
    financial: false,
    build: () => ({ changes: [c('g1', 'scale', 0.7), c('gDecay', 'add', -0.15)] }),
  },
  {
    id: 'demand-shock',
    name: 'Demand shock',
    story: 'A down year, then recovery to a lower plateau.',
    why: 'Revenue falls 15% next year and margins settle eight points lower. Cyclical businesses see this every decade or so.',
    financial: false,
    build: () => ({ changes: [c('g1', 'set', -0.15), c('marginTarget', 'add', -0.08)] }),
  },
  {
    id: 'energy-crunch',
    name: 'Energy crunch',
    story: 'The grid is full: new data centres and factories wait years for power; gas turbines fill some of the gap at a higher cost and face limits in some countries.',
    why: 'Written for power users: growth is capped at 15% a year for four years, power costs take three margin points, own generation adds capex. A utility or turbine maker may gain instead: flip the signs.',
    financial: false,
    build: () => ({ changes: [c('growthCap', 'set', 0.15), c('growthCapYears', 'set', 4), c('marginTarget', 'add', -0.03), c('capexPct', 'scale', 1.2), c('beta', 'add', 0.1)] }),
  },
  {
    id: 'rate-shock',
    name: 'Rate shock',
    story: 'Inflation returns: the 10-year Treasury jumps to 10% for two years, then settles at 6%.',
    why: 'Years 1-2 are discounted at the spike, everything after at the new lasting 6%. The cost of debt moves with it.',
    financial: false,
    build: () => {
      const v = blanks();
      v[0] = 0.1;
      v[1] = 0.1;
      return { changes: [c('rf', 'set', 0.06)], paths: [{ lever: 'rf', mode: 'set', values: v }] };
    },
  },
  {
    id: 'rates-high',
    name: 'Rates stay high',
    story: 'No return to cheap money.',
    why: 'Two points on the risk-free rate for good and half a point on the equity risk premium.',
    financial: true,
    build: () => ({ changes: [c('rf', 'add', 0.02), c('erp', 'add', 0.005)] }),
  },
  {
    id: 'rate-cut',
    name: 'Rate cut',
    story: 'Borrowing gets much cheaper, as in a recession response.',
    why: 'Two points off the risk-free rate. Terminal growth is capped at the risk-free rate, so it may fall with it.',
    financial: true,
    build: () => ({ changes: [c('rf', 'add', -0.02)] }),
  },
  {
    id: 'riskier',
    name: 'Riskier than the market thinks',
    story: 'A few big customers, regulation or export controls make the business riskier.',
    why: 'Beta up 0.3. The discount rate rises; the cash flows stay the same.',
    financial: true,
    build: () => ({ changes: [c('beta', 'add', 0.3)] }),
  },
  {
    id: 'bull-moat',
    name: 'Bull: moat holds',
    story: 'Software and ecosystem lock-in keep pricing power.',
    why: 'Margins five points higher and growth fading more slowly.',
    financial: false,
    build: () => ({ changes: [c('marginTarget', 'add', 0.05), c('gDecay', 'set', 0.8)] }),
  },
];
