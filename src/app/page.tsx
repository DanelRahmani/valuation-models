import Link from 'next/link';
import { TickerSearch } from '@/components/TickerSearch';
import { HeroDcf } from '@/components/HeroDcf';
import { RandomCompanyButton } from '@/components/RandomCompany';

const MODELS: { name: string; rate: string; idea: string; fit: string }[] = [
  { name: 'FCFF DCF', rate: 'WACC', idea: 'Cash flow to the whole firm, then subtract net debt.', fit: 'Most operating companies' },
  { name: 'FCFE DCF', rate: 'Cost of equity', idea: 'Cash flow left for shareholders after debt is served.', fit: 'Banks, stable leverage' },
  { name: 'APV', rate: 'Unlevered cost of equity', idea: 'The firm as if debt-free, plus the tax shield of its debt.', fit: 'LBOs, changing leverage' },
  { name: 'Residual income', rate: 'Cost of equity', idea: 'Book value plus profits above what shareholders require.', fit: 'Banks, insurers' },
  { name: 'Dividend discount', rate: 'Cost of equity', idea: 'Gordon growth, two-stage and H-model.', fit: 'Mature dividend payers' },
  { name: 'Multiples', rate: 'Market prices', idea: 'P/E, EV/EBITDA, EV/Sales, P/B and PEG against industry averages.', fit: 'A reality check' },
  { name: 'Reverse DCF', rate: 'WACC', idea: 'The growth rate the current price already assumes.', fit: 'Anything priced on hope' },
  { name: 'Scenarios', rate: 'WACC', idea: 'Bear, base and bull with probabilities, compute capex and dilution.', fit: 'Pre-profit and AI companies' },
];

export default function Home() {
  return (
    <>
      <section className="relative pb-14 pt-14 sm:pt-20">
        <div aria-hidden className="hero-vignette absolute -inset-x-24 -top-10 bottom-0" />
        <div className="relative">
          <p className="font-mono text-xs text-muted">S&amp;P 500 · SEC filings · refreshed monthly</p>
          <h1 className="mt-5 max-w-3xl font-serif text-5xl italic leading-[1.02] tracking-[-0.01em] sm:text-7xl">
            What is a company worth<span className="text-accent">?</span>
          </h1>
          <div aria-hidden className="mt-6 h-px w-56 bg-accent/70" />
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            Type a ticker and I pull its filings, estimate its beta and cost of capital, and run eight valuation models side by side. Click any number to see the
            formula behind it, or take the whole model to Excel with every formula live.
          </p>
          <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="w-full sm:max-w-md">
              <TickerSearch />
            </div>
            <RandomCompanyButton />
          </div>
        </div>
      </section>

      <section aria-label="Live example">
        <HeroDcf />
      </section>

      <section className="mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-serif text-4xl">Eight ways to answer it</h2>
          <Link href="/methodology/" className="link text-sm">
            How each one works
          </Link>
        </div>
        <p className="mt-3 max-w-2xl text-muted">
          They disagree on purpose. Each rests on a different idea of where value comes from, and where they diverge is usually where the interesting question
          is.
        </p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {MODELS.map((m) => (
            <li key={m.name} className="group relative rounded-[1.5rem] border border-seam bg-panel/60 p-6 transition-colors hover:bg-panel">
              <svg aria-hidden className="card-stitch pointer-events-none absolute inset-0 h-full w-full">
                <rect x="1" y="1" rx="23" />
              </svg>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-serif text-2xl">{m.name}</h3>
                <span className="font-mono text-[0.6875rem] text-muted">{m.rate}</span>
              </div>
              <p className="mt-2 text-sm">{m.idea}</p>
              <p className="mt-3 font-mono text-[0.6875rem] text-accent">Best for: {m.fit}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-20 grid gap-10 sm:grid-cols-3">
        {[
          ['Every number has a source', 'Each input shows where it came from: an XBRL tag in a 10-K, the monthly snapshot, a default, or you.'],
          ['Every formula is visible', 'Click any cell for the calculation in words and as an Excel formula. The export is the same model, live.'],
          ['The models agree with each other', 'FCFF, FCFE, APV and residual income share assumptions and land within about one percent.'],
        ].map(([t, d]) => (
          <div key={t} className="seam pt-4">
            <h3 className="font-serif text-xl">{t}</h3>
            <p className="mt-2 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>
    </>
  );
}
