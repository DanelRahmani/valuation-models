import { pageMeta } from '../_og/site';
import { GitHubIcon } from '@/components/SiteNav';

export const metadata = { title: 'Methodology', ...pageMeta('/methodology/', 'Methodology · Valuation Models') };

const SECTIONS = [
  ['data', 'Data'],
  ['refresh', 'Monthly refresh'],
  ['rates', 'Discount rates'],
  ['forecast', 'Forecast'],
  ['models', 'The models'],
  ['financials', 'Banks and insurers'],
  ['peers', 'Peers and value creation'],
  ['uncertainty', 'Sensitivity and uncertainty'],
  ['validation', 'Validation'],
  ['consistency', 'Consistency'],
  ['ai', 'Valuing AI companies'],
  ['limits', 'Limits and judgment calls'],
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
    how: 'Downloaded once a month (about 1 GB), trimmed to the few dozen concepts the models use.',
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
    name: 'Nasdaq: quote summary',
    href: 'https://www.nasdaq.com/market-activity/stocks/aapl',
    what: 'Market capitalisation for each stock.',
    how: 'A cross-check on the SEC share count, to catch splits and mergers after the latest filing.',
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
            the same concept differently (revenue alone has five common tags), so each line item has an ordered list of fallback tags. A figure is only used
            for the fiscal year it belongs to: if the latest 10-K lacks an item, it shows as missing rather than borrowing an older year. Hover any historical
            figure on a valuation page to see the tag, period and filing date behind it.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            <li>
              <strong>Operating income:</strong> about ninety large filers (Johnson &amp; Johnson, Lilly, Exxon) report no operating subtotal. It is rebuilt as
              pre-tax income minus non-operating items (the total if tagged, otherwise interest expense, other non-operating income and interest income). On
              366 companies that do report it, this rule lands within 10% for 72% and within 25% for 84%.
            </li>
            <li>
              <strong>D&amp;A:</strong> where a company reports only depreciation and books acquired-intangible amortization on its own line (AMD,
              Microsoft, Alphabet), the two are added together. Oil and gas producers&apos; exploration and development spending counts as capex.
            </li>
            <li>
              <strong>Total debt:</strong> filers split debt across many tags. Several recipes each add up one consistent set of lines (current plus
              long-term debt, notes plus credit lines, and so on). A recipe can miss debt but never count it twice, so the largest is used. Operating
              leases are left out. If no debt is found but the company pays interest, the page says so.
            </li>
            <li>
              <strong>Shares:</strong> the latest cover-page count from any 10-K or 10-Q, so a split after the fiscal year is picked up. It is checked
              against Nasdaq&apos;s market capitalisation; if the two disagree by more than 40% (a merger or reverse split after the last filing, or a
              company with several share classes), market cap divided by price is used.
            </li>
            <li>
              <strong>Tax rate:</strong> total tax over total pre-tax income for the last three years. When that is negative or above 40%, the US
              statutory 21% is used instead.
            </li>
          </ul>

          <H2 id="refresh">Monthly refresh</H2>
          <p className="mt-4">
            A{' '}
            <A href="https://github.com/DanelRahmani/valuation-models/blob/main/.github/workflows/snapshot.yml">GitHub Action</A> runs on the 2nd of every month:
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5">
            <li>Refresh the S&amp;P 500 list and map each ticker to its SEC filer.</li>
            <li>Download SEC&apos;s nightly bulk file and keep the concepts the models use.</li>
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
              interval. One company&apos;s regression is noisy. When R² is at least 0.2, the default is the Blume adjustment (0.67β + 0.33), which pulls
              the estimate toward the market average of 1. Below that, stock returns say little about market risk (Coca-Cola&apos;s R² is 0.07), so the
              default is Damodaran&apos;s industry beta relevered at the company&apos;s own debt-to-equity, as long as the industry has at least ten firms.
              Every option is shown with its beta, the cost of equity it implies and the evidence behind it, so switching is one click.
            </li>
          </ul>
          <F>Hamada: βL = βU × (1 + (1 - t) × D/E)</F>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Cost of debt:</strong> interest expense over total debt, kept between the risk-free rate plus 1% (a minimal investment-grade
              spread) and plus 8%.
            </li>
            <li>
              <strong>Which rate where:</strong> FCFF uses WACC; FCFE, residual income and the dividend models use the cost of equity; APV uses the unlevered cost
              of equity.
            </li>
          </ul>

          <H2 id="forecast">Forecast</H2>
          <p className="mt-4">
            Ten years. Revenue growth starts from the latest year and fades toward a typical company&apos;s growth, which itself slides to terminal growth by
            year 10 (see below). The operating margin moves from today
            to a target over a chosen number of years. Capex and D&amp;A are percentages of revenue (three-year averages by default), and working capital
            absorbs a share of each new dollar of revenue. When a filing has no capex tag (common for utilities and REITs), capex is set equal to D&amp;A and
            the page says so. Defaults are a starting point, not a forecast.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            <li>
              <strong>Growth path:</strong> the forecast starts from the latest year&apos;s revenue growth. A typical S&amp;P 500 company grows about 6% a
              year (the median from 2017 to 2026), and that typical rate slides in a straight line to terminal growth by year 10. Growth above typical fades
              on top of it, along one of two paths you choose on the company page:
              <ul className="mt-2 list-[circle] space-y-1 pl-5">
                <li>
                  <strong>Research (default):</strong> growth above typical keeps 70% of itself each year, so half of it is gone every two years. This
                  reproduces McKinsey&apos;s finding that companies growing above 20% a year typically slow to about 8% within five years and about 5% within
                  ten (Koller, Goedhart and Wessels, <em>Valuation</em>), and fits Chan, Karceski and Lakonishok&apos;s (2003) finding that growth has little
                  persistence.
                </li>
                <li>
                  <strong>Base rates (S&amp;P 500 backtest):</strong> estimated on this site&apos;s own data, 449 non-financial S&amp;P 500 companies from
                  2017 to 2025. Regressing next year&apos;s growth above the yearly median on this year&apos;s, 23% of the excess survives a year (33% leaving
                  out 2020-22), and 15-27% is still there four to five years later. The path keeps 30% after one year and lets a lasting 20% fade out by
                  year 10. It is stricter than the research path, partly because acquisitions and commodity swings make measured growth noisy, which pulls
                  a measured persistence down.
                </li>
              </ul>
              The page says which path is in use, every parameter is an input, and no growth cap is needed: a boom is respected without being projected
              forward. NVIDIA&apos;s 65% latest growth becomes 48%, 35%, 26%, 19% and 14% in years 1-5 on the research path, and 24%, 17%, 15%, 13% and
              11% on base rates.
            </li>
            <li>
              <strong>One-off charges:</strong> when impairments of goodwill, intangibles or long-lived assets exceed 1% of revenue, the forecast margin adds
              them back and the page says by how much. They are non-cash and do not recur.
            </li>
            <li>
              <strong>Steady state:</strong> if capex runs above D&amp;A, it falls to D&amp;A between years 6 and 10, because a mature company spends roughly
              what it depreciates. Capex below D&amp;A (amortisation of acquired intangibles, which never needs replacing) is left alone.
            </li>
          </ul>
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
              ['Two-stage DDM', 'Five years of dividends growing with the revenue forecast, then Gordon.'],
              ['H-model', 'V = D₀(1 + gL)/(re - gL) + D₀ × H × (gS - gL)/(re - gL), for growth that fades in a straight line.'],
              [
                'Total payout',
                'Dividends plus buybacks, net of stock-based pay, as a share of net income (three years pooled, at most 100% unless dividends alone are higher). Net income grows with the revenue forecast for five years and the payout is discounted at the cost of equity; after year 5 the payout rises to 1 - g / re, all a mature company needs to retain. Equity value divided by today’s shares.',
              ],
              [
                'Multiples',
                'Company metric × peer multiple; enterprise multiples subtract net debt, with equity floored at zero. EV/Sales is scaled by the company’s margin over the peers’ margin and P/B by its return on equity over theirs (down without limit, up by at most 1.5×), since a revenue or book multiple is only fair at similar profitability. Loss-makers are not valued on revenue or book, P/B is left out where peers trade above 10× book, and a result resting on one multiple says so.',
              ],
              ['Reverse DCF', 'Bisection on where the growth path starts until the FCFF value equals the share price, reported as average revenue growth over years 1-5 next to the model’s own.'],
              ['Scenarios', 'Three FCFF models with their own growth, margin and capex, weighted by probability, with extra shares for dilution.'],
            ].map(([k, v]) => (
              <div key={k} className="grid gap-1 sm:grid-cols-[160px_1fr]">
                <dt className="font-serif text-lg">{k}</dt>
                <dd className="text-muted">{v}</dd>
              </div>
            ))}
          </dl>

          <H2 id="financials">Banks and insurers</H2>
          <p className="mt-4">
            A bank borrows to lend: debt is its raw material, not financing, so enterprise value and free cash flow to the firm mean nothing. For banks,
            insurers, brokers and asset managers the site turns off FCFF, FCFE, APV and the enterprise multiples. Residual income runs on book equity
            instead: book grows at its own recent pace, earns the recent return on equity for five years, and then half the gap to the cost of equity
            closes by year 10. A bank that earns exactly its cost of equity is worth its book value. Dividend models, P/E and P/B apply as usual.
          </p>
          <p className="mt-4">
            Peer multiples come from Damodaran&apos;s industry averages. P/E is aggregate market cap over the net income of profitable firms: the simple
            average P/E is blown up by firms with tiny earnings (pharma reads 335× on it, 25× on this).
          </p>

          <H2 id="peers">Peers and value creation</H2>
          <p className="mt-4">
            Peers come from the S&amp;P 500 itself. A company is grouped with its GICS sub-industry; small sub-industries are folded in with their
            closest neighbours (automakers with parts makers, airlines with railroads and freight, REITs together), and only a dozen companies with no
            close neighbour fall back to their sector. Two share classes of one company count once. The multiples model can use the median of these peers
            instead of Damodaran&apos;s industry averages; multiples above 100× (50× for EV/Sales and P/B) are dropped as outliers.
          </p>
          <F>ROIC = operating income × (1 - t) / (equity + debt - cash)</F>
          <p className="mt-4">
            A company creates value only when its return on invested capital beats its WACC. The value-creation tab shows that spread over ten years, where
            the cash went (capex, acquisitions, dividends, buybacks), stock pay as a share of revenue, net debt to EBITDA and interest coverage. Banks and
            insurers are shown on return on equity against the cost of equity. When cash or negative book equity leaves invested capital below a quarter of
            gross capital (book equity plus debt), the ratio stops measuring anything (Palantir would show 655%), so it is reported as not meaningful and
            the page points to return on equity and the operating margin instead.
          </p>

          <H2 id="uncertainty">Sensitivity and uncertainty</H2>
          <p className="mt-4">
            The tornado chart moves one input at a time between a low and a high value (WACC ±1 point, growth and margin ±3 points, capex ±25%, terminal
            growth ±0.5 point, beta across its regression&apos;s 95% range) and ranks them by how far the value moves. The Monte Carlo tab re-runs the same model
            2,000 times in the browser, drawing growth, margin (or return on equity), beta, terminal growth and capex together. Spreads come from the
            company&apos;s own history: the spread of five-year average growth is the yearly spread divided by √5, and the beta spread is the regression&apos;s
            standard error. Growth and margin are drawn with a 0.3 correlation. Draws where the discount rate falls to within half a point of terminal
            growth are counted and set aside rather than kept as absurd values. The random generator is seeded, so a given run is reproducible.
          </p>

          <H2 id="validation">Checked against an independent source</H2>
          <p className="mt-4">
            Every S&amp;P 500 company was run through the models and its revenue, operating income, net income, D&amp;A, cash, debt, equity and market
            cap compared with Nasdaq&apos;s independently compiled statements. Gaps that remain are mostly definitions: Nasdaq counts leases and captive
            finance arms as debt, and contract-cost amortisation as D&amp;A. When a default lands far from the price, the page says why (thin equity,
            a discount rate close to growth, a stale filing, one-off charges) rather than hiding it.
          </p>
          <p className="mt-4">
            The checks are automated. Every company&apos;s figures are tested against the rest of its own filing: net income over diluted shares must
            reproduce the EPS the company reports, debt cannot exceed total liabilities, cash cannot exceed assets, and price times shares must give
            the market cap. Each month the snapshot also compares revenue, net income and equity with Nasdaq and refuses to publish if fewer than 90%
            agree within 2% (in November 2026: revenue 97%, net income 98%, equity 99%). Filings that broke an earlier version of the code are kept as
            regression tests, so the same bug cannot come back unnoticed. The few remaining errors are tagging mistakes in the filings themselves,
            listed with the reason in the repository.
          </p>

          <H2 id="consistency">Consistency</H2>
          <p className="mt-4">
            FCFF, FCFE, APV and residual income should give similar answers when they share assumptions, and they usually land within a few percent of each
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

          <H2 id="limits">Limits and judgment calls</H2>
          <p className="mt-4">
            Every number on this site follows from the filings and a handful of defaults. The arithmetic is checked; the defaults are choices. These are the
            choices that move answers most, why they were made, and where they fail. Each one is an input you can change on the company page.
          </p>

          <h3 className="mt-8 font-serif text-xl">Judgment calls</h3>
          <dl className="mt-4 space-y-5">
            {[
              [
                'Growth fades instead of being capped',
                'Holding a recent growth rate for five years either needs a cap (an earlier version capped it at 20%, which valued NVIDIA at $114) or projects a boom forward (NVIDIA’s 114% three-year median would put its revenue above $9 trillion). The site now starts from the latest year and fades the growth above a typical 6% along a research path (McKinsey’s observed decay, the default: NVIDIA $144 against a $166 price) or a stricter path backtested on S&P 500 data ($88). Neither path brings the fastest growers to their price unless most of the boom lasts for years, which is the bet the market is making; the reverse DCF shows how big that bet is.',
              ],
              [
                'Dividend models still run for low-yield growers',
                'They run whenever dividends are at least 20% of earnings. For Eli Lilly or Costco that gives a value far below the price: the dividend is small next to what the company retains and reinvests, and a dividend model counts only what is paid. That is how the method works, not a bug, so the result is shown rather than hidden. The total payout model, which adds buybacks, and FCFF are the better guides for these firms. Below 20% the dividend models are switched off, because they would value a token payout rather than the business.',
              ],
              [
                'Total payout counts only what is handed back',
                'A company piling up cash while it grows (NVIDIA pays out about a third of its earnings) looks cheaper here than in FCFF, which counts all free cash flow whether it is paid out or not. Buybacks are lumpy, so the payout ratio is pooled over three years and stock-based pay is netted out: buybacks that only soak up new employee shares return nothing.',
              ],
              [
                'Missing capex is set equal to depreciation',
                'About 35 companies, mostly utilities and REITs, report capital spending under their own tags, which the SEC data used here does not carry. Their capex is assumed equal to D&A, the least a business must spend to keep its assets. Growing utilities spend more, so their cash-flow values are still on the high side; the page warns and the 10-K cash flow statement has the real figure.',
              ],
              [
                'Values below zero are set aside',
                'When a model values the equity below zero (Intel’s cash-flow models on current margins), the cash flows do not cover what is owed ahead of shareholders. A share cannot be worth less than nothing, so the model is marked as not applicable with the negative figure in its note, and the range on the page leaves it out.',
              ],
              [
                'Payout ratios are pooled, not averaged',
                'Three years of dividends over three years of earnings, the same way the tax rate is computed. An average of yearly ratios lets a single loss year drag the payout to zero and switch the dividend models off for a steady payer.',
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-medium">{k}</dt>
                <dd className="mt-1 text-muted">{v}</dd>
              </div>
            ))}
          </dl>

          <h3 className="mt-8 font-serif text-xl">Known limitations</h3>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            <li>Annual data only; nothing changes between 10-K filings.</li>
            <li>Leases, pensions, minority interests and options are not adjusted for separately.</li>
            <li>
              Growth through share issuance is not netted out. A REIT that grows by issuing shares to buy property shows the growth but not the dilution, so
              its values run high.
            </li>
            <li>
              The cash-flow models disagree more for capital-heavy, highly levered firms (utilities, airlines, REITs): FCFE and residual income assume the
              current debt weight holds, FCFF and APV do not. A wide spread there is information, not an error.
            </li>
            <li>
              The growth path starts from one year&apos;s growth. A merger year inflates it and a one-off dip deflates it (Tesla&apos;s -3% after 19% the
              year before); the fade limits the damage to the first few years, and the starting growth is an input.
            </li>
            <li>Banks and insurers are valued on equity only: residual income, dividends, P/E and P/B. There is no reverse DCF or walkthrough for them.</li>
            <li>Industry mapping from GICS to Damodaran categories is automatic and sometimes wrong. You can change it on each page.</li>
            <li>Price data is used to estimate betas but is not licensed for redistribution, so it is never published.</li>
          </ul>
          <p className="mt-4">
            This is a tool for understanding what a price assumes, not investment advice. A model value far from the price usually means the market expects
            something the defaults do not; the reverse DCF and the sensitivity tabs show what.
          </p>

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
              McKinsey &amp; Company (Koller, Goedhart, Wessels), <em>Valuation: Measuring and Managing the Value of Companies</em>, Wiley. Includes the
              decay of high revenue growth behind the research growth path.
            </li>
            <li>
              Berk and DeMarzo, <em>Corporate Finance</em>, Pearson. Chapters on capital budgeting, WACC and APV.
            </li>
            <li>
              Louis Chan, Jason Karceski and Josef Lakonishok (2003), &ldquo;The Level and Persistence of Growth Rates&rdquo;, <em>Journal of Finance</em>{' '}
              58(2). Growth shows little persistence beyond chance; the case for fading it.
            </li>
            <li>
              Marshall Blume (1971), &ldquo;On the Assessment of Risk&rdquo;, <em>Journal of Finance</em> 26(1). The beta adjustment.
            </li>
            <li>
              Michael Mauboussin, Dan Callahan and Darius Majd (2016), <em>The Base Rate Book</em>, Credit Suisse. How often companies of a given size sustain a given rate of
              sales growth.
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
