import Link from 'next/link';
import { TickerSearch } from '@/components/TickerSearch';

const MODELS = [
  ['FCFF DCF', 'Cash flow to the whole firm, discounted at WACC.'],
  ['FCFE DCF', 'Cash flow to shareholders, at the cost of equity.'],
  ['APV', 'Unlevered value plus the tax shield of debt.'],
  ['Residual income', 'Book value plus returns above the cost of equity.'],
  ['Dividend discount', 'Gordon growth, two-stage and the H-model.'],
  ['Multiples', 'P/E, EV/EBITDA, EV/Sales, P/B and PEG against industry averages.'],
  ['Reverse DCF', 'The growth rate the current price already assumes.'],
  ['Scenarios', 'Bear, base and bull cases for pre-profit and AI-style companies.'],
];

export default function Home() {
  return (
    <>
      <section className="pb-16 pt-12 sm:pt-20">
        <p className="font-mono text-xs uppercase tracking-wider text-muted">S&amp;P 500 · SEC filings · every formula visible</p>
        <h1 className="mt-4 max-w-3xl font-serif text-5xl leading-[1.05] sm:text-6xl">What is a company worth, and what would you have to believe?</h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Type a ticker. I pull its filings, estimate its beta and cost of capital, and run eight valuation models side by side. Click any number to see the
          formula behind it, or download the whole thing as an Excel model with live formulas.
        </p>
        <div className="mt-10">
          <TickerSearch />
        </div>
        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <Link href="/value/?t=NVDA" className="link">
            Try it with NVIDIA
          </Link>
          <Link href="/value/" className="link">
            Any company (upload its SEC file)
          </Link>
          <Link href="/methodology/" className="link">
            How it works
          </Link>
        </div>
      </section>
      <section className="border-t border-seam py-12">
        <h2 className="font-serif text-3xl">The models</h2>
        <dl className="mt-8 grid gap-x-12 gap-y-6 sm:grid-cols-2">
          {MODELS.map(([t, d]) => (
            <div key={t} className="border-t border-seam pt-3">
              <dt className="font-serif text-xl">{t}</dt>
              <dd className="mt-1 text-sm text-muted">{d}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
