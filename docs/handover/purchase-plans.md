# Handover: Purchase plans

**Updated:** 2026-10-28. Read [Start here](../handover.md#start-here) first.

**Backend update, 2026-10-29:** `withdrawn`/`purchased` and previous-plan links are now
implemented and migrated. See
[`plan-lifecycle-api.md`](../plan-lifecycle-api.md). Summary counts now use only draft/submitted plans; final-state deadline badges are hidden.
Open/Finished filters, lifecycle adapters and previews are implemented on `backend-plan-lifecycle`.

**Status:** done. **Owner now:** nobody; the follow-ups wait on Recommendations.

## Where we left off

- **Built and merged:** the page follows `docs/ui-revamp/assets/inspo/purchase-plans-page/image.png`, without the dashed "Create plan" card or a progress bar.
  - A summary strip: Active plans, Overdue plans, Next deadline.
  - A "Sort by" text toggle (Soonest deadline / Largest volume).
  - Cards with a status badge (Due soon ≤ 7 days, On track, Overdue) and the quantity as the large figure. The "…" menu holds Delete.
  - Create/edit forms with validation, and a delete confirmation dialog.
  - Visible "Plan saved" / "Plan deleted" notices, with the saved card highlighted.
  - Motion tokens, button press feedback, the dialog easing in, and a working loading spinner.
- **How it landed:**
  - The row-first grid: PR #30 into `main`.
  - The theme: PR #32.
  - The polish went straight into wireframe (cd28f3a → 5d54101), and draft cards dropped their status pill (bd7ea7a).
  - The manager **Approval inbox** came from PR #34 (`main`). Decision notes on decided cards came from PR #38.
- **Deferred motion:** cards sliding on re-sort, and a first-load reveal.
- **Small follow-ups (UI only)**, waiting for the new statuses from [Recommendations](recommendations.md):
  - "Active plans" counts submitted, approved and rejected plans. Count only drafts and submitted.
  - Decided plans still show On track / Due soon / Overdue. Hide those badges for final states.
  - Once `purchased` and `withdrawn` exist, add an open / finished filter to the plans list.

## Where your agent should continue

1. Wait until Recommendations adds `withdrawn` and `purchased`, or do the first two follow-ups now; they don't need the new statuses.
2. Branch from `feature/ui-revamp-wireframe`. The logic lives in `components/PurchasePlanSummary.tsx` (`DUE_SOON_DAYS`, the summary strip and badges).
3. Add a test per follow-up and check the page in the preview (see [Start here](../handover.md#test-and-preview)).

> **Prompt for your agent:** Read `docs/handover.md` (Start here) and `docs/handover/purchase-plans.md`. On a branch off `feature/ui-revamp-wireframe`, change `PurchasePlanSummary.tsx` so "Active plans" counts only draft and submitted plans, and decided plans (approved, rejected, and later withdrawn and purchased) show no deadline badge. Add tests. Run `npm test` and `npm run build` in `frontend/`.

## Design inspiration

- **Revamp mockup:** [`docs/ui-revamp/assets/inspo/purchase-plans-page/image.png`](../ui-revamp/assets/inspo/purchase-plans-page/image.png). It was built without the dashed "Create plan" card and without a progress bar.
- **Original mockups:** [`docs/ui-mockups/`](../ui-mockups/) `purchase-plan*.png`, `purchase-plans-*.png` and `Purchase plans · Desktop overview.png`: every state, including saving, save failed, editing, deleting and delete failed.
- **What's built now:** run the preview (see [Start here](../handover.md#test-and-preview)).
- **Patterns to reuse** (all in `features/purchase-plan/components/`):
  - cards, summary strip and sort: `PurchasePlanSummary.tsx`
  - forms: `PurchasePlanForm.tsx`
  - confirm dialog: `DeletePlanDialog.tsx`
  - inbox list: `ApprovalInbox.tsx`
  - status notes on cards: `PlanDecisionNote.tsx`
  - icons, buttons, error banner and loading state: `Primitives.tsx`
