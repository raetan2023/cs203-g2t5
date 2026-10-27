# Market overview proposal

A standalone HTML proposal for `/market-dashboard`. It uses the layout of the Claude Design mock and keeps all of the
current screen's behaviour.

- `market-proposal.html`: the page. Open it directly, or serve the folder.
- `market-data.js`: sample data in the exact API shapes (stored market, forecast per horizon, plans).
- `snapshot.mjs`: with the backend running, `node docs/ui-revamp/market-proposal/snapshot.mjs` writes
  `market-snapshot.js` (git-ignored) from `/api/v1/market/stored`, and the page then shows the real stored data:
  all 16 sales categories and the real histories.
- `PARITY.md`: current logic vs the mock vs this proposal, the bugs found, and the decisions for the owner.
- `TASTE_REVIEW.md` + `taste-review/`: round-1 taste review and its screenshots.

## Preview states

Append `?state=` with one of: `loading`, `read-error`, `read-error-empty`, `missing`, `empty`, `forecast-loading`,
`forecast-error`, `forecast-unavailable`, `forecast-disconnected`, `no-plans`, `no-plan-access`, `search-empty`.

## Sample content to replace

- Histories, forecast values, drivers, plans and the organisation name ("Straits Marine") are sample data.
- The latest prices, dates, sources, units and the six sales values are from the 28 Oct stored read.
