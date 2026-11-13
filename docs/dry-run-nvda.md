# Dry run: NVIDIA (NVDA), 2026-11-13

Data: SEC companyfacts (CIK 0001045810), latest 10-K FY2026 (ended 2026-01-25). Price $166.19 (Nasdaq close 2026-11-12). 10-yr Treasury 4.98% (FRED, 2026-11-10). ERP 4.23% (Damodaran, end of 2025).

## 1. Extracted historicals vs Yahoo Finance ($ millions)

| Item | FY2023 | FY2024 | FY2025 | FY2026 | Yahoo |
|---|---|---|---|---|---|
| Revenue | 26,974 | 60,922 | 130,497 | 215,938 | Match |
| Cost of revenue | 11,618 | 16,621 | 32,639 | 62,475 | Match |
| Operating income | 4,224 | 32,972 | 81,453 | 130,387 | Match except FY2023 (Yahoo 5,580: reclassifies the $1.35B Arm termination charge as irregular; the 10-K reports 4,224) |
| Pre-tax income | 4,181 | 33,818 | 84,026 | 141,450 | Match |
| Income tax | -187 | 4,058 | 11,146 | 21,383 | Match |
| Net income | 4,368 | 29,760 | 72,880 | 120,067 | Match |
| Cash from operations | 5,641 | 28,090 | 64,089 | 102,718 | Match |
| Capex | 1,833 | 1,069 | 3,236 | 6,042 | Match |
| Buybacks | 10,039 | 9,533 | 33,706 | 40,086 | Match |
| Cash | 3,389 | 7,280 | 8,589 | 10,605 | Match |
| Diluted shares (M) | 25,070 | 24,940 | 24,804 | 24,514 | Match |

## 2. Beta

Nasdaq 5-year daily prices, monthly returns vs SPY: beta 2.24 on 59 months (manual CSV download), 2.20 on 60 months (snapshot API pull, one extra month). R² about 0.5, SE about 0.3.

## 3. Valuation (default assumptions)

WACC 14.26%, cost of equity 14.3%, growth 30% (3-yr CAGR 100%, capped), margin held at 60.4%.

| Model | Value per share |
|---|---|
| FCFF | $153.13 |
| FCFE | $153.03 |
| APV | $153.11 |
| Residual income | $151.44 |
| Multiples (Damodaran semiconductor averages) | $216.49 |
| DDM (Gordon / 2-stage / H) | $0.35 / $0.96 / $0.82 (NVIDIA pays almost no dividend) |
| Reverse DCF | 31.8% stage-1 growth justifies $166.19 |

## 4. Checks

- **Independent recomputation:** FCFF recomputed in a separate Python script from the same inputs gives $153.1286, identical to the engine.
- **Excel:** the exported workbook was opened in Microsoft Excel with a full recalculation (`CalculateFullRebuild`). All Summary values equal the site to 4 decimals, with 0 error cells.
- **Internal consistency:** FCFF, FCFE, APV and residual income agree within 1.2%.
