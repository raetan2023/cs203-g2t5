# Handover by page

**Updated:** 2026-10-28. Each page has its own file in [`docs/handover/`](handover/). Read [Start here](#start-here) below, then only your page's file.

| Page | UI | Backend | Owner now | Next step |
|---|---|---|---|---|
| [Login](handover/login.md) | Done | Done (Clerk) | — | Optional follow-up only |
| [Home](handover/home.md) | Done (PR #40) | No new endpoints needed | — | Photo / time-of-day choice |
| [Purchase plans](handover/purchase-plans.md) | Done | Done | — | Small follow-ups after the new statuses exist |
| [Recommendations](handover/recommendations.md) | Done up to the manager's decision | **Missing: everything after the decision** | **Recommendations teammate** | Agree the [open questions](handover/recommendations.md#open-questions), then build |
| [Market dashboard](handover/market-dashboard.md) | **Spec done** (HTML proposal); live page unchanged | Small additions | **Market dashboard teammate** | Build the spec in React; decide "Your plans" |

Every page file has these sections:
1. **Where we left off:** what's built, with the PRs and decisions.
2. **Where your agent should continue:** the branch, the steps, and a prompt to paste into your agent.
3. **Design inspiration:** every mockup, brief section and screenshot folder for that page.

## Where the revamp stands (2026-10-28)

- **The UI revamp lives on `feature/ui-revamp-wireframe`.** On 2026-10-28 it was 44 commits ahead of `main` and 0 behind.
  - Merged into it: PR #35 and #36 (recommendations page), #37 (login), #38 (decision views), #39 (post-decision design), #40 (Home) and #41 (this handover and the market dashboard spec).
  - The purchase plans polish was committed to it directly.
- **Still to do across the app:**
  - merge wireframe into `main` (the owner's call, once the teams agree)
  - everything after the manager's decision ([Recommendations](handover/recommendations.md))
  - the market dashboard build ([Market dashboard](handover/market-dashboard.md))
- **The app looks like two design systems.** Plans, recommendations, Home and the shell use `--bb-*` tokens. The forecast and market dashboard CSS mostly don't (about 250 hard-coded colours). The market build should fix that for its own files.

### Revamp-wide docs and tools

Read these only when your page file points to them, or when you need the background:

| File | What it is |
|---|---|
| [`docs/ui-revamp/CREATIVE_BRIEF.md`](ui-revamp/CREATIVE_BRIEF.md) | The direction for every page (§3), the shell (§3.6), and the loop for each screen (§4) |
| [`docs/ui-revamp/UI_REVAMP_PLAN.md`](ui-revamp/UI_REVAMP_PLAN.md) | The original plan: guardrails (§2), token architecture (§4), phases (§5), definition of done (§8) |
| [`docs/ui-revamp/SYNC_WITH_MAIN.md`](ui-revamp/SYNC_WITH_MAIN.md) | How to merge `main` into the UI branch: `main` owns behaviour, the UI branch owns presentation |
| `DESIGN_SYSTEM.md` (repo root), `frontend/DESIGN.md`, `frontend/PRODUCT.md` | The visual spec, the frontend design notes, and who the product is for |
| [`docs/ui-revamp/tools/`](ui-revamp/tools/) | Playwright screenshot suite (`screens.spec.ts`, baselines in `baselines/`), `gallery.html` to browse them, `phase2-check.mjs` for the theme checks |
| `docs/ui-revamp/before/`, `phase2/`, `reference/` | Screenshots from before the revamp, after the beige theme pass, and of the old wireframe login |
| [`docs/AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md) | A proposal (not installed) for saving agent tokens with a graphify code map |

---

## Start here

### Branch and workflow

- Branch from **`feature/ui-revamp-wireframe`**. It is up to date with `main` and is the only branch with the new UI. Open PRs back into it.
- Before starting and before each PR, check you're not behind: `git fetch && git rev-list --count HEAD..origin/main` should print `0`. Merge (don't rebase) if it isn't.
- One branch per gap keeps reviews small.
- Database changes go to the **shared** Supabase project by hand. Back up first, run once, record the result, and tell the team. Follow the rollout steps in [`plan-submission.md`](plan-submission.md). Never rerun the existing migrations in `backend/migrations/`.

### Read only these

| Read | Why |
|---|---|
| This section and your page's file | What to build and how |
| `frontend/AGENTS.md` | Frontend rules: use `--bb-*` tokens from `frontend/src/styles/tokens.css`, no new hex colours |
| `docs/frontend-design-guidelines.md` | States to cover (loading, empty, error), accessibility, never colour alone |

Each page file lists any extra reading. You can skip the forecast, Ridge and revamp-planning docs unless your page's file names them.

### Mockups and screenshots

Each page file has a **Design inspiration** section listing the same six sources: the revamp mockup, the brief section, the original mockups, screenshots before the revamp, what's built now, and patterns to reuse.

- **Mockups:** `docs/ui-revamp/assets/inspo/<page>/`. Each folder has a `README.md` or `HANDOFF.md`. Serve the folder (`python -m http.server`) and open the `.dc.html` file; its inline styles carry the exact spacing and sizes.
- **Screenshots of what's built:** under `docs/ui-revamp/critique-*/` and each page's review folder.

### Test and preview

- **Frontend:** in `frontend/`, run `npm test`, `npm run build` and `npm run test:recommendation-layout`.
  - If the machine is busy and tests time out, use `npx vitest run --maxWorkers=2`.
- **Backend:** in `backend/`, run `./mvnw test`. Add HTTP tests for every role and status, as `plan-submission.md` describes for submit and decide.
- **Preview without a backend:** run `npm run dev` and open `/preview.html`, then use **Demo controls**. Don't refresh; reopen `/preview.html` instead.
