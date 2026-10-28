# Handover: Purchase plans

**Updated:** 2026-10-28. Read [Start here](../handover.md#start-here) first.

**Status:** done. Plan cards with Sort by, create/edit/delete with notices, the manager approval inbox, and decision notes on decided plans (PR #38). Mockup: `docs/ui-revamp/assets/inspo/purchase-plans-page/image.png`.

**Deferred motion:** cards sliding on re-sort, and a first-load reveal.

**Small follow-ups (UI only):** these wait for the new statuses from [Recommendations](recommendations.md).
- "Active plans" counts submitted, approved and rejected plans. Count only drafts and submitted.
- Decided plans still show On track / Due soon / Overdue. Hide those badges for final states.
- Once `purchased` and `withdrawn` exist, add an open / finished filter to the plans list.

## Design inspiration

- **Revamp mockup:** [`docs/ui-revamp/assets/inspo/purchase-plans-page/image.png`](../ui-revamp/assets/inspo/purchase-plans-page/image.png). It was built without the dashed "Create plan" card and without a progress bar.
- **Brief:** [`CREATIVE_BRIEF.md`](../ui-revamp/CREATIVE_BRIEF.md) §3.3 "Purchase plans": the summary strip, card layout, status badges and sort.
- **Original mockups:** [`docs/ui-mockups/`](../ui-mockups/) `purchase-plan*.png`, `purchase-plans-*.png` and `Purchase plans · Desktop overview.png`: every state, including saving, save failed, editing, deleting and delete failed.
- **Screenshots before the revamp:** `docs/ui-revamp/before/` `multiple-*`, `empty-*`, `loading-*`, `load-error-*`, `saved-*` (desktop and mobile).
- **What's built now:**
  - [`docs/ui-revamp/critique-pp/a/`](../ui-revamp/critique-pp/a/): 16 states, from create and validation to the delete dialog and 390 px
  - [`critique-pp/polish/`](../ui-revamp/critique-pp/polish/) and [`critique-pp/reference-build/`](../ui-revamp/critique-pp/reference-build/): the final pass
  - `docs/ui-revamp/critique-rec/decision-views/plans-decisions-*.png`: cards with decision notes
- **Patterns to reuse** (all in `features/purchase-plan/components/`):
  - cards, summary strip and sort: `PurchasePlanSummary.tsx`
  - forms: `PurchasePlanForm.tsx`
  - confirm dialog: `DeletePlanDialog.tsx`
  - inbox list: `ApprovalInbox.tsx`
  - status notes on cards: `PlanDecisionNote.tsx`
  - icons, buttons, error banner and loading state: `Primitives.tsx`
