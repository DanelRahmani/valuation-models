# Plan: trailing-twelve-month figures from 10-Q filings

Status: proposal, not built. Written after a test of the live site flagged Palantir's multiples
(P/E 252x on the site against about 110-118x on financial sites).

## Why the 10-K alone is not enough

The 10-K data is correct; it is just old. A 10-K covers one fiscal year and is filed once, two to three months after
the year ends. Companies then file three 10-Qs during the next year, each with the quarter and the year to date.

So the latest 10-K can be up to 14 months out of date. On 13 November 2026, Palantir's latest 10-K covers calendar 2025,
but its 10-Q for the quarter to 30 September 2026 is already filed:

| Palantir | Revenue | Net income |
|---|---|---|
| FY2025 (10-K, what the site uses) | $4,475M | $1,625M |
| Last 12 months to Sep 2026 (from 10-Qs) | $7,287M | about $3,670M |

For a slow-growing company the difference is small. For a company growing 50% a year it changes every multiple: the
P/E falls from 252x to about 110x. Financial sites, Bloomberg and analysts use trailing-twelve-month (TTM) figures for
exactly this reason, and a recruiter comparing the site with Yahoo Finance would notice the gap first.

The price, share count and market cap on the site are already current (daily close, latest 10-Q cover). Only the
financial statements lag.

## The data is already in SEC company facts

Each 10-Q reports year-to-date flows (3, 6 and 9 months) next to the quarter. That gives TTM without needing a
separate fourth quarter, which companies never file (it is inside the 10-K):

    TTM = last fiscal year (10-K) + year to date now (10-Q) - same period a year earlier (10-Q)

Palantir, checked against Nasdaq's sum of the last four quarters:

    4,475 (FY2025) + 5,881 (9 months 2026) - 3,069 (9 months 2025) = 7,287   Nasdaq: 7,288

Balance-sheet items (cash, debt, equity) need no arithmetic: take the latest 10-Q value.

## What to build

1. **Trimming (`trimCompanyfacts`).** Keep 10-Q rows for the mapped flow tags, limited to year-to-date durations
   (roughly 90, 180 or 270 days, starting on the fiscal-year start) and to the last two fiscal years. Keep 10-Q
   instants for balance-sheet tags. Estimated growth: about 40% per company file (55 KB to about 75 KB); fine for a
   static site.
2. **Extraction (`extractHistoricals`).** Add `ttm` next to `items`: one value per line item with its own as-of date
   and the three source facts behind it, so hovering a figure still shows its tags and filings. The tricky part:
   every rule built for annual data has to run on the TTM period too (debt recipes, rebuilding operating income, D&A
   plus amortisation, oil and gas capex, net income chosen by EPS, impairments). The clean way is to make those
   rules take a period (a set of facts for one window) instead of a fiscal year, then run them for each year and for
   the TTM window. That refactor is most of the work.
3. **Model inputs (`defaultAssumptions`).** Use TTM for the base-year revenue, margin, net income, D&A, capex and
   tax, and the latest 10-Q for cash, debt and equity. Keep annual history for growth medians, ten-year charts and
   the value-creation series, where annual comparability matters more than freshness.
4. **Forecast labels.** The DCF currently starts at "FY2026". With a TTM base it starts at "next 12 months"; year
   labels become "Yr 1 ... Yr 10", plus a line saying the base is the twelve months to a given date.
5. **Interface.** Show "Last 12 months to 30 Sep 2026" under the company name, and a switch between "Latest 12 months"
   (default) and "Last fiscal year" so either basis can be checked. Shareable links keep the choice.
6. **Data checks.**
   - Extend the EPS check to TTM: TTM net income / diluted shares against the sum of the last four quarterly EPS
     figures.
   - Compare TTM revenue and net income with Nasdaq's quarterly statements (they already publish four quarters).
   - Add a regression fixture for Palantir: TTM revenue 7,287 within 0.1% of Nasdaq.
   - Gate the monthly snapshot on the TTM match rate, as it already does for annual figures.

## Edge cases to handle

| Case | Handling |
|---|---|
| Latest filing is the 10-K (no 10-Q yet this year) | TTM equals the fiscal year; label says so |
| 52/53-week fiscal years (Apple, Costco) | Match prior-year periods by fiscal quarter (`fp`), not by calendar date |
| Restated quarters (10-Q/A) | Latest filing per period wins, as for annual data |
| Fiscal-year change or merger mid-year | If the three windows do not line up within a few days, fall back to annual and say why |
| A tag missing in one quarter (common) | Use the same fallback order; if TTM cannot be built from consistent tags, fall back to annual for that line only |
| Year-to-date not reported, only quarters | Sum the last four 3-month quarters, using the 10-K for Q4 (FY minus 9-month year to date) |
| Banks and insurers | Same arithmetic; their models use net income and equity, both straightforward |

## Effort and order

1. Period refactor of the extraction rules, with the existing 39 regression and data-check tests as the safety net:
   one to two days.
2. TTM window and latest balance sheet, plus the Palantir fixture: half a day.
3. Model inputs, labels, switch and links: half a day.
4. Checks and snapshot gate on TTM: half a day.

The monthly snapshot already runs on the 2nd of each month, so new 10-Qs would reach the site within a month of
filing with no extra scheduling.

## What it would not fix

Model results that are extreme because of their assumptions rather than stale data. Palantir's DCF would still sit far
below its price, because the default caps five-year growth at 20% against a market that prices in much more. That gap
is the finding, and the reverse DCF states it.
