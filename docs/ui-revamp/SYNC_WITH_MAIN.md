# Syncing the UI branch with `main` (runbook)

For anyone (human or agent) working on `feature/ui-revamp-wireframe`. `main` keeps moving while the UI revamp is
long-lived, so sync on a schedule, resolve by a fixed rule, and verify. Context: `docs/ui-revamp/UI_REVAMP_PLAN.md` (§12 summarises this).

## Rules

1. **`main` owns behaviour; this branch owns presentation.** In a conflicted `.tsx` or `.test.tsx`, keep `main`'s logic,
   props, new elements and test expectations, then re-apply the restyle (classNames, tokens) on top. Do not take one side
   wholesale **unless the UI side of the hunk is not presentation** (see the 2026-10-27 log: every conflict was
   non-presentation, so `main` won). In `.css`, keep this branch's token values and add `main`'s new rules, then convert new
   hex literals to `--bb-*` tokens.
2. **Merge, never rebase** (long-lived branch with merge commits). Keep `git config rerere.enabled true`; a conflict resolved
   once is replayed on later syncs.
3. **Rehearse on a throwaway branch**, then fast-forward. A bad resolution costs nothing.
4. **Sync cadence:** start of every phase; before opening each phase PR; the same day a teammate PR that touches `frontend/`
   merges; otherwise weekly. Land the additive foundation (`styles/`, tooling) on `main` early to shrink divergence.
5. Keep markup edits minimal in files others actively edit (`PurchasePlanPage`, `RecommendationsPage`, `ClerkApp`).

## 1. Drift check (2 minutes, nothing is modified)

```bash
git fetch origin
git rev-list --left-right --count origin/main...HEAD      # behind  ahead
git diff --name-only $(git merge-base HEAD origin/main) origin/main -- frontend
git merge-tree --write-tree --name-only --no-messages HEAD origin/main   # tree id, then conflicting files
```

No `frontend/` changes, or an empty conflict list, means the sync is trivial.

## 2. Sync procedure

```bash
# 0. clean tree. Tracked *.class files under historical-market-dashboard/backend/target/ get modified by local builds
git stash push -m build-artifacts -- historical-market-dashboard/backend/target
git tag -f backup/ui-before-sync-<date> HEAD
git config rerere.enabled true
git switch -c sync/main-<date>
git merge origin/main            # resolve conflicts per Rule 1, git add each file
```

Then verify, cheapest first:

```bash
cd frontend && npm install && npx tsc --noEmit && npm test && npm run build
git checkout HEAD -- package-lock.json      # npm on Windows strips "libc" fields; restore the committed lockfile
cd ../docs/ui-revamp/tools && npm install   # first time only; node_modules is not committed
# with `cd frontend && npm run dev` running:
npx playwright test -g "layout|a11y" --reporter=line     # add `|theme|focus` for the progress meter
npx playwright test -g visual                            # then `npx playwright show-report`; review only screens main changed
```

Finish: `git commit` the merge, `git switch feature/ui-revamp-wireframe && git merge --ff-only sync/main-<date>`,
`git branch -d sync/main-<date>`, add a log entry below. If `frontend/src/preview/PreviewApp.tsx` changed on `main`,
update `STATES` in `docs/ui-revamp/tools/screens.spec.ts` for any new preview state. Re-baseline only screens you reviewed.

## 3. Subagents

| Task | Agent | Notes |
| --- | --- | --- |
| Drift report | `Explore` | read-only, ≤ 15 lines |
| Rehearsal merge and resolution | `general-purpose`, `isolation: "worktree"` | works on the sync branch only; reports files and decisions |
| Confirm `main`'s behaviour survived | `everything-claude-code:code-reviewer` | review `origin/main..sync` for lost logic |

## 4. Sync log

### 2026-10-27 — catch-up, 28 commits behind

- Before: 9 ahead, 28 behind; merge-tree predicted 7 conflicts; merge produced exactly those 7.
- Conflicts: `app/ClerkApp.tsx` and `.test.tsx`, `purchase-plan/PurchasePlanPage.tsx`, `components/PurchasePlanForm.tsx`,
  `components/PurchasePlanSummary.tsx`, `purchase-plan/scenario.test.tsx`, `recommendations/RecommendationsPage.tsx`.
- Resolution: **took `main` in all 7.** The UI side of every hunk was this branch's earlier "current planning date" wording
  and date-refresh logic (commit `7d7a752`); `main` reimplemented the same feature as "application date" together with
  organisation access (`useOrganization`, `planAccess`, `canEdit`). No restyling was lost.
- Left behind: `frontend/src/app/useDateRollover.ts` (+ `.test.tsx`) is now unused (`main` has its own midnight refresh in
  `ClerkApp.tsx`). Delete or keep: owner's decision.
- Checks: `tsc` clean; vitest 21 files / 197 tests pass; `vite build` OK. Playwright desktop `layout|a11y`: 21 pass, 13 fail.
  The failures are the soft "text under 12px" check (11px `dt` labels, `figcaption`, `.rec-eyebrow` added by `main`) and
  3 colour-contrast issues on the login page. **Not compared against the pre-merge state**, so treat as existing backlog.
- Baselines in `docs/ui-revamp/tools/baselines/` were **not** re-baselined; they are still the pre-revamp "before" look.
- New un-themed UI that arrived from `main`: `features/organisation/` (49 hex literals, own Clerk `appearance.ts`),
  `features/forecast/` (13), `TimingComparison`, restructured recommendations page, new `market` preview state.
- Housekeeping: the 12 modified `*.class` files were stashed (`git stash list`, "build-artifacts-before-main-sync"); drop the
  stash if you don't need those local builds. Tag `backup/ui-before-sync-2026-10-27` points at the pre-sync tip.

### 2026-10-27 (evening) — after PR #32 merged, 7 commits behind

- Before: 0 ahead, 7 behind (PR #32 brought this branch into `main`; #33 deadline-weighted recommendation, #34 approval
  workflow and forecast role access followed). merge-tree predicted no conflicts: **fast-forward** to `d09beb8`.
- Presentation kept: `main` built on the purchase-plans redesign (status pill "Submitted for approval", Edit/Delete only
  for draft plans, manager `ApprovalInbox`), all in `--bb-*` tokens. Recommendations page restructured for one
  deadline-weighted recommendation plus approval (`RecommendationApproval`, `ManagerDecisionForm`,
  `RecommendationEvidence`); its CSS still has 59 old colour literals (no new ones).
- Backend changes (approval, migrations `20261027_*`) are `main`'s; nothing to resolve here.
- Checks: vitest 24 files / 227 tests pass; `tsc` clean; `vite build` OK. Tag `backup/ui-before-sync-2026-10-27b` = pre-sync tip.
