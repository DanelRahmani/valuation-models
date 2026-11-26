# Scenario calibration: what the evidence says

Collected 19 November 2026 to ground the scenario templates (`src/content/scenarioTemplates.ts`). Each template shows its
own evidence and sources in the app under "Where the numbers come from". Where no base rate exists, the template says the
number is a judgment call.

## 1. How fast do margins recover after a shock?

| Finding | Number | Source |
|---|---|---|
| Corporate profitability reverts toward its mean | **~38% of the gap closes per year**; faster when profitability is far from the mean, and faster when it is below it | Fama & French (2000), *J. of Business* 73(2) — [RePEc](https://ideas.repec.org/a/ucp/jnlbus/v73y2000i2p161-75.html) |
| Top performers mostly, but not all, fade | A small majority of top-quintile companies (by economic profit) are still top-quintile ~10 years later; about half drop out, one in eight to the bottom | McKinsey — [The strategic yardstick](https://www.mckinsey.com/capabilities/strategy-and-corporate-finance/our-insights/the-strategic-yardstick-you-cant-afford-to-ignore) |
| Firms with ROIC > 20% | ~50% chance of being in the same group 10 years later | McKinsey (2006), *Balancing ROIC and growth* |
| A real case | NVIDIA's GAAP operating margin fell from 37.3% (FY22) to 15.7% (FY23), about 22 points, and recovered the next year | [NVIDIA FY23 release](https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-fourth-quarter-and-fiscal-2023) |

**Used as:** the shock's transient margin hit decays at 38% a year (`shockRecovery` = 0.38). The demand shock uses 0.5,
because a margin below its mean reverts faster. The permanent part of a competitive hit = half the lead over the industry
margin, since about half of top performers keep their edge.

**The engine change this needed:** the shock's margin hit now has a permanent share plus a part that recovers
geometrically, instead of a straight-line recovery by year 10.

## 2. What does competitive entry do to prices?

| Finding | Number | Source |
|---|---|---|
| Generic drugs, 3 competitors | Prices ~20% below the brand within 24-36 months | [ASPE (2021)](https://aspe.hhs.gov/sites/default/files/migrated_legacy_files//198346/medicare-part-d-generic-comp.pdf) |
| Generic drugs, 10+ competitors | ~80% below | same |
| First vs second entrant | The first generic prices slightly below the brand; the second roughly halves the price | FDA (2019), via trade press |

**Used as:** the new-entrant shock's 20% revenue drop (a price cut on the same volume). This is an analogy: chips are not
drugs. Drugs give the cleanest measured case of what entry does to prices.

## 3. Demand downturns (semiconductors)

| Year | Global chip sales | Source |
|---|---|---|
| 2001 | −32% (WSTS forecast; Gartner −32.5%) | [The Register, 2001](https://www.theregister.co.uk/2001/10/23/world_chip_sales_down/) |
| 2009 | −9% ($248.6B → $226.3B) | [SIA](https://semiconductors.org/global-chip-sales-decline-in-2009) |
| 2019 | ~−12% | trade press (not checked against WSTS) |
| 2023 | −8.2% ($574.1B → $526.8B) | [SIA via Design & Reuse](https://design-reuse.com/news/55644/2023-semiconductor-sales.html) |

**Used as:** the demand shock's −12% year (typical, not the worst), with a 10-point transient margin hit.

## 4. Interest rates

- Unexpected Fed moves affect stock prices mainly through expected excess returns, i.e. discount rates
  ([Bernanke & Kuttner, 2005](https://econpapers.repec.org/RePEc:bla:jfinan:v:60:y:2005:i:3:p:1221-1257)). Nagel & Xu
  (2024) attribute most of it to the term structure instead. Either way, it works through the discount rate, which is what
  the rate templates change. I could not verify the often-quoted "1% per 25 bp surprise" figure, so it is not used.
- Long-duration (growth) stocks are the most rate-sensitive
  ([Dechow, Sloan & Soliman, 2004](https://deepblue.lib.umich.edu/items/82a14f0a-ea44-44d1-8a86-3d19483f23ad)).
- Sizes used: +2 points ≈ the 2022 rise in the 10-year yield (about 1.5% → 3.9%). The 10-year was above 10% in
  1980-81, which gives the Volcker-style stress test.

## 5. Energy

| Finding | Number | Source |
|---|---|---|
| Oil shocks and GDP | A 10% oil price rise lowers GDP growth ~0.4 points four quarters later (Hamilton 1983); the 1973 disruption coincided with a 3.2% GDP fall | [Hamilton](https://www.eia.gov/finance/markets/reports_presentations/2022/Hamilton_EIA2022_slides.pdf) |
| But smaller than often assumed | Exogenous supply shocks had comparatively small average effects on US GDP | [Kilian (2008)](https://www.bankofcanada.ca/wp-content/uploads/2010/08/kilian.pdf) |
| 2022 European gas crisis | German chemical output −6% (VCI); EU chemical output ~−16% in Q4 2022; BASF energy costs +260% year on year in Q2 | [CHEManager](https://chemanager-online.com/en/news/german-chemicals-stagger-under-energy-burden) |
| Grid connection waits | Median request-to-operation over 5 years for projects built in 2025 (doubled since the 2000s) | [Berkeley Lab, Queued Up 2026](https://eta-publications.lbl.gov/publications/us-interconnection-queue-data-0) |
| Data centres, Virginia | Up to 7 years for large hookups (2024), up from 18-24 months in 2020 | [Bloomberg](https://www.bloomberg.com/news/articles/2024-08-29/data-centers-face-seven-year-wait-for-power-hookups-in-virginia) |

**Used as:** the energy price shock (−6% volume, a 5-point transient margin hit) and the grid crunch (growth capped for 5
years). A grid limit on today's scale has no precedent, so the 15% cap is a judgment call. The Berkeley Lab data cover
generators, not loads, so they are a proxy for data-centre waits.

## 6. Growth persistence

- Growth rates have little persistence beyond chance (Chan, Karceski & Lakonishok, 2003).
- This site's own backtest (S&P 500, 2017-2025): 23-33% of growth above the median is left after one year.
- **Used as:** "Growth fades at base rates" sets the yearly decay to 0.3 (the research default is 0.7).

## Still judgment calls (said so in the app)

The year-3 timing of the entrant shock, the 3-point growth drag, the energy-crunch cap and margin hit, both capex templates,
beta +0.3, and the bull case's 3 points.
