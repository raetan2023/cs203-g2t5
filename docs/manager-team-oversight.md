# Manager team oversight and approvals

Team scope is the officers currently assigned to the manager in their active Clerk
organisation; see [PM and PO assignment](pm-po-assignment.md). Other teams,
other organisations and legacy unassigned plans are excluded. Query parameters
cannot change the verified organisation.

The Purchase plans page includes the existing approval inbox, plan listing and a
new Team oversight section. `GET /api/v1/purchase-plans/manager-overview` requires a
manager or admin session, returns `Cache-Control: no-store`, and provides the figures
below. For a manager they cover their current officers; for an admin (shown as
Organisation oversight under the admin's Plans section) they cover every plan in the
organisation, and each entry in `officers` also carries the officer's current PM.

Only approved plans count. `period=30d` limits every figure to plans approved in
the last 30 days including today (Singapore time); `period=all`, the default, has no
time limit. Repeating `officer=<user id>` limits the figures to those officers; the
response always lists the manager's full team in `officers` for the dropdown.

- `total_quantity_mt`, shown as Total planned volume: plans a manager approved,
  including those since purchased. Pending, rejected and withdrawn plans are left out.
- `purchased_quantity_mt`, shown as Purchased volume: the planned amount of every
  purchased plan. A purchase is always the whole plan, so there is no "bought less
  than planned" figure.
- `open_quantity_mt`, shown as Remaining to buy: approved plans not yet purchased.
  Pending requests are not counted until a manager approves them.
- `exposure_usd`, shown as Estimated remaining cost: Remaining to buy multiplied by the
  reference price below. A line under the figures shows this formula and the price used.
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

## Team list for filters

`GET /api/v1/purchase-plans/team` (managers and admins) lists everyone the officer
filters offer, even before they have any plans: a manager's current officers, or for
an admin every current officer with their PM. The Approval inbox, Plans and oversight
dropdowns use it, so an officer with nothing yet still appears with a count of 0.

## Plans section

Managers and admins see decided plans (approved, purchased, rejected, and closed when
there are any) as cards, 6 per page. Each plan is one of To buy, Overdue (approved,
past its deadline, not bought), Purchased, Rejected or Closed; the filter buttons show
how many of each. Admins also filter by PM and officer in one People dropdown and
see each officer's PM on the card. Drafts, pending and withdrawn requests are not
listed here.

## Approval inbox

The inbox lists pending and withdrawn requests from the manager's officers, newest
first, 6 per page (two rows of three). Approved, rejected and purchased requests are left out because
they need no action. The type buttons show how many requests are pending, overdue
and withdrawn, and the list can be narrowed to any number of officers and to one
request type; the counts follow the officer choice.

A pending request whose purchase deadline has passed is shown as overdue, with its
own count and filter. A manager can still approve it after confirming. If it is still
pending 5 days after the deadline, an hourly backend job rejects it automatically with
the reason "Rejected automatically: no decision within 5 days after the purchase deadline."
The decision is stored under the officer's current manager and shown as
"Bunker Buddy (automatic)"; the officer is notified. Requests whose officer has no
manager are left until one is assigned. Set `mgo.overdue-rejection.enabled=false` to
turn the job off.

A withdrawn plan disappears from officer and manager views (the inbox and plan
lists) five days after it was withdrawn. Admins still see every plan, and nothing is
deleted.
