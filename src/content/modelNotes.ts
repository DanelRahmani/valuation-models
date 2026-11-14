import type { ModelId } from '@/lib/finance/calcsheet';

export interface ModelNote {
  short: string;
  bestFor: string;
  watchOut: string;
  ai: string;
}

export const MODEL_NOTES: Partial<Record<ModelId, ModelNote>> = {
  fcff: {
    short: 'FCFF DCF',
    bestFor: 'Most operating companies, especially when leverage is stable and cash flows are positive.',
    watchOut: 'Terminal value usually carries most of the answer. Check the sensitivity grid before trusting a single number.',
    ai: 'Still the backbone, but AI firms break the "capex settles near depreciation" habit. Years of heavy compute spending push free cash flow negative early and shift value into the terminal year.',
  },
  fcfe: {
    short: 'FCFE DCF',
    bestFor: 'Banks and companies whose debt level is a policy choice rather than a financing need.',
    watchOut: 'Sensitive to the borrowing assumption. Here reinvestment is funded at the current debt weight.',
    ai: 'Works as well as FCFF. Watch dilution: AI companies pay heavily in stock, which this model only sees through the share count.',
  },
  apv: {
    short: 'APV',
    bestFor: 'Leveraged buyouts and companies whose debt will change a lot over the forecast.',
    watchOut: 'Treats debt as permanent and ignores the cost of financial distress, so it flatters highly levered firms.',
    ai: 'Relevant again as AI labs fund data centres with project debt and leases. A changing capital structure is exactly what APV handles.',
  },
  ri: {
    short: 'Residual income',
    bestFor: 'Banks, insurers and asset-heavy firms where book value means something.',
    watchOut: 'Book value is accounting, not economics. Buybacks and write-offs distort it.',
    ai: 'Weak for AI companies: their main assets (models, data, talent) are mostly expensed, so book value understates what they own.',
  },
  ddm_gordon: {
    short: 'Gordon growth',
    bestFor: 'Mature dividend payers with steady growth: utilities, consumer staples, some banks.',
    watchOut: 'Explodes as growth approaches the cost of equity, and ignores buybacks entirely.',
    ai: 'Mostly irrelevant for AI firms, which retain everything. It survives as the terminal value formula inside every DCF.',
  },
  ddm_2stage: {
    short: 'Two-stage DDM',
    bestFor: 'Dividend payers expected to grow faster for a few years before settling.',
    watchOut: 'The jump from high growth to stable growth is abrupt. The H-model smooths it.',
    ai: 'Same limits as Gordon. Useful for incumbents adopting AI that keep paying dividends.',
  },
  ddm_h: {
    short: 'H-model',
    bestFor: 'Dividend payers whose growth fades gradually toward the long-run rate.',
    watchOut: 'An approximation: exact only when growth falls in a straight line.',
    ai: 'A fading-growth path fits an AI cost advantage that competitors slowly copy.',
  },
  total_payout: {
    short: 'Total payout',
    bestFor: 'Mature companies that return cash through buybacks as well as dividends: most large US firms today.',
    watchOut: 'Only counts cash actually handed back. A company piling up cash while it grows (paying out a third of earnings, say) looks cheaper here than in FCFF, which counts all free cash flow. Buybacks are lumpy, so the payout ratio is a three-year average.',
    ai: 'Big tech returns hundreds of billions through buybacks while spending on AI. If capex keeps rising, the payout ratio has to fall, and this value with it.',
  },
  multiples: {
    short: 'Multiples',
    bestFor: 'A reality check against how the market prices similar companies right now.',
    watchOut: 'Inherits whatever the market gets wrong about the whole industry. Peer defaults are Damodaran industry averages.',
    ai: 'EV/Sales is how most AI companies are priced today, which says more about expectations than about value.',
  },
  scenarios: {
    short: 'Scenario-weighted',
    bestFor: 'Companies whose outcomes are genuinely binary: pre-profit, hyper-growth, regulatory risk.',
    watchOut: 'The probabilities are opinions. Write down why you chose them.',
    ai: 'Built for this case. Replace one heroic forecast with three you can argue about.',
  },
  reverse: {
    short: 'Reverse DCF',
    bestFor: 'Anything priced on expectations: asking what the price already assumes.',
    watchOut: 'Solves for one variable only (stage-1 growth). Margins and reinvestment stay where you set them.',
    ai: 'The most useful lens for AI valuations: turn a headline price into a growth rate you can judge.',
  },
};
