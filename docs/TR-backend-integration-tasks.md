# Rae (TR): database and frontend checklist (excluding market dashboard, recommendation and password reset)

Updated: 26 September 2026. Personal checklist; leave this file untracked. The filename is retained for existing links. Rae now owns the remaining frontend screens except market dashboard, Recommendation and password-reset screens, in addition to purchase plans and database responsibilities.

You and Wunna have swapped roles. You own database setup, migrations, constraints, the database handoff, purchase-plan frontend implementation, and now the remaining frontend screens/shared shell except market dashboard, Recommendation and password-reset screens. Wunna owns the shared Spring Boot backend, API security, request helper, and overall integration; he owns purchase-plan APIs and shared scenario-date configuration. Anjali still owns market context frontend/backend. Rae's latest instruction transfers the remaining frontend coding previously assigned to Luck to Rae; Luck remains the design reference/reviewer unless otherwise agreed. Nelson has implemented Clerk for authentication/session logic (confirmed by Rae); Supabase is used for the PostgreSQL database only. Clerk-to-database integration remains to be agreed and verified.

See [team overview](team-overview.md) and [backend conventions](backend-conventions.md). Localhost and mock application data remain the current scope. Integrating the smaller four-table database is required this sprint. Frontend/backend contributors may inject their own mock data while you prepare it; real historical sourcing remains deferred.

Checked items below indicate the specific input, decision, or scoped test described; local test completion does not establish live Supabase or end-to-end readiness.

## Next frontend work: remaining screens and shared app

**Latest instruction takes precedence:** Rae is tasked with coding the rest of the frontend except market dashboard, Recommendation and password-reset screens. This section supersedes older statements below assigning shared layout, routing, or authentication-screen implementation to Luck. Existing purchase-plan checkboxes are historical work guidance, not a request to rebuild completed code. The mock implementation checkpoint below now records completed code; remaining integration and visual checks stay explicit.

**Follow the established procedure:** inspect actual PNGs and current code, clarify material ambiguities before implementing affected behavior, build visible React screens with fixtures first, keep localhost preview available for Rae to test during development, then wire interactions, verify, and document handoffs. Do not use Superpowers unless the task is very heavy and Rae has agreed first. Do not deploy or push as part of this checklist without a separate instruction.

**Implementation checkpoint (26 September):** Shared app routes/header/sidebar, sign-in/signup, Home, existing purchase-plan integration and development examples are implemented. Rae approved unavailable social buttons and omission of policy/agreement links for the mock milestone. `npm test`: 18/18 passed; `npm run build`: passed. Preview: http://127.0.0.1:5173/ (run `npm run dev` in `frontend/`). Use a sample email and any nonempty demo password, or select a signed-in example in Demo controls. See [frontend handoff and resume instructions](../frontend/README.md). Browser visual checks, real Clerk/provider configuration, custom signup verification if required, policy destinations, and authenticated backend integration remain pending. No excluded screen was implemented. Production entry does not enable mock auth.

### 0. Start from the existing frontend and preserve working behavior

- [x] Read `frontend/README.md`, `frontend/package.json`, `src/preview/PreviewApp.tsx`, and `src/features/purchase-plan/` before editing. Use the existing React 19 + TypeScript + Vite app and scoped plain CSS; do not scaffold another frontend.
- [x] Check for newly added shared frontend or Nelson's Clerk code before creating replacements. Preserve unrelated local changes and leave this personal checklist untracked.
- [x] Preserve `PurchasePlanPage` and its service interface. Its mock CRUD, cancel/error/retry flows, and 22-day example already exist; retain the 10-test baseline and production build check.
- [x] Preserve Rae's later UI correction: **no circle/plus illustration in the purchase-plan empty panel**. Only the top-right Create plan control initiates creation.
- [x] Continue using `npm run dev` from `frontend/` (or `npm.cmd run dev` in PowerShell); share the actual local URL as soon as it is running. Saved code should update through Vite so Rae can test periodically.
- [x] Extend the development-only Demo controls with screen/state selection and slow/fail-once examples. Keep controls outside production pages and make reset behavior explicit.

### 1. Screen inventory and decisions to settle

The PNGs below were visually inspected when this checklist was extended. The coding agent must inspect them again before reproducing their layout.

| Screen / component | Reference | Intended frontend work |
| --- | --- | --- |
| Shared header and sidebar | `ui-mockups/Shared Navigation.png`, Home/purchase-plan headers | Working menu, drawer/sidebar, active links, sign out |
| Sign in | `ui-mockups/login-screen.png` | Split hero/form layout, credentials, password visibility, auth links and states |
| Create account | `ui-mockups/signup-screen.png` | Full name, email, password, agreement, submit and states |
| Forgot password | `ui-mockups/forgot-password.png` | **Excluded by Rae. Do not implement this screen or a reset flow** |
| Alternate reset design | `ui-mockups/forgot signup bro idk.png` | Same excluded password-reset feature; do not implement it as a substitute |
| Home | `ui-mockups/home-welcome.png`, `ui-mockups/home-loading.png` | Personalized welcome, loading state, purchase-plan link |
| Purchase plans | Existing feature and `purchase-plans-*` references | Mount existing implementation into shared shell; regression checks |
| Recommendation | `ui-mockups/recommendation.png` | **Excluded by Rae. Do not build this screen**; retain a disabled Coming soon sidebar entry |
| Market dashboard | Owned by Anjali | Navigation/mounting boundary only; **do not implement or redesign this screen** |

- [x] Password-reset screens, routes, adapters and tests are excluded. Omit the Forgot password link for this milestone unless an existing working provider destination is supplied; do not create a dead link or implement another reset variant.
- [x] Keep Recommendation disabled and labelled Coming soon as shown in the sidebar mockup. Rae explicitly excluded its screen: do not add a route, preview screen, fixtures, decision controls or recommendation service.
- [ ] Obtain Nelson's existing auth interface/code when available. Confirm configured social providers, signup verification steps, password requirements, session persistence and sign-out behavior before claiming real authentication works. These do not block drawing and testing mock screens.
- [ ] Obtain real Terms/Privacy destinations if agreement links must be functional. Do not invent policies or use `#` links that appear working; record missing destinations for review.
- [x] Keep ownership documents' older Luck assignments and PRD's stale Supabase Auth references from overriding the latest instruction: Rae codes these screens; Clerk handles authentication; Supabase supplies the database.

### 2. Establish shared layout, components, and routes

- [x] Introduce a small app layer, for example `src/app/` (routes/session boundary), `src/components/` (shared shell and reusable controls), and `src/features/auth/`, `home/`. Keep `features/purchase-plan/` intact. Names are guidance, not mandatory scaffolding.
- [x] Replace the preview-only header with a reusable `AppHeader` and working `Sidebar`/drawer. Use the anchor mark, Bunker Buddy name, navy surfaces, teal accents, and scenario-date badge where shown. Menu and close controls need labels and actual behavior.
- [x] Match the sidebar's Home, Purchase plans, Market dashboard, Recommendation/Coming soon, and bottom-aligned Sign out. Derive active styling from the route and add `aria-current="page"`.
- [x] Support desktop and narrow layouts: drawer closes after navigation; Escape closes it; manage focus, return it to the trigger, and prevent background interaction when it is modal. Do not cover content permanently or produce horizontal overflow.
- [x] Define public routes for sign in, signup and any required signup-verification step, and signed-in routes for Home/purchase plans. Suggested paths: `/login`, `/signup`, `/home`, `/purchase-plans`; settle the dashboard path with Anjali. Recommendation and password reset have no active routes in this scope.
- [x] Use one small routing solution and document it. Support internal links, direct URL loads, refresh and browser Back/Forward; include a useful unknown-route fallback. Keep auth layouts outside the signed-in shell.
- [x] Render session-loading UI while checking session state, not a brief login/private-page flash. Signed-out private routes return to sign in; signed-in users reach Home or a valid internal return destination. A mock route guard is not backend authorization.
- [x] Centralize only genuinely shared buttons, fields, logo/icons, spinner and design tokens. Auth uses light cards/inputs while product pages are dark; avoid global button/input rules that change purchase plans or Anjali's page accidentally.
- [x] Keep the plan service instance stable above route changes so navigating Home → Purchase plans does not reset the mock plan. Dispose/reset user-specific state on logout/account switch. Do not persist mock passwords or tokens.
- [x] Reserve Anjali's dashboard integration point and document the props/export expected. If her page is absent, use an explicitly labelled temporary unavailable placeholder or disabled entry; do not build dashboard charts/data as part of this task.

### 3. Build the authentication layout and sign-in screen

Reference: `login-screen.png`.

- [x] Build the desktop split: approximately 55% dark hero panel on the left and 45% pale background/form area on the right. Include brand, large white heading, supporting copy, illustrative line graphic and small badges; a white rounded card contains the form.
- [x] On mobile, prioritize the form and collapse/shorten the decorative hero. Keep labels and actions visible without horizontal scrolling. Use a local SVG/CSS illustration, not a new charting dependency or market API.
- [x] Label any decorative price chart **Illustrative / mock data**. Review the mockup's forecasting, impact and security claims against actual capabilities; use neutral copy where features are deferred and document the intentional differences.
- [x] Build Microsoft/Google buttons with recognizable accessible labels, an “or” divider, email, password with show/hide control, Remember me, Sign in, and Create an account link.
- [x] Use email/password autocomplete and real labels. A password visibility button must not submit the form; preserve values when toggled. Support Enter submission and visible keyboard focus.
- [x] Validate required fields and email format, then show pending, invalid-credential, network/general failure and successful sign-in states. Disable repeat submission, preserve email on failure, and never log credentials.
- [x] During the mock milestone, identify the simulated auth mode in preview controls and use a documented demo identity; submitting arbitrary credentials must not be presented as real authentication. Social buttons must not imply an actual OAuth success unless Nelson's configured provider flow is used.
- [x] Treat Remember me as a provider/session integration decision. Do not implement it by storing a password/token in browser storage; document when persistence is only simulated or unsupported.
- [x] Make the signup link navigate to its screen and successful mock sign-in navigate to Home.

### 4. Build signup and required verification states

Reference: `signup-screen.png`; reuse the authentication shell.

- [x] Show Create account, short supporting copy, Full name, Email address, Password with visibility control/helper, agreement checkbox and links, Create account, and Sign in link. No separate profile screen or unrequested extra fields.
- [x] Validate required name/email/password and agreement if retained. Align password rules with Nelson/Clerk; the pictured “8+ characters with a mix of letters and numbers” is mockup copy, not evidence of configured provider policy.
- [x] Handle idle, submitting, inline validation, duplicate-account/provider error and general failure states without duplicate requests. Preserve non-sensitive inputs and announce errors.
- [x] Model the signup result as either completed session or verification required. Do not assume creating an account always signs the user in immediately.
- [ ] If Clerk requires email-code/link verification, add only the necessary verification UI: pending, invalid/expired code, resend feedback and completion. There is no supplied PNG; reuse auth-card styling and confirm the actual flow with Nelson.
- [x] Use the supplied display name on Home after mock signup. Real display names come from the agreed Clerk/session interface, not a new application profile table.

### 5. Build Home and mount the existing purchase-plan feature

References: `home-welcome.png`, `home-loading.png`.

- [x] Match the sparse navy layout: large left-aligned Welcome back, {name}, muted “Manage your purchase plan and explore market conditions.”, and teal Go to purchase plans action, beneath the shared header.
- [x] Take the name from the session/demo identity rather than hardcoding John. Use “Welcome back” without a name when unavailable; do not infer a name from private account identifiers.
- [x] Keep Home the same with or without a saved purchase plan. Do not add new metrics, charts, forecast cards or a second plan editor.
- [x] Implement centered teal spinner and Loading your home... during session/name loading, with reduced-motion support. Add a recoverable error state if the chosen service can fail; no fabricated successful welcome while loading fails.
- [x] Route the main action to the existing purchase-plan page and reflect the active navigation item. Ensure only one shared header is rendered.
- [x] Verify the plan remains saved when navigating Home ↔ Purchase plans in the same mock session; refresh behavior stays explicitly documented. Keep all existing create/edit/delete, form errors and focus behavior working.

### 6. Keep authentication and network integration replaceable

- [x] Define a small auth/session boundary around the screens, reusing Nelson's existing interface if supplied. Expose session loading/signed-out/signed-in and operations for sign in, signup and sign out, plus provider/verification operations only when supported.
- [x] Keep the mock auth adapter in preview/development code. It may simulate delays, errors and session transitions; it does not validate accounts, send mail or establish user security. Do not accidentally enable it as a production authentication fallback.
- [ ] Wire the real adapter to Nelson's Clerk code later, with public configuration documented and secrets excluded. Wunna remains responsible for backend token verification and API request infrastructure.
- [x] Handle sign-out pending/failure/success honestly: do not show a completed logout if the provider failed. On success clear user-bound plan state, return to sign in and prevent private screens from appearing through Back navigation without a session check.
- [ ] Handle expiry through the agreed session flow and isolate state on account changes. Agree treatment of unsaved plan edits during expiry/navigation rather than silently resubmitting under another identity.
- [x] Preserve Wunna's purchase-plan adapter boundary and the explicit scenario-date configuration. Do not use today's date as a substitute or invent a scenario endpoint before it is agreed.

### 7. Verify screens and interactions, then document the handoff

- [x] Keep meaningful existing tests passing and add tests for auth-form validation, visibility toggles, simulated signup/login outcomes, session-loading guards, sign-out failure, navigation and user-state reset. Mock tests must not be described as Clerk end-to-end tests.
- [ ] Verify sign in → Home → purchase plans → create/save → Home → saved plan → sign out, plus signup → verification (if needed) → Home.
- [ ] Verify direct-route loads, refresh, Back/Forward, unknown routes, sidebar keyboard operation/closing and no duplicate header. Confirm the dashboard integration boundary works without implementing Anjali's screen.
- [x] Confirm Recommendation remains a disabled Coming soon navigation entry and has no implemented screen or decision flow.
- [ ] Compare each screen/state against the actual references at desktop size (1440 × 900 where applicable), then narrow widths around 375px. Check contrast, wrapping, scrolling, focus, input labels/errors, password controls, announcements and reduced motion.
- [x] Run `npm test` and `npm run build`; record actual results. If browser tools are unavailable, clearly leave visual/native-browser verification pending and give Rae the local URL/manual steps.
- [x] Update `frontend/README.md` with app structure, routes, exports, mock identity, state controls, reset/persistence behavior, intentional visual differences and real-integration prerequisites. Keep demo controls out of production UI.
- [ ] Give Anjali the shared shell/mounting interface, Nelson the auth UI requirements, and Wunna the session/request integration points. Rae now owns the shared frontend coding; do not wait for Luck to implement those pieces.

**Build order:** inspect/clarify affected designs → extend live preview and shared primitives → header/sidebar/routes → sign in → signup → Home → mount/regression-check purchase plans → adapter integration/checks → visual QA and handoff.

**First visible milestone:** existing frontend runs with shared navigation, Home and sign-in UI; Rae can select pages and test while coding continues. **Frontend mock milestone done:** all agreed screens/states excluding market dashboard, Recommendation and password reset are navigable, responsive and demonstrable with explicit mock sessions/data, and tests/build/verification notes are recorded. **Integrated completion remains separate:** real Clerk flows, backend authorization, persistent plans and account isolation require actual integration tests.

**Verification note:** The two manual journey/route checks above remain unchecked for real-browser confirmation. Their core interactions and popstate handling passed automated tests; no real browser was connected.

### 8. Leave resumable checkpoints

- [x] Work in runnable increments: (1) shared shell/routes and preview, (2) sign in/signup, (3) Home and purchase-plan integration, (4) verification and handoff. Do not start a new increment immediately before a known stop.
- [ ] At a pause, record completed files/features, checks actually run and their results, unresolved issues, exact next task, and commands/URL needed to resume in this checklist or `frontend/README.md`.
- [x] Leave the current increment runnable where possible; explicitly identify unfinished or failing work instead of claiming completion. Keep credentials out of handoff notes.
- [ ] If an actual runtime limit is reported or Rae asks to pause, notify Rae and leave the checkpoint. The agent cannot inspect Rae's account token balance/usage limits through the available tools; do not claim to monitor them or invent a remaining budget.


## Frontend first: purchase-plan page and demo

**26 September implementation update:** Rae confirmed Luck has reviewed the current mockups and authorized implementation. The local React/TypeScript/Vite preview is now in `frontend/`; see [run instructions and handoff](../frontend/README.md). Implemented the mock-backed empty/create/edit/saved/loading/error/delete states and development example controls. Ten interaction/contract tests and the production build passed. Visual browser comparison remains pending because no browser connection was available; live API, Clerk and database integration remain pending. This checklist remains untracked.

**Confirmed by Rae:** React is the frontend framework, no frontend has been implemented yet, and Rae and Luck already share the UI mockups. Build the visible purchase-plan frontend first; detailed date rules are not the immediate priority. Use representative fixture values while building the UI, retaining the date fields shown in the mockups. Complete database and application integration later this sprint.

**Sequence chosen by Rae:** build the page as a self-contained React feature with a small local preview wrapper and mock responses matching [Wunna's API contract](../backend/README.md#purchase-plan). Luck still owns the final app setup, header/sidebar, routing, shared components, and authentication screens. Rae can build local buttons/inputs/dialogs needed for this feature now and reconcile them with Luck's shared components later. Her completed layout is not a prerequisite. JavaScript/TypeScript and styling tooling are not yet confirmed; keep those choices lightweight and documented instead of treating React as undecided.

### Implementation checklist for the later frontend agent: build these first

This is the concrete UI work Rae can start independently. Suggested component names below are organizational guidance, not an existing codebase. Read the actual PNGs before implementing; do not treat their filenames alone as the specification. Implement one page with changing states rather than a separate page for every screenshot. Sections A-E below retain the broader integration and verification requirements.

#### 1. Set up a minimal React preview

- [ ] Recheck the repository for a newly added frontend before scaffolding. If still absent, create a minimal runnable React frontend with a documented start command. Record the selected JS/TS and styling choices for Luck.
- [ ] Keep the feature together, for example under `src/features/purchase-plan/`, with page, components, scoped styles, and fixtures. Export `PurchasePlanPage` so Luck can mount it in the shared app later.
- [ ] Render the page directly in a small preview app. No router, login, database, or live API is needed for the first visual milestone.
- [ ] If needed for screenshot comparison, add a preview-only top bar matching the logo/header area. Keep it separate from the feature; the real header, menu, sidebar, and navigation remain Luck's work.

#### 2. Build the background, typography, and layout styles

- [ ] Create a full-height dark navy page background and a slightly lighter navy surface for cards/dialogs, following the screenshots.
- [ ] Define feature-scoped CSS variables for background, surface, border, primary teal, destructive red, main text, muted text, spacing, and corner radii. Avoid global button/input styles that could affect Luck's pages.
- [ ] Match the large white page heading, muted supporting sentence, small uppercase field labels, and readable input/value text. Match the mockup's visual hierarchy without assuming an exact font family from the image.
- [ ] Build the content container: approximately 40 px desktop outer spacing in the 1440 px references, reducing on narrow screens. Use flexible widths rather than a fixed 1440 px canvas.
- [ ] Build the heading row with title/subtitle on the left and Create plan on the right; allow it to wrap on smaller screens.
- [ ] Build a reusable feature card style with subtle border, rounded corners, interior padding, and horizontal dividers. The editing form spans the content width; the saved card is narrower and left-aligned (roughly 580 px in the reference).

#### 3. Build the buttons and icons

- [ ] Build a feature-local `PlanButton` with primary teal, secondary outlined, destructive filled red, and destructive outlined/text variants.
- [ ] Match Create plan (plus icon), Save plan/Save changes, Edit, Cancel, Delete, Delete plan, and Retry from the relevant mockups.
- [ ] Add hover, keyboard-focus, disabled, and busy states. Disabled controls must actually be disabled; busy actions show Saving... or Deleting plan and prevent duplicate clicks.
- [ ] Add consistent plus, calendar, trash, and status icons using one lightweight approach. Keep decorative icons hidden from assistive technology and accessible names on any icon-only controls.
- [ ] Keep the controls local to Rae's feature for now; Luck can later adopt them or replace them with shared equivalents.

#### 4. Build the form controls and feedback elements

- [ ] Build a labelled quantity input with the MT unit aligned inside the right side, matching the editing screenshot. Support normal, focused teal border, disabled, and inline-error appearances.
- [ ] Build a labelled deadline input with a calendar affordance. Use a working native date control initially; a custom calendar is not required to reproduce the page flow.
- [ ] Build the muted read-only historical scenario date row. Keep its fixture value separate from editable form values.
- [ ] Build an error banner with a red-tinted background, border, status icon, and message, matching `purchase-plans-save-failed.png`.
- [ ] Build a teal loading spinner with supporting status text, matching `purchase-plan-loading.png`. Respect reduced-motion preferences.
- [ ] Associate labels/errors with inputs and announce request status/error messages accessibly.

#### 5. Build the empty state

Reference: [purchase-plans-empty.png](ui-mockups/purchase-plans-empty.png).

- [ ] Show Purchase plans and Manage your purchase quantity and deadline.
- [ ] Show the enabled Create plan button at the top right.
- [ ] Build the large dashed-border empty panel, centered circular plus illustration, and You haven't created a purchase plan yet message.
- [ ] Clicking Create plan opens the inline create form. Keep the decorative central illustration noninteractive unless deliberately implemented as a labelled second create control.

#### 6. Build one form for create and edit

Reference: [purchase-plans-editing.png](ui-mockups/purchase-plans-editing.png); reuse its structure for create mode, which has no dedicated screenshot in the newer state set.

- [ ] Build `PurchasePlanForm` with a card heading, supporting text, quantity, deadline, read-only scenario date, divider, and bottom-right Cancel/Save actions.
- [ ] In create mode start with empty editable fields and label the action Save plan. In edit mode populate saved values and label it Save changes.
- [ ] Keep form draft values separate from the saved plan. Cancel create returns to empty; Cancel edit restores the unchanged saved card.
- [ ] Disable the top Create button while a form is open. Keep date fixtures simple during visual implementation; do not block this stage on urgency rules or scenario-date API work.
- [ ] Add basic required-field and positive-quantity feedback, with room for backend field errors later.

#### 7. Build the saved-plan summary card

Reference: [purchase-plans-saved.png](ui-mockups/purchase-plans-saved.png).

- [ ] Build `PurchasePlanSummary` with Your purchase plan, read-only quantity/MT, deadline, historical scenario date, and time remaining, separated as in the mockup.
- [ ] Show Edit and Delete at the bottom right. Show the disabled Create button and You can save one purchase plan explanation beside it.
- [ ] Use representative fixture values for the first preview. Keep time remaining as a supplied display value; urgency categories are a later agreement, not a prerequisite for this card.
- [ ] Use neutral purchase-plan supporting copy instead of the mockup's claim about live predictions.

#### 8. Build loading, saving, and failure states

References: [loading](ui-mockups/purchase-plan-loading.png), [saving](ui-mockups/purchase-plans-saving.png), and [save failure](ui-mockups/purchase-plans-save-failed.png).

- [ ] Show the centered spinner/text while initially loading; do not briefly show the empty panel first.
- [ ] Add an initial-load error message with Retry, using the same visual language. This state needs implementation even though no separate PNG was supplied.
- [ ] During save, retain the form layout and entered values, update status copy/button text, and prevent conflicting actions.
- [ ] On save failure, keep entered values, show the error banner above the action row, and restore usable Cancel/Save controls.

#### 9. Build the delete dialog and its three states

References: [confirmation](ui-mockups/purchase-plans-delete-confirmation.png), [deleting](ui-mockups/purchase-plans-deleting.png), and [failure](ui-mockups/purchase-plans-delete-failed.png).

- [ ] Build `DeletePlanDialog`: dark translucent overlay, centered navy panel (roughly 440 px on desktop), circular trash icon, heading, explanation, divider, and two side-by-side actions. Keep it within narrow viewports.
- [ ] Confirmation state: Delete your purchase plan?, Cancel, and red Delete plan action.
- [ ] Pending state: change heading/copy to deletion in progress and disable actions to prevent duplicate deletion or misleading cancellation.
- [ ] Failure state: show Deletion failed with Cancel and Retry. Leave the saved card present behind the dialog.
- [ ] On successful mock deletion, close the dialog and return to empty. Cancel before deletion or after failure closes it with the saved plan unchanged.
- [ ] Implement dialog semantics, focus trapping, initial focus on the safe action, focus restoration, and Escape dismissal when no deletion is pending.

#### 10. Wire the complete local demo and prepare the handoff

- [ ] Keep saved plan, editable draft, page mode, request status, and dialog state explicit so incompatible states cannot appear together.
- [ ] Connect the UI to an in-memory mock service exposing read/create/update/delete. Match Wunna's response shapes now, with simulated delay and controllable failures; keep network/auth logic out of presentation components.
- [ ] Provide a development-only way to select empty/saved/loading/load-error/save-error/delete-error examples. Keep preview controls separate from the eventual product page.
- [ ] Verify the full Create -> Save -> Edit -> Cancel -> Edit/Save -> Delete/Cancel -> Delete/Confirm journey and error retries. Confirm failures preserve inputs or the saved plan and busy actions cannot be repeated.
- [ ] Compare every implemented state with its reference PNG at desktop size, then check a narrow viewport and keyboard operation. Record any intentional differences, such as corrected supporting copy.
- [ ] Hand Luck the page export, scoped styles, dependencies, and preview instructions. Document which temporary controls/header should be replaced by her shared components.

**Build order:** background/layout -> buttons -> fields/card/error/spinner primitives -> empty -> create/edit form -> saved card -> delete dialog -> loading/error states -> mock interactions -> visual/usability checks. A working mock-backed React page is the immediate deliverable; live API, authentication, database persistence, and detailed date/urgency agreement follow afterward.

### A. Use the mockups as the page specification

- [x] Reviewed the ten purchase-plan PNGs in [ui-mockups](ui-mockups/) on 26 September: the original form, loading, empty, editing, saved, saving, save failure, delete confirmation, deleting, and delete failure.
- [ ] Confirm Luck's review status and use the `purchase-plans-*` state set as the working CRUD reference. These show a top-right Create button, one saved card, an inline form, and a delete modal. Receipt of files does not establish design approval.
- [ ] Match the dark background, navy cards, teal primary actions, muted labels, borders, spacing, and red destructive/error treatments. Keep page styles scoped so Luck can integrate them into the shared app.
- [ ] Fill the missing create-mode design using the editing form's layout: quantity, purchase deadline, read-only historical scenario date, Cancel, and Save plan. Add initial-load failure with Retry and inline validation states, which have no dedicated supplied mockup.
- [ ] Reconcile mockup copy with the current sprint: remove claims about live predictions/model impact, and describe quantity and deadline management. Only mention support if a support route actually exists.
- [ ] Correct the original `purchase-plan.png` example: 24 October to 15 November 2025 is **22 calendar days**, as in the API contract, not 9. Use backend `days_remaining` for saved plans. Urgency categories/colours are still unagreed and absent from the API; show numeric time remaining first and add categories after agreement.

### B. Make the page runnable without waiting for the shared app

- [x] React confirmed; Rae reports no frontend implementation exists yet. Both Rae and Luck have the mockups.
- [ ] Coordinate JavaScript/TypeScript, styling, and the page export/location with Luck as the minimal preview is established. Recheck for new shared work before scaffolding; document provisional choices if she has not started.
- [ ] Build the purchase-plan page, form, summary card, and confirmation dialog as feature components. Render them in a temporary local preview wrapper; keep shared navigation and authentication integration outside the page.
- [ ] Put read/create/update/delete operations behind a small service interface so the page can use a mock implementation now and Wunna's request helper later without rewriting its interaction logic.
- [ ] Create clearly labelled mock responses using the contract: `{ "plan": null }`, a saved plan with `plan_id`, `quantity_mt`, `purchase_deadline`, `scenario_as_of_date`, and `days_remaining`, plus delayed and failed requests. Keep the saved mock state separate from unsaved form inputs.
- [ ] Use `2025-10-24` as the explicitly configured demo scenario date, matching the backend default. Ask Wunna how the frontend obtains the configured date before a plan exists: `GET` with `{ "plan": null }` currently supplies no scenario date. Do not assume a scenario endpoint exists or fall back to today's date.
- [ ] Add local run/demo instructions and a repeatable way to demonstrate empty, saved, slow, and failed requests. State whether mock data resets on refresh; mock storage does not prove database persistence.

**First visible milestone:** a locally runnable purchase-plan page showing the empty state and a working Create -> Save -> saved-card journey using mock responses. This can be shown before Luck's shared shell or live authentication is ready.

### C. Implement the interactions in demo order

- [ ] **Load and empty:** show the loading screen until the read finishes; only show empty after a successful null response. Show an error and Retry if loading fails. Enable Create when no plan exists.
- [ ] **Create:** open the inline form; accept a positive numeric quantity in MT and a valid deadline. Cancel returns to empty without saving. Disable Create while the form is open or a request is pending.
- [ ] **Validate:** require both fields, reject zero/negative/non-numeric quantities, and reject dates earlier than the known scenario date. A deadline equal to the scenario date is allowed by the documented contract. Keep date-only values as `YYYY-MM-DD` for requests and avoid timezone shifts in display. Confirm any decimal precision limits with Wunna rather than inventing them.
- [ ] **Save:** show Saving..., prevent repeat submission and conflicting actions, and switch to the returned saved summary only after success. On failure retain inputs, show field/general errors, and allow correction or retry. Use Save plan for create and Save changes for edit.
- [ ] **Saved summary:** show quantity/MT, deadline, historical scenario date, and numeric time remaining. Keep values read-only, provide Edit/Delete, and disable Create with the one-plan explanation shown in the saved mockup.
- [ ] **Edit:** populate a separate draft from the saved plan. Cancel discards the draft and restores the unchanged summary. Successful saving replaces the summary with the API response, including recalculated days remaining.
- [ ] **Delete:** open the confirmation dialog. Cancel leaves the plan intact. On confirmation show Deleting..., prevent duplicate actions, and keep the card until deletion succeeds. Success closes the dialog, returns to empty, and enables Create. Failure retains the plan and offers Retry/Cancel as mocked up.
- [ ] **Usability:** check narrower screens, visible input labels, keyboard operation, focus indicators, field-error associations, and announced loading/errors. Keep modal focus inside the dialog and restore it on close; disable dismissal while deletion is pending so Cancel does not imply an in-flight request was undone.

### D. Connect the same page to Wunna's API

- [x] Purchase-plan request/response and error contract received in [backend README](../backend/README.md#purchase-plan).
- [ ] Replace the mock service with calls through Wunna's shared request helper when available. Keep base URL and development configuration outside page components; coordinate frontend-origin/CORS setup with him.

| Operation | Request | Expected handling |
| --- | --- | --- |
| Load | `GET /api/v1/purchase-plan` | `200`: unwrap `plan`; null means empty |
| Create | `POST /api/v1/purchase-plan` | Send only `quantity_mt` and `purchase_deadline`; `201` returns the plan wrapper |
| Edit | `PUT /api/v1/purchase-plan` | Same input fields; `200` returns the updated plan wrapper |
| Delete | `DELETE /api/v1/purchase-plan` | `204`: success with no JSON body to parse |

- [ ] For temporary local API integration, configure `X-API-Key` and `X-User-Id` using an existing `users` table UUID supplied through the development setup. The UUID in README is an example, not proof that a matching user exists. This is temporary caller identification, not verified login.
- [ ] Map `422 field_errors.quantity_mt` and `field_errors.purchase_deadline` to the inputs and show `detail` as appropriate. Handle network/server failures without clearing drafts or pretending a save/delete succeeded.
- [ ] Handle `401` with the agreed sign-in/session flow once Nelson's integration is available; in the temporary preview explain that caller configuration is missing/invalid. For `409` create conflicts and `404` edit/delete results, explain the changed server state and provide a reload/recovery path without silently losing unsaved input.
- [ ] Coordinate replacing temporary caller headers with Wunna/Nelson's verified session-token interface. Clear previous-user plan state when the session changes; the backend owns authentication and authorization.

### E. Demonstrate, then hand off and verify integration

- [ ] Run through create -> saved summary -> edit -> cancel -> edit/save -> delete/cancel -> delete/confirm -> recreate with mock responses. Demonstrate slow requests, validation errors, and save/delete/load failures.
- [ ] Check the 500 MT / 15 November 2025 example displays scenario date 24 October 2025 and 22 days remaining. Check same-day deadline, invalid quantity, and deadline before scenario date.
- [ ] Give Luck the page export, required dependencies/styles, service interface, and run instructions. Replace preview-only layout/components with her shared components, and let her mount the page in shared navigation and review visual consistency.
- [ ] Verify actual create/read/update/delete with Wunna's running API and database; then verify refresh, logout/login, backend-restart persistence, and two-account isolation after Clerk integration. Record mock-only checks separately from these integrated results.

**Frontend demo done when:** the mock-backed page is runnable and its CRUD, Cancel, loading, validation, and error flows can be demonstrated. **Sprint completion additionally requires:** the page in Luck's shared app, verified authentication, and database-backed persistence/ownership checks. Database tasks below remain in scope after the first visible frontend milestone.

## 1. Take over the existing database work

**Agreed additional responsibility:** own the purchase-plan frontend while retaining database work. Luck owns shared frontend setup/layout/components, design review, and authentication screens. Nelson supplies the auth/session logic. Anjali retains market context frontend/backend; Wunna supplies shared backend infrastructure and plan APIs.

- [x] Purchase-plan frontend assigned to TR in this discussion.
- [ ] Coordinate component boundaries and handoff with Luck before implementation.
- [x] TR's UI mockups are finished and awaiting Luck's review; the reviewed version is expected on GitHub tomorrow.
- [ ] Review Luck's feedback and the updated GitHub version before frontend implementation.
- [ ] Agree shared frontend components/routing with Luck; Wunna's request/response examples are now available in the backend README (see frontend checklist above).
- [ ] Implement empty state, create/edit form, saved summary, delete interaction, validation, loading/error states, and API wiring.
- [ ] Verify Save/Cancel, one-plan behaviour, refresh/logout-login persistence as supported by the demo store, and server-error handling with Wunna.

Start with the frontend demo checklist above, using contract-compatible mock responses. Keep database/identity coordination moving and complete database integration within this sprint. Mockup files have been received and inspected; Luck's design approval and frontend implementation remain pending.

- [x] Role swap confirmed: TR owns database; Wunna owns shared backend/integration.
- [x] Logical schema available in [database-schema.md](database-schema.md).
- [x] SQL script available in [mgo_current_sprint_schema.sql](mgo_current_sprint_schema.sql); loaded in disposable local PostgreSQL with auth stubs on 24 September. Constraint checks: 12 passed, 4 failed; live deployment remains unverified.
- [ ] Review the existing SQL against the PRD and logical schema before changing it.
- [ ] Ask Wunna which database objects/migrations have already been created or applied, and obtain the relevant environment access privately.
- [ ] Agree the migration history and backend/database handoff with Wunna so neither of you recreates or overwrites existing work.

**Inputs and handoffs:**

- [ ] Wunna: current database state, existing configuration/migration details, and backend connection requirements.
- [ ] TR can provide: reviewed schema/migration inventory and list of unresolved database questions.

**Done when:** you know what exists and what remains to be implemented; schema files are not assumed to prove a live database is ready.

## 2. Verify registration identity linkage (no separate profile feature)

- [x] Separate profile creation/editing removed from this sprint; no profile screen or standalone profile API required.
- [x] Clerk is the confirmed authentication provider, implemented by Nelson. Supabase supplies the database only.
- [x] Legacy SQL identity dependencies remain: public.users references auth.users, a trigger synchronizes users, and policies use auth.uid(). These must be adapted to the confirmed Clerk setup; they do not describe the chosen authentication architecture.
- [ ] Agree application identity mapping with Wunna and Nelson. Proposed, not finalized: keep internal UUID user_id and add a unique text clerk_user_id; plans retain their internal user foreign key.
- [ ] Replace the legacy auth.users dependency/trigger with the agreed Clerk user-provisioning approach and adapt ownership policies to the database access path.
- [ ] Verify registration produces the minimal user record needed by the plan foreign key when the database is integrated; check the ID matches Wunna's verified identity.
- [ ] Keep credential storage with Clerk; do not add duplicate password storage.

**Inputs and handoffs:**

**Get from Nelson:**

- [ ] Branch/commit or files containing the Clerk implementation, plus instructions to run signup, login, and logout locally.
- [ ] Which Clerk development instance is used, required environment variable names, and how teammates obtain development configuration privately. Do not put secret keys or session tokens in this checklist or Git.
- [ ] The code/helper that reads the signed-in Clerk user ID and obtains the session token for backend requests; confirm token forwarding with Wunna's shared request helper.
- [ ] For Wunna's token verification: issuer/JWKS details and any configured audience or custom token settings. Share a redacted claim example if needed, not a live token.
- [ ] Whether signup currently creates any application database user record. If yes, obtain the code and destination table; if no, record provisioning as pending rather than assuming Clerk creates public.users automatically.
- [ ] Which user/email fields are available, including the primary-email choice and whether an email is guaranteed; reconcile this with public.users.email being required and unique.
- [ ] A way to create two Clerk development test accounts and identify their Clerk user IDs for registration-linkage and cross-user access tests.
- [ ] Existing session-expiry/sign-out handling the purchase-plan page should use, so failed saves never appear successful.

**Agree with Wunna (with Nelson supplying auth context):**

- [ ] Whether all database access goes through Spring Boot or the frontend also calls Supabase directly; this determines the required database policy/token integration.
- [ ] Verified Clerk identity-to-application-user mapping used by plan endpoints; never rely on a client-supplied owner ID alone.
- [ ] Who creates the application user row and when (e.g. verified backend request or Clerk webhook), including repeat-request handling and existing Clerk users.
- [ ] Database connection role and where ownership is enforced; test access as two real signed-in users after integration.
- [ ] TR can provide: Clerk-compatible schema/migration proposal, user foreign-key checks, and local constraint results. Profile CRUD is not part of this work.

**Done when:** registration and plan ownership work with the smaller schema without a separate profile-creation step.

## 3. Prepare repeatable schema migrations and database configuration

- [ ] Prepare or adapt migrations for the smaller current-sprint schema only: USERS, PURCHASE_PLANS, MARKET_SERIES, and MARKET_OBSERVATIONS. The larger forecasting/analysis schema is out of scope; separate physical database instances are not established by the diagrams.
- [ ] Enforce required fields, foreign keys, unique series/date observations, positive plan quantity, and at most one plan per user.
- [x] Add four missing NOT NULL constraints to the local schema and prepare [candidate migration](migrations/20260925_required_fields.sql): purchase_plans.purchase_deadline, purchase_plans.scenario_as_of_date, market_series.source_name, and market_observations.value_type.
- [ ] Reconcile the candidate with the actual shared schema/history and review existing NULL rows before deployment; shared Supabase remains untouched.
- [ ] Use suitable decimal/date types and document precision/scale choices with Wunna and Anjali.
- [ ] Preserve shared market records when a plan is deleted; later analysis tables/cascades remain deferred.
- [ ] Document how to initialize a fresh development database and which configuration values backend contributors need.
- [ ] Share database access privately; keep credentials out of documentation and Git.

**Inputs and handoffs:**

- [x] Current table/constraint requirements available in the logical schema.
- [ ] TR can provide: migrations, connection configuration instructions, and initialized development database.
- [ ] Wunna/Anjali: review compatibility with their backend mappings and queries.
- [ ] Nelson/Wunna: finalize task 2's identity mapping before dependent migrations are finalized.

**Done when:** the schema can be created reproducibly and backend contributors can connect using the documented setup.

## 4. Coordinate mock data and defer historical sourcing

- [x] Current stage uses mock application data on localhost; real historical sourcing is deferred.
- [ ] Agree with Anjali and Wunna on mock fixture shapes, loading responsibility, and the database handoff checkpoint this sprint. They can inject their own mock data and progress without waiting for you; final integration must use the smaller database.
- [ ] If you provide seed data, label it clearly as mock, preserve scenario/observation dates and units, and make repeat loads avoid duplicates.
- [ ] Decide the later source-data/import owner separately; database ownership does not automatically assign historical research/import to you.

**Inputs and handoffs:**

- [ ] Anjali: displayed series and fixture shape for historical MGO/Gasoil data.
- [x] Wunna owns shared scenario-date configuration.
- [ ] Wunna: supply the actual agreed mock date, supported-date behaviour, and plan fixture requirements for Rae and Anjali to use.
- [ ] TR can provide: database seed scripts once the fixture format and ownership are agreed.
- [ ] Later data owner: real files and source metadata when historical integration is scheduled.

**Done when:** any database fixtures are reproducible and explicitly synthetic; real-data work is not treated as a blocker for the local mock demo.

## 5. Hand the database to backend owners and verify it

- [ ] Give Wunna and Anjali setup instructions, migrations, and schema/constraint details.
- [x] Verified locally against the existing SQL: second plan, nonpositive/null quantity, invalid references, and duplicate observations are rejected; deleting a plan preserves shared market data. See [test instructions/results](../tests/database/README.md).
- [ ] Rerun all constraint checks after schema fixes and Clerk adaptation; verify the integrated development database separately.
- [x] 25 September: corrected fresh schema and migrated schema each passed 16/16 checks; migration NULL rejection/rollback and repeat execution also passed locally. Clerk adaptation and integrated tests remain pending. Shared Supabase untouched.
- [ ] Help Wunna verify database-backed plan persistence across refresh, logout/login, and backend restart, plus deletion without losing shared market data.
- [ ] Help Anjali replace temporary fixture reads with queries against database-backed mock market data this sprint.
- [ ] Coordinate any required database access policies with Wunna; backend identity checks remain his responsibility. Foreign keys alone do not enforce user privacy.
- [x] Recorded 24 September local results: 16 checks, 12 passed, 4 failed (missing required fields). Used an isolated Docker PostgreSQL container with auth stubs; shared Supabase was untouched and the container was removed. Clerk, RLS/user isolation, API behaviour, and persistence across sessions/restarts were not tested.

**Inputs and handoffs:**

- [ ] Wunna: working backend connection and plan API behaviour, including owner isolation.
- [ ] Anjali: market-context database queries and expected results.
- [ ] Nelson/Wunna: test user identities for registration linkage and plan ownership verification.
- [ ] TR can provide: database validation results and fixes for database issues.

**Done when:** Wunna's plan APIs and Anjali's market APIs use the smaller database, the frontend journey works with mock data, and persistence/constraints/ownership have been verified this sprint.

## Work now handed to Wunna

### Ready-to-send Clerk handoff request (draft; not sent)

Nelson: please share the Clerk branch/files and local setup steps, development
configuration privately, identity/token helpers and expiry handling, Wunna's token
verification settings, available user/email fields, whether signup provisions an
application database user, and a way to create two development test accounts.
Wunna: please confirm backend-only versus direct frontend database access, the
connection role, existing schema/migration history, and who provisions users.
We need to agree the Clerk-to-internal-user mapping and ownership enforcement
before I finalize identity migrations. The four required-field fixes are separate.

### Purchase-plan frontend handoff decisions

- Minimal Home: welcome by name, supporting text, and Go to purchase plans;
  same page with or without a plan.
- Sidebar: Home, Purchase plans, Market dashboard, Recommendation (deferred MVP).
- One purchase-plans page for CRUD; at most one saved card, with Create at top
  right disabled while a saved plan exists. Saved values are read-only with
  Edit/Delete at bottom right.
- Inline create/edit form: quantity and one deadline. Cancel restores the empty
  state or unchanged saved summary; delete requires confirmation.
- Clearly label the historical scenario date. Wunna's API now specifies calendar
  days and rejects deadlines before the scenario date. Urgency thresholds remain
  unresolved; Wunna owns shared scenario-date configuration.
- Loading must not flash the empty state. Failures preserve form inputs and are
  distinct from a successful response with no saved plan.

Shared Spring Boot setup, health/scenario APIs, API conventions and contracts, token verification, CORS, the shared frontend API helper, purchase-plan APIs, frontend integration with Luck, and overall demo coordination are now Wunna's responsibilities. The existing [backend conventions](backend-conventions.md) are a draft handoff for him to review against his implementation.

You provide database support for those tasks. Nelson's authentication/session logic responsibility, Luck's authentication-screen ownership and Anjali's end-to-end market-context ownership remain unchanged. No deployment is required at this stage.
