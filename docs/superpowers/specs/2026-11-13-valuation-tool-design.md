# Valuation Models Tool: Design

Date: 2026-11-13 · Status: draft, awaiting approval

## Intent

A free, browser-only website that runs the classic intrinsic and relative valuation models on any SEC-filing company and shows the math transparently. It serves two purposes:

1. **CV project** for finance recruiting, sitting next to EconoSim and EconoSift. It should show that the author understands how DCF, DDM, APV and residual income actually work, not just that they can code.
2. **Companion to an upcoming blog post** on whether classic valuation models still work for AI companies: heavy upfront compute capex, losses today, and AI acting as cheap capital that replaces white-collar labor.

The output is a mathematical valuation under the user's assumptions. It is never investment advice and never says buy or sell.

## Goals

- The user uploads a company's SEC `companyfacts` JSON, or types inputs by hand. The site extracts historical financials and pre-fills the drivers.
- All models run side by side, with a summary of value per share for each model plus the range.
- The site explains which discount rate each model uses and where each input came from: the filing, the user, or a default.
- One button exports an Excel workbook with live formulas: an Inputs tab, one tab per model and a Summary tab.
- Each model has a "best suited for" note (sector or company type) and a short "does this survive AI?" note.
- A pre-profit / heavy-capex mode for AI-style companies.

## Non-goals

- Live market data. There's no price feed, no ticker search API and no Yahoo scraping.
- Accounts, saved models or a database.
- Coverage of non-SEC filers. IFRS filers (`ifrs-full` tags, 20-F) are a stretch goal, not v1.
- Peer-group data. Multiples use peer values that the user types in.

## Anti-goals (these would count as failure even if it works)

- Any user data reaching a server. That means no server functions, no logging and no analytics on inputs. It keeps GDPR out of scope.
- Anything that reads like a recommendation: "undervalued, buy", green and red signals, price targets.
- Formulas in the Excel file that don't match the website's numbers.
- An oversized test suite. There are one or two meaningful tests in total.

## Constraints

- **Hosting:** Vercel, as its own project on a subdomain of the personal site. Next.js with `output: 'export'`, a fully static site with no functions, no workers and no API keys.
- **Stack:** the same as the personal site: Next.js 16, React, TypeScript, Tailwind. ExcelJS for the export.
- **Data source:** SEC `data.sec.gov/api/xbrl/companyfacts/CIK##########.json`. It needs no key, but SEC blocks browser requests from other sites (no CORS). So the **user downloads the file in their own browser and uploads it**, and the file is parsed client-side.
- **Repo:** public GitHub repo, created from this folder.
- **Build workflow:** the main session writes all the code. Haiku writes the one or two tests. Nothing else is delegated.

## Approaches considered

| | Approach | Verdict |
|---|---|---|
| **A** | Standalone static Next.js site, own repo, own Vercel project, subdomain | **Chosen.** Same stack as the personal site and EconoSim, zero server functions, isolated deploys. |
| B | Vite + React single-page app | Works, but a different setup from the user's other sites for no gain. |
| C | A route inside the personal website repo | Rejected. No subdomain, and it couples the deploys. |
| — | Server-side SEC fetch through a Vercel function using the user's email | Rejected. User data would pass through our server, bringing in GDPR. The upload flow avoids this. |

## Data input

1. **SEC upload (primary).** A short guide: find the CIK (link to SEC's `company_tickers.json` or EDGAR search), open the companyfacts URL, save the file, drop it on the page.
   - The parser reads `facts["us-gaap"]` and `facts["dei"]` and takes annual figures (`form` 10-K, `fp` FY) from the latest 5 fiscal years, de-duplicating amended values by taking the latest `filed`.
   - **Each line item maps to an ordered list of fallback tags**, because companies use different tags. For example, revenue is `Revenues` → `RevenueFromContractWithCustomerExcludingAssessedTax` → `SalesRevenueNet`.
   - Line items: revenue, COGS, operating income, D&A, interest expense, pretax income, tax expense, net income, CFO, capex, dividends paid, cash, total debt (current + noncurrent), equity, shares outstanding (`dei:EntityCommonStockSharesOutstanding` and diluted weighted shares).
   - Every extracted value records which tag it came from. The UI shows that tag on hover.
   - If a line item is missing, the field is left empty and flagged for the user to fill in. The parser never guesses.
   - **Verified 2026-11-13 in Chrome:** `https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json` opens as raw JSON with no login, and the user saves it with Ctrl+S.
   - **Links in the guide:**
     - CIK lookup: `https://www.sec.gov/edgar/search/`, plus `https://www.sec.gov/files/company_tickers.json`
     - Company data file: `https://data.sec.gov/api/xbrl/companyfacts/CIK{10-digit}.json`
     - The guide builds this link for the user once they enter a ticker, using a small static ticker→CIK map shipped with the site. That's public-domain SEC data, refreshed by hand.
2. **Manual entry.** The same form, empty. Any pre-filled value can also be overridden.
3. **Market inputs the filing doesn't contain:** current share price and the 10-year Treasury yield (risk-free rate). The user types these in, and the site links to where to look them up.

## Discount rates

- **Cost of equity (CAPM):** risk-free rate + β × equity risk premium.
  - Risk-free: the user's 10-year Treasury yield.
  - ERP: default from Damodaran's current implied ERP, editable, with the source and date shown.
- **Beta (company-specific regression is the default):**
  1. **Regression beta (primary).** The user downloads two free CSVs from Nasdaq.com's historical-quotes page (no account needed): the stock and SPY as the market proxy. They upload both, and the site computes:
     - beta by OLS on monthly returns (default 5 years / 60 months, with a weekly 2-year option);
     - R², the standard error of beta and a 95% confidence interval;
     - the Blume-adjusted beta (0.67β + 0.33);
     - a scatter plot with the regression line.
     Raw beta is unlevered at the historical D/E and relevered at the current D/E from the filing.
     - **Verified 2026-11-13:** `https://www.nasdaq.com/market-activity/stocks/{ticker}/historical` and `https://www.nasdaq.com/market-activity/etf/spy/historical`. Choose "5Y", then "Download historical data". No login; the cookie banner can be ignored.
       - The result is `HistoricalData_<timestamp>.csv`: about 1,255 daily rows, columns `Date,Close/Last,Volume,Open,High,Low`, dates in MM/DD/YYYY.
       - Stock prices carry a `$` sign; ETF prices don't.
       - Prices are split-adjusted (NVDA 2021 shows about $30) but not dividend-adjusted.
       - **The file doesn't contain the ticker, and both files have the same name pattern,** so the UI uses two separately labelled drop zones: Stock and Market.
     - **Sanity run on these files:** NVDA vs SPY, 59 monthly returns, gives β = 2.24, SE 0.29, R² 0.51, Blume 1.83.
     - **CSV parser:** auto-detects the Nasdaq format (`Date, Close/Last, …` with `$` signs) and also accepts Yahoo, Stooq or any `Date,Close` file.
     - Prices are aligned on month-end dates. Gaps are flagged, never filled in.
     - **Dividends:** price-only returns, which is standard practice. The UI notes this.
  2. **Bottom-up cross-check.** Damodaran's industry unlevered beta (a small static table embedded in the site, credited and dated), relevered with the company's D/E. It's shown next to the regression beta. When R² is low or the confidence interval is wide, the UI suggests the bottom-up beta.
  3. **Manual override,** for example Yahoo's beta.
  - The Excel export includes a `Beta` sheet with the aligned returns and live `SLOPE`, `RSQ` and `STEYX` formulas.
- **WACC:** E/(D+E)·Re + D/(D+E)·Rd·(1−t).
  - Rd = interest expense / average debt from the filing, which the user can override.
  - t = effective tax rate from the filing.
- **Which rate each model uses**, shown in the UI:

  | Model | Discount rate |
  |---|---|
  | FCFF DCF | WACC |
  | FCFE DCF, DDM, residual income | Cost of equity |
  | APV | Unlevered cost of equity, plus the tax shield discounted at Rd |

## Models (v1)

| Model | Variants | Best suited for |
|---|---|---|
| Dividend discount | Gordon Growth (1-stage), 2-stage, H-model | Mature dividend payers, utilities, banks |
| FCFF DCF | Explicit 5–10 yr forecast, terminal value by Gordon *or* exit multiple | Most operating companies |
| FCFE DCF | Same structure, equity cash flows | Banks, companies with stable leverage |
| APV | Unlevered value + PV of tax shields | Changing leverage, LBOs |
| Residual income | Book value + PV(excess returns over cost of equity) | Banks, insurers, asset-heavy companies |
| Multiples | P/E, EV/EBITDA, EV/Sales, P/B, PEG, using peer values the user enters | A cross-check for everything; EV/Sales for unprofitable companies |
| Reverse DCF | Solves for the revenue growth implied by the current price | Hype-priced and AI companies |

**Forecast drivers:** revenue growth (stage 1 / fade / terminal), EBIT margin, tax rate, capex % of revenue, D&A % of revenue, net working capital % of revenue. Defaults come from historical averages. The terminal growth rate is capped at the risk-free rate, with a warning.

**Pre-profit / AI mode:** a toggle that changes the FCFF DCF to:
- Bear, base and bull scenarios, each with its own growth path, a target margin reached in year N, and compute capex intensity that starts high and declines.
- Scenario probabilities, giving a probability-weighted value.
- Dilution inputs: new shares from convertible debt or SAFEs, plus stock-based compensation.
- A headline from the reverse DCF: "To justify $X, revenue must compound Y% for Z years at a W% margin."

## Output

- **Summary:** value per share for each model, a range bar, the current price for reference (not a verdict), and a prominent disclaimer.
- **Per-model detail:** the year-by-year table, the formulas written out, and a sensitivity grid (discount rate × terminal growth) for the DCFs.
- **Notes per model:** "Best for", "Watch out for", and "Does this survive AI?" Short, honest and hedged. They can link to the blog post once it exists.

## Employer-facing extras

A recruiter gives a project about 30 seconds and won't download files first. So:
- **"Try it with NVIDIA" demo button,** using a bundled NVIDIA companyfacts file. SEC data is public domain, so it can be shipped.
  - The demo's beta is a pre-entered 2.24, labelled as computed from Nasdaq prices on 2026-11-13.
  - Nasdaq price files are *not* bundled, because redistributing them is legally unclear. Uploading CSVs recomputes the beta.
- **A methodology page:** formulas, sources, assumptions and known limits. This is where the finance judgment shows.
- **An NVIDIA case-study write-up** on the personal site, linking to the tool and the AI-valuation post.
- **A README** with a screenshot, a link to the live demo, and the Excel export showcased.

## Excel export

- ExcelJS runs client-side and writes `Inputs`, `Historicals`, `Summary` and one sheet per model.
- Every derived cell is a formula referencing the `Inputs` cells. Cached results are written too, so the file shows values before it recalculates.
- The workbook is built from the same model definitions as the UI, so the two can't drift apart.

## Verification (dry run)

1. Run the site locally. Use the user's Chrome to download NVIDIA's companyfacts file (CIK 0001045810) and upload it.
2. Check the extracted historicals (revenue, net income, CFO, capex, shares, debt, cash) against NVIDIA's 10-K and Yahoo Finance's financials tab. They should match the 10-K exactly. Yahoo may differ slightly because of its own adjustments; any differences get noted.
3. Run every model and sanity-check the outputs by hand for at least one model.
4. Open the Excel export and confirm the recalculated values match the site.
5. Note: Yahoo publishes no DCF, so only the inputs and historicals can be compared against it, not the valuations.

## Testing

Haiku writes at most two tests:
1. A golden-value test of the model math against a textbook worked example (Gordon Growth plus one FCFF DCF).
2. A parser test on a trimmed NVIDIA companyfacts fixture.

Nothing more.

## Left to the builder

- Page layout and visual design (following the personal site's look).
- Exact fallback tag lists, beyond the ones named above.
- Number formatting, sensitivity grid size, and the content of the explanatory notes.
- Site name and subdomain. Placeholder: `valuation.<personal domain>`. Confirm with the user before deploying.
