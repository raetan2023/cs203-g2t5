# Evidence: does Singapore gasoil represent MGO? (MPP-48)

Full analysis: [`gasoil_mgo_proxy.ipynb`](gasoil_mgo_proxy.ipynb) · matched data: [`matched_dates.csv`](matched_dates.csv)
· data: `models/ridge-regression/data/raw/market_observations.csv` (253 MGO quotes, 2020-03-13 to 2026-10-06).

**Finding: gasoil is a reasonable proxy for MGO.**

## Units and matching

- Gasoil (`sg_gasoil_investing`) is quoted in **USD/barrel**; MGO (`sg_mgo_themaritime`) in **USD/metric tonne**
  (source: `models/ridge-regression/data/metadata/series_dictionary.csv`).
- Conversion: **7.45 barrels per tonne** of Singapore gasoil (≈ 0.844 kg/L), applied to gasoil only; MGO is already
  quoted per tonne. It is not derived from our data, and MGO's exact grade is unrecorded. Percentage comparisons need
  no conversion. **Source:** ICE Futures converts the Platts Singapore gasoil price at 1 metric tonne = 7.45 barrels
  ([contract specification](https://www.ice.com/products/65898861/Gasoil-Arb---Singapore-Gasoil-(Platts)-vs-Low-Sulphur-Gasoil-1st-Line-Balmo-Future-(in-Bbls))).
- Matching rule: each MGO quote is paired with the most recent gasoil close **on or before** its date (same day
  allowed, max 7 days old). All 253 quotes matched; gasoil was 0–3 days old.

## Headline numbers

| Evidence | Result |
|---|---|
| Price levels (gasoil × 7.45 vs MGO) | correlation **0.986**; median gap only **$21.6/t** |
| % moves, all 252 consecutive quotes | **r = 0.80**; MGO moves ~85% as much as gasoil (slope **0.83**, 95% CI 0.75–0.90) |
| Move MGO by gasoil's actual % change vs "no change" | error cut by **28%** (MAE **$31.05 → $22.50/t**); **32%** with previous-day gasoil |
| Stability over time | slope 0.81 (2020–21), 1.06 (2022), 0.85 (2023–25), 0.64 (2026); positive in every period |

## Basis conversion rule

- **Move an MGO price with gasoil:** `MGO_est = MGO_last × (1 + gasoil % change since the last MGO quote)`,
  measuring gasoil up to the **previous trading day**.
- **Convert a level:** `MGO ≈ 7.45 × gasoil (USD/bbl) + basis`, typical basis ~$20/t.
- Equal percentage movement is **well supported** as a simple rule; MGO tends to move slightly less (~85%), a
  possible refinement to validate later.

## Things to keep in mind

- **Strongest over days to weeks.** Day-to-day MGO quotes are noisier (34% of short-interval quotes don't change);
  MGO lines up best with the previous day's gasoil.
- **The basis can widen during shocks**, e.g. March 2026 (MGO +70% in six days vs gasoil ~+20%) and July–Aug 2026
  (gap $165–222/t), before narrowing again.
- **Based on actual moves.** These comparisons use observed gasoil, so they measure how well gasoil represents MGO,
  separately from how well gasoil can be forecast.
- 126 of the 253 quotes are from 2026; quote publication times and MGO grade aren't recorded. Gasoil is used as a
  proxy and isn't labelled as an observed MGO price.

## For the Model Trust page (Yash)

Chart: [`model_trust_chart.png`](model_trust_chart.png)

> Our forecasts use Singapore gasoil futures as a daily signal for the MGO bunker price, because MGO quotes are
> published irregularly. Across 253 observed MGO quotes since 2020, gasoil (converted to USD per tonne) closely
> tracks MGO, and their price moves line up with a correlation of 0.80. Like any proxy, the gap between them can
> widen briefly during sharp market moves, such as March 2026.
