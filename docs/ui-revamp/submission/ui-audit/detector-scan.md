# Detector scan

Detector: `impeccable detect --json` (plugin 4.7.1). Run 2026-11-05. Report only; no source file was edited.

## Totals

13 findings in all: 2 from the source scan, 11 from the rendered snapshots. All are severity `warning`. 4 are verified real, 2 are real detections of a deliberate choice (taste call), 7 are false positives.

| Rule | Source | Rendered | Total | Real | Deliberate choice | False positive |
|---|---|---|---|---|---|---|
| `overused-font` | 2 | 2 | 4 | 0 | 2 distinct (4 hits) | 0 |
| `low-contrast` | 0 | 3 | 3 | 2 | 0 | 1 |
| `tiny-text` | 0 | 2 | 2 | 2 | 0 | 0 |
| `cramped-padding` | 0 | 4 | 4 | 0 | 0 | 4 |

No finding objected to the approved palette (warm beige on near-black). The two real contrast hits are on the forecast widget's own hard-coded navy and slate colours, which are outside the token set.

### Per target

| Target | Exit | Findings |
|---|---|---|
| `frontend/src` (whole tree, prototypes included) | 2 | 2 |
| `frontend/src/app` | 0 | 0 |
| `frontend/src/components` | 0 | 0 |
| `frontend/src/features` | 2 | 2 (the same two) |
| `home.html` | 0 | 0 |
| `home-manager.html` | 0 | 0 |
| `multiple.html` | 0 | 0 |
| `empty.html` | 0 | 0 |
| `saved.html` | 0 | 0 |
| `plans-decisions.html` | 0 | 0 |
| `plans-manager.html` | 0 | 0 |
| `decision-history.html` | 0 | 0 |
| `manager-decisions.html` | 0 | 0 |
| `forecast-widget.html` | 2 | 5 |
| `login.html` | 2 | 2 |
| `signup.html` | 2 | 2 |
| `rec-wait.html` | 2 | 1 |
| `rec-review.html` | 0 | 0 |
| `rec-loading.html` | 2 | 1 |
| `rec-purchased.html` | 0 | 0 |

All 16 requested snapshots existed; none was missing.

## Verified findings

Rendered findings carry `line: 0` (the detector reports the computed style, not a source line), so the file:line below is the source rule I traced each one to.

| # | Rule | Severity | Seen in | Source file:line | Offending snippet | Verdict | Reason |
|---|---|---|---|---|---|---|---|
| 1 | `low-contrast` | warning | `forecast-widget.html` | `frontend/src/features/forecast/forecast.css:158-160` (`.forecast-skill`) | `3.6:1 (need 4.5:1) — text #5f7083 on #0c1524`; `font-size: 11px; color: #5f7083;` | Real | 11px text at 3.6:1 fails WCAG AA. Both colours are hard-coded in the widget, not `--bb-*` tokens, so this is not a palette objection. |
| 2 | `low-contrast` | warning | `forecast-widget.html` | `frontend/src/features/forecast/forecast.css:223-225` (`.forecast-drivers-note`) | `3.6:1 (need 4.5:1) — text #5f7083 on #0c1524`; `font-size: 11px; color: #5f7083;` | Real | Same colour pair as #1 on the card background set at `forecast.css:5`. |
| 3 | `low-contrast` | warning | `forecast-widget.html` | none in project source; Recharts' `#recharts_measurement_span` in the snapshot | `1.1:1 (need 4.5:1) — text #000000 on #0c0d0e` | False positive | Library text-measuring span, `aria-hidden`, positioned at `top: -20000px`, appended to `body` (which sets no text colour, so it computes to black). Never visible. Attribution is inferred: it is the only element in the snapshot outside `.bb-app` that can compute to black on the canvas. |
| 4 | `tiny-text` | warning | `forecast-widget.html` | `frontend/src/features/forecast/forecast.css:159` (`.forecast-skill`) | `11px body text`; `font-size: 11px;` | Real | Sentence text below the 12px floor stated in `frontend/DESIGN.md` line 9 ("12px is the floor; no stylesheet sets a size outside the scale"). |
| 5 | `tiny-text` | warning | `forecast-widget.html` | `frontend/src/features/forecast/forecast.css:224` (`.forecast-drivers-note`) | `11px body text`; `font-size: 11px;` | Real | Same as #4. The detector does not name the element; the two hits are attributed to the two 11px sentence-text rules. `forecast.css:43` (`.forecast-badge`) and `:117` (`.forecast-summary-label`) are also 11px and break the same floor, though as short labels they may not be what the rule counted. |
| 6 | `cramped-padding` | warning | `login.html`, `signup.html` (2 hits) | `frontend/src/features/auth/auth.css:13-14` (`.auth-hero`), markup `frontend/src/features/auth/AuthLayout.tsx:60` | `<div> "auth-hero": children flush against border+bg on all sides (no inset)` | False positive | The hero is a full-bleed video panel. Its text children are absolutely positioned with their own inset (`.auth-header` at `left: 32px; top: 28px`, `auth.css:32`); the detector does not account for absolute positioning. |
| 7 | `cramped-padding` | warning | `rec-loading.html` | `frontend/src/features/recommendations/recommendations.css:256` (`.rec-loading-chart`), markup `frontend/src/features/recommendations/RecommendationLoading.tsx:57` | `<div> "rec-loading-chart": children flush against bg on all sides (no inset)` | False positive | This is a chart plot area, `aria-hidden`, whose labels are absolutely positioned inside it (`right: 6%`, `bottom: 12px`, `recommendations.css:260-266`). The tightest one is `.rec-lc-deadline-label` at `top: 4px` (line 262), which is worth a visual glance but is not a padded text container. |
| 8 | `cramped-padding` | warning | `rec-wait.html` | `frontend/src/features/recommendations/recommendations.css:92-93` (`.rec-toggle`), markup `frontend/src/features/recommendations/TimingComparison.tsx:105` | `<div> "rec-toggle": children flush against border on top/bottom (no inset)` | False positive | Segmented control: the bordered wrapper holds two buttons that fill it on purpose. Each button has `min-height: 36px; padding: 0 14px`, so the label text sits about 10px from the border. |
| 9 | `overused-font` | warning | source scan; also `login.html`, `signup.html` as `Primary font: geist` (3 hits) | `frontend/src/features/auth/auth.css:7` | `font-family: 'Geist` | Real detection, deliberate choice | Geist really is the face on the auth pages. The comment at `auth.css:2` says it is used on these pages only, following the sign-in inspiration; the rest of the app uses `--bb-font` (Segoe UI stack, `tokens.css:66`). Not a defect, but `frontend/DESIGN.md` does not record the exception, and the app runs two type families. |
| 10 | `overused-font` | warning | source scan | `frontend/src/features/auth/auth.css:3` | `Google Fonts: geist` (`@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap')`) | Real detection, deliberate choice | Same decision as #9. Side note outside the rule: the font is fetched by a render-blocking CSS `@import` from a third-party host. `frontend/src/styles/theme.ts:74` sets the same family for the Clerk form and was not flagged. |

## Rules that fired on rendered snapshots but not on source

- `low-contrast`
- `tiny-text`
- `cramped-padding`

All three need computed styles and layout, so the static source scan cannot see them. `overused-font` fired on both.

## What the detector could not run on, or did not cover

- No run errored; every invocation exited 0 or 2 with valid JSON and empty stderr.
- The detector has no exclude option, so `frontend/src/prototypes` could not be skipped in the whole-tree scan. It made no difference: the whole-tree result is identical to the `frontend/src/features` result, and nothing was reported from `prototypes`, `preview` or `styles`. `detect-source.json` holds the whole-tree output; `detect-source-app.json`, `detect-source-components.json` and `detect-source-features.json` hold the per-folder outputs.
- The source scan reported nothing for `frontend/src/features/forecast` (`ForecastWidget.jsx` plus `forecast.css`), although the rendered scan found four real issues there. The static pass does not resolve contrast or text size from plain CSS, so a clean source scan is not evidence that those rules pass.
- Snapshots are static HTML at one viewport and one state. Hover, focus, the open navigation drawer and the 390px layout were not scanned. These snapshots exist but were not on the requested list and were not scanned: `home-admin`, `home-analyst`, `home-price-error`, `load-error`, `navigation`, `rec-admin`, `rec-analyst`, `rec-analyst-awaiting`, `rec-approved`, `rec-awaiting`, `rec-buy`, `rec-empty`, `rec-error`, `rec-monitor`, `rec-ready`, `rec-rejected`, `rec-unavailable`, `rec-withdrawn`.
- Rendered findings have no source line and do not name the element for `low-contrast` and `tiny-text`; the mapping to source in rows 1 to 5 is by matching the reported colours and size against the stylesheet.

The live browser overlay step was skipped because this is a headless background run with no human-visible tab.

## Raw output

`ui-audit/detect-source.json` and `ui-audit/detect-<name>.json` for each of the 16 snapshots.
