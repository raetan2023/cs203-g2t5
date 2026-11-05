# Handover prompt: UI design changes

Paste everything inside the block into a new Claude Code session in the repo. Edit the "Decisions so far" lines first. For a teammate taking one page, change the line under "Your job" to their work package.

```text
You are continuing the Bunker Buddy UI revamp (CS203 group project: a marine fuel purchase-planning app, React 19 + TypeScript + Vite + plain CSS, Spring Boot backend, Clerk auth). Submission is days away, so finish small, verified pieces rather than starting broad ones.

READ FIRST, in this order:
1. docs/ui-revamp/submission/ui-audit.md: the whole-app audit. Section 1 is the diagnosis, 3 is the token proposal, 4 the open decisions, 5 the work packages, 6 corrections, 7 every finding.
2. docs/ui-revamp/submission/ui-audit/design-review.md: the fix and file for each finding ID. Read only the parts for your work package, plus section 10 (what must not break).
3. docs/ui-revamp/SUBMISSION_5DAY_PLAN.md: where the week stands. It is deliberately untracked, so it exists only in the main checkout.
4. frontend/DESIGN.md, DESIGN_SYSTEM.md, frontend/PRODUCT.md and frontend/src/styles/tokens.css.

THE PROBLEM: the app has no visual hierarchy. Tokens make everything the same weight (surfaces 1.13:1 apart, text tiers collapsed, accent 1.10:1 from the text colour, no type roles, two button tiers), and pages repeat their answer instead of choosing one. Fixing tokens alone is not enough. Each page must also remove what competes.

YOUR JOB: WP-0 first (the shared layer), in this order:
1. Fix the base.css:6 specificity bug that makes every <button> primary render at weight 400.
2. Add the missing base primitives: link style, heading roles, .bb-page container, .bb-tag, .bb-segmented.
3. Add the agreed tokens, including status tones and the raised surface.
4. Rebuild buttons as one component with primary, secondary and ghost tiers.
Then stop and show Rae the result before starting any page.

DECISIONS SO FAR (Rae: edit these before pasting):
- D1 token proposal: NOT YET APPROVED. Discuss it with Rae in chat before changing tokens.css values.
- D2 persistent navigation: undecided.
- D3 Home content: undecided.
- D4 Accept/Reject/Ignore versus Submit for approval: undecided.
- D5 which cost is submitted to the manager: undecided. This is a logic change for the recommendations owner, not a styling task.
- D6 verdict on plan cards: undecided.
- D7 market chart default series: undecided.
If a task depends on an undecided item, skip it, list it, and carry on with the rest.

RULES:
- Sync first: git fetch, branch from the latest origin/main, one branch per work package, PR into main. Do not push to main.
- The revamp must not change logic, data, API calls, routes, validation or user flows unless a decision above allows it. If a change alters behaviour, say so plainly before making it.
- Use --bb-* tokens only. No literal colours or sizes. 12px is the type floor.
- theme.ts mirrors token colours and theme.test.ts enforces it, so a colour change touches both. Clerk and Recharts read from theme.ts.
- Keep what the audit says must not break: the answer-first verdict and its honest labels, all loading/empty/error states, the accessibility plumbing, and the compare-buying-dates strip. Keep every caveat such as "Synthetic demo data" and "Confirm a current supplier quote".
- Rise/fall colour means what is good for a buyer: green is cheaper, red #f2849e is dearer, always with an arrow, sign or word.
- Update frontend/DESIGN.md and DESIGN_SYSTEM.md when tokens change. Both currently overclaim.
- Rae prefers design questions in plain chat with your recommendation, not the question pop-up.

HOW TO VERIFY:
- From frontend/: npm test, then npx tsc --noEmit, then npx vite build.
- Start the preview: npx vite --host 127.0.0.1 --port 5190 --strictPort
- From the repo root: node docs/ui-revamp/tools/capture-states.mjs .taste-skill/after/states
  This screenshots 34 states at 1440 and 390 and writes hierarchy metrics to summary.json. Compare against docs/ui-revamp/submission/ui-audit/ and open the screenshots yourself.
- Targets: at most 4 bordered boxes above the fold, one primary button per view, 0px horizontal overflow.
- Preview limits: the mock service has no manager inbox or decision history, so those two views need a real account. Known test failure: scripts/test-plan-layout.mjs was already failing on main.

KNOWN RISKS: the MGO quote feed is frozen at 2026-10-26 and GDELT is rate-limited, so live forecast horizons die on 2026-11-09. That is outside this task, but do not judge the live page by missing forecasts.

WHEN DONE: list what changed, which finding IDs are closed, what you skipped and why, and test results. Add a dated report to docs/ui-revamp/submission/ and tick the work in the plan.
```
