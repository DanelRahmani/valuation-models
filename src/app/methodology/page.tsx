import { GitHubIcon } from '@/components/SiteNav';

export const metadata = { title: 'Methodology' };

const SECTIONS = [
  ['data', 'Data'],
  ['refresh', 'Monthly refresh'],
  ['rates', 'Discount rates'],
  ['forecast', 'Forecast'],
  ['models', 'The models'],
  ['consistency', 'Consistency'],
  ['ai', 'Valuing AI companies'],
  ['limits', 'Limits'],
  ['sources', 'Sources'],
  ['references', 'Further reading'],
] as const;

const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <h2 id={id} className="seam mt-16 scroll-mt-24 pt-8 font-serif text-3xl sm:text-4xl">
    {children}
  </h2>
);
const F = ({ children }: { children: React.ReactNode }) => (
  <p className="num my-4 rounded-2xl border border-seam bg-panel/70 px-4 py-3 text-[0.8125rem]">{children}</p>
);
const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a className="link" href={href} target="_blank" rel="noreferrer">
    {children}
  </a>
);

const SOURCES: { name: string; href: string; what: string; how: string }[] = [
  {
    name: 'SEC EDGAR: XBRL company facts (bulk)',
    href: 'https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip',
    what: 'Every financial figure companies tag in their 10-K filings.',
    how: 'Downloaded once a month (about 1 GB), trimmed to around twenty concepts per company.',
  },
  {
    name: 'SEC EDGAR: company facts API',
    href: 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces',
    what: 'The same data for one company at a time.',
    how: 'Fallback when the bulk file fails, and the file format for uploads on the "Any company" page.',
  },
  {
    name: 'SEC: ticker to CIK map',
    href: 'https://www.sec.gov/files/company_tickers.json',
    what: 'The official link between ticker symbols and SEC filer numbers.',
    how: 'Used to find the right filer for each ticker.',
  },
  {
    name: 'S&P 500 constituents',
    href: 'https://github.com/datasets/s-and-p-500-companies',
    what: 'Tickers, names, GICS sector and sub-industry.',
    how: 'Refreshed each run; the previous list is kept if it fails.',
  },
  {
    name: 'US Treasury: daily par yield curve',
    href: 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve',
    what: 'The 10-year Treasury yield.',
    how: 'The risk-free rate. FRED is the fallback.',
  },
  {
    name: 'FRED: 10-year Treasury (DGS10)',
    href: 'https://fred.stlouisfed.org/series/DGS10',
    what: 'Federal Reserve Bank of St. Louis series for the same yield.',
    how: 'Fallback for the risk-free rate.',
  },
  {
    name: 'Damodaran: implied equity risk premium',
    href: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/implpr.html',
    what: 'The S&P 500 risk premium backed out of current prices.',
    how: 'The equity risk premium in CAPM.',
  },
  {
    name: 'Damodaran: industry betas',
    href: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/Betas.html',
    what: 'Unlevered betas by industry for US companies.',
    how: 'The bottom-up beta option, relevered at each company’s debt-to-equity.',
  },
  {
    name: 'Damodaran: industry multiples',
    href: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/pedata.html',
    what: 'P/E, PEG, EV/EBITDA, EV/Sales and P/B by industry (separate pages for each).',
    how: 'Default peer multiples for the relative valuation.',
  },
  {
    name: 'Nasdaq: historical quotes',
    href: 'https://www.nasdaq.com/market-activity/stocks/aapl/historical',
    what: 'Five years of daily prices for each stock and for SPY.',
    how: 'Monthly returns for the beta regression, and the latest close. Raw prices are not republished.',
  },
  {
    name: 'Yahoo Finance: price history',
    href: 'https://finance.yahoo.com/',
    what: 'The same price data from a second provider.',
    how: 'Fallback when Nasdaq has no data for a ticker.',
  },
];

export default function Methodology() {
  return (
    <article className="pb-12 pt-14">
      <p className="font-mono text-xs text-muted">Methodology</p>
      <h1 className="mt-5 font-serif text-5xl italic leading-[1.02] sm:text-6xl">How the numbers are made</h1>
      <div aria-hidden className="mt-6 h-px w-40 bg-accent/70" />
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
        Every value on the site comes from a formula you can click and read, and the Excel export contains those same formulas. This page explains the choices
        behind them, lists every source with a link, and says where the models break.
      </p>

      <div className="mt-10 grid gap-12 lg:grid-cols-[200px_1fr]">
        <nav aria-label="On this page" className="lg:sticky lg:top-8 lg:self-start">
          <p className="font-mono text-[0.6875rem] text-muted">On this page</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-muted transition-colors hover:text-accent">
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href="https://github.com/DanelRahmani/valuation-models"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-seam px-4 py-2 text-sm text-accent transition-colors hover:bg-panel-strong"
          >
            <GitHubIcon /> Source code
          </a>
        </nav>

        <div className="max-w-2xl leading-relaxed">
          <H2 id="data">Data</H2>
          <p className="mt-4">
            Financials come from SEC EDGAR XBRL company facts: annual 10-K values only, de-duplicated so restated figures replace the originals. Companies tag
            the same concept differently (revenue alone has five common tags), so each line item has an ordered list of fallback tags. Hover any historical
            figure on a valuation page to see the tag, period and filing date behind it.
          </p>

          <H2 id="refresh">Monthly refresh</H2>
          <p className="mt-4">
            A{' '}
            <A href="https://github.com/DanelRahmani/valuation-models/blob/main/.github/workflows/snapshot.yml">GitHub Action</A> runs on the 2nd of every month:
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5">
            <li>Refresh the S&amp;P 500 list and map each ticker to its SEC filer.</li>
            <li>Download SEC&apos;s nightly bulk file and keep the twenty concepts the models use.</li>
            <li>Fetch the 10-year Treasury yield, Damodaran&apos;s risk premium, industry betas and multiples.</li>
            <li>Regress five years of monthly returns for each stock on SPY and keep only the statistics.</li>
            <li>Commit the result, which redeploys the site.</li>
          </ol>
          <p className="mt-4">
            If more than 5% of companies fail, nothing is written and the site keeps last month&apos;s data; an issue is opened so I hear about it. Each page shows
            the date its data was taken.
          </p>

          <H2 id="rates">Discount rates</H2>
          <F>Cost of equity = rf + β × ERP</F>
          <F>WACC = E/V × re + D/V × rd × (1 - t)</F>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            <li>
              <strong>Risk-free rate:</strong> the 10-year Treasury yield, because the cash flows being discounted are long-dated. A 3-month bill would
              understate it.
            </li>
            <li>
              <strong>Equity risk premium:</strong> Damodaran&apos;s implied premium for the S&amp;P 500, backed out of current prices rather than historical
              averages.
            </li>
            <li>
              <strong>Beta:</strong> an OLS regression of monthly stock returns on SPY returns over five years, reported with R², standard error and a 95%
              interval. One company&apos;s regression is noisy, so the site also offers the Blume adjustment (0.67β + 0.33) and Damodaran&apos;s industry beta
              relevered at the company&apos;s own debt-to-equity. When R² is low, the industry beta is usually the better estimate.
            </li>
          </ul>
          <F>Hamada: βL = βU × (1 + (1 - t) × D/E)</F>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Cost of debt:</strong> interest expense over total debt, bounded below by the risk-free rate.
            </li>
            <li>
              <strong>Which rate where:</strong> FCFF uses WACC; FCFE, residual income and the dividend models use the cost of equity; APV uses the unlevered cost
              of equity.
            </li>
          </ul>

          <H2 id="forecast">Forecast</H2>
          <p className="mt-4">
            Ten years. Revenue grows at the stage-1 rate for five years, then fades in a straight line to terminal growth. The operating margin moves from today
            to a target over a chosen number of years. Capex and D&amp;A are percentages of revenue (three-year averages by default), and working capital
            absorbs a share of each new dollar of revenue. Defaults are a starting point, not a forecast.
          </p>
          <F>FCFF = EBIT × (1 - t) + D&amp;A - capex - ΔNWC</F>
          <F>Terminal value = FCFF₁₀ × (1 + g) / (WACC - g), or EBITDA₁₀ × exit multiple</F>
          <p className="mt-4">
            Terminal growth is capped at the risk-free rate by default: in the long run no company grows faster than the economy. The site warns when the terminal
            value is most of the enterprise value.
          </p>

          <H2 id="models">The models</H2>
          <dl className="mt-6 space-y-6">
            {[
              ['FCFF DCF', 'Free cash flow to the firm, discounted at WACC, minus net debt.'],
              ['FCFE DCF', 'Net income minus the equity-funded share of reinvestment, discounted at the cost of equity, plus cash and investments.'],
              ['APV', 'FCFF discounted at the unlevered cost of equity, plus the present value of interest tax shields (t × D for permanent debt).'],
              ['Residual income', 'Book equity plus the present value of net income above the equity charge (re × opening book).'],
              ['Gordon growth', 'V = D₁ / (re - g).'],
              ['Two-stage DDM', 'Five years of dividends at stage-1 growth, then Gordon.'],
              ['H-model', 'V = D₀(1 + gL)/(re - gL) + D₀ × H × (gS - gL)/(re - gL), for growth that fades in a straight line.'],
              ['Multiples', 'Company metric × peer multiple; enterprise multiples subtract net debt. Negative bases are skipped.'],
              ['Reverse DCF', 'Bisection on stage-1 growth until the FCFF value equals the share price.'],
              ['Scenarios', 'Three FCFF models with their own growth, margin and capex, weighted by probability, with extra shares for dilution.'],
            ].map(([k, v]) => (
              <div key={k} className="grid gap-1 sm:grid-cols-[160px_1fr]">
                <dt className="font-serif text-lg">{k}</dt>
                <dd className="text-muted">{v}</dd>
              </div>
            ))}
          </dl>

          <H2 id="consistency">Consistency</H2>
          <p className="mt-4">
            FCFF, FCFE, APV and residual income should give similar answers when they share assumptions, and here they land within about one percent of each
            other. FCFE funds reinvestment at the current debt weight so leverage stays constant. Residual income uses clean-surplus accounting: book equity grows
            only by what is reinvested, which ties it to FCFE. Large gaps between methods usually point to an inconsistent input, which is itself worth knowing.
          </p>
          <p className="mt-4">
            The engine was checked on NVIDIA: historicals against the 10-K and Yahoo Finance, the FCFF value against an independent recomputation, and the Excel
            export against Microsoft Excel&apos;s own recalculation (identical to four decimals). The write-up is in the{' '}
            <A href="https://github.com/DanelRahmani/valuation-models/blob/main/docs/dry-run-nvda.md">repository</A>.
          </p>

          <H2 id="ai">Valuing AI companies</H2>
          <p className="mt-4">
            Classic models assume capex settles near depreciation and that value sits in assets on the balance sheet. AI companies break both: they spend years
            building compute ahead of revenue, and their main assets (models, data, talent) are expensed. Pre-profit / AI mode replaces one heroic forecast with
            three scenarios, each with its own growth, margin path and compute intensity, weighted by probabilities you choose, and adds dilution from
            conversions and stock compensation. The reverse DCF turns a headline valuation into the growth it requires, which is usually the more honest
            conversation.
          </p>

          <H2 id="limits">Limits</H2>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            <li>Annual data only; nothing changes between 10-K filings.</li>
            <li>Leases, pensions, minority interests and options are not adjusted for separately.</li>
            <li>Banks and insurers fit FCFF poorly; use FCFE, residual income or the dividend models for them.</li>
            <li>Industry mapping from GICS to Damodaran categories is automatic and sometimes wrong. You can change it on each page.</li>
            <li>Price data is used to estimate betas but is not licensed for redistribution, so it is never published.</li>
          </ul>

          <H2 id="sources">Sources</H2>
          <ul className="mt-6 space-y-3">
            {SOURCES.map((s) => (
              <li key={s.name} className="rounded-2xl border border-seam bg-panel/60 px-5 py-4">
                <A href={s.href}>{s.name}</A>
                <p className="mt-1 text-sm">{s.what}</p>
                <p className="mt-1 font-mono text-[0.6875rem] text-muted">{s.how}</p>
              </li>
            ))}
          </ul>

          <H2 id="references">Further reading</H2>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            <li>
              Aswath Damodaran, <em>Investment Valuation</em>, 3rd ed., Wiley. The source for most of the conventions here.{' '}
              <A href="https://pages.stern.nyu.edu/~adamodar/">Damodaran Online</A>
            </li>
            <li>
              McKinsey &amp; Company (Koller, Goedhart, Wessels), <em>Valuation: Measuring and Managing the Value of Companies</em>, Wiley.
            </li>
            <li>
              Berk and DeMarzo, <em>Corporate Finance</em>, Pearson. Chapters on capital budgeting, WACC and APV.
            </li>
            <li>
              Marshall Blume (1971), &ldquo;On the Assessment of Risk&rdquo;, <em>Journal of Finance</em> 26(1). The beta adjustment.
            </li>
            <li>
              Robert Hamada (1972), &ldquo;The Effect of the Firm&apos;s Capital Structure on the Systematic Risk of Common Stocks&rdquo;, <em>Journal of Finance</em>{' '}
              27(2).
            </li>
          </ul>

          <p className="seam mt-16 pt-6 text-sm text-muted">
            These are mathematical valuations under stated assumptions, not investment advice. Built by <A href="https://danelrahmani.com">Danel Rahmani</A>.
            The code is open on <A href="https://github.com/DanelRahmani/valuation-models">GitHub</A>.
          </p>
        </div>
      </div>
    </article>
  );
}
