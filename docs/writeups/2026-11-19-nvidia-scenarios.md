# What would have to go wrong for NVIDIA? 17 scenarios, grounded in the research

*Draft, 19 November 2026. Numbers from the site's snapshot of 17 November 2026; re-run before posting (see the notes at the end).*

Someone left a sharp comment on my valuation tool: custom chips are coming. Google has TPUs, Amazon has Trainium,
Microsoft has Maia, Huawei has Ascend. With GPUs this expensive, every large buyer has a reason to build its own. Today's
lack of competition says little about tomorrow's.

That is easy to agree with and hard to put a number on. So I built a scenario maker into the tool and calibrated each
scenario to what the research says about how margins, demand, rates and energy shocks have actually behaved. Then I ran
them all on NVIDIA.

*Mathematical valuations under stated assumptions. Not investment advice.*

## The base case

Straight from the SEC filings, with no opinions added:

- The 12 months to 26 July 2026: revenue of **$303 billion**, an operating margin of **65%**, revenue growth of **83%**.
- Growth fades the way fast growers' growth has historically faded (McKinsey's decay: each year keeps 70% of the growth
  above a typical company's), down to 2.5% after year 10.
- Margin held at 65%. Capex at its 3-year average of **2.3% of revenue**.
- Beta 1.80, risk-free rate 5.1%, equity risk premium 4.2%: a **WACC of 12.7%**.

That gives **$286 a share** against a price of **$155.46**. The reverse DCF says the price needs about **20% a year**
revenue growth over five years; the base case assumes 35%. The market is far more cautious than a mechanical fade of past
growth. The question is **which story it is pricing**.

## Where the scenario numbers come from

| Scenario | Evidence it is calibrated to |
|---|---|
| Margins after a shock | Corporate profitability reverts about **38% a year** toward its mean (Fama & French, 2000) |
| How much of a lead survives competition | About **half** of top-quintile companies are still there ten years later (McKinsey) |
| Price drop when rivals arrive | About **−20%** within two to three years once three competitors enter (generic drugs, ASPE 2021) |
| A demand downturn | Chip sales fell **32%** (2001), **9%** (2009), about **12%** (2019) and **8%** (2023). NVIDIA's own margin fell about 22 points in fiscal 2023 and recovered within a year |
| How fast growth fades | Growth rates barely persist (Chan, Karceski & Lakonishok). On the site's own S&P 500 data only **23-33%** of above-median growth is left after a year |
| Grid constraints | Median grid hookup now takes **over 5 years** (Berkeley Lab); large data centres in Virginia wait **up to 7** (Dominion) |
| Energy price shocks | German chemical output fell about **6%** in the 2022 gas crisis; oil shocks hurt GDP but less than often assumed (Hamilton; Kilian) |
| Rates | +2 points ≈ the 2022 rise in the 10-year yield; 10% was the 1980-81 level. Long-duration stocks are the most rate-sensitive (Dechow, Sloan & Soliman) |

Where there is no base rate (the year a rival breaks through, the size of a grid-limited growth cap, capex cycles), the
number is a judgment call, and the tool says so next to it.

## Results

FCFF value per share. FCFE, APV and residual income land within a few dollars of it in every case.

| Scenario | Value per share | vs base | vs price | Revenue, year 10 | WACC |
|---|---|---|---|---|---|
| Bull: moat holds | $395 | +38% | +154% | $2,811B | 12.7% |
| Rate cut (−2 pts) | $370 | +29% | +138% | $1,980B | 10.7% |
| Recession (demand shock + rate cut) | $356 | +24% | +129% | $1,979B | 10.7% |
| **Base case** | **$286** | — | **+84%** | $1,980B | 12.7% |
| Capex high, then normalises | $284 | −1% | +83% | $1,980B | 12.7% |
| Capex stays high | $278 | −3% | +79% | $1,980B | 12.7% |
| Demand shock (one bad year) | $273 | −5% | +76% | $1,979B | 12.7% |
| Energy price shock (1973/1979/2022) | $266 | −7% | +71% | $1,861B | 12.7% |
| Riskier than the market thinks (beta +0.3) | $249 | −13% | +60% | $1,980B | 13.9% |
| Rate shock (10% for two years) | $239 | −16% | +54% | $1,980B | 13.7%* |
| Rates stay high (+2 pts) | $230 | −19% | +48% | $1,980B | 14.7% |
| New competition (slow squeeze) | $188 | −34% | +21% | $1,536B | 12.7% |
| Margin reverts to industry (base rate) | $175 | −39% | +13% | $1,980B | 12.7% |
| **New-entrant shock** | **$161** | −44% | **+4%** | $1,309B | 12.7% |
| Custom silicon (shock + capex) | $160 | −44% | +3% | $1,309B | 12.7% |
| Energy crunch (grid full) | $131 | −54% | −16% | $907B | 12.7% |
| **Growth fades at base rates** | **$107** | −62% | −31% | $614B | 12.7% |
| Perfect storm (shock + grid + rates) | $66 | −77% | −57% | $628B | 13.7%* |

\* The lasting rate. Years 1-2 are discounted at the 10% spike.

## What I learned

**1. The biggest question isn't competition. It's how long the boom lasts.** If NVIDIA's growth fades the way most
companies' growth does, it is worth $107, below the price, with margins untouched. The research default (McKinsey's
slower fade for fast growers) gives $286. That one assumption is worth more than any competition scenario.

**2. The market price sits on the custom-silicon story.** A rival breaking through in year 3 gives $161, within 4% of the
$155 price. It takes a fifth of revenue, and the margin falls to 50% for good, keeping half its lead over the industry (35%).

**3. A slow squeeze costs less than a sudden shock, and both cost less than you might think.** The gradual version ends
at the same 50% margin but loses no revenue in one go: $188. Even the base-rate case, where the margin reverts almost all
the way to the industry's 38%, still gives $175. A 65% margin is valuable, but most of the value is in the growth.

**4. A normal downturn barely matters; losing the momentum does.** A −12% year (a typical chip downturn) with a 10-point
margin dip, half of which comes back each year (NVIDIA's own margin was back within a year after fiscal 2023), costs only
5%: $273. Paired with a rate cut, as in a real recession, the value even rises. What costs money is the growth not coming
back: "Growth fades at base rates" gives $107.

**5. For NVIDIA, capex barely matters.** It spends 2.3% of revenue on capex because others make its chips; the AI
build-out shows up on its customers' books, as NVIDIA's revenue. Its capex risk is a demand shock. For Microsoft,
Alphabet or a utility, the capex scenarios would bite.

**6. Physical limits are a real risk.** Capping growth at 15% a year for five years, because the grid can't connect
data centres faster, gives $131. That is worse than a competitor breaking through, and there is no historical precedent for it.

**7. Rates matter about as much as a margin reset.** Two points either way moves the value by about 20-30%. A 10% spike
for two years costs 16%, because most of the value sits further out.

**8. Multiples can't do this.** Multiples price today's earnings, so they hardly react. Scenario analysis needs a model with
an explicit future.

## How the tool does it

- A scenario is a list of changes to a fixed set of levers: margin target, growth fade, a one-time shock (revenue, margin,
  how much is permanent, how fast the rest recovers), capex paths, a growth cap, rates. You can also type values year by year.
  It is all numbers, never code.
- Every template shows where its numbers come from, with links, and marks the judgment calls.
- Changes are relative to the company's own base case, so a saved scenario still makes sense after the monthly data update.
- Scenarios are saved in your browser only and are never on unless you switch them on. The Excel download includes them
  behind a dropdown that recalculates the whole workbook.

## What this is not

- Not forecasts. The research gives base rates, not NVIDIA's future; NVIDIA may well be the exception.
- The base case is mechanical. With 83% trailing growth it multiplies revenue 4.4× in five years, which is a big part of
  why it sits so far above the price.
- Not investment advice.

---

## Notes for us (not for the post)

**Before posting:**
- The scenario maker is only on branch `scenario-maker`. Merge and deploy before linking to it.
- Re-run after the next monthly snapshot: NVIDIA's October-quarter 10-Q will move the TTM figures and the price. Re-run the
  same templates plus the three combinations on `public/data/companies/NVDA.json`.
- Add a screenshot of the comparison table, or a bar chart of value per share with the price as a line.
- Check the competitor product names in the opening.
- Sources and the full evidence table: `docs/research/scenario-calibration.md`. The 2019 −12% chip figure comes from trade
  press and should be checked against WSTS.

**Changes after the independent review (19 Nov):** Bull fade 0.75 (was 0.8). "Capex stays high" no longer raises D&A, which in this model only added cash. Range limits can no longer reverse a change for loss-makers. The base case now carries a note when its margin is far above the industry.

**Changes since the first draft (19 Nov):**
- Five template fixes:
  - Demand shock: now a one-year dip of −12% in absolute terms; half the lost revenue and half the margin dip come back each year.
  - New competition: now uses the same growth drag as the shock.
  - Capex templates: warn for low-capex companies.
  - Comparison table: shows year-by-year values.
  - Models that don't use the forecast are marked "for reference".
- Templates recalibrated to the research. The shock's margin hit now has a permanent share plus a part that recovers at
  38% a year, instead of a straight line. New templates: "Growth fades at base rates" and "Energy price shock".
