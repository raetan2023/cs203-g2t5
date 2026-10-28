# Handover by page

**Updated:** 2026-10-28. Each page has its own file in [`docs/handover/`](handover/). Read [Start here](#start-here) below, then only your page's file.

| Page | UI | Backend | Owner now | Next step |
|---|---|---|---|---|
| [Login](handover/login.md) | Done | Done (Clerk) | — | Optional follow-up only |
| [Home](handover/home.md) | Done (PR #40) | No new endpoints needed | — | Photo / time-of-day choice |
| [Purchase plans](handover/purchase-plans.md) | Done | Done | — | Small follow-ups after the new statuses exist |
| [Recommendations](handover/recommendations.md) | Done up to the manager's decision | **Missing: everything after the decision** | **Recommendations teammate** | Agree the [open questions](handover/recommendations.md#open-questions), then build |
| [Market dashboard](handover/market-dashboard.md) | **Spec done** (HTML proposal); live page unchanged | Small additions | **Market dashboard teammate** | Build the spec in React; decide "Your plans" |

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
