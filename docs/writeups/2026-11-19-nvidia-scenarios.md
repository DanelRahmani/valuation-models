# What would have to go wrong for NVIDIA? 16 scenarios on one valuation

*Draft, 19 November 2026. Numbers from the site's snapshot of 17 November 2026; re-run before posting (see the notes at the end).*

Someone left a sharp comment on my valuation tool: custom chips are coming. Google has TPUs, Amazon has Trainium,
Microsoft has Maia, Huawei has Ascend. With GPUs this expensive, every large buyer has a reason to build its own. Today's
lack of competition says little about tomorrow's.

That is hard to argue with in the abstract and hard to put a number on. So I built a scenario maker into the tool and ran
every scenario on NVIDIA. This post is what came out.

*Mathematical valuations under stated assumptions. Not investment advice.*

## The base case

The base case comes straight from the SEC filings, with no opinions added:

- The 12 months to 26 July 2026: revenue of **$303 billion**, an operating margin of **65%**, revenue growth of **83%**.
- Growth fades the way fast growers' growth has historically faded (McKinsey's decay: each year keeps 70% of the growth above
  a typical company's), down to 2.5% after year 10.
- Margin held at 65%. Capex at its 3-year average, **2.3% of revenue**.
- Beta 1.80 (Blume-adjusted regression), risk-free rate 5.1%, equity risk premium 4.2%: a **WACC of 12.7%**.

That gives a discounted-cash-flow value of **$286 a share**, against a price of **$155.46**. The base case is 84% above the
market.

The reverse DCF says the same thing the other way around: to justify $155, revenue has to grow about **20% a year** over
the next five years. The base case assumes 35%. The market is already much more cautious than a mechanical fade of past
growth.

So the interesting question isn't "is NVIDIA cheap". It's **"which story is the market already pricing?"**

## Sixteen scenarios

Each scenario changes a few inputs relative to the base case. Nothing else moves. Values are FCFF per share. FCFE, APV and
residual income land within a few dollars of FCFF in every case.

| Scenario | Value per share | vs base | vs price | Revenue, year 10 | Margin, year 10 | WACC |
|---|---|---|---|---|---|---|
| Bull: moat holds | $585 | +105% | +276% | $4,406B | 70% | 12.7% |
| Rate cut (−2 pts) | $370 | +29% | +138% | $1,980B | 65% | 10.7% |
| **Base case** | **$286** | — | **+84%** | $1,980B | 65% | 12.7% |
| Capex high, then normalises | $284 | −1% | +83% | $1,980B | 65% | 12.7% |
| Capex stays high | $280 | −2% | +80% | $1,980B | 65% | 12.7% |
| Riskier than the market thinks (beta +0.3) | $249 | −13% | +60% | $1,980B | 65% | 13.9% |
| Rate shock (10% for two years, then 6%) | $242 | −16% | +55% | $1,980B | 65% | 13.6%* |
| Margin reverts halfway to the industry | $229 | −20% | +47% | $1,980B | 50% | 12.7% |
| Rates stay high (+2 pts) | $211 | −26% | +36% | $1,980B | 65% | 15.5% |
| **New-entrant shock** | **$160** | −44% | **+3%** | $1,309B | 50% | 12.7% |
| Custom silicon (shock + capex) | $159 | −45% | +2% | $1,309B | 50% | 12.7% |
| Growth fades faster | $135 | −53% | −13% | $803B | 65% | 12.7% |
| New competition (slow squeeze) | $133 | −54% | −15% | $1,020B | 50% | 12.7% |
| Slow squeeze + capex | $132 | −54% | −15% | $1,020B | 50% | 12.7% |
| Energy crunch | $127 | −56% | −18% | $927B | 62% | 13.1% |
| Perfect storm (shock + energy + rates) | $64 | −78% | −59% | $628B | 47% | 14.0% |
| Demand shock | $50 | −82% | −68% | $286B | 57% | 12.7% |

\* The lasting rate. Years 1-2 are discounted at the 10% spike.

What each one does:

- **New-entrant shock:** in year 3 a rival chip takes off. Revenue drops 20% that year, the margin drops 20 points, a
  quarter of the margin hit is won back by year 10, and growth runs 3 points slower afterwards.
- **New competition:** the slow version. The target margin drifts 15 points lower over five years, and growth fades faster
  (55% of the excess kept each year instead of 70%).
- **Energy crunch:** the grid is full, so data centres wait for power. Revenue growth is capped at 15% a year for four
  years. Power costs take 3 margin points, own generation adds 20% to capex, and beta rises by 0.1.
- **Capex scenarios:** capex 1.5 times higher, either for all ten years or for three years before falling back to
  depreciation.

## What I learned

**1. The market price sits right on the custom-silicon story.** A shock in year 3 that takes a fifth of revenue and 20
points of margin gives $160, within 3% of the $155 price. The slow squeeze and an energy crunch land just below the price.
Put loosely, today's price already assumes NVIDIA loses its current position. It does not assume the 65% margin lasts.

**2. For NVIDIA, capex barely matters.** Making capex 50% higher, even for ten years, moves the value by 1-2%. NVIDIA is
fabless: it spends 2.3% of revenue on capex. The AI build-out shows up on its *customers'* books, as NVIDIA's revenue. So
the capex risk for NVIDIA runs the other way: if hyperscalers cut spending, NVIDIA loses demand. That is the demand-shock
row, and it is by far the worst. For Microsoft, Alphabet or a utility, the capex scenarios would bite.

**3. Physical limits matter as much as competition.** Capping growth at 15% a year for four years, because power is not
there, does about as much damage (−56%) as the slow-squeeze competition scenario (−54%). Most of that comes from the cap,
not the smaller margin and beta changes. You can't build a grid with capital alone.

**4. Rates move it as much as a margin reset.** Two points on the risk-free rate, in either direction, moves the value by
26-29%. A 10% spike for only two years costs 16%, because most of the value sits further out.

**5. A sudden shock is worth more than a slow squeeze.** Both end at a 50% margin. The shock waits until year 3, so the
first two years run at full speed, which is enough to leave it ahead. (The two also treat growth differently, so this is
not a perfectly clean comparison.)

**6. The payoff is lopsided in percentage terms, not in dollars.** The bull case doubles the value. Most bear cases halve it,
and the combined "perfect storm" takes 78% off.

**7. Multiples can't do this.** The multiples model stays between $309 and $445 in every scenario, because it prices today's
earnings at peer multiples. Scenario analysis needs a model with an explicit future: cash flows, margins, growth paths.

## How the tool does it

- A scenario is a list of changes to a fixed set of levers: margin target, growth fade, a shock year with revenue and
  margin hits, capex paths, a growth cap, rates. You can also type values year by year. It is all numbers, never code.
- Changes are relative by default ("margin −15 points"), so a saved scenario still makes sense after the monthly data update.
- Scenarios are saved in your browser only, are never on unless you switch them on, and the page always shows the base case
  next to them.
- The Excel download includes every saved scenario behind a dropdown. Pick one and the whole workbook recalculates. Every
  formula is visible.

## What this is not

- These are not forecasts. The template numbers (−20% revenue, −20 points of margin, year 3) are round starting points for
  a story, not estimates.
- The base case itself is mechanical: it fades past growth and holds today's margin. With 83% trailing growth, that still
  multiplies revenue 4.4× in five years. The tool flags this, and it is a big part of why the base sits so far above the price.
- Not investment advice. The tool does math under stated assumptions; you supply the story.

---

## Notes for us (not for the post)

**Before posting:**
- The scenario maker is only on branch `scenario-maker`, not on the live site. Merge and deploy before linking to it, or
  the link won't show the feature.
- Re-run after the next monthly snapshot. NVIDIA's October-quarter 10-Q will move the TTM figures and the price. The script
  is in this conversation: it ran every template plus three combinations through `applyScenario` and `quickRun` on
  `public/data/companies/NVDA.json`.
- Add a screenshot of the side-by-side table and the banner. Consider a chart: the value per share for each scenario as a
  bar, with the price as a line.
- Check the competitor product names in the opening before publishing (product launches and names change quickly).

**What the evaluation found about the tool itself:**
1. **The demand-shock template is too harsh.** It sets latest-year growth to −15%, and the fade then starts from there, so
   revenue never recovers: year-10 revenue ($286B) is below today's. A "one bad year, then recovery" story should use the
   year grid instead (growth year 1 = −15%, the rest blank). But the model path from 83% would then resume at high growth in
   year 2, which is also odd. Probably needs its own lever ("growth restarts at X%").
2. **The capex templates don't fit fabless companies.** Either hide them when capex is below ~5% of revenue, or add a line
   in the template's text saying so.
3. **New competition and the new-entrant shock aren't directly comparable.** One fades growth faster; the other cuts
   growth after the shock. Make the gradual template use the same growth lever (or none) so the timing comparison is clean.
4. **The rate-shock row in the comparison table shows only the lasting WACC.** The year-by-year spike isn't visible there;
   a "plus year-by-year values" marker in the input rows would help.
5. **Multiples and total payout respond oddly.** They're anchored on current figures, so they move little or erratically
   under scenarios. Consider leaving them out of the scenario comparison, or labelling them "not driven by the forecast".
