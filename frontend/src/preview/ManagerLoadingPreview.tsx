import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PurchasePlanPage } from '../features/purchase-plan/PurchasePlanPage';
import { createMockPlanService } from '../features/purchase-plan/mockService';
import type { PurchasePlan } from '../features/purchase-plan/types';
import '../app/app.css';

const today = '2026-11-02';
const plans: PurchasePlan[] = [99, 120, 47].map((quantity_mt, i) => ({ plan_id: `synthetic-animation-${i}`,
  quantity_mt, purchase_deadline: '2026-11-06', scenario_as_of_date: today, days_remaining: 4,
  status: 'submitted', submitted_at: '2026-11-02T08:00:00Z' }));
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function ManagerLoadingPreview() {
  const [revision, setRevision] = useState(0);
  const service = useMemo(() => {
    const base = createMockPlanService({ initialPlans: plans, scenarioDate: today, delayMs: 0 });
    return { ...base,
      async list() { await wait(1800); return base.list(); },
      async notifications() { await wait(1600); return { notifications: plans.map(plan => ({
        notification_id: plan.plan_id, plan_id: plan.plan_id, created_at: plan.submitted_at!, quantity_mt: plan.quantity_mt,
        purchase_deadline: plan.purchase_deadline, status: plan.status!,
      })) }; },
      async managerOverview() { await wait(1600); return { plan_count: 3, total_quantity_mt: 266,
        open_quantity_mt: 266, pending_approval_count: 3, reference_price_usd_per_mt: 1351.5,
        reference_date: '2026-10-26', exposure_usd: 359499 }; },
    };
  }, [revision]);
  return <div className="bb-app"><div style={{ padding: '16px 24px', borderBottom: '1px solid var(--bb-border-subtle)' }}>
    <p>SYNTHETIC ANIMATION PREVIEW · No team data changes.</p>
    <button className="bb-button bb-button--secondary" onClick={() => setRevision(value => value + 1)}>Replay initial loading</button>{' '}
    <a href="/manager-review-preview.html" style={{ color: 'var(--bb-text)' }}>Try the decision-button spinner</a>
    <p>After loading, press Refresh inbox or Refresh team overview to see the refresh bar.</p>
  </div><PurchasePlanPage key={revision} service={service} scenarioDate={today} canEdit={false} isManager /></div>;
}
createRoot(document.getElementById('root')!).render(<ManagerLoadingPreview />);
