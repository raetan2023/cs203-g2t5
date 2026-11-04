# Manager team oversight and approvals

Team scope is the manager's active Clerk organisation. There is no separate
subteam or reporting-line model. Managers can see all plans belonging to that
organisation, across buyers; other organisations and legacy unassigned plans are
excluded. Query parameters cannot change the verified organisation.

The Purchase plans page includes the existing approval inbox, plan listing and a
new Team oversight section. `GET /api/v1/purchase-plans/manager-overview` requires a
manager session, returns `Cache-Control: no-store`, and provides:

- `plan_count` and `total_quantity_mt`: every plan currently in the organisation,
  including finished plans. Revision drafts are separate plans, so this historical
  total is not a total of unique purchases.
- `pending_approval_count`: submitted plans awaiting a decision.
- `open_quantity_mt`: drafts, submitted plans and approved plans awaiting purchase.
  Rejected, withdrawn and purchased plans are excluded.
- `reference_price_usd_per_mt`, `reference_date` and `exposure_usd`: open MT multiplied
  by the most recent positive observed Singapore MGO USD/MT price on or before
  the application's planning date. This is indicative gross procurement exposure,
  not forecast risk, committed spend or a supplier quote. The source date is shown
  even when old. If no compatible price exists, these three fields are null while
  volume totals remain available. An empty team has zero volumes and counts.

The endpoint reads plans and the price in one repeatable-read transaction. Exposure
does not call GDELT or the forecasting model. Refresh team overview reloads these
totals; the existing Refresh inbox control independently reloads notifications.

Managers follow a submitted plan's recommendation link to review the frozen
submission and approve or reject it. Existing decision behaviour is reused:
approval comments are optional, rejection comments are required, and both are
limited to 2,000 characters. Status, the immutable manager decision audit record
and buyer notification commit together. The record retains the verified actor,
comment, outcome and timestamp. Concurrent decisions permit only one final
decision. The saved submission and decision remain readable after purchase.

No new tables, migrations or shared database writes are required for this addition.

Automated checks cover organisation isolation, decimal volume calculations,
finished statuses, incompatible/future prices, missing prices, empty teams,
manager-only HTTP access, response validation and stale responses on team switches.
The existing approval service and HTTP tests cover comments, audit rollback,
status changes and concurrent decisions. A live journey still requires separate
buyer and manager memberships in Clerk.
