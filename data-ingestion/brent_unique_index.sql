-- Candidate migration for the UUID schema exported from Supabase.
-- Not applied by the importer. Coordinate with the database owner before running.
-- No records are removed. Existing duplicates abort this transaction.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE UNIQUE INDEX IF NOT EXISTS market_observations_series_date_uq
  ON public.market_observations (series_id, observation_date);

COMMIT;
