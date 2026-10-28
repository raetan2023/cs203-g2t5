# Market overview: current logic vs the redesign mock vs this proposal

- **Current**: production `/market-dashboard`, which is `MarketDashboard.jsx` → `StoredMarketPanel.jsx` + `ForecastWidget`
  (and `ForecastCard`, `ForecastChart`, `DriversPanel`), inside `AppShell`. It reads `useDatabaseMarket` and `ForecastProvider`.
- **Mock**: `docs/ui-revamp/assets/inspo/mkt-dashboard-page/Market overview (redesign)-html/Market.dc.html`
  (Claude Design export, hard-coded sample data, untracked in the main checkout).
- **Proposal**: `market-proposal.html` + `market-data.js` in this folder. It uses the mock's layout and keeps every
  behaviour of the current screen. `?state=` previews each state (list in README).

Legend: ✅ kept · ⚠️ kept but changed · ❌ missing · ➕ new.

## Data and refresh

| Current behaviour | Mock | Proposal |
|---|---|---|
| Reads `GET /api/v1/market/stored` with `X-API-Key`; 15 s timeout; one request in flight; aborts on unmount | n/a (static) | ✅ unchanged (the hook stays as is) |
| Response validated (`storage`, arrays, finite values, ISO dates); invalid → error | n/a | ✅ unchanged |
| Re-reads every 60 s | ✅ "refreshes every minute" | ✅ "re-reads every minute" |
| Refresh button: disabled while checking, `aria-busy`, spinner, "Checking…" | ⚠️ icon only, no busy state | ✅ text button "Refresh"; busy, spinner and "Checking…" |
| "Last checked HH:MM" (check time, not observation time) | ✅ | ✅ |
| "N available series" count | ❌ | ⚠️ moved into the missing-series notice ("23 series are stored") |
| Loading message | ❌ | ✅ skeleton at the final layout + status text |
| Read error, with "Showing previously loaded records" when data is kept | ❌ | ✅ notice with the time of the kept read + Retry |
| Missing series disclosure ("Not yet stored: … No example prices are substituted.") | ❌ | ✅ |
| Empty storage ("No imported market observations…") | ❌ | ✅ |
| Footer: not a real-time feed; refresh doesn't import | ✅ | ✅ |

## Prices

| Current behaviour | Mock | Proposal |
|---|---|---|
| Fixed order MGO, gasoil, Brent, Dubai, USD | ✅ | ✅ (unknown series go **last**; current code sorts them first, see bugs) |
| `$` only when currency is USD; 4 decimals for index/tone, else 2; min 2 decimals for USD or source-defined | ⚠️ "USD " prefix | ✅ same rules |
| `source-defined` unit → "Unit pending verification" + "Physical unit and contract definition are not verified. No price conversion is applied." | ⚠️ "unit unverified", note dropped | ✅ "unit unverified" in the cell; note under the strip and in the chart header |
| Missing unit → "Unit unspecified" | ❌ | ✅ |
| Change vs previous stored observation: % if available, else absolute; arrow; "No previous observation" | ⚠️ % only, no null state | ✅ all three cases |
| Observation date + source per card | ⚠️ date only; source only for the selected series | ⚠️ date in the cell, source in its tooltip and in the chart header |
| Up = green, down = red (today's CSS) | ⚠️ green = lowers cost, orange = raises cost, grey for USD index | ⚠️ same as mock (**decision 1**) |
| — | ➕ clock on prices older than 7 days | ➕ kept, with the age in words in the chart header |
| — | ➕ sparkline per price | ❌ dropped (taste: no sparklines on KPIs; the chart shows the trend) |

## History chart

| Current behaviour | Mock | Proposal |
|---|---|---|
| Series picker: price series with ≥ 2 distinct valid dates | ⚠️ price cells are the picker (all assumed chartable) | ✅ cells are the picker; cells without history are not buttons |
| Default series **Brent** | ⚠️ default MGO + "Back to MGO" | ⚠️ default MGO + "Back to MGO" |
| 15 / 30 / 60 calendar days ending at the latest observation; missing days stay missing | ✅ | ✅ |
| Current price + change + "N days ending DATE" | ⚠️ price + change over range | ⚠️ change over range ("+9.2% over the 60 days to 26 Oct · 1,238 → 1,352"); price lives in the strip |
| Dots when < 3 points | ❌ | ✅ |
| Tooltip: date, value, unit | ✅ + change vs previous + keyboard | ✅ same as mock (arrow keys, Escape) |
| Footer: "N observations · first – last" | ❌ | ✅ |
| "View recent values": last 7 as a table | ❌ | ✅ "Recent values" |
| Legend "Actual stored observations" | ❌ | ✅ legend for stored, forecast and range (two series need one) |

## Forecast (ForecastProvider + ForecastWidget)

| Current behaviour | Mock | Proposal |
|---|---|---|
| One horizon 7/14/30 from `/api/v1/forecast`; cached per horizon; re-read every 60 s when visible and on tab return; new run invalidates. **Not shared with the purchase estimate:** `App.tsx` wraps that page in its own `ForecastProvider` (`/api/v1/purchase-plans/forecast`), so its horizon is separate | ⚠️ shows all three at once, no picker | ✅ picker kept, state unchanged |
| States: loading, error + Retry, unavailable + last successful run, not connected | ⚠️ unavailable only | ✅ all four |
| "Experimental forecast" / "Synthetic preview" label | ⚠️ experimental note only | ✅ coverage note; synthetic note in details |
| Evidence badge (supported/weak/no edge) | ❌ | ✅ when present (see bugs: never present in production) |
| Last quote + date → target date + horizon; central; delta abs and %; ±1 flat band; range low–high | ⚠️ range + central per horizon | ✅ all, plus a range bar with the quote marked |
| Interval: target coverage, observed coverage, baseline coverage, mean width vs baseline, evaluation scope, limitations | ⚠️ "Not yet measured" only | ✅ in "How sure the range is" |
| Skill line (no edge / % better than persistence / synthetic) | ❌ | ✅ in details |
| Provenance: origin, published, GDELT window, source dates, run id, model version | ⚠️ model, origin, run time | ✅ all, in "Where it comes from" |
| Chart: history + band from the quote to the target + "As of" marker | ⚠️ separate marks below the chart | ✅ one chart: solid history, dashed forecast, range, quote line (brief §3.5) |
| Drivers: sorted by size, min 6% width, up/down, zero-weight note, hidden when absent | ✅ diverging bars | ✅ diverging bars, all rules kept |
| Refresh forecast | ❌ | ✅ "Refresh" in the card footer |

## Sales and news

| Current behaviour | Mock | Proposal |
|---|---|---|
| Sales sorted by value then name; `fuelName` normalisation | ✅ | ✅ |
| Search (case-insensitive), all matches while searching | ✅ | ✅ |
| 6 rows, "View all N" / "Show fewer" | ⚠️ "View all" only | ✅ both |
| "No fuel categories match" | ❌ | ✅ |
| Bar relative to the largest value (zero-safe); zero kept | ✅ | ✅ |
| Month per row; footnote "dates identify the represented month" | ⚠️ month in the title | ⚠️ month in the title when all rows share it, per row otherwise; footnote kept |
| Unit per row; "categories are not summed" | ⚠️ unit in subtitle | ⚠️ same; per row when units differ |
| — | ➕ "Your fuel" tag | ⚠️ MGO categories in beige (no per-user fuel exists) |
| GDELT article count and average tone with unit and date | ✅ | ✅ (tone shown at 2 decimals; full value in its tooltip) |
| Caveat: context, not a price signal; counts may be partial; source | ✅ | ✅ |
| — | ➕ 14-day bars and tone line; summary sentence | ➕ kept, built from the GDELT history the endpoint already returns; summary names its baseline ("above its 13-day median") |

## Shell and new blocks

| Current behaviour | Mock | Proposal |
|---|---|---|
| Menu, brand, "MARKET OVERVIEW" chip (repeats the h1) | ⚠️ date + organisation switcher + role | ⚠️ same as mock (`organisationControl` already exists in `AppShell`) |
| — | ➕ "Your plans": quantity, deadline, days left, action, Create plan | ➕ kept, **gated by `can_read_plans` / `can_write_plans`**, overdue state added (**decision 2**) |

## Bugs and dead logic found in the current code

1. `ForecastCard`: an experimental forecast has `interval.nominal_coverage = null`, so it prints **"Target coverage: 0% prediction interval."** (`Math.round(null * 100)`).
2. `parseForecast` doesn't pass `evidence`, `mae_skill_vs_persistence` or `synthetic` through, so in production the evidence badge and the skill line never render. They only show with mock data.
3. `StoredMarketPanel` sorts prices by `order.indexOf`, so a series that isn't in the list (index −1) is placed **first**, ahead of MGO.
4. Unused files still in the folder: `TickerCards.jsx`, `MGOChart.jsx`, `IndicatorsTable.jsx`, `useMarketDashboard.js` (hard-coded fallback prices 614.5 / 78.45), `BrentMarketPanel.jsx` + `brent-market.css`, `dashboard.css`.

## Decisions

**Update 2026-10-28:** decision 1 is made (buyer meaning; the dearer colour is now red `#f2849e`, not orange). Decisions 2 and 3 are handed over in [`docs/handover/market-dashboard.md`](../../handover/market-dashboard.md).

1. **Colour meaning.** CREATIVE_BRIEF §3.5 says green = up, red = down. The mock and this proposal use buyer meaning instead: green lowers cost, orange raises it, and the USD index stays grey. Taste supports buyer meaning, but fails the beige + orange pairing as an "assistant palette". Either way the pressure hue needs to change.
2. **Plans on the market page.** This is a cross-feature block. It needs the plan list plus one recommendation read per plan, or it shows only deadlines and links.
3. **Forecast horizons.** One picker (proposal, the current behaviour) vs all three at once (mock, three reads). Either
   way, this is the market forecast; a plan's estimate uses the purchase-plan forecast and its own horizon choice.
4. **Sparklines** from the mock are dropped. Taste bans them on KPIs; the brief lists them only as a brainstorm idea.
