# Manager approve/reject panel — direction B

Reference: the teammate's A–D screenshot supplied by Nelson, preserved as
`ui-revamp/assets/inspo/manager-approve/approve-reject-panel-directions.jpg`.
Direction B (decision first) is implemented from that JPEG; an original HTML
export was not supplied. It reuses the existing frozen submission and approval
endpoints. The manager listing is unchanged.

On a submitted recommendation, **Approve recommendation** or **Reject recommendation**
opens a modal side panel. The panel shows the saved recommendation first,
reference cost and forecast impact range, then buyer, deadline, saved reference
price and comment. Its footer stays visible while long contents scroll.
It fills a narrow screen and is 420px wide on desktop. The close button, Escape,
keyboard focus trap, inert background and focus restoration use a native dialog.
The actual dialog is portalled outside page-specific styles.

The footer **Approve** or **Reject** is the final confirmation. Rejecting requires
a nonblank reason; approval comments are optional, both capped at 2,000 characters.
The panel displays validation, saving, saved decision, already-decided/conflict
and save-failure states. While saving, duplicate actions and closing are blocked.
Failures retain the comment. A conflict locks decisions and can show the other
manager's saved actor/time/comment. After a successful write, **Back to plan**
or closing reloads the saved audit details on the underlying page.

The range labels are derived from the saved experimental cost-impact bounds,
not from a new forecast. They describe possible differences rather than realised
savings. Missing values stay unavailable. No live-versus-submission change banner
is invented. The existing transactional approval, notification, fingerprint,
ownership and organisation rules remain in force.

`GET /api/v1/purchase-plans/{id}/submission` additionally returns optional
`buyer_label`, after the existing plan access check. It reads the owner's email
or Clerk subject through an organisation-scoped join with the existing users
table. No new table or database migration is required.

## Preview and checks

Start Vite, then open `/manager-review-preview.html`. This separate development
entry uses synthetic data and makes no API requests or notifications. Close the
panel to choose normal, slow submission, another manager's decision or save error.
Press Reject with an empty comment to see validation. The existing `/preview.html`
manager review scenario also uses the real panel.

- `npm test -- --maxWorkers=2` (on Node 25+, use
  `NODE_OPTIONS=--no-experimental-webstorage` for jsdom).
- `npm run build`.
- `node scripts/test-manager-decision-layout.mjs` — all panel states, keyboard,
  320/390/768/1440px and screenshots under `/tmp/manager-decision-b/`.
- `node scripts/test-plan-lifecycle.mjs` — existing lifecycle and manager journey.
- `cd backend && ./mvnw test` — includes authorised buyer-label reads and
  cross-organisation exclusions, with isolated databases.

Screenshots and mock services are synthetic; they do not establish a live decision
on a team plan. A live approve/reject check still needs submitted test requests.
