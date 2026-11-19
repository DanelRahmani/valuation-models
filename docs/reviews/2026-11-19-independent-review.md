# Independent review: scenario maker + site + NVDA cross-check

Date: 2026-11-19 · Branch: `scenario-maker` (HEAD `56fca03`) vs `main` · Reviewer had no part in building it. Read-only: no source edits.

## Executive verdict

**The scenario maker works and is close to ready to ship. Fix three things first.** The engine design (compile levers into per-year rows, neutral by default) is sound. Neutral adjustments reproduce the base case for **all 501 companies** in `public/data`, not just the 19 test fixtures (0 mismatches at $0.005). Scenarios are never on at page load. The banner is impossible to miss. The comparison table matches the engine. The Excel scenario switch recalculates in real Excel to the cent for every case. Type-check and all 75 tests pass. No console errors.

What should be fixed before relying on it:

1. **Clamps flip the sign of a scenario for loss-makers** (Medium-High). Example: "New competition" on a −80% target margin *raises* it to −50%.
2. **In the Excel file, `capex_pct` stops driving the model** once any saved scenario uses a capex path, including in the Base case (Medium).
3. **Two templates are much bigger than their stories, and one comparison claim is untrue** (Medium). "Demand shock (cyclical downturn)" takes NVDA −65% because it halves the whole growth path. "Bull: moat holds" gives +99%. The "New competition" text says it "ends where the new-entrant shock ends, so the two compare timing", but the shock also cuts 20% of revenue for good, so the two compare more than timing.

The NVDA inputs match the latest 10-Q (Q2 FY27, filed 2026-08-26) line by line. Two input caveats: short-term investments double-count about $6.9B of cash equivalents and leave out about $90B of equity investments, and the data is now one quarter old because Q3 FY27 results came out on 17 Nov in an 8-K. The site's $286 base FCFF value is 1.84× the $155.46 price and close to the analyst consensus (~$304–$328). It rests on holding a **65% operating margin forever** while revenue grows 4.4× in five years. That is the base case's biggest judgment, and the site doesn't flag it.

## Findings, ranked

### 1. Medium-High: clamps turn a "worse" scenario into a better one for loss-makers
- **Where:** `src/lib/scenarios/apply.ts:361-365` (clamp after `applyOp`), `src/lib/scenarios/types.ts:675` (`marginTarget` min −0.5), `src/lib/finance/models.ts:107-111` (`MAX(-0.5, …)` floor on the whole margin path once any margin adjustment exists).
- **Failure (confirmed by script):** base target margin −80%, scenario "change by −10 pts" → result **−50%** with the note "was held to the range". The scenario says margins get worse; the model makes them 30 points better. MRNA (margin −116%) shows the same with the New competition, Margin reverts, Energy crunch and Bull templates. The margin floor also lifts the *base* path of years 1-10 to −50% as soon as any shock or margin row is on. Related: `g1` uses `scale`, so "Demand shock" (`g1 × 0.5`) halves a *decline* (−30% → −15%) and improves a shrinking company.
- **Fix:** clamp to `[min(lo, base), max(hi, base)]` so a change can't cross its own base in the wrong direction. Apply the −50% floor to the *adjustment*, not the base path: `MAX(base_path + adj, MIN(base_path, -0.5))`. For `g1`, use `add` in templates, or scale only the excess over typical growth.

### 2. Medium: in Excel, `capex_pct` stops working once any scenario has a capex path
- **Where:** `src/lib/excel/scenarios.ts:32-34,50-62` with `src/lib/finance/models.ts:158-159`. When any scenario uses `capexHighYears`/`capexNormal`/a capex row, the FCFF capex row becomes `revenue × sc_capex[t]`, and `sc_capex` holds **hard numbers** for every column, base included.
- **Failure (confirmed in Excel via COM):** NVDA workbook with "Capex high, then normalises" saved. Set Scenarios!C10 (base `capex_pct`) from 2.3% to 10% → FCFF stays **$286.03**. The Inputs sheet still lists `capex_pct` as a live switched input, so a user believes they are changing it.
- **Fix:** write the capex path as formulas on the base column (`capex_pct` held for H years, then a linear fade to `MIN(da_pct, capex_pct)`), or keep the base formula and add a per-year `sc_capex_delta` row (neutral 0). At minimum, label `capex_pct` "overridden by the scenario capex rows".

### 3. Medium: some template sizes don't match their stories, and one claim is untrue
NVDA, FCFF per share, base $286.03 (script and comparison table agree; FCFE/APV/RI move within 1 point of FCFF):

| Template | Value | Δ | Verdict |
|---|---|---|---|
| New competition | $187.82 | −34% | Direction and size plausible |
| New-entrant shock | $161.25 | −44% | Plausible. Larger than the gradual case partly because it also removes 20% of revenue for good. The "why" text says the two "compare timing", which is not true |
| Margin reverts to industry | $175.23 | −39% | Plausible (65% → ~38% target) |
| **Demand shock (cyclical downturn)** | **$99.82** | **−65%** | **Too big for "a typical year".** `g1 × 0.5` halves the entire growth path, so it is a permanent "boom over" case, not a cycle. NVDA's own FY23 downturn reversed within a year (FY24 margin 54%) |
| Growth fades at base rates | $107.49 | −62% | Big but honest: it states the base rate (0.3 vs 0.7) |
| Energy crunch | $131.09 | −54% | Direction right. The cap binds hard (15% vs 60/43/32/23/17% base growth) |
| Energy price shock | $266.46 | −7% | Sensible; says it fits energy-heavy firms |
| Rate shock (Volcker) | $239.36 | −16% | Sensible |
| Rates stay high (+2) | $230.44 | −19% | Sensible |
| Rate cut (−2) | $370.24 | +29% | Convexity makes it larger than the +2 case; sensible |
| Capex stays high / normalises | $279.74 / $284.38 | −2% / −1% | Correctly small; the caution text says so |
| Riskier (β +0.3) | $248.65 | −13% | Sensible |
| **Bull: moat holds** | **$569.03** | **+99%** | Overstated: decay 0.8 on 83% starting growth compounds hugely. Call the decay a judgment call and consider 0.75 |

- **Fix:** rewrite Demand shock as a one-year growth set plus a recovery, without scaling `g1`, or rename it "Boom ends". Correct the timing claim in `src/content/scenarioTemplates.ts:78`.

### 4. Medium: base case holds NVIDIA's 65% operating margin for ever (default, not scenario code)
- **Where:** `src/lib/finance/assumptions.ts:287` (`src.marginTarget = 'Held at current margin'`).
- **Failure:** NVDA base = revenue ×4.4 in five years at 65.2% margin into perpetuity. The reverse DCF says the price only needs 19.9% average growth over years 1-5. The page warns about the growth but not that the margin is held at an all-time high. The site's own calibration doc (Fama-French 38%/yr reversion, McKinsey) argues the other way.
- **Fix:** when the current margin is far above the industry margin, add a visible note, or fade part of the gap by default and say so.

### 5. Low-Medium: hand-edited storage passes validation through prototype keys
- **Where:** `src/lib/scenarios/store.ts:512,520,525` use `lever in LEVERS` / `in PATH_META`. `'constructor' in LEVERS` is `true` through `Object.prototype`.
- **Failure (confirmed in the browser):** `{lever:'constructor'}` plus a path `{lever:'toString'}` is accepted. Switching it on blanks every forecast model ("n/a"). The banner reads "Base case $286.03 → –". The comparison table prints "undefined 10.0% (yr 1)". `apply.ts:432` treats any unknown path lever as an `rf` row. No crash, but the spec's "drop anything that doesn't pass" is not met.
- **Fix:** use `Object.hasOwn(LEVERS, lever)`, and add an explicit `else if (p.lever === 'rf')` in apply.

### 6. Low-Medium: year-by-year "change by" values and garbage JSON are not handled well
- `apply.ts:422,427,433`: `add` rows for growth, margin and rf are never clamped (only `set` is). A rf row of −150 pts makes FCFF "n/a"; growth +5000 pts gives $9,134/share (confirmed). Clamp the *result* of each year to `PATH_META` ranges.
- `store.ts:545-548`: malformed JSON returns `null`, so the UI says "**This browser is blocking site storage**" (confirmed). The message is wrong; it should be "Saved scenarios were unreadable and were reset".

### 7. Low: smaller correctness and UX issues
- `Scenarios.tsx:36`: the 51st save is silently dropped (`slice(0, 50)`), and "Save and switch on" then turns on a scenario that doesn't exist. Show a message.
- `scenarioTemplates.ts:240`: "Capex high, then normalises" stores `capexNormal` as an **absolute** `set a.daPct` from the day it was created. After a data refresh it no longer means "= D&A", which goes against the spec's "relative by default". Leave `capexNormal` unset; the engine already defaults to `MIN(D&A, capex)`.
- Mobile (375px): the sticky banner is **272px tall** on an 812px screen, a third of the viewport, and it lists every lever change. Collapse the changes line below `sm`.
- Mobile: the page overflows horizontally by 8px at 375px. The cause is the floating round nav button (`nav-glass … h-10 w-10`, right edge at 368px). This is on `main` too, not new.
- With a scenario on, the reverse DCF text still says "at a 65.2% operating margin", although the scenario's margin rows differ.
- `src/lib/excel/scenarios.ts:47-53`: the rate-path rescale for `rdFollowsRf = false` uses the base tax rate. It is wrong if the same scenario also changes tax. Not exercised by any template.

## Spec vs build (`docs/superpowers/plans/2026-11-18-scenario-maker.md`)

Matches: data model, relative ops, `applyScenario` purity and diff list, per-company `scenarios:v1:<TICKER>` storage, no active state stored, try/catch everywhere, JSON backup/restore, list with Switch on/Edit/Duplicate/Delete, editor with simple/advanced/year grid and "Add changes from a template", comparison table, banner, "Base $X" on cards, share-link tooltip, the financial-firm filter, base-drift notice, 50 cap, Excel Scenarios sheet with `scenario_sel` dropdown, INDEX/MATCH inputs and per-year rows, static summary, opens on Base, About lists stories.

Missing or different:
- **`newShares` lever** (spec §1, Shares) is not implemented.
- Comparison table has no **WACC** row (spec §4 lists it).
- Sidebar: a summary box at the top instead of "each changed input highlighted with base underneath" (acceptable, but different).
- Live preview updates on blur/Enter, not "as you type".
- Shock recovery: geometric decay plus a permanent share (documented in calibration doc §1), not the linear "won back by year 10".
- JSON export covers one company only (spec says "all companies or one"). Uploaded companies key on CIK only, not name + CIK.
- Templates differ from the spec table (rate shock, energy crunch, bull, margin reverts); the changes are documented in `docs/research/scenario-calibration.md`.

## Template sources: plausibility

Checked against what I know or could find. None looks invented, and none is badly overstated:
- Fama & French (2000) ~38%/yr profitability reversion: correct.
- NVIDIA FY22 → FY23 GAAP operating margin 37.3% → 15.7%, back up the next year: correct (10,041/26,914; 4,224/26,974; FY24 ~54%).
- Chip sales −32% (2001), −9% (2009), ~−12% (2019), −8.2% (2023): correct.
- 10-yr Treasury above 10% in 1980-81, and the 2022 rise of ~1.5% → 3.9%: correct.
- Berkeley Lab >5-year median queue, Bloomberg 7-year Dominion waits: plausible (Berkeley Lab data cover generators, as the doc itself says).
- **ASPE "~20% with 3 competitors":** not verified. The FDA figures quoted in the same calibration doc ("second entrant roughly halves the price") point to *larger* drops, so 20% is the low end, not an overstatement. The drug analogy for chips is weak, and the doc admits it.
- McKinsey: the template says "about half keep their edge", while the calibration doc says "a small majority". Make them consistent.
- "Site's own backtest 23-33%": not checked independently.

## Site-wide results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **pass** (exit 0) |
| `npx vitest run` | **pass**: 9 files, 75 tests (includes the untracked `tests/stress.scratch.test.ts`) |
| Lint | **Not available**: no ESLint dependency or config in the repo, and Next 16 has no `next lint`. Nothing to run |
| `next build` | Not run (it would write `.next` under the running dev server) |
| Console errors (NVDA page, scenario flows, corrupt storage) | None, no page errors |
| Performance | `quickRun` 0.8 ms, `runAll` 23 ms for NVDA. The comparison of N scenarios is cheap |
| Mobile 375px | Usable; tabs and tables scroll inside their containers. Issues: see #7 |
| A11y basics | All inputs labelled (aria-label or wrapping label), tabs use `role=tab`, `lang=en`, no images without alt. Not checked: contrast, keyboard focus order, screen-reader pass |
| Neutral adjustments, all 501 companies | 0 mismatches (FCFF/FCFE/APV/RI/DDMs/payout/multiples, status and value) |
| Excel scenario switch (real Excel, COM) | Base 286.03 / Shock 161.25 / Rate 239.36 / Capex 284.38, identical to the site for FCFF, FCFE, APV and RI |

## NVDA input check (site vs SEC XBRL, CIK 0001045810)

Site basis: TTM to 2026-07-26 = FY2026 10-K (filed 2026-02-25) + Q2 FY27 10-Q YTD (accession 0001045810-26-000075, filed 2026-08-26) − H1 FY26. Filing values from `data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json`.

| Input | Site | Filing value (derivation) | Source tag | OK? |
|---|---|---|---|---|
| Revenue TTM | $302,970M | 215,938 − 90,805 + 177,837 = 302,970 | `Revenues` | ✓ |
| Revenue FY2026 | $215,938M | 215,938 | `Revenues`, 10-K | ✓ |
| Operating income TTM | $197,579M | 130,387 − 50,078 + 117,270 = 197,579 | `OperatingIncomeLoss` | ✓ |
| Operating margin TTM | 65.2% | 197,579 / 302,970 = 65.21% | derived | ✓ |
| D&A TTM | $3,687M (3-yr avg 1.74% of revenue used) | 2,843 − 1,280 + 2,124 = 3,687 | `DepreciationDepletionAndAmortization` | ✓ |
| Capex TTM | $7,354M (3-yr avg 2.34% used) | 6,042 − 3,122 + 4,434 = 7,354 | `PaymentsToAcquireProductiveAssets` | ✓ |
| Cash | $22,443M | 22,443 | `CashAndCashEquivalentsAtCarryingValue` | ✓ |
| Short-term investments | $46,900M | Balance-sheet marketable securities **34,143** (`DebtSecuritiesCurrent`). The AFS total of 46,900 also holds ~5.9B of 1-5-yr securities and ~6.9B of AFS already in cash equivalents (derived: 46,900 − 34,143 − 5,900) | `AvailableForSaleSecuritiesDebtSecurities` | **✗ ~$6.9B double-counted (~$0.28/sh)** |
| Equity investments | not counted | `EquitySecuritiesFvNi` 42,783 (current assets) + non-marketable equity 47,898 ≈ $90.7B (~$3.75/sh) | — | **✗ omitted (~1.3% of value)** |
| Debt | $33,366M | 32,366 non-current + 1,000 current = 33,366 (up from 8,470 in Q1; new issuance, 8-K 2026-06-18) | `LongTermDebt` | ✓ (leases of $5.5B excluded, by design) |
| Diluted shares | 24,338M | 24,338, but this is the **6-month YTD** weighted average, labelled "last 12 months" | `WeightedAverageNumberOfDilutedSharesOutstanding` | ✓ value / label imprecise |
| Cover-page shares (used) | 24,100M | 24,100 as of 2026-08-21 | `dei:EntityCommonStockSharesOutstanding` | ✓ |
| Tax rate | 14.1% (3-yr FY pooled) | (4,058 + 11,146 + 21,383)/(33,818 + 84,026 + 141,450) = 14.1%. TTM effective 36,863/229,743 = **16.0%**, FY26 15.1% | `IncomeTaxExpenseBenefit` / pretax | ✓ method; ~2 pts below the current rate (NOPAT +2%) |
| Dividends TTM | $6,776M | 974 − 488 + 6,290 = 6,776; **Q2 FY27 alone was $6,000M** (vs $243M in Q1) | `PaymentsOfDividends` | ✓ value. TTM understates the run rate if Q2 recurs; DDMs are n/a for NVDA anyway |
| Buybacks TTM | $55,315M | 40,086 − 23,815 + 39,044 = 55,315 | `PaymentsForRepurchaseOfCommonStock` | ✓ |
| Net income TTM | $192,880M | pretax 229,743 − tax 36,863 = 192,880. Includes ~$32B of non-operating (investment) gains | `NetIncomeLoss` | ✓ |
| Price | $155.46 (close 2026-11-17) | not independently verified (quote sites blocked automated access) | — | ? |
| **Freshness** | Q2 FY27 | NVIDIA filed an **8-K Item 2.02 (results) on 2026-11-17**. Q3 FY27 numbers are public but not yet in XBRL; Q3 guidance was ~$108B vs $57.0B a year earlier, so TTM revenue would rise ~17% | submissions API | ⚠ stale by one quarter once the 10-Q lands |

### NVDA outputs vs references

- Base value per share: FCFF $286.03, FCFE $284.65, APV $285.95, RI $284.61 (consistent), total payout $181.16, multiples $395.52. DDMs n/a. Price $155.46, so FCFF is 1.84× the price.
- Reverse DCF: the price implies **19.9%** average revenue growth in years 1-5 at a 65.2% margin; the model uses 35.3%.
- WACC 12.7% (Blume β 1.80, rf 5.1%, ERP 4.23%, debt weight 0.9%).
- Implied multiples at $286: ~36× TTM EPS ($7.93, which includes non-operating gains), ~41× TTM NOPAT per share. At the price: ~20× EPS.
- Analyst consensus (pre-Q3): TipRanks average **$317.83** (35 analysts, 11 Nov 2026); MarketBeat **$304.26** (53 ratings, range $218–$500); another source ~$327. Melius cut to $315; Baird downgraded to Hold, $200 target. The site sits just under the sell-side average.
- Damodaran: I found no 2026 per-share figure. His January 2026 comments call NVIDIA "richly priced", which is the opposite of the site's 84% upside. His earlier published values were well below the market (2023: ~$240 pre-split, i.e. ~$24 post-split; 2024: ~$436 pre-split, i.e. ~$43.6 post-split). The gap is mostly the perpetual 65% margin and the growth path (#4).

## What I could not verify

- The share price and market cap snapshot (Stooq returned a bot check; I did not try to get around it).
- The 8-K text itself: www.sec.gov blocks undeclared automated tools, so Q3 figures come from search results, not the filing.
- ASPE's exact "20% with three competitors" figure, and the site's own growth backtest.
- Damodaran's current published NVIDIA valuation.
- `next build`, lint (none configured), contrast/keyboard/screen-reader accessibility, and Safari/iOS behaviour.
- SimpleView while a scenario is on (it gets the base `a` with the scenario `out`; not exercised).

## Reviewer notes

- The dev server on :3100 was **not running** when I started. I started it through the `valuation-dev` preview config (same port, same command). It is still running.
- Playwright created `.playwright-mcp/` in the repo; I deleted it. Scenarios I saved in the Playwright browser are in that isolated browser profile, not in your own browser.
- Scratch scripts and the downloaded workbook are in my session scratchpad, outside the repo.

Sources: [SEC companyfacts API](https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json) · [SEC submissions API](https://data.sec.gov/submissions/CIK0001045810.json) · [TipRanks bear/bull 2026](https://www.tipranks.com/news/nvidia-stock-nvda-forecast-bear-case-vs-bull-case-scenario-for-2026) · [MarketBeat](https://www.marketbeat.com/articles/nvidia-just-proved-the-ai-boom-is-bigger-than-anyone-thought/) · [FN2 analyst consensus](https://fn2.ai/earnings/nvda/analysts) · [Finviz: Damodaran on AI valuations](https://finviz.com/news/287849/top-valuation-expert-says-ai-market-needs-trillions-in-revenue-to-justify-valuations-after-cashing-out-of-its-biggest-chipmaker) · [Motley Fool: Damodaran 2024 value](https://www.fool.com/investing/2024/08/16/dean-of-valuation-reason-buy-nvidia-stock)
