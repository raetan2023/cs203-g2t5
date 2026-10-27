-- Applied to the shared Supabase project on 2026-10-27 (Asia/Singapore).
-- Follow-up snapshot column added; verified all 11 plans unchanged, 0 notifications.
-- Run once per database; do not rerun on the migrated shared project.
-- Preserves existing plans and notifications. Existing submissions without a
-- snapshot remain historical plan-only requests and must not be fabricated.
BEGIN;
ALTER TABLE public.plan_approval_notifications
    ADD COLUMN recommendation_snapshot jsonb,
    ADD CONSTRAINT plan_approval_snapshot_object_check
        CHECK (recommendation_snapshot IS NULL OR (
            jsonb_typeof(recommendation_snapshot) = 'object'
            AND recommendation_snapshot ? 'horizon_days'
            AND recommendation_snapshot ->> 'horizon_days' IN ('7', '14', '30')
            AND recommendation_snapshot ? 'analysis'
            AND jsonb_typeof(recommendation_snapshot -> 'analysis') = 'object'));
COMMIT;
