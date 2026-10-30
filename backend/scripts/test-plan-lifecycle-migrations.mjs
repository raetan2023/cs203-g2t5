// Disposable PostgreSQL/WASM smoke test. Never connects to Supabase.
// Pass the installed PGlite module path, or install @electric-sql/pglite locally.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite');
const db = new PGlite();
const sql = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const count = async table => Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
const fail = async (statement, code) => {
  await assert.rejects(() => db.exec(statement), error => error.code === code);
};
try {
  await db.exec(`
    CREATE TABLE users (user_id uuid PRIMARY KEY);
    CREATE TABLE purchase_plans (plan_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(user_id),
      quantity_mt numeric NOT NULL CHECK (quantity_mt > 0), purchase_deadline date NOT NULL, scenario_as_of_date date NOT NULL);
    INSERT INTO users VALUES ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
  `);
  for (const name of ['20261027_purchase_plan_organisation.sql', '20261027_plan_submission.sql',
    '20261027_recommendation_approval_snapshot.sql', '20261027_manager_approval_decisions.sql']) await db.exec(await sql(name));
  await db.exec(`
    INSERT INTO purchase_plans VALUES
      ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',10,'2026-11-15','2026-10-28','org_a','approved','2026-10-28T08:00:00Z'),
      ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',10,'2026-11-15','2026-10-28','org_a','rejected','2026-10-28T08:00:00Z');
    INSERT INTO plan_approval_decisions (plan_id,clerk_org_id,manager_user_id,manager_clerk_user_id,manager_label,decision,decision_comment)
      SELECT plan_id,clerk_org_id,'00000000-0000-0000-0000-000000000002','user_manager','Manager',status,'Reviewed' FROM purchase_plans;
  `);
  const before = (await db.query('SELECT * FROM purchase_plans ORDER BY plan_id')).rows;
  const migrations = ['20261029_buyer_decision_notifications.sql', '20261029_plan_withdrawal_revision.sql', '20261029_purchase_records.sql'];
  for (const name of migrations) await db.exec(await sql(name));
  assert.equal(await count('plan_decision_notifications'), 2, 'Existing decisions backfilled once');
  const after = (await db.query('SELECT * FROM purchase_plans ORDER BY plan_id')).rows;
  assert.deepEqual(after.map(({ previous_plan_id, ...row }) => row), before, 'Existing plans preserved');
  assert.ok(after.every(row => row.previous_plan_id === null));
  await db.exec(`
    INSERT INTO purchase_records (plan_id,clerk_org_id,buyer_user_id,purchased_on,supplier,quantity_mt,price_usd_per_mt)
      VALUES ('10000000-0000-0000-0000-000000000001','org_a','00000000-0000-0000-0000-000000000001','2026-10-29','Supplier',5.25,900.12);
  `);
  assert.equal((await db.query('SELECT (quantity_mt * price_usd_per_mt)::text AS total FROM purchase_records')).rows[0].total, '4725.6300');
  await fail(`UPDATE purchase_records SET buyer_user_id='00000000-0000-0000-0000-000000000002'`, '23503');
  await fail(`UPDATE purchase_records SET clerk_org_id='org_b'`, '23503');
  for (const assignment of ['quantity_mt=0', 'price_usd_per_mt=-1', 'quantity_mt=0.0000001', "supplier=' '"])
    await fail(`UPDATE purchase_records SET ${assignment}`, '23514');
  await fail(`UPDATE plan_decision_notifications SET decision='rejected' WHERE decision='approved'`, '23503');
  await fail(`UPDATE plan_decision_notifications SET seen_at=created_at-interval '1 second'`, '23514');
  await fail(`UPDATE purchase_plans SET status='purchased',submitted_at=NULL`, '23514');
  await db.exec(`
    INSERT INTO purchase_plans (plan_id,user_id,clerk_org_id,quantity_mt,purchase_deadline,scenario_as_of_date,previous_plan_id)
      VALUES ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','org_a',10,'2026-11-15','2026-10-29','10000000-0000-0000-0000-000000000002');
  `);
  await fail(`UPDATE purchase_plans SET clerk_org_id='org_b' WHERE previous_plan_id IS NOT NULL`, '23503');
  await fail(`UPDATE purchase_plans SET previous_plan_id=plan_id WHERE previous_plan_id IS NOT NULL`, '23514');
  assert.equal((await db.query(`SELECT count(*) AS n FROM pg_class WHERE relname IN ('purchase_records','plan_withdrawals','plan_decision_notifications') AND relrowsecurity`)).rows[0].n, 3);
  await db.exec(`CREATE ROLE lifecycle_browser; GRANT USAGE ON SCHEMA public TO lifecycle_browser;
    GRANT SELECT ON plan_decision_notifications,plan_withdrawals,purchase_records TO lifecycle_browser; SET ROLE lifecycle_browser;`);
  assert.equal(await count('purchase_records'), 0, 'RLS blocks browser reads');
  assert.equal(await count('plan_decision_notifications'), 0, 'RLS blocks browser notifications');
  await db.exec('RESET ROLE');
  const firstMigration = await sql(migrations[0]);
  await assert.rejects(() => db.exec(firstMigration), 'Rerunning a manual migration fails');
  await db.exec('ROLLBACK');
  assert.equal(await count('plan_decision_notifications'), 2, 'Failed rerun preserves notifications');
  console.log('Migration smoke test passed: backfill, preservation, constraints, revision ownership and RLS.');
} finally {
  await db.close();
}
