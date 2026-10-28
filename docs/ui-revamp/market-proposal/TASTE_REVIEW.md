# Taste review: market overview proposal (round 1)

Reviewed with tasteskill 2.1.5, app-screen run (`references/app-screens.md` §2.7). The page was rendered from
`market-proposal.html` with the sample data in `market-data.js`. Screenshots are in `taste-review/` (1440, 768, 390).
Every `?state=` preview was opened in Chromium with no script errors.

**Update 2026-10-28:** the owner chose buyer meaning for colour, and the dearer colour changed from orange `#f2a172`
to red `#f2849e`. The inspector now reports **0 FAIL**, 2 WARN: the beige brand ink (`palette-cream`, accepted) and
the uneven card rows. The screenshots in `taste-review/` are from that run.

## Gate

| Check | Current dashboard (28 Oct) | Proposal |
|---|---|---|
| `lint.mjs --app` | 4 FAIL (gradients), 5 WARN (eyebrows ×4, shadow) | **0 FAIL**, 2 WARN (tooltip shadow, monospace run id: both allowed on app screens) |
| `inspect.mjs --app` | 3 FAIL (tiny uppercase labels, gradients, 75 text blocks < 11px), 5 WARN (38px title, heavy borders, ragged row, contrast, dev server) | **1 FAIL** (palette), **1 WARN** (ragged rows) |
| Type sizes | 8–38px, 14 sizes | 12–30px, 10 sizes; h1 24px |
| Page length at 1440 | 3.2 screens; forecast starts ~1,840px down | 1.7 screens; forecast in the first screen |

**FAIL `palette-claude`:** the beige ink (#f0e6d2) plus the orange "adds cost pressure" hue (#f2a172) reads as
taste's banned cream-and-terracotta pairing. The beige is the accepted brand. The orange came from the mock.
**WARN `ragged-row`:** the chart card ends 121px above the forecast + plans column, and sales ends 138px below news.

## The seven questions

1. **Is the question answered by the biggest thing, and is that read first?** Yes. The question is *what MGO costs now
   and where it is heading*. The title line answers it in words ("Singapore MGO $1,351.50/MT on 26 Oct, unchanged…
   7-day forecast range $1,200–$1,386"). MGO is the largest figure (30px, against 22px for the other prices), and
   the chart opens on MGO, running into the dashed forecast range. In the current screen the largest figure was the
   news count, and the forecast was two screens down.
2. **Do blocks share edges?** Not yet. There are two ragged rows at 1440. At 768, the forecast and plans cards sit side by
   side at different heights. The chart's 60-day window starts on 28 Aug but the data starts on 2 Sep. That is an
   honest calendar window, but it reads as a gap.
3. **Colour only on data, status and the one action?** Mostly. Beige marks MGO (its line, the strip's selected rule,
   the MGO sales bars). Green and orange appear only on changes. The palette FAIL above is the one problem.
4. **Do numbers add up and agree?** Yes. Each change is recomputed from the last two stored values:
   Brent 118.82 → 115.22 = −3.03%, gasoil 173.38 → 174.73 = +0.78%. The forecast range in the title line and in
   the card is the same value. The relative figures name their baseline ("vs previous value",
   "over the 60 days to 26 Oct", "above its 13-day median").
5. **Zeros and missing values?** The MGO zero change prints as "— 0.00%" in grey. A missing previous value prints
   "No previous value". Stale prices (Brent 8 days, USD index 12 days) get the clock in amber.
6. **Legends and captions?** The chart legend swatches match their marks. But two captions have to explain the encoding.
   The two-line note under the strip (what green and orange mean, the clock, the unverified units) and
   "Marine gas oil categories in beige" are both tells: encode the meaning, don't caption it.
7. **On the phone?** Navigation folds into the menu. The strip becomes MGO full-width plus a 2×2 grid. Sales are
   two-line rows with the figure visible (on the current screen they were cut off). The forecast is the third block
   down, but its answer is already in the title line.

## What still reads as generated (to clean up next round)

In rough order of impact:

1. **The orange pressure hue** (palette FAIL). Pick a pressure colour that isn't terracotta, such as a rose red
   (taste's dark negative is #e5566f), or settle decision 1 in PARITY.md first.
2. **The caption under the price strip.** Two lines explaining colours, the clock and units. Move the colour meaning
   into each change's accessible text and tooltip ("lowers cost for a buyer"), and the unit note into the cell's
   tooltip, so the strip needs no key.
3. **The forecast range bar.** Its ends are always the low and high, so the fill always spans the full track and the
   bar is decoration. Either scale it to a fixed band around the quote (for example ±15%) so ranges compare across
   horizons, or drop it and let the chart carry the range.
4. **Ragged rows.** Let the chart card take the column's height, by moving "Recent values" and the observation
   count under the chart in a fixed footer. Cap sales at the height of news, or stack news under the forecast.
5. **News mini charts.** They are small trend graphics under single figures, which is close to the sparklines taste
   bans. Keep one (article count, with dates on its axis) or make them a single two-row chart.
6. **"Open estimate →" on every plan row.** The whole row is already the link, so the arrow text is repeated chrome.
7. **"Marine gas oil categories in beige."** A caption explaining an encoding. Either the bold name is enough, or label
   the group.

## Not changed on purpose

- **Beige ink on near-black and Segoe UI.** These are the accepted brand tokens (`tokens.css`). The mock used Geist,
  which the brief keeps to the auth pages.
- **Monospace run id.** App rules allow monospace for IDs.
- **The tooltip shadow.** It is on a floating element.
