export const metadata = { title: 'Methodology · Valuation Models' };

const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="mt-14 border-t border-seam pt-6 font-serif text-3xl">{children}</h2>;
const F = ({ children }: { children: React.ReactNode }) => <p className="num my-3 rounded border border-seam bg-panel/60 px-3 py-2 text-[0.8125rem]">{children}</p>;

export default function Methodology() {
  return (
    <article className="max-w-3xl pb-12 pt-12 leading-relaxed">
      <p className="font-mono text-xs uppercase tracking-wider text-muted">Methodology</p>
      <h1 className="mt-4 font-serif text-5xl">How the numbers are made</h1>
      <p className="mt-6 text-lg text-muted">
        Every value on the site comes from a formula you can click and read, and the Excel export contains those same formulas. This page explains the choices
        behind them, and where they break.
      </p>

      <H2>Data</H2>
      <p className="mt-4">
        Financials come from SEC EDGAR XBRL company facts: annual 10-K values only, de-duplicated so restated figures replace the originals. Companies tag the
        same concept differently (revenue alone has five common tags), so each line item has an ordered list of fallback tags. The tag behind every number is
        shown when you hover it.
      </p>
      <p className="mt-4">
        A GitHub Action refreshes the S&amp;P 500 on the 2nd of every month. It downloads SEC&apos;s nightly bulk file, the 10-year Treasury yield from FRED,
        and Damodaran&apos;s industry data, and estimates a beta for each company from five years of monthly prices. Only the beta statistics and the latest
        close are published, never the price history. If a run fails, the site keeps the previous month&apos;s data and I get an alert.
      </p>

      <H2>Discount rates</H2>
      <F>Cost of equity = rf + β × ERP</F>
      <F>WACC = E/V × re + D/V × rd × (1 - t)</F>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>
          <strong>Risk-free rate:</strong> the 10-year Treasury yield, because the cash flows being discounted are long-dated. A 3-month bill rate would
          understate it.
        </li>
        <li>
          <strong>Equity risk premium:</strong> Damodaran&apos;s implied premium for the S&amp;P 500, backed out of current prices rather than historical
          averages.
        </li>
        <li>
          <strong>Beta:</strong> an OLS regression of monthly stock returns on SPY returns over five years, with R², standard error and a 95% interval. A
          single company&apos;s regression is noisy, so the site also offers the Blume adjustment (0.67β + 0.33) and Damodaran&apos;s industry beta relevered
          at the company&apos;s own debt-to-equity (Hamada: βL = βU × (1 + (1 - t) D/E)). When R² is low, the industry beta is usually the better estimate.
        </li>
        <li>
          <strong>Cost of debt:</strong> interest expense over total debt, bounded below by the risk-free rate.
        </li>
        <li>
          <strong>Which rate where:</strong> FCFF uses WACC; FCFE, residual income and dividend models use the cost of equity; APV uses the unlevered cost of
          equity.
        </li>
      </ul>

      <H2>Forecast</H2>
      <p className="mt-4">
        Ten years. Revenue grows at the stage-1 rate for five years, then fades in a straight line to terminal growth. The operating margin moves from today
        to a target over a chosen number of years. Capex and D&amp;A are percentages of revenue (three-year averages by default), and working capital absorbs
        a share of each new dollar of revenue. Defaults are a starting point, not a forecast: change them.
      </p>
      <F>FCFF = EBIT × (1 - t) + D&amp;A - capex - ΔNWC</F>
      <F>Terminal value = FCFF₁₀ × (1 + g) / (WACC - g), or EBITDA₁₀ × exit multiple</F>
      <p className="mt-4">
        Terminal growth is capped at the risk-free rate by default: in the long run no company grows faster than the economy. The site warns when the
        terminal value is most of the enterprise value.
      </p>

      <H2>Keeping the models consistent</H2>
      <p className="mt-4">
        FCFF, FCFE, APV and residual income should give similar answers when they share assumptions, and here they do, within a few percent. FCFE funds
        reinvestment at the current debt weight so leverage stays constant. Residual income uses clean-surplus accounting: book equity grows only by what is
        reinvested, which ties it to FCFE. APV treats debt as permanent, so its tax shield is worth t × D. Large gaps between methods usually point to an
        inconsistent input, which is itself useful to know.
      </p>

      <H2>Dividend models</H2>
      <F>Gordon: V = D₁ / (re - g)</F>
      <F>H-model: V = D₀(1 + gL)/(re - gL) + D₀ × H × (gS - gL)/(re - gL)</F>
      <p className="mt-4">
        They ignore buybacks, which are now the main way most US companies return cash, so they undervalue anyone who prefers buybacks. That is the point of
        showing them: they explain why the Gordon formula survives mainly as a terminal value.
      </p>

      <H2>Valuing AI companies</H2>
      <p className="mt-4">
        Classic models assume capex settles near depreciation and that value comes from assets on the balance sheet. AI companies break both: they spend years
        building compute ahead of revenue, and their main assets (models, data, talent) are expensed. Pre-profit / AI mode replaces one heroic forecast with
        three scenarios, each with its own growth, margin path and compute intensity, weighted by probabilities you choose. It also takes dilution from
        conversions and stock compensation. The reverse DCF turns a headline valuation into the growth it requires, which is usually the more honest
        conversation.
      </p>

      <H2>Limits</H2>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Annual data only; no quarterly updates between 10-Ks.</li>
        <li>Leases, pensions, minority interests and options are not adjusted for separately.</li>
        <li>Banks and insurers fit FCFF poorly; use FCFE, residual income or the dividend models for them.</li>
        <li>Industry mapping from GICS to Damodaran categories is automatic and sometimes wrong. You can change it.</li>
      </ul>

      <p className="mt-14 border-t border-seam pt-6 text-sm text-muted">
        These are mathematical valuations under stated assumptions, not investment advice. Sources: SEC EDGAR, FRED, Aswath Damodaran&apos;s data library
        (pages.stern.nyu.edu/~adamodar), Nasdaq and Yahoo Finance price histories for beta estimation.
      </p>
    </article>
  );
}
