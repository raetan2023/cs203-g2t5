# Supabase change record: purchase-plan organisation ownership

Date: **27 October 2026 (Asia/Singapore)**

Branch: `organisation-role-access`

Status: **Stage 1 applied manually by Nelson in Supabase SQL Editor.**

The assistant prepared the SQL; Nelson executed it and reported
**“Success. No rows returned.”** This document records that user-confirmed execution,
not an independent post-migration database inspection. The backend scoping/role implementation is now prepared locally (see the organisation
access guide); the 9 reviewed legacy plans have since been assigned to Bunker Buddy, as recorded below.

## Checks completed before the change

Nelson supplied the latest schema and ran the read-only checks in
[20261027_organisation_preflight.sql](../backend/migrations/20261027_organisation_preflight.sql).
Screenshots and pasted results established:

| Check | Result before migration |
| --- | --- |
| Existing plans | 9 plans belonging to 7 distinct users |
| Plan columns | `plan_id` UUID, `user_id` UUID, `quantity_mt` numeric, `purchase_deadline` date, `scenario_as_of_date` date; all NOT NULL |
| Plan ID default | `gen_random_uuid()` |
| Organisation column | No `clerk_org_id` column |
| Primary key | `purchase_plans_pkey` on `plan_id` |
| Quantity check | `quantity_mt > 0` |
| Owner foreign key | `user_id` references `users(user_id) ON DELETE CASCADE` |
| Owner index | Non-unique `purchase_plans_user_id_idx` on `user_id` |
| User indexes | Primary key on `user_id`, unique `clerk_user_id`, unique `email` |
| Organisation index | None |
| RLS | Enabled, not forced, on both `users` and `purchase_plans` |
| RLS policies | No policies on either table; policy query returned no rows |

The absence of a unique index on `purchase_plans.user_id` confirms multiple plans
per user are supported. The foreign key's existing cascade behavior means deleting
a user deletes their plans; this migration did not introduce or modify that behavior.

## Exact SQL executed

```sql
BEGIN;

ALTER TABLE public.purchase_plans
ADD COLUMN IF NOT EXISTS clerk_org_id text;

CREATE INDEX IF NOT EXISTS purchase_plans_org_user_idx
ON public.purchase_plans (clerk_org_id, user_id);

COMMIT;
```

The same executable statements are saved in
[20261027_purchase_plan_organisation.sql](../backend/migrations/20261027_purchase_plan_organisation.sql).
Comments explain the rollout, but no `COMMENT ON COLUMN` statement was executed.
Spring Boot does not automatically execute these migration files.

## What changed and why

| Change | Purpose |
| --- | --- |
| Nullable `purchase_plans.clerk_org_id` text column | Store the Clerk organisation ID owning each plan, such as `org_...` |
| Composite index `purchase_plans_org_user_idx` on `(clerk_org_id, user_id)` | Support organisation-scoped reads and owner-within-organisation lookups |

The column intentionally has no default and is nullable during rollout. The SQL
does not update or delete any existing plans, so the 9 pre-existing plans remain
and initially have NULL organisation IDs. No organisation has been assigned to them.
The success message is normal for this DDL: it does not return a result table.

User identity remains separate: `user_id` identifies the plan creator, while
`clerk_org_id` identifies the organisation. Clerk retains organisation membership
and roles. There is no local organisation table to reference, and a database foreign
key cannot point to Clerk's external service.

## What remained unchanged

- Existing primary keys, owner foreign key/cascade, quantity validation and owner index.
- `users`, `market_series`, `market_observations`, `news_daily_features`,
  `forecast_runs`, `forecast_values` and `forecast_active`.
- RLS settings, policies and database grants; no new client access was granted.
- Existing plan quantities, deadlines, scenario dates and user mappings.
- No new NOT NULL constraint, organisation default, role column, approval status or audit table.

## Optional read-only post-change verification

These queries remain available for manual verification:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'purchase_plans'
  AND column_name = 'clerk_org_id';

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'purchase_plans'
  AND indexname = 'purchase_plans_org_user_idx';

SELECT COUNT(*) AS total_plans,
       COUNT(*) FILTER (WHERE clerk_org_id IS NULL) AS unassigned_plans
FROM public.purchase_plans;
```

Expected immediately after migration, absent other concurrent writes: a nullable
text column with no default, the composite index, and 9 total/unassigned plans.
Counts may change if users create or delete plans after the earlier check.

## Read-only verification after the change

On 27 October 2026 the assistant independently connected with the existing local
backend credentials in an explicit read-only JDBC transaction and verified:

- `clerk_org_id` exists, is text, and remains nullable.
- `purchase_plans_org_user_idx` exists.
- There are **9 total plans and 9 NULL organisation IDs** at the time of verification.

The transaction was rolled back after its SELECTs. No plan records, roles, grants,
policies, org assignments or additional schema changes were written.

## Remaining rollout work

### 1. Run the updated backend consistently

The local backend now derives organisation and role from verified Clerk claims,
sets the organisation for new plans, and scopes all reads/mutations. Buyers retain
individual ownership and multiple-plan support; managers/analysts have organisation
read access; admins do not automatically receive plan privileges. These checks are
covered by isolated tests and are not a claim that a live Clerk plan-write journey
has been completed. See [the role/API guide](organisation-role-access.md).

NULL legacy rows are deliberately hidden from scoped APIs. Do not create an
unscoped fallback or permit users to claim existing rows merely by selecting an org.
Older backend instances must be upgraded too, or they may continue inserting NULLs.

### 2. Legacy assignment completed: Bunker Buddy

On 27 October 2026 Nelson authorised assigning all 9 unassigned legacy plans to
Bunker Buddy and supplied its Clerk organisation ID:
`org_3LGX9KPpydIuo5jlZbgae1xLdGr`. User ownership and membership roles were to remain
unchanged. This assignment was executed by the assistant after a read-only count
confirmed exactly 9 unassigned rows.

Execution used a single SERIALIZABLE transaction:

1. Select and lock the 9 rows where `clerk_org_id IS NULL`.
2. Abort and roll back if the candidate count differs from 9.
3. Save plan IDs, owners and previous NULL organisation values in a private local
   before-state backup (outside the repository).
4. Execute this prepared statement for each selected ID/owner pair:

   ```sql
   UPDATE public.purchase_plans
   SET clerk_org_id = ?
   WHERE plan_id = ? AND user_id = ? AND clerk_org_id IS NULL;
   ```

   The first parameter was the Bunker Buddy ID above; the remaining parameters
   were each locked row's original plan ID and owner. This is a JDBC statement
   template, not a script to paste into SQL Editor.
5. Require exactly one updated row per selected plan. Verify every selected row's
   owner, quantity, deadline and scenario date against its before-state, then commit.
6. Independently verify all 9 committed ID/owner/organisation associations in a new
   read-only transaction.

Post-commit verification found **9 selected plans assigned, 10 total plans, and 0
unassigned plans**. The additional already-assigned row was not part of the update;
only the 9 selected NULL rows were changed. No Clerk membership/role changes,
quantity changes, date changes, deletes, RLS changes or additional DDL were performed.
A private local backup and execution receipt are retained outside version control.

Owners can access their plans only when they also have the required Clerk role
and membership in Bunker Buddy. Assigning database ownership does not invite those
users or promote/change their roles. Manager/analyst access follows the documented
organisation-wide read policy; admins do not automatically get business-plan access.

### 3. Require organisation ownership after rollout

Once the updated backend is deployed everywhere and all legacy rows are reviewed,
verify that no NULL organisation IDs remain. Then review a separate
`ALTER COLUMN clerk_org_id SET NOT NULL` change. This has not been applied.

Approval workflows, comments, decision history and role-change audit storage are
separate future migrations. No additional Supabase changes have been made for them.
